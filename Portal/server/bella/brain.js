// Bella — the brain (Phase G1): streaming Anthropic call + tool loop.
//
// Flow per chat turn:
//   budget check → load prefs + history → stream model response, forwarding
//   text tokens to the client as they arrive → if the model called tools,
//   execute them server-side under the USER'S auth context (see tools.js),
//   feed results back, loop (max 6 rounds) → persist everything + count usage.
//
// Provider: plain fetch against api.anthropic.com (house pattern from
// news/enrich.js — no SDK). Key via getKey('anthropic') → macOS Keychain
// locally, BDI_KEY_ANTHROPIC env on Railway (already set on portal + admin).
//
// Model: claude-sonnet-5 — Val's FINAL call (2026-07-03): Bella = Sonnet 5,
// news rewriting = Haiku 4.5 (news/enrich.js, already so), and Bella must
// NEVER use Fable-5 or Opus-class models (cost: Fable is ~5-10× Sonnet).
// No silent fallbacks to other models, ever. BDI_BELLA_MODEL env var remains
// the only override (no-deploy escape hatch; news-engine lesson: a retired
// hardcoded model id fails on every call).
// 5-class models REJECT `temperature` (HTTP 400) — never send it.

import { getKey } from '../keychain.js';
import { buildSystem } from './prompt.js';
import { TOOL_DEFINITIONS, getTool, executeTool, requiresApproval } from './tools.js';
import { buildPlanGrant, takeGrant, planApprovedNote } from './plan.js';
import { freshSignalsBrief } from './context.js';
import * as store from './store.js';

const MODEL       = process.env.BDI_BELLA_MODEL || 'claude-sonnet-5';
const MAX_TOKENS  = 2048;
const MAX_ROUNDS  = 6;        // model-call rounds per user turn (tool loop bound)
const HISTORY_MAX = 60;       // hard fetch cap; store.js quantises it to a cacheable window

// ---------------------------------------------------------------------------
// SSE parser lives in ./sse.js (zero-import module shared with the marketing
// brain, which must never pull this file's db-reaching import chain).
// Re-exported here so existing imports/tests keep working.
// ---------------------------------------------------------------------------

import { createSSEFeeder } from './sse.js';
export { createSSEFeeder };

// Turn a raw Anthropic HTTP failure into something a non-developer can act on.
// Val saw the bare 'HTTP 400: {"type":"error"...credit balance too low...}'
// 2026-07-12 and couldn't tell it was HIS Anthropic console, not a Bell bug.
export function friendlyAnthropicError(status, body) {
  const b = String(body || '').toLowerCase();
  if (status === 400 && b.includes('credit balance')) {
    return 'Bella’s Anthropic account has run out of credit. Add credit at console.anthropic.com → Plans & Billing, then try again. (Bella runs on Anthropic’s API — this is that account’s balance, separate from your Bell subscription.)';
  }
  if (status === 401 || status === 403) {
    return 'Bella’s Anthropic key was rejected. Re-run "Set Anthropic API Key.command" with a valid key, then try again.';
  }
  if (status === 429) return 'Bella is being rate-limited by Anthropic right now — wait a few seconds and try again.';
  if (status === 500 || status === 503 || status === 529) return 'Anthropic is temporarily overloaded — please try again in a moment.';
  return 'Anthropic HTTP ' + status + ': ' + String(body || '').slice(0, 200);
}

// ---------------------------------------------------------------------------
// One streaming model call. Returns the full assistant content blocks,
// stop_reason, and usage; forwards text deltas via onToken.
// ---------------------------------------------------------------------------

async function streamModelResponse({ apiKey, system, messages, signal, onToken }) {
  // Watchdog: a turn may NEVER hang silently (Val hit an endless "…" on
  // 2026-07-03). Own controller chained to the client-disconnect signal +
  // a hard 90s cap on the whole model call, streaming included.
  const ctrl = new AbortController();
  let timedOut = false;
  const chain = () => ctrl.abort();
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', chain, { once: true }); }
  const watchdog = setTimeout(() => { timedOut = true; ctrl.abort(); }, 90_000);

  try {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal: ctrl.signal,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // NB: no `temperature` — it is deprecated/rejected on Sonnet-class 5
      // models (Anthropic returns HTTP 400 if sent). Defaults are used.
      stream: true,
      system,
      tools: TOOL_DEFINITIONS,
      messages,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const e = new Error(friendlyAnthropicError(res.status, body));
    e.friendly = true;   // already user-readable — the turn catch shows it as-is
    throw e;
  }

  const blocks = [];
  let stopReason = null;
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  let streamError = null;

  const feed = createSSEFeeder((event, data) => {
    if (event === 'message_start') {
      const u = data?.message?.usage || {};
      inputTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
      // Tracked separately so the log shows the cache-hit rate — a silent
      // cache-buster (anything that varies the fixed prefix) must be visible.
      cacheReadTokens = u.cache_read_input_tokens || 0;
    } else if (event === 'content_block_start') {
      const cb = data.content_block || {};
      blocks[data.index] = cb.type === 'tool_use'
        ? { type: 'tool_use', id: cb.id, name: cb.name, _partial: '' }
        : { type: 'text', text: '' };
    } else if (event === 'content_block_delta') {
      const b = blocks[data.index];
      if (!b) return;
      if (data.delta?.type === 'text_delta') {
        b.text += data.delta.text;
        onToken(data.delta.text);
      } else if (data.delta?.type === 'input_json_delta') {
        b._partial += data.delta.partial_json || '';
      }
    } else if (event === 'content_block_stop') {
      const b = blocks[data.index];
      if (b && b.type === 'tool_use') {
        try { b.input = b._partial ? JSON.parse(b._partial) : {}; } catch { b.input = {}; }
        delete b._partial;
      }
    } else if (event === 'message_delta') {
      if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
      if (data.usage?.output_tokens) outputTokens = data.usage.output_tokens;
    } else if (event === 'error') {
      streamError = new Error('Anthropic stream error: ' + (data.error?.message || 'unknown'));
    }
  });

  const decoder = new TextDecoder();
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    feed(decoder.decode(value, { stream: true }));
    if (streamError) throw streamError;
  }
  if (streamError) throw streamError;

  // The API rejects empty text blocks on the NEXT request ("text content
  // blocks must be non-empty", hit live 2026-07-03): models often open a text
  // block but stream zero characters into it before tool calls. Drop empties
  // here so neither the tool loop nor the DB ever holds one.
  const cleaned = blocks.filter((b) => b && !(b.type === 'text' && !String(b.text || '').trim()));
  return {
    blocks: cleaned.length ? cleaned : [{ type: 'text', text: '(no answer this round — please ask again)' }],
    stopReason, inputTokens, cacheReadTokens, outputTokens,
  };
  } catch (err) {
    if (timedOut) throw new Error('the model did not answer within 90 seconds — please try again');
    throw err;
  } finally {
    clearTimeout(watchdog);
    if (signal) signal.removeEventListener('abort', chain);
  }
}

// ---------------------------------------------------------------------------
// The turn runner.
// ---------------------------------------------------------------------------

let cachedKey = null;
let cachedKeyAt = 0;
async function anthropicKey() {
  if (cachedKey && Date.now() - cachedKeyAt < 5 * 60_000) return { key: cachedKey, timedOut: false };
  // getKey shells out to the macOS Keychain locally, and that can BLOCK on a
  // hidden permission prompt (the cause of the endless "…" Val hit on
  // 2026-07-03). Race it against 5s so a stuck Keychain becomes a clear,
  // actionable error instead of a silent hang. Nothing negative is cached.
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve('__timeout__'), 5000); });
  const got = await Promise.race([getKey('anthropic'), timeout]);
  clearTimeout(timer);
  if (got === '__timeout__') return { key: null, timedOut: true };
  if (got) { cachedKey = got; cachedKeyAt = Date.now(); }
  return { key: got || null, timedOut: false };
}

const textOf = (blocks) => blocks.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();

// Move the message-level cache breakpoint to the last content block of the
// last message before each model call. The fixed prefix (tool schemas + both
// system blocks) already carries 3 of the 4 allowed breakpoints; this 4th one
// makes the replayed HISTORY (up to 30 messages incl. 12KB tool results) a
// cache read (~0.1× input price, much faster prefill) on every tool-loop round
// and every follow-up turn, instead of re-processing it in full each time.
// Exactly ONE holder at a time: older breakpoints are stripped first (they
// also come back from the DB on replay — contentJson stores what we sent).
// Round-to-round the breakpoint moves only a few blocks, well inside the
// API's 20-block lookback, so the previous cache entry is always found.
function setHistoryCacheBreakpoint(messages) {
  let last = null;
  for (const m of messages) {
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b && typeof b === 'object') {
        if (b.cache_control) delete b.cache_control;
        last = b;
      }
    }
  }
  if (last) last.cache_control = { type: 'ephemeral' };
}

/**
 * Runs one full Bella turn.
 *   ctx           — { user, tenant } from the authenticated request
 *   conversationId— existing conversation or null (a new one is created)
 *   userText      — the user's message
 *   clientContext — { section } — what the user is currently looking at
 *   send          — (event, data) → SSE write
 *   signal        — AbortSignal (client disconnect)
 *   autonomous    — scheduled-task runs: approval gates are SKIPPED (Val's
 *                   rule 2026-07-03: approving the schedule IS the approval;
 *                   execution must never stall on a card). Credit caps and
 *                   the audit trail still apply in full.
 */
export async function runBellaTurn({ ctx, conversationId, userText, clientContext, send, signal, autonomous = false }) {
  const tenantId = ctx.tenant?.id;
  const userId   = ctx.user?.id ?? 0;

  const { key: apiKey, timedOut: keyTimedOut } = await anthropicKey();
  if (!apiKey) {
    send('error', {
      message: keyTimedOut
        ? 'Your Mac\'s Keychain didn\'t release Bella\'s key — look for a Keychain permission prompt (click "Always Allow"), or re-run "Set Anthropic API Key.command", then try again.'
        : "Bella isn't configured on this deployment yet (missing Anthropic key).",
    });
    return;
  }

  const budget = await store.countTurn(tenantId, userId);
  if (!budget.ok) {
    send('error', { message: `Daily Bella limit reached (${budget.cap} chats). It resets at midnight — or ask your admin to raise it.` });
    return;
  }

  // Conversation + history.
  let convId = conversationId || null;
  if (convId) {
    const owned = await store.getOwnedConversation(tenantId, userId, convId);
    if (!owned) convId = null;   // never continue someone else's thread
  }
  if (!convId) {
    const conv = await store.createConversation(tenantId, userId, userText.slice(0, 80));
    convId = conv.id;
  }
  send('meta', { conversation_id: convId });

  // Prefs + history are independent reads — fetch them together.
  const [prefs, messages] = await Promise.all([
    store.getBellaPrefs(userId),
    store.loadModelMessages(convId, HISTORY_MAX),
  ]);
  const approvalMode = prefs.approval_mode === 'auto' ? 'auto' : 'ask';
  const system = buildSystem(ctx.user, ctx.tenant, prefs);

  // Approval continuations: after the Approve/Deny buttons the client sends
  // "[[action:ID:approved|denied]]" — swap it for a framing note the model
  // narrates from. Hidden: no user bubble is rendered (display content '').
  let effectiveText = userText;
  let hidden = false;
  // An APPROVED plan (propose_plan) grants this turn a per-tool budget so the
  // whole job runs card-free — the one card already showed the user every
  // step. The grant never outlives the turn and never covers tools the plan
  // didn't name. (Val's multi-action autonomy spec, 2026-07-08.)
  let grant = null;
  // Fill-miss feedback (Val 2026-07-12: "she said it is done but it did not
  // happen — she lied"). When a fill_field dispatch finds no matching field on
  // screen, the client reports it back here with the fields that ARE present,
  // so Bella corrects herself honestly and offers the right one (they said
  // "position"; the form's field is "Job title").
  const fillMissMatch = /^\[\[fill_missed:([\s\S]*?)\|\|([\s\S]*?)\]\]$/.exec(userText.trim());
  const actionMatch = /^\[\[action:(\d+):(approved|denied)\]\]$/.exec(userText.trim());
  if (fillMissMatch) {
    hidden = true;
    const wanted = fillMissMatch[1].trim().slice(0, 80);
    const available = fillMissMatch[2].trim().slice(0, 600);
    effectiveText = `[System note: the value you tried to type into "${wanted}" did NOT land — there is no field with that label on the screen the user is viewing, so NOTHING was saved. Do not say it was done. Tell the user plainly it wasn't set. The fields that ARE on this screen: ${available || '(none detected)'}. If one of those is clearly what they meant (e.g. they said "position" and the form has "Job title"), offer to set that one and ask them to confirm; otherwise ask which field they mean. Never claim a field was filled when it wasn't.]`;
  } else if (actionMatch) {
    hidden = true;
    const action = await store.getOwnedAction(tenantId, userId, Number(actionMatch[1]));
    if (!action) {
      effectiveText = '[System note: the referenced action no longer exists. Tell the user briefly.]';
    } else if (actionMatch[2] === 'approved') {
      if (action.tool === 'propose_plan') {
        let args = action.args;
        if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
        grant = buildPlanGrant(args, (name) => !!getTool(name));
        effectiveText = planApprovedNote(action.id, args);
      } else {
        effectiveText = `[System note: the user APPROVED your proposed ${action.tool} (action #${action.id}) and it has been executed. Result: ${action.result_summary || action.status}. Tell the user the outcome, then continue helping.]`;
      }
    } else {
      effectiveText = `[System note: the user DENIED your proposed ${action.tool} (action #${action.id}). Acknowledge briefly; do not retry unless they ask.]`;
    }
  }

  // Per-turn context rides in the user message (NOT the system prompt — that
  // would bust the prompt cache).
  const section = clientContext?.section ? String(clientContext.section).slice(0, 40) : null;
  const voiceMode = clientContext?.voice === true;
  // Proactive awareness: a one-line brief of the last 24h of signals (ICP
  // matches highlighted). Skipped on hidden/autonomous turns; best-effort.
  let fresh = null;
  if (!hidden && !autonomous) fresh = await freshSignalsBrief(tenantId).catch(() => null);
  const fullUserText =
    (section && !hidden ? `[user is currently on the "${section}" section]\n` : '')
    + (voiceMode && !hidden ? '[voice conversation — reply in 1–3 short speakable sentences, plain prose, no lists, no quick-reply choices]\n' : '')
    + (fresh ? `[fresh context, mention only when relevant: ${fresh}]\n` : '')
    + effectiveText;
  messages.push({ role: 'user', content: [{ type: 'text', text: fullUserText }] });
  await store.addMessage(convId, tenantId, userId, {
    role: 'user', content: hidden ? '' : userText, contentJson: [{ type: 'text', text: fullUserText }],
  });

  let totalIn = 0, totalOut = 0, totalCacheRead = 0;
  try {
    const maxRounds = grant ? 10 : MAX_ROUNDS;   // an approved plan runs many steps
    for (let round = 0; round < maxRounds; round++) {
      setHistoryCacheBreakpoint(messages);
      const { blocks, stopReason, inputTokens, cacheReadTokens, outputTokens } =
        await streamModelResponse({ apiKey, system, messages, signal, onToken: (t) => send('token', { t }) });
      totalIn += inputTokens; totalOut += outputTokens; totalCacheRead += cacheReadTokens;

      const toolUses = blocks.filter((b) => b.type === 'tool_use');
      if (stopReason !== 'tool_use' || toolUses.length === 0) {
        await store.addMessage(convId, tenantId, userId, {
          role: 'assistant', content: textOf(blocks), contentJson: blocks,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        });
        break;
      }

      // Execute this round's tools under the user's auth context. They are
      // independent in-process dispatches, so run them CONCURRENTLY — a round
      // with 3 tool calls costs the slowest one, not the sum (each already has
      // its own 12s timeout). `slots`/`metaSlots` are filled by index so the
      // tool_result order still mirrors the model's tool_use order exactly,
      // as the API requires. Approval proposals stay sequential (rare, and
      // each needs its own DB row + card in a stable order).
      const meta = { tools: [] };
      const slots = new Array(toolUses.length);
      const metaSlots = new Array(toolUses.length);
      const runners = [];
      for (let i = 0; i < toolUses.length; i++) {
        const tu = toolUses[i];
        const tool = getTool(tu.name);

        // Approval gate (Val's D2): 'always' tools gate in every mode;
        // 'act'/'spend' gate unless the user chose no-approval in Settings.
        // Autonomous (scheduled) runs skip gates — pre-approved at scheduling.
        if (!autonomous && requiresApproval(tool, approvalMode) && !takeGrant(grant, tu.name)) {
          let summary;
          try { summary = tool.describe ? tool.describe(tu.input || {}) : 'Run ' + tu.name; } catch { summary = 'Run ' + tu.name; }
          const actionId = await store.proposeAction(tenantId, userId, convId, tu.name, tu.input || {}, summary);
          send('approval', { action_id: actionId, tool: tu.name, summary });
          meta.approvals = meta.approvals || [];
          meta.approvals.push({ action_id: actionId, tool: tu.name, summary });
          metaSlots[i] = { name: tu.name, summary: 'awaiting your approval' };
          slots[i] = {
            type: 'tool_result', tool_use_id: tu.id,
            content: JSON.stringify({ status: 'approval_required', action_id: actionId, note: 'Proposed to the user — an Approve/Deny card is waiting at the TOP of the Bella chat panel (and a badge on the Bella orb). Tell them to open the Bella panel and approve it there. Do NOT call this tool again for the same thing.' }),
          };
          continue;
        }

        // Client-side effects (navigate) go straight to the browser.
        if (tool?.clientEffect === 'navigate') {
          send('navigate', { section: tu.input?.section, subsection: tu.input?.subsection || null });
          meta.navigate = tu.input?.section;
        } else {
          send('tool', { name: tu.name, status: 'running' });
        }

        runners.push((async () => {
          const { result, summary, isError } = await executeTool(tu.name, tu.input, { ...ctx, conversationId: convId });
          // Clip ONCE here; store.js replays these exact bytes (prompt caching is a
          // prefix byte match — see store.TOOL_RESULT_CLIP).
          slots[i] = { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result).slice(0, store.TOOL_RESULT_CLIP), ...(isError ? { is_error: true } : {}) };
          if (tool?.clientEffect !== 'navigate') {
            send('tool', { name: tu.name, status: isError ? 'error' : 'done', summary });
          }
          // Rich UI actions (open a record / filter a grid / fill a field) so Bella
          // can act on the app, not just describe it. Computed from input + result
          // once the tool succeeds; the client applies it via ui/lib/bellaBus.js.
          if (!isError && typeof tool?.uiAction === 'function') {
            let act = null;
            try { act = tool.uiAction(tu.input || {}, result); } catch { act = null; }
            if (act) { send('ui_action', act); meta.ui_action = act; }
          }
          metaSlots[i] = { name: tu.name, summary };
          await store.logAction(tenantId, userId, convId, tu.name, tu.input, isError ? 'error' : 'done', summary);
        })());
      }
      await Promise.all(runners);
      meta.tools = metaSlots.filter(Boolean);
      const results = slots.filter(Boolean);

      await store.addMessage(convId, tenantId, userId, {
        role: 'assistant', content: textOf(blocks), contentJson: blocks, meta,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      });
      await store.addMessage(convId, tenantId, userId, {
        role: 'user', content: '', contentJson: results,
      });

      messages.push({ role: 'assistant', content: blocks });
      messages.push({ role: 'user', content: results });
    }

    send('done', { conversation_id: convId, usage: { input_tokens: totalIn, output_tokens: totalOut }, turns_today: budget.turns });
    console.log(`[bella] turn ok · in=${totalIn} (cache_read=${totalCacheRead}, ${totalIn ? Math.round((totalCacheRead / totalIn) * 100) : 0}%) · out=${totalOut}`);
  } catch (err) {
    if (err?.name === 'AbortError' && signal?.aborted) return;   // client left — nothing to report
    console.error('[bella] turn failed:', err.message);
    // Friendly errors (out of credit, bad key, overloaded) are already
    // user-readable — show them verbatim instead of the raw HTTP dump.
    send('error', { message: err?.friendly ? String(err.message) : 'Bella hit a problem: ' + String(err.message || err).slice(0, 200) });
  } finally {
    await store.addTokenUsage(tenantId, userId, totalIn, totalOut).catch(() => {});
    await store.touchConversation(convId).catch(() => {});
  }
}

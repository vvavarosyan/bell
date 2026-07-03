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
import * as store from './store.js';

const MODEL       = process.env.BDI_BELLA_MODEL || 'claude-sonnet-5';
const MAX_TOKENS  = 2048;
const MAX_ROUNDS  = 6;        // model-call rounds per user turn (tool loop bound)
const HISTORY_MAX = 30;       // messages replayed from the conversation

// ---------------------------------------------------------------------------
// SSE parser lives in ./sse.js (zero-import module shared with the marketing
// brain, which must never pull this file's db-reaching import chain).
// Re-exported here so existing imports/tests keep working.
// ---------------------------------------------------------------------------

import { createSSEFeeder } from './sse.js';
export { createSSEFeeder };

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
    throw new Error('Anthropic HTTP ' + res.status + ': ' + body.slice(0, 300));
  }

  const blocks = [];
  let stopReason = null;
  let inputTokens = 0;
  let outputTokens = 0;
  let streamError = null;

  const feed = createSSEFeeder((event, data) => {
    if (event === 'message_start') {
      const u = data?.message?.usage || {};
      inputTokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
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
    stopReason, inputTokens, outputTokens,
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

  const prefs = await store.getBellaPrefs(userId);
  const approvalMode = prefs.approval_mode === 'auto' ? 'auto' : 'ask';
  const system = buildSystem(ctx.user, ctx.tenant, prefs);
  const messages = await store.loadModelMessages(convId, HISTORY_MAX);

  // Approval continuations: after the Approve/Deny buttons the client sends
  // "[[action:ID:approved|denied]]" — swap it for a framing note the model
  // narrates from. Hidden: no user bubble is rendered (display content '').
  let effectiveText = userText;
  let hidden = false;
  const actionMatch = /^\[\[action:(\d+):(approved|denied)\]\]$/.exec(userText.trim());
  if (actionMatch) {
    hidden = true;
    const action = await store.getOwnedAction(tenantId, userId, Number(actionMatch[1]));
    if (!action) {
      effectiveText = '[System note: the referenced action no longer exists. Tell the user briefly.]';
    } else if (actionMatch[2] === 'approved') {
      effectiveText = `[System note: the user APPROVED your proposed ${action.tool} (action #${action.id}) and it has been executed. Result: ${action.result_summary || action.status}. Tell the user the outcome, then continue helping.]`;
    } else {
      effectiveText = `[System note: the user DENIED your proposed ${action.tool} (action #${action.id}). Acknowledge briefly; do not retry unless they ask.]`;
    }
  }

  // Per-turn context rides in the user message (NOT the system prompt — that
  // would bust the prompt cache).
  const section = clientContext?.section ? String(clientContext.section).slice(0, 40) : null;
  const voiceMode = clientContext?.voice === true;
  const fullUserText =
    (section && !hidden ? `[user is currently on the "${section}" section]\n` : '')
    + (voiceMode && !hidden ? '[voice conversation — reply in 1–3 short speakable sentences, plain prose, no lists, no quick-reply choices]\n' : '')
    + effectiveText;
  messages.push({ role: 'user', content: [{ type: 'text', text: fullUserText }] });
  await store.addMessage(convId, tenantId, userId, {
    role: 'user', content: hidden ? '' : userText, contentJson: [{ type: 'text', text: fullUserText }],
  });

  let totalIn = 0, totalOut = 0;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const { blocks, stopReason, inputTokens, outputTokens } =
        await streamModelResponse({ apiKey, system, messages, signal, onToken: (t) => send('token', { t }) });
      totalIn += inputTokens; totalOut += outputTokens;

      const toolUses = blocks.filter((b) => b.type === 'tool_use');
      if (stopReason !== 'tool_use' || toolUses.length === 0) {
        await store.addMessage(convId, tenantId, userId, {
          role: 'assistant', content: textOf(blocks), contentJson: blocks,
          usage: { input_tokens: inputTokens, output_tokens: outputTokens },
        });
        break;
      }

      // Execute this round's tools under the user's auth context.
      const meta = { tools: [] };
      const results = [];
      for (const tu of toolUses) {
        const tool = getTool(tu.name);

        // Approval gate (Val's D2): 'always' tools gate in every mode;
        // 'act'/'spend' gate unless the user chose no-approval in Settings.
        // Autonomous (scheduled) runs skip gates — pre-approved at scheduling.
        if (!autonomous && requiresApproval(tool, approvalMode)) {
          let summary;
          try { summary = tool.describe ? tool.describe(tu.input || {}) : 'Run ' + tu.name; } catch { summary = 'Run ' + tu.name; }
          const actionId = await store.proposeAction(tenantId, userId, convId, tu.name, tu.input || {}, summary);
          send('approval', { action_id: actionId, tool: tu.name, summary });
          meta.approvals = meta.approvals || [];
          meta.approvals.push({ action_id: actionId, tool: tu.name, summary });
          meta.tools.push({ name: tu.name, summary: 'awaiting your approval' });
          results.push({
            type: 'tool_result', tool_use_id: tu.id,
            content: JSON.stringify({ status: 'approval_required', action_id: actionId, note: 'Proposed to the user — they must click Approve in the chat. Briefly state what you proposed and wait. Do NOT call this tool again for the same thing.' }),
          });
          continue;
        }

        // Client-side effects (navigate) go straight to the browser.
        if (tool?.clientEffect === 'navigate') {
          send('navigate', { section: tu.input?.section });
          meta.navigate = tu.input?.section;
        } else {
          send('tool', { name: tu.name, status: 'running' });
        }

        const { result, summary, isError } = await executeTool(tu.name, tu.input, { ...ctx, conversationId: convId });
        results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result).slice(0, 12_000), ...(isError ? { is_error: true } : {}) });
        if (tool?.clientEffect !== 'navigate') {
          send('tool', { name: tu.name, status: isError ? 'error' : 'done', summary });
        }
        meta.tools.push({ name: tu.name, summary });
        await store.logAction(tenantId, userId, convId, tu.name, tu.input, isError ? 'error' : 'done', summary);
      }

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
  } catch (err) {
    if (err?.name === 'AbortError' && signal?.aborted) return;   // client left — nothing to report
    console.error('[bella] turn failed:', err.message);
    send('error', { message: 'Bella hit a problem: ' + String(err.message || err).slice(0, 200) });
  } finally {
    await store.addTokenUsage(tenantId, userId, totalIn, totalOut).catch(() => {});
    await store.touchConversation(convId).catch(() => {});
  }
}

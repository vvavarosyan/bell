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
// Model: Sonnet-class per Val's D1 (2026-07-03). BDI_BELLA_MODEL overrides
// without a deploy — the news-engine lesson: a retired hardcoded model id
// fails on every call, so keep the escape hatch and surface API errors
// verbatim to the log.

import { getKey } from '../keychain.js';
import { buildSystem } from './prompt.js';
import { TOOL_DEFINITIONS, getTool, executeTool } from './tools.js';
import * as store from './store.js';

const MODEL       = process.env.BDI_BELLA_MODEL || 'claude-sonnet-5';
const MAX_TOKENS  = 2048;
const MAX_ROUNDS  = 6;        // model-call rounds per user turn (tool loop bound)
const HISTORY_MAX = 30;       // messages replayed from the conversation

// ---------------------------------------------------------------------------
// SSE parser for the Anthropic stream — pure + exported for unit tests.
// Feed it raw chunk text; it emits {event, data} for every complete frame.
// ---------------------------------------------------------------------------

export function createSSEFeeder(onEvent) {
  let buf = '';
  return function feed(chunkText) {
    buf += chunkText;
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      let event = 'message';
      const dataLines = [];
      for (const line of frame.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        // comment lines (":") and blanks are ignored per the SSE spec
      }
      if (!dataLines.length) continue;
      let data = null;
      try { data = JSON.parse(dataLines.join('\n')); } catch { continue; }
      onEvent(event, data);
    }
  };
}

// ---------------------------------------------------------------------------
// One streaming model call. Returns the full assistant content blocks,
// stop_reason, and usage; forwards text deltas via onToken.
// ---------------------------------------------------------------------------

async function streamModelResponse({ apiKey, system, messages, signal, onToken }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
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

  return { blocks: blocks.filter(Boolean), stopReason, inputTokens, outputTokens };
}

// ---------------------------------------------------------------------------
// The turn runner.
// ---------------------------------------------------------------------------

let cachedKey = null;
let cachedKeyAt = 0;
async function anthropicKey() {
  if (cachedKey && Date.now() - cachedKeyAt < 5 * 60_000) return cachedKey;
  cachedKey = await getKey('anthropic');
  cachedKeyAt = Date.now();
  return cachedKey;
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
 */
export async function runBellaTurn({ ctx, conversationId, userText, clientContext, send, signal }) {
  const tenantId = ctx.tenant?.id;
  const userId   = ctx.user?.id ?? 0;

  const apiKey = await anthropicKey();
  if (!apiKey) {
    send('error', { message: "Bella isn't configured on this deployment yet (missing Anthropic key)." });
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
  const system = buildSystem(ctx.user, ctx.tenant, prefs);
  const messages = await store.loadModelMessages(convId, HISTORY_MAX);

  // Per-turn context rides in the user message (NOT the system prompt — that
  // would bust the prompt cache).
  const section = clientContext?.section ? String(clientContext.section).slice(0, 40) : null;
  const fullUserText = (section ? `[user is currently on the "${section}" section]\n` : '') + userText;
  messages.push({ role: 'user', content: [{ type: 'text', text: fullUserText }] });
  await store.addMessage(convId, tenantId, userId, {
    role: 'user', content: userText, contentJson: [{ type: 'text', text: fullUserText }],
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

        // Client-side effects (navigate) go straight to the browser.
        if (tool?.clientEffect === 'navigate') {
          send('navigate', { section: tu.input?.section });
          meta.navigate = tu.input?.section;
        } else {
          send('tool', { name: tu.name, status: 'running' });
        }

        // Approval gate (G2 wires real approvals; the hook lives here now so
        // action tools land behind it by construction).
        if (tool?.definition && tool.requires_approval) {
          const summary = 'needs approval (arrives with the next Bella upgrade)';
          results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ status: 'approval_required', note: summary }) });
          meta.tools.push({ name: tu.name, summary });
          await store.logAction(tenantId, userId, convId, tu.name, tu.input, 'proposed', summary);
          continue;
        }

        const { result, summary, isError } = await executeTool(tu.name, tu.input, ctx);
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
    if (err?.name === 'AbortError') return;   // client left — nothing to report
    console.error('[bella] turn failed:', err.message);
    send('error', { message: 'Bella hit a problem: ' + String(err.message || err).slice(0, 200) });
  } finally {
    await store.addTokenUsage(tenantId, userId, totalIn, totalOut).catch(() => {});
    await store.touchConversation(convId).catch(() => {});
  }
}

// Bella — conversation store, action audit, and budget guard (Phase G1).
//
// Everything here is keyed by (tenant_id, user_id): each member's Bella is
// their own thread — no shared memory across users or tenants (locked
// isolation commitment #3). user_id 0 = the local engine's synthetic admin.
//
// Budget: Val's defaults (2026-07-03) — 300 chat turns/day, 500 Bella-spent
// credits/day. Per-plan limits arrive with the Billing integration; the env
// overrides below exist so prod can be tuned without a deploy.

import { query } from '../db.js';

export const DAILY_TURNS_CAP   = Number(process.env.BDI_BELLA_DAILY_TURNS || 300);
export const DAILY_CREDITS_CAP = Number(process.env.BDI_BELLA_DAILY_CREDITS || 500);

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export async function createConversation(tenantId, userId, title) {
  const r = await query(
    `INSERT INTO bella_conversations (tenant_id, user_id, title)
     VALUES ($1, $2, $3) RETURNING id, title, created_at`,
    [tenantId, userId, (title || 'New conversation').slice(0, 80)]
  );
  return r.rows[0];
}

export async function listConversations(tenantId, userId, limit = 20) {
  const r = await query(
    `SELECT id, title, status, created_at, updated_at
       FROM bella_conversations
      WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
      ORDER BY updated_at DESC LIMIT $3`,
    [tenantId, userId, Math.min(Number(limit) || 20, 50)]
  );
  return r.rows;
}

/** Returns the conversation row only if it belongs to this tenant+user. */
export async function getOwnedConversation(tenantId, userId, id) {
  const r = await query(
    `SELECT id, title FROM bella_conversations
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId]
  );
  return r.rows[0] || null;
}

export async function touchConversation(id) {
  await query(`UPDATE bella_conversations SET updated_at = now() WHERE id = $1`, [id]);
}

export async function deleteConversation(tenantId, userId, id) {
  const r = await query(
    `DELETE FROM bella_conversations
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId]
  );
  return r.rowCount > 0;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function addMessage(conversationId, tenantId, userId, { role, content = '', contentJson = null, meta = null, usage = null }) {
  await query(
    `INSERT INTO bella_messages (conversation_id, tenant_id, user_id, role, content, content_json, meta, usage)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [conversationId, tenantId, userId, role, content,
     contentJson ? JSON.stringify(contentJson) : null,
     meta ? JSON.stringify(meta) : null,
     usage ? JSON.stringify(usage) : null]
  );
}

/** Messages for the UI (display text + tool chips), oldest first. */
export async function listMessagesForUi(conversationId, limit = 200) {
  const r = await query(
    `SELECT id, role, content, meta, created_at
       FROM bella_messages
      WHERE conversation_id = $1
      ORDER BY id ASC LIMIT $2`,
    [conversationId, Math.min(Number(limit) || 200, 500)]
  );
  return r.rows;
}

// ONE cap for a tool result, applied ONCE when it is SENT to the model (brain.js) and
// then stored verbatim. Replay MUST be byte-identical to what was sent.
//
// Why this matters (the single biggest cost bug, found 2026-07-15): prompt caching is a
// PREFIX BYTE MATCH. We used to send a result at 12,000 chars but replay it clipped to
// 2,000. From the first clipped tool_result onward, turn N+1's prefix stopped matching
// turn N's cache entry — so the entire rest of the history was re-billed at full price
// AND (because the history breakpoint sits at the end) re-WRITTEN at 1.25x, every single
// turn. Bella is tool-heavy, so nearly every turn paid it.
//
// Counter-intuitive but measured: clipping on replay COSTS money. A 12k tool result read
// from cache is cheaper than the same result clipped to 2k but uncached. So: clip once,
// at send time, and never rewrite the bytes afterwards.
export const TOOL_RESULT_CLIP = 4000;

// QUANTISED history window. A per-message sliding window (always "the last 30") changes
// the FRONT of the messages array on every single turn — and prompt caching is a prefix
// match, so the whole replayed history missed the cache once a conversation passed the
// window size. Instead we trim in STEP-sized chunks: between trims the replayed history is
// APPEND-ONLY (exactly what the cache wants), so turn N+1 re-reads turn N's prefix.
const HISTORY_KEEP_MIN = 24;   // never replay fewer than this many messages
const HISTORY_SOFT     = 40;   // only start trimming past this
const HISTORY_STEP     = 16;   // trim this many at a time → prefix stable for 16 messages

/**
 * Rebuild the Anthropic `messages` array for a conversation (oldest first,
 * last `max` rows). content_json is authoritative; plain-text rows fall back
 * to their display text.
 */
export async function loadModelMessages(conversationId, max = 60) {
  const r = await query(
    `SELECT role, content, content_json FROM (
       SELECT id, role, content, content_json
         FROM bella_messages
        WHERE conversation_id = $1
        ORDER BY id DESC LIMIT $2
     ) t ORDER BY id ASC`,
    [conversationId, max]
  );
  const out = [];
  for (const row of r.rows) {
    let content = row.content_json;
    if (typeof content === 'string') { try { content = JSON.parse(content); } catch { content = null; } }
    if (Array.isArray(content)) {
      // Replay hygiene — the API rejects empty text blocks ("text content
      // blocks must be non-empty", hit live 2026-07-03). Strip them (this
      // also HEALS rows persisted before the fix); drop rows left empty.
      // Pairing stays intact: only empty TEXT blocks are dropped, never
      // tool_use/tool_result, and a row that becomes empty had no tool_use.
      // NB: tool_result content is replayed VERBATIM (see TOOL_RESULT_CLIP) —
      // rewriting it here would break the prompt-cache prefix match.
      content = content
        .filter((b) => !(b && b.type === 'text' && !String(b.text || '').trim()));
      if (!content.length) continue;
    }
    const finalContent = content || String(row.content || '');
    if (!Array.isArray(finalContent) && !String(finalContent).trim()) continue;
    out.push({ role: row.role, content: finalContent });
  }
  // Quantised trim (see HISTORY_STEP): drop whole chunks so the window START stays put
  // for STEP messages at a time, keeping the replayed prefix append-only and cacheable.
  if (out.length > HISTORY_SOFT) {
    const drop = Math.floor((out.length - HISTORY_KEEP_MIN) / HISTORY_STEP) * HISTORY_STEP;
    if (drop > 0) out.splice(0, drop);
  }

  // The API requires the history to OPEN with a plain user turn: drop leading
  // assistant rows AND tool_result rows orphaned by the window cut.
  const isOrphanToolResult = (m) =>
    m.role === 'user' && Array.isArray(m.content) && m.content.some((b) => b && b.type === 'tool_result');
  while (out.length && (out[0].role !== 'user' || isOrphanToolResult(out[0]))) out.shift();
  return out;
}

// ---------------------------------------------------------------------------
// Action audit — every tool call, actor = the user Bella acted for.
// ---------------------------------------------------------------------------

export async function logAction(tenantId, userId, conversationId, tool, args, status, resultSummary, creditsCost = 0) {
  try {
    await query(
      `INSERT INTO bella_actions (tenant_id, user_id, conversation_id, tool, args, status, result_summary, credits_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, userId, conversationId, tool,
       JSON.stringify(args || {}), status, (resultSummary || '').slice(0, 400), creditsCost]
    );
  } catch (err) {
    // Audit failures must never break a chat turn — but they must be visible.
    console.error('[bella] action log failed:', err.message);
  }
}

export async function listActions(tenantId, userId, limit = 50) {
  const r = await query(
    `SELECT id, conversation_id, tool, args, status, result_summary, credits_cost, created_at
       FROM bella_actions
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY id DESC LIMIT $3`,
    [tenantId, userId, Math.min(Number(limit) || 50, 200)]
  );
  return r.rows;
}

// ---------------------------------------------------------------------------
// Budget guard
// ---------------------------------------------------------------------------

/**
 * Counts a turn and reports whether the user is within budget. The increment
 * happens first (single upsert, race-safe); callers refuse the turn when
 * `ok` is false.
 */
export async function countTurn(tenantId, userId) {
  const r = await query(
    `INSERT INTO bella_usage (tenant_id, user_id, day, turns)
     VALUES ($1, $2, CURRENT_DATE, 1)
     ON CONFLICT (tenant_id, user_id, day)
     DO UPDATE SET turns = bella_usage.turns + 1
     RETURNING turns, credits_spent`,
    [tenantId, userId]
  );
  const row = r.rows[0];
  return { ok: row.turns <= DAILY_TURNS_CAP, turns: row.turns, cap: DAILY_TURNS_CAP };
}

export async function addTokenUsage(tenantId, userId, inputTokens, outputTokens) {
  await query(
    `INSERT INTO bella_usage (tenant_id, user_id, day, input_tokens, output_tokens)
     VALUES ($1, $2, CURRENT_DATE, $3, $4)
     ON CONFLICT (tenant_id, user_id, day)
     DO UPDATE SET input_tokens  = bella_usage.input_tokens  + EXCLUDED.input_tokens,
                   output_tokens = bella_usage.output_tokens + EXCLUDED.output_tokens`,
    [tenantId, userId, Math.max(0, Number(inputTokens) || 0), Math.max(0, Number(outputTokens) || 0)]
  );
}

/** Today's usage row (for the Settings section + admin visibility). */
export async function getTodayUsage(tenantId, userId) {
  const r = await query(
    `SELECT turns, input_tokens, output_tokens, credits_spent
       FROM bella_usage
      WHERE tenant_id = $1 AND user_id = $2 AND day = CURRENT_DATE`,
    [tenantId, userId]
  );
  return r.rows[0] || { turns: 0, input_tokens: 0, output_tokens: 0, credits_spent: 0 };
}

// ---------------------------------------------------------------------------
// Per-user Bella preferences (stored in users.extra_fields.preferences.bella
// by the existing /api/account PATCH — read here for the brain).
// ---------------------------------------------------------------------------

export async function getBellaPrefs(userId) {
  if (!userId) return {};   // synthetic local-admin (id 0) has no users row
  try {
    const r = await query(`SELECT extra_fields FROM users WHERE id = $1`, [userId]);
    const extra = r.rows[0]?.extra_fields || {};
    return (extra.preferences && extra.preferences.bella) || {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Approvals (G2) — proposed actions await the user's explicit click.
// ---------------------------------------------------------------------------

/** Persist a proposed action; unlike logAction this MUST succeed (throws). */
export async function proposeAction(tenantId, userId, conversationId, tool, args, summary) {
  const r = await query(
    `INSERT INTO bella_actions (tenant_id, user_id, conversation_id, tool, args, status, result_summary)
     VALUES ($1, $2, $3, $4, $5, 'proposed', $6) RETURNING id`,
    [tenantId, userId, conversationId, tool, JSON.stringify(args || {}), (summary || '').slice(0, 900)]
  );
  return r.rows[0].id;
}

export async function getOwnedAction(tenantId, userId, id) {
  const r = await query(
    `SELECT id, conversation_id, tool, args, status, result_summary, credits_cost
       FROM bella_actions WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [id, tenantId, userId]
  );
  return r.rows[0] || null;
}

/** Live statuses for a set of actions — lets reloaded approval cards show the truth. */
export async function getActionStatuses(tenantId, userId, ids) {
  if (!ids.length) return {};
  const r = await query(
    `SELECT id, status, result_summary FROM bella_actions
      WHERE tenant_id = $1 AND user_id = $2 AND id = ANY($3::bigint[])`,
    [tenantId, userId, ids]
  );
  const out = {};
  for (const row of r.rows) out[row.id] = { status: row.status, note: row.result_summary || null };
  return out;
}

export async function setActionStatus(id, status, resultSummary = null, creditsCost = null) {
  await query(
    `UPDATE bella_actions
        SET status = $2,
            result_summary = COALESCE($3, result_summary),
            credits_cost   = COALESCE($4, credits_cost)
      WHERE id = $1`,
    [id, status, resultSummary ? String(resultSummary).slice(0, 400) : null, creditsCost]
  );
}

// ---------------------------------------------------------------------------
// Daily Bella credit budget (Val's D5: 500/day default; per-plan later).
// ---------------------------------------------------------------------------

export async function checkCreditsBudget(tenantId, userId, estimate) {
  const u = await getTodayUsage(tenantId, userId);
  const spent = Number(u.credits_spent) || 0;
  return { ok: spent + Math.max(0, Number(estimate) || 0) <= DAILY_CREDITS_CAP, spent, cap: DAILY_CREDITS_CAP };
}

export async function addCreditsSpent(tenantId, userId, n) {
  const add = Math.max(0, Number(n) || 0);
  if (!add) return;
  await query(
    `INSERT INTO bella_usage (tenant_id, user_id, day, credits_spent)
     VALUES ($1, $2, CURRENT_DATE, $3)
     ON CONFLICT (tenant_id, user_id, day)
     DO UPDATE SET credits_spent = bella_usage.credits_spent + EXCLUDED.credits_spent`,
    [tenantId, userId, add]
  );
}

// ---------------------------------------------------------------------------
// Scheduled / overnight tasks (G2) — "have this ready by morning".
// ---------------------------------------------------------------------------

export async function createTask(tenantId, userId, conversationId, instruction, runAt) {
  const r = await query(
    `INSERT INTO bella_tasks (tenant_id, user_id, conversation_id, instruction, run_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, run_at`,
    [tenantId, userId, conversationId, String(instruction).slice(0, 4000), runAt]
  );
  return r.rows[0];
}

export async function listTasks(tenantId, userId, limit = 20) {
  const r = await query(
    `SELECT id, instruction, run_at, status, result, created_at, updated_at
       FROM bella_tasks
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY (status = 'queued') DESC, run_at DESC
      LIMIT $3`,
    [tenantId, userId, Math.min(Number(limit) || 20, 100)]
  );
  return r.rows;
}

export async function cancelTask(tenantId, userId, id) {
  const r = await query(
    `UPDATE bella_tasks SET status = 'cancelled', updated_at = now()
      WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'queued'`,
    [id, tenantId, userId]
  );
  return r.rowCount > 0;
}

/** Atomically claim due tasks (safe if two services ever tick at once). */
export async function claimDueTasks(limit = 2) {
  const r = await query(
    `UPDATE bella_tasks SET status = 'running', updated_at = now()
      WHERE id IN (
        SELECT id FROM bella_tasks
         WHERE status = 'queued' AND run_at <= now()
         ORDER BY run_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, tenant_id, user_id, conversation_id, instruction`,
    [Math.max(1, Number(limit) || 2)]
  );
  return r.rows;
}

export async function completeTask(id, status, result) {
  await query(
    `UPDATE bella_tasks SET status = $2, result = $3, updated_at = now() WHERE id = $1`,
    [id, status, result ? JSON.stringify(result) : null]
  );
}

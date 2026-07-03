// Bella — scheduled/overnight task runner (Phase G2).
//
// "Have this ready by tomorrow morning" → schedule_task writes a bella_tasks
// row → this 60s tick claims due rows (FOR UPDATE SKIP LOCKED — safe if two
// services ever tick) and runs a HEADLESS Bella turn under the task owner's
// identity. Results land in the task's conversation (visible in her chat
// History) + an in-app notification.
//
// Approvals still apply overnight: gated tools become proposed actions —
// the user finds the Approve cards in the conversation next morning.
//
// Gating (same pattern as startCrmScheduler): BDI_BELLA_SCHEDULER=1 on
// exactly ONE prod service (app.bell.qa) — never both app+admin, they share
// the DB. The local engine always runs it (Val's own tasks).

import { query } from '../db.js';
import { runBellaTurn } from './brain.js';
import * as store from './store.js';
import { createNotification } from '../lib/notifications.js';

const MODE = (process.env.BDI_MODE || 'local-admin').toLowerCase();
const ENABLED = process.env.BDI_BELLA_SCHEDULER === '1' || MODE === 'local-admin';
const TICK_MS = 60_000;
const TASK_TIMEOUT_MS = 8 * 60_000;   // whole-task cap (per-model-call 90s watchdog still applies)

const SYNTHETIC_ADMIN = { id: 0, tenant_id: 1, email: 'admin@local', full_name: 'Local Admin', role: 'platform_admin', is_active: true };

async function ctxForTask(task) {
  let user = SYNTHETIC_ADMIN;
  if (task.user_id) {
    const u = await query(`SELECT id, tenant_id, email, full_name, role, is_active FROM users WHERE id = $1`, [task.user_id]);
    if (!u.rows.length || u.rows[0].is_active === false) return null;   // owner gone → skip
    user = u.rows[0];
  }
  const t = await query(`SELECT id, name, plan FROM tenants WHERE id = $1`, [task.tenant_id]);
  const tenant = t.rows[0] || { id: task.tenant_id, name: 'Bell', plan: 'internal' };
  return { user, tenant };
}

async function runOne(task) {
  const ctx = await ctxForTask(task);
  if (!ctx) {
    await store.completeTask(task.id, 'failed', { error: 'owner_not_found' });
    return;
  }

  // Headless: collect what would have streamed to the chat panel.
  let finalText = '';
  let errorText = null;
  let approvals = 0;
  const send = (event, data) => {
    if (event === 'token') finalText += data.t || '';
    else if (event === 'approval') approvals++;
    else if (event === 'error') errorText = data?.message || 'error';
  };

  const abort = new AbortController();
  const killer = setTimeout(() => abort.abort(), TASK_TIMEOUT_MS);
  try {
    await runBellaTurn({
      ctx,
      conversationId: task.conversation_id || null,
      userText: '[Scheduled task — execute it now, autonomously, and end with a short summary of what you did.]\n' + task.instruction,
      clientContext: {},
      send,
      signal: abort.signal,
    });
  } catch (err) {
    errorText = String(err.message || err).slice(0, 300);
  } finally {
    clearTimeout(killer);
  }

  const ok = !errorText;
  await store.completeTask(task.id, ok ? 'done' : 'failed', {
    summary: (finalText || '').slice(0, 600) || null,
    ...(errorText ? { error: errorText } : {}),
    ...(approvals ? { approvals_pending: approvals } : {}),
  });

  // Notify the owner (real users only — the local synthetic admin has no
  // users row; Val sees results in the conversation + task list).
  if (task.user_id) {
    await createNotification({
      tenantId: task.tenant_id,
      userId: task.user_id,
      category: 'system',
      type: 'bella_task',
      title: ok
        ? (approvals ? 'Bella finished a task — approvals waiting' : 'Bella finished your task')
        : 'Bella task failed',
      body: String(task.instruction).slice(0, 140),
    }).catch((e) => console.error('[bella] task notification failed:', e.message));
  }
  console.log(`[bella] task #${task.id} ${ok ? 'done' : 'FAILED'}${approvals ? ` (${approvals} approvals pending)` : ''}`);
}

let timer = null;
let running = false;

export function startBellaScheduler() {
  if (!ENABLED) { console.log('[bella] scheduler disabled (set BDI_BELLA_SCHEDULER=1)'); return; }
  if (timer) return;
  const safeRun = async () => {
    if (running) return;   // never overlap ticks
    running = true;
    try {
      const due = await store.claimDueTasks(2);
      for (const task of due) await runOne(task);
    } catch (err) {
      console.error('[bella] scheduler tick failed:', err.message);
    } finally {
      running = false;
    }
  };
  timer = setInterval(safeRun, TICK_MS);
  console.log('[bella] scheduler started (60s tick)');
}

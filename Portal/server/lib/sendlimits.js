// Per-tenant DAILY outbound-email limit (Phase 1 outreach safety).
//
// Counts outbound crm_emails sent today and caps them by the tenant's plan
// (config/plans.js `emails_per_day`). The internal tenant (id=1 / platform
// admin) is never limited. Enforced in the single-send route AND the sequence
// runner, so neither manual nor automated sending can blow past the cap.

import { query } from '../db.js';
import { planById } from '../config/plans.js';

const DEFAULT_DAILY = 100;

export function dailyEmailLimit(planId) {
  const p = planById(planId);
  return (p && Number.isFinite(p.emails_per_day)) ? p.emails_per_day : DEFAULT_DAILY;
}

export async function emailsSentToday(tenantId) {
  // "Today" = the Qatar calendar day, not the server's UTC day. Before this the counter
  // reset at UTC midnight (03:00 in Doha), so a daily cap never lined up with a Qatar day.
  const r = await query(
    `SELECT count(*)::int AS n FROM crm_emails
      WHERE tenant_id = $1 AND direction = 'out'
        AND status IN ('sent','delivered','opened')
        AND sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Qatar') AT TIME ZONE 'Asia/Qatar')`,
    [Number(tenantId)]);
  return r.rows[0]?.n || 0;
}

/** { allowed, used, limit, remaining } for a tenant's daily outbound email. */
export async function checkDailyLimit(tenantId, planId) {
  if (Number(tenantId) === 1) return { allowed: true, used: 0, limit: Infinity, remaining: Infinity };
  let plan = planId;
  if (plan === undefined) {
    const t = await query(`SELECT plan FROM tenants WHERE id = $1`, [Number(tenantId)]);
    plan = t.rows[0]?.plan || null;
  }
  const limit = dailyEmailLimit(plan);
  const used = await emailsSentToday(tenantId);
  const remaining = Math.max(0, limit - used);
  return { allowed: remaining > 0, used, limit, remaining };
}

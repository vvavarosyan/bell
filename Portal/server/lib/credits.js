// Per-tenant credit system.
//
//   • Monthly grant: each subscription plan grants `plan.credits` per ~30-day
//     period (lazy — granted on the next balance read after the period rolls).
//   • Reveals: unlocking a person/company's contact details costs 1 credit,
//     charged at most once per entity per tenant (tenant_reveals UNIQUE).
//   • Admin adjust: platform_admin can add/deduct a tenant's balance.
//
// platform_admin users and the internal tenant (id=1) BYPASS credits entirely —
// they see all contacts and are never charged. So local-admin + admin.bell.qa
// are unaffected; only real customer tenants (user mode) consume credits.

import { query, withTransaction } from '../db.js';
import { planById } from '../config/plans.js';
import { notifyTenant } from './notifications.js';

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/** platform_admin + internal tenant don't consume credits and see everything. */
export function bypassesCredits(user, tenant) {
  return user?.role === 'platform_admin' || Number(tenant?.id) === 1;
}

/**
 * Lazily grant the plan's monthly allotment if a new period has started (or the
 * plan changed). Idempotent within a period. Returns the current balance.
 */
export async function ensureMonthlyGrant(tenantId) {
  return withTransaction(async (client) => {
    const r = await client.query(
      `SELECT id, plan, credit_balance, credits_period_start, credits_period_plan
         FROM tenants WHERE id = $1 FOR UPDATE`,
      [tenantId]
    );
    if (!r.rows.length) return 0;
    const t = r.rows[0];
    const plan = planById(t.plan);
    const allot = plan?.credits || 0;
    const now = Date.now();
    const start = t.credits_period_start ? new Date(t.credits_period_start).getTime() : null;
    const newPeriod = start === null || (now - start) >= PERIOD_MS;
    const planChanged = t.credits_period_plan && t.credits_period_plan !== t.plan;

    if (allot > 0 && (newPeriod || planChanged)) {
      const newBal = Number(t.credit_balance) + allot;
      await client.query(
        `UPDATE tenants
            SET credit_balance = $2, credits_period_start = now(),
                credits_period_plan = $3, updated_at = now()
          WHERE id = $1`,
        [tenantId, newBal, t.plan]
      );
      await client.query(
        `INSERT INTO credit_ledger (tenant_id, delta, reason, balance_after, actor)
         VALUES ($1, $2, 'monthly_grant', $3, 'system')`,
        [tenantId, allot, newBal]
      );
      return newBal;
    }
    return Number(t.credit_balance);
  });
}

/** Current balance after applying any due monthly grant. */
export async function getBalance(tenantId) {
  return ensureMonthlyGrant(tenantId);
}

/** Set of entity ids (of one type) this tenant has already revealed. */
export async function getRevealedSet(tenantId, entityType, ids) {
  if (!ids || !ids.length) return new Set();
  const r = await query(
    `SELECT entity_id FROM tenant_reveals
      WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = ANY($3::bigint[])`,
    [tenantId, entityType, ids]
  );
  return new Set(r.rows.map((x) => Number(x.entity_id)));
}

/**
 * Reveal a single entity for a tenant. Charges 1 credit if not already revealed.
 * Returns { revealed, charged, already, balance, insufficient }.
 */
// Notify the tenant's users when a charge takes their balance across a low
// threshold (once per crossing). Fire-and-forget; never blocks a reveal.
async function lowCreditCheck(tenantId, after, charged) {
  if (!charged) return;
  const before = after + charged;
  for (const T of [0, 10]) {
    if (before > T && after <= T) {
      const out = T === 0;
      notifyTenant(tenantId, {
        category: 'account', type: out ? 'credits_out' : 'credits_low',
        title: out ? "You're out of credits" : `Credits running low — ${after} left`,
        body: out
          ? 'Top up to keep revealing contacts and running research (1 credit per reveal).'
          : `You have ${after} credit${after === 1 ? '' : 's'} remaining. Top up to avoid interruptions.`,
        link: '/billing', icon: 'megaphone', email: true,
      }).catch(() => {});
      break;
    }
  }
}

export async function revealOne(tenantId, entityType, entityId, actor) {
  await ensureMonthlyGrant(tenantId);
  const result = await withTransaction(async (client) => {
    const exists = await client.query(
      `SELECT 1 FROM tenant_reveals WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3`,
      [tenantId, entityType, entityId]
    );
    const balRow = await client.query(
      `SELECT credit_balance FROM tenants WHERE id = $1 FOR UPDATE`, [tenantId]
    );
    const balance = Number(balRow.rows[0]?.credit_balance ?? 0);

    if (exists.rows.length) {
      return { revealed: true, charged: 0, already: true, balance, insufficient: false };
    }
    if (balance < 1) {
      return { revealed: false, charged: 0, already: false, balance, insufficient: true };
    }
    const newBal = balance - 1;
    await client.query(`UPDATE tenants SET credit_balance = $2, updated_at = now() WHERE id = $1`, [tenantId, newBal]);
    await client.query(
      `INSERT INTO tenant_reveals (tenant_id, entity_type, entity_id, revealed_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING`,
      [tenantId, entityType, entityId, actor]
    );
    await client.query(
      `INSERT INTO credit_ledger (tenant_id, delta, reason, balance_after, ref_type, ref_id, actor)
       VALUES ($1, -1, $2, $3, $4, $5, $6)`,
      [tenantId, entityType === 'person' ? 'reveal_person' : 'reveal_company', newBal, entityType, entityId, actor]
    );
    return { revealed: true, charged: 1, already: false, balance: newBal, insufficient: false };
  });
  lowCreditCheck(tenantId, result.balance, result.charged);
  return result;
}

/**
 * Bulk reveal. Charges 1 credit per not-yet-revealed id, in id order, up to the
 * available balance (partial — reveals as many as affordable).
 * Returns { requested, already, revealed, insufficient, charged, balance }.
 */
export async function revealBulk(tenantId, entityType, ids, actor) {
  await ensureMonthlyGrant(tenantId);
  const unique = [...new Set(ids.map(Number).filter(Number.isFinite))];
  const result = await withTransaction(async (client) => {
    const balRow = await client.query(
      `SELECT credit_balance FROM tenants WHERE id = $1 FOR UPDATE`, [tenantId]
    );
    let balance = Number(balRow.rows[0]?.credit_balance ?? 0);

    const existing = await client.query(
      `SELECT entity_id FROM tenant_reveals
        WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = ANY($3::bigint[])`,
      [tenantId, entityType, unique]
    );
    const alreadySet = new Set(existing.rows.map((x) => Number(x.entity_id)));
    const need = unique.filter((id) => !alreadySet.has(id));
    const toReveal = need.slice(0, balance);

    for (const id of toReveal) {
      await client.query(
        `INSERT INTO tenant_reveals (tenant_id, entity_type, entity_id, revealed_by) VALUES ($1,$2,$3,$4)
         ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING`,
        [tenantId, entityType, id, actor]
      );
    }
    const charged = toReveal.length;
    if (charged > 0) {
      balance -= charged;
      await client.query(`UPDATE tenants SET credit_balance = $2, updated_at = now() WHERE id = $1`, [tenantId, balance]);
      await client.query(
        `INSERT INTO credit_ledger (tenant_id, delta, reason, balance_after, ref_type, actor)
         VALUES ($1, $2, 'bulk_reveal', $3, $4, $5)`,
        [tenantId, -charged, balance, entityType, actor]
      );
    }
    return {
      requested: unique.length,
      already: alreadySet.size,
      revealed: charged,
      insufficient: need.length - charged,
      charged,
      balance,
    };
  });
  lowCreditCheck(tenantId, result.balance, result.charged);
  return result;
}

/**
 * Admin add/deduct. delta may be negative; balance is clamped at 0.
 * Returns the new balance.
 */
export async function adminAdjust(tenantId, delta, actor, note) {
  return withTransaction(async (client) => {
    const balRow = await client.query(
      `SELECT credit_balance FROM tenants WHERE id = $1 FOR UPDATE`, [tenantId]
    );
    if (!balRow.rows.length) throw new Error('tenant_not_found');
    const balance = Number(balRow.rows[0].credit_balance);
    const newBal = Math.max(0, balance + Number(delta));
    await client.query(`UPDATE tenants SET credit_balance = $2, updated_at = now() WHERE id = $1`, [tenantId, newBal]);
    await client.query(
      `INSERT INTO credit_ledger (tenant_id, delta, reason, balance_after, actor)
       VALUES ($1, $2, 'admin_adjust', $3, $4)`,
      [tenantId, newBal - balance, newBal, actor + (note ? ` (${note})` : '')]
    );
    return newBal;
  });
}

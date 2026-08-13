// When two companies become one, the customer's own data must follow the survivor.
//
// ⚠️ THE GAP THIS CLOSES, confirmed by adversarial review 2026-08-13. Merges happen on the ENGINE
// BOX, and mergeCompanies re-parents every canonical child table there. But the tables a TENANT
// owns — their CRM pipeline, their paid reveals, their saved lists, their contributed datapoints —
// live only on PRODUCTION, are not mirrored, and were re-pointed by NOTHING. Worse, the merge
// tombstones the duplicate's contact rows on prod (those tables ARE mirrored), so a tenant whose
// CRM record pointed at the duplicate watched its contacts physically disappear while their
// record stayed frozen on an archived shell. A reveal they PAID for stopped accruing data.
//
// The repair key is already delivered: every push carries companies.canonical_id, so production
// knows exactly where each duplicate went. This walks the tenant tables and re-points them along
// that pointer — on prod, called via the sync route after every push; locally, called by the push
// itself (the local Portal has tenant data too: Val's own CRM).
//
// ── COLLISIONS ARE LEFT ALONE, LOUDLY ────────────────────────────────────────────────────────
// crm_records is UNIQUE (tenant_id, entity_type, entity_id). If a tenant tracked BOTH duplicates,
// re-pointing one row onto the other's key would either crash or force Bell to delete a record
// carrying the tenant's own notes and deals. Neither is Bell's call to make silently — those rows
// are counted and reported, never touched. Measured today they are rare to nonexistent; if one
// ever appears, the count in the push summary is where it shows up.
//
// ── WHAT IS DELIBERATELY NOT RE-POINTED ──────────────────────────────────────────────────────
// credit_ledger. It is a LEDGER: "spent 1 credit on entity X at time T" is a historical fact
// about a purchase, and rewriting history to say the tenant bought Y instead is falsification,
// not repair. The reveal row (tenant_reveals) is the LIVE entitlement and IS re-pointed — that
// is what makes the paid reveal keep working. Same doctrine as dedup_candidates: an audit trail
// records what happened, not what later became true.

import { query } from '../db.js';

// (table, refColumns, uniqueKeyCols) — uniqueKeyCols null = no collision possible, plain re-point.
const POLYMORPHIC = [
  { table: 'crm_records',            unique: ['tenant_id'] },
  { table: 'tenant_reveals',         unique: ['tenant_id'] },
  { table: 'crm_list_members',       unique: ['list_id'] },
  { table: 'contributed_datapoints', unique: ['tenant_id', 'field', 'value'] },
];

/**
 * Re-point tenant-owned references from merged-away companies to their canonical survivor.
 * Idempotent; safe to run after every push. Never deletes anything.
 * @returns {{repointed: object, collisions: object}}
 */
export async function reconcileMergedEntityRefs() {
  const repointed = {};
  const collisions = {};

  for (const { table, unique } of POLYMORPHIC) {
    try {
      const scopeEq = unique.map((c) => `k.${c} = t.${c}`).join(' AND ');
      const upd = await query(`
        UPDATE ${table} t
           SET entity_id = c.canonical_id
          FROM companies c
         WHERE t.entity_type = 'company'
           AND c.id = t.entity_id
           AND c.canonical_id IS NOT NULL
           AND c.canonical_id <> t.entity_id
           AND NOT EXISTS (
             SELECT 1 FROM ${table} k
              WHERE ${scopeEq} AND k.entity_type = 'company' AND k.entity_id = c.canonical_id)`);
      if (upd.rowCount) repointed[table] = upd.rowCount;
      const col = await query(`
        SELECT count(*)::int n FROM ${table} t
          JOIN companies c ON c.id = t.entity_id AND t.entity_type = 'company'
         WHERE c.canonical_id IS NOT NULL AND c.canonical_id <> t.entity_id`);
      if (col.rows[0].n) collisions[table] = col.rows[0].n;
    } catch (err) {
      // A deployment that lacks one of these tables (or a future rename) must not break the push.
      collisions[table] = 'error: ' + String(err.message).slice(0, 120);
    }
  }

  // Plain company_id references with no unique key in the way.
  for (const { table, column } of [
    { table: 'outreach_targets', column: 'company_id' },
    { table: 'zero_risk_deals',  column: 'company_id' },
  ]) {
    try {
      const upd = await query(`
        UPDATE ${table} t
           SET ${column} = c.canonical_id
          FROM companies c
         WHERE c.id = t.${column}
           AND c.canonical_id IS NOT NULL
           AND c.canonical_id <> t.${column}`);
      if (upd.rowCount) repointed[table] = upd.rowCount;
    } catch (err) {
      collisions[table] = 'error: ' + String(err.message).slice(0, 120);
    }
  }

  return { repointed, collisions };
}

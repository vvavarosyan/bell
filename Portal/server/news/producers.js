// Market Feed producers (non-news event types).
//
// These turn Bell's own data activity into feed_events so the Market Feed is an
// "everything stream", not just news. Phase 2 starts with company registrations;
// research → feed (with exclusivity window) and signals come next.
//
// Runs on the always-on engine (BDI_NEWS_ENGINE=1). Idempotent — feed_events has
// UNIQUE (kind, ref_table, ref_id), so re-runs never duplicate.

import { query } from '../db.js';

/**
 * Emit "New company registered" events for companies that have recently arrived
 * (created in the last 48h, assembled, not archived) and aren't in the feed yet.
 * The mirror carries each company's original created_at, so this only fires for
 * genuinely fresh companies — never a backfill flood of old records.
 */
export async function emitCompanyRegistrations() {
  const r = await query(`
    INSERT INTO feed_events
      (kind, ref_table, ref_id, title, summary, category, source_name, importance, linked_company_ids, occurred_at)
    SELECT 'company_registered', 'companies', c.id,
           'New company registered: ' || c.name,
           NULLIF(concat_ws(' · ', c.industry, c.city), ''),
           'corporate', 'Bell Registry', 0.3, ARRAY[c.id]::bigint[], c.created_at
      FROM (
        SELECT id, name, industry, city, created_at
          FROM companies
         WHERE bin IS NOT NULL AND archived = false
           AND created_at > now() - interval '48 hours'
           AND NOT EXISTS (
             SELECT 1 FROM feed_events fe
              WHERE fe.kind = 'company_registered'
                AND fe.ref_table = 'companies'
                AND fe.ref_id = companies.id)
         ORDER BY created_at DESC
         LIMIT 100
      ) c
    ON CONFLICT (kind, ref_table, ref_id) DO NOTHING
    RETURNING id`);
  return { emitted: r.rowCount };
}

/** Run all producers. Returns a small summary. */
export async function runProducers() {
  const out = {};
  try { out.company_registrations = (await emitCompanyRegistrations()).emitted; }
  catch (e) { out.error = e.message; }
  return out;
}

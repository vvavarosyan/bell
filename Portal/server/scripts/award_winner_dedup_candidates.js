// Award-winner duplicate pairs → the Dedup Queue (Operation Data Trust, task #108 part 1).
//
// The buyer's award page states the winner TWICE: by name and by CR number. When the name pass
// linked a tender to a company that holds NO registrations, while the stated CR resolves to a
// registry-backed company, the page has named the same firm in two Bell rows — the East West
// shape found 2026-08-17 (tender 34778: "East West Trading International" id 188380 no-CR vs
// "East & West Trading International Est." id 170443 CR 24795). Measured: 216 tenders across
// 22 distinct no-CR companies.
//
// This queues each pair in dedup_candidates with the literal evidence for Val's click in the
// local Portal → Dedup Queue. Nothing merges automatically. Idempotent — the (a,b) unique key
// absorbs re-runs.
//
//   node scripts/award_winner_dedup_candidates.js

import { query, pool } from '../db.js';

async function main() {
  const r = await query(`
    WITH w AS (
      SELECT t.id AS tender_id, t.award_company_id,
             ltrim(split_part(t.raw->'award_report'->'winner'->'registrations'->>0,'/',1),'0') AS base
        FROM tenders t
       WHERE t.raw->'award_report'->'winner'->'registrations'->>0 IS NOT NULL
         AND t.award_company_id IS NOT NULL),
    pairs AS (
      SELECT w.award_company_id AS noreg_id,
             (SELECT c.id FROM company_registrations r JOIN companies c ON c.id = r.company_id
               WHERE ltrim(split_part(r.number,'/',1),'0') = w.base
                 AND COALESCE(c.archived,false) = false AND c.canonical_id IS NULL
               ORDER BY (r.body IN ('MOCI','QCCI','company_record','CRA')) DESC, c.id
               LIMIT 1) AS cr_id,
             w.base, count(*)::int AS tenders
        FROM w
       WHERE length(w.base) >= 4
         AND NOT EXISTS (SELECT 1 FROM company_registrations r WHERE r.company_id = w.award_company_id)
       GROUP BY 1, w.base),
    ins AS (
      SELECT LEAST(noreg_id, cr_id) AS a, GREATEST(noreg_id, cr_id) AS b,
             jsonb_build_array('award_page_names_both(cr ' || base || ', ' || tenders || ' tender' || CASE WHEN tenders = 1 THEN '' ELSE 's' END || ')') AS reasons
        FROM pairs
       WHERE cr_id IS NOT NULL AND cr_id <> noreg_id
         AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = noreg_id AND (COALESCE(c.archived,false) OR c.canonical_id IS NOT NULL)))
    INSERT INTO dedup_candidates (company_a_id, company_b_id, similarity_score, similarity_reasons)
    SELECT DISTINCT ON (a, b) a, b, 0.950, reasons FROM ins
    ON CONFLICT (company_a_id, company_b_id) DO NOTHING`);
  console.log(`${r.rowCount} award-winner duplicate pair(s) queued for review (local Portal → Dedup Queue).`);
}

main().then(() => pool.end()).then(() => process.exit(0))
  .catch(async (e) => { console.error('Stopped:', e.stack || e.message); await pool.end().catch(() => {}); process.exit(1); });

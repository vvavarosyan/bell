// Companies that WON Qatar government tenders and are NOT in Bell.
//
// The award-winner CR linker (2026-08-17) resolved 1,254 winners to existing companies by the
// CR number printed on the buyer's own award page. What remained is not residue — it is the
// strongest discovery evidence Bell has ever held: 578 distinct winner names across 1,966
// awarded tenders whose stated CR resolves to NO company in the database. Each one is a firm
// the STATE says exists (name + commercial registration number + contract awarded, on a
// government page), provably trading at contract scale, missing from Bell.
//
// Same machinery as the hiring queue (jobs/hiring_candidates.js): the review card goes in
// spark_discoveries (relation='awarded') and inherits promote/ignore/dedup. On Val's approve,
// the promote path creates the company, records the stated CR as a company_record
// registration, and the CR linker attaches the tenders it won — the card's evidence becomes
// the company's record in one click.
//
// ⚠️ NOTHING IS CREATED AUTOMATICALLY. A government page is strong evidence, but creation is
// Val's click, same as every discovery path.

import { query } from '../db.js';
import { isSpecificEmployer, employerCore } from '../jobs/attribute.js';

/**
 * Queue unresolved award winners for review. Re-running is safe: names already queued,
 * promoted or ignored are skipped, and a CR that meanwhile resolves (a company was added)
 * drops out of the selection by itself.
 */
export async function queueAwardWinnerCandidates({ log = () => {}, apply = true, limit = 600 } = {}) {
  const rows = (await query(`
    WITH w AS (
      SELECT t.id, t.buyer, t.awarded_at,
             btrim(t.raw->'award_report'->'winner'->>'name') AS name,
             ltrim(split_part(reg.val,'/',1),'0')            AS base,
             NULLIF(t.raw->'award_report'->'winner'->>'approved_value','')::numeric AS approved_value
        FROM tenders t,
             LATERAL jsonb_array_elements_text(t.raw->'award_report'->'winner'->'registrations') reg(val)
       WHERE t.award_company_id IS NULL
         AND COALESCE(btrim(t.raw->'award_report'->'winner'->>'name'),'') <> ''
         AND length(ltrim(split_part(reg.val,'/',1),'0')) >= 4),
    unresolved AS (
      SELECT * FROM w WHERE NOT EXISTS (
        SELECT 1 FROM company_registrations r
         WHERE ltrim(split_part(r.number,'/',1),'0') = w.base))
    SELECT lower(name) AS key, (array_agg(name))[1] AS name,
           array_agg(DISTINCT base)                 AS crs,
           count(DISTINCT id)::int                  AS tender_count,
           array_agg(DISTINCT id)                   AS tender_ids,
           (array_agg(DISTINCT buyer) FILTER (WHERE buyer IS NOT NULL))[1:4] AS buyers,
           max(awarded_at)                          AS latest_awarded,
           sum(approved_value)                      AS total_value
      FROM unresolved
     GROUP BY 1
     ORDER BY count(DISTINCT id) DESC
     LIMIT $1`, [limit])).rows;

  const out = { candidates: rows.length, queued: 0, skipped_existing: 0, skipped_vague: 0 };
  for (const r of rows) {
    // The same specificity gate the job matcher uses — "Trading Company" names a category.
    if (!isSpecificEmployer(r.name)) { out.skipped_vague++; continue; }

    // Already known to the queue in any state — including 'ignored', which stays ignored.
    const seen = await query(
      `SELECT 1 FROM spark_discoveries WHERE relation = 'awarded' AND lower(btrim(name)) = lower(btrim($1)) LIMIT 1`,
      [r.name]);
    if (seen.rows.length) { out.skipped_existing++; continue; }

    // Ambiguous-not-absent guard: if a live company already carries this NAME (the CR simply
    // differs — an old CR, a branch, a data gap), this is a reconciliation question, not a
    // missing company. Queueing it as "missing" would mint a duplicate on approve.
    const exists = await query(
      `SELECT 1 FROM companies
        WHERE COALESCE(archived,false) = false AND canonical_id IS NULL
          AND btrim(regexp_replace(regexp_replace(lower(replace(name, '&', ' and ')), '[^a-z0-9؀-ۿ]+', ' ', 'g'), '\\s+', ' ', 'g')) = $1
        LIMIT 1`, [employerCore(r.name)]);
    if (exists.rows.length) { out.skipped_existing++; continue; }

    if (!apply) { out.queued++; continue; }
    await query(
      `INSERT INTO spark_discoveries (name, country, relation, source_url, raw, status)
       VALUES ($1, 'Qatar', 'awarded', NULL, $2::jsonb, 'new')`,
      [String(r.name).slice(0, 300), JSON.stringify({
        crs: r.crs, tender_count: r.tender_count, tender_ids: r.tender_ids,
        buyers: r.buyers, latest_awarded: r.latest_awarded,
        total_value: r.total_value != null ? Number(r.total_value) : null,
        why: `won ${r.tender_count} government tender${r.tender_count === 1 ? '' : 's'} under CR ${r.crs.join(', ')} — and Bell holds no company with that registration`,
      })]);
    out.queued++;
  }

  log(`  award-winner candidates: ${out.queued} queued · ${out.skipped_existing} already known/named · ${out.skipped_vague} too vague`);
  return out;
}

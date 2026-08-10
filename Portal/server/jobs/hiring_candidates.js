// Companies that are hiring in Qatar and are NOT in Bell.
//
// Val, 2026-08-10, looking at the Jobs tab: "many jobs are not having company, which does not make
// sense. Why is this? and can we somehow fix it?"
//
// Two different reasons, and only one of them is fixable:
//
//   • 34 Oracle requisitions state NO employer at all — that platform publishes none (verified on
//     86 of 86 sampled). There is nothing to match, and inferring the employer from which website
//     the board sits on is the guess that would put a Chennai vacancy on a Doha trading firm. Those
//     stay unattached, correctly, forever.
//
//   • ~117 classifieds vacancies DO name their employer — Bell simply has no company by that name.
//     "Fornax Global", "Nasser Al Jaber Group", "Trilogistics WLL", "Al Majed Group". Those are not
//     a gap in the job data. They are real Qatar firms, advertising real vacancies, missing from
//     the database — which makes them the best-evidenced discovery leads Bell has. A company that
//     is spending money to hire is trading, staffed, and reachable.
//
// So an unattributed vacancy is turned into a review card rather than left as a blank cell. The row
// goes in the existing spark_discoveries queue (relation='hiring') so it inherits the promote and
// ignore machinery, the dedup guard and the UI that already work.
//
// ⚠️ NOTHING IS CREATED AUTOMATICALLY. Every card is Val's click, for the same reason the job
// matcher refuses an ambiguous name: an advert is a claim about who is hiring, not proof that a
// company exists under exactly that name. Promotion runs the same duplicate check as every other
// discovery path.

import { query } from '../db.js';
import { isSpecificEmployer, employerCore } from './attribute.js';

/**
 * Collect the employers named on unattributed vacancies and queue them for review.
 *
 * Re-running is safe and cheap: an employer already queued, already promoted, or already ignored
 * is skipped, so a nightly call adds only what is genuinely new. An ignored name never comes back —
 * that decision is Val's and it sticks.
 *
 * @returns {{queued:number, skipped_existing:number, skipped_vague:number, candidates:number}}
 */
export async function queueHiringCandidates({ log = () => {}, apply = true } = {}) {
  // One row per distinct stated employer, with the evidence attached: how many live vacancies
  // name it, what they are, and where they are. That evidence IS the review card.
  const rows = (await query(`
    SELECT j.employer_stated                                   AS name,
           count(*)::int                                       AS job_count,
           (array_agg(j.title ORDER BY j.posted_at DESC NULLS LAST))[1:4]         AS titles,
           (array_agg(j.location_text ORDER BY j.posted_at DESC NULLS LAST))[1]   AS location,
           max(j.posted_at)                                    AS latest_posted,
           (array_agg(j.source ORDER BY j.posted_at DESC NULLS LAST))[1]          AS source
      FROM jobs j
     WHERE j.company_id IS NULL
       AND j.closed_at IS NULL
       AND j.employer_stated IS NOT NULL
       AND btrim(j.employer_stated) <> ''
     GROUP BY j.employer_stated
     ORDER BY count(*) DESC`)).rows;

  const out = { candidates: rows.length, queued: 0, skipped_existing: 0, skipped_vague: 0 };

  for (const r of rows) {
    // The same specificity gate the matcher uses. "Confidential", "Trading Company" and the like
    // name a category, not a firm — queueing them would just make Val reject them one by one.
    if (!isSpecificEmployer(r.name)) { out.skipped_vague++; continue; }

    // Already known to this queue in any state — including 'ignored', which must stay ignored.
    const seen = await query(
      `SELECT 1 FROM spark_discoveries WHERE relation = 'hiring' AND lower(btrim(name)) = lower(btrim($1)) LIMIT 1`,
      [r.name]);
    if (seen.rows.length) { out.skipped_existing++; continue; }

    // And a last check against the live database: the matcher may have refused this name only
    // because it was AMBIGUOUS (two companies share it), which is not the same as absent. Queueing
    // an ambiguous name as "missing" would be wrong.
    const exists = await query(
      `SELECT 1 FROM companies
        WHERE COALESCE(archived,false) = false AND canonical_id IS NULL
          AND btrim(regexp_replace(regexp_replace(lower(replace(name, '&', ' and ')), '[^a-z0-9؀-ۿ]+', ' ', 'g'), '\\s+', ' ', 'g')) = $1
        LIMIT 1`, [employerCore(r.name)]);
    if (exists.rows.length) { out.skipped_existing++; continue; }

    if (!apply) { out.queued++; continue; }
    await query(
      `INSERT INTO spark_discoveries (name, country, relation, source_url, raw, status)
       VALUES ($1, 'Qatar', 'hiring', NULL, $2::jsonb, 'new')`,
      [String(r.name).slice(0, 300), JSON.stringify({
        job_count: r.job_count, titles: r.titles, location: r.location,
        latest_posted: r.latest_posted, job_source: r.source,
        why: `${r.job_count} live vacanc${r.job_count === 1 ? 'y' : 'ies'} name this employer, and Bell holds no company by that name`,
      })]);
    out.queued++;
  }

  log(`  hiring candidates: ${out.queued} queued · ${out.skipped_existing} already known · ${out.skipped_vague} too vague to be a company name`);
  return out;
}

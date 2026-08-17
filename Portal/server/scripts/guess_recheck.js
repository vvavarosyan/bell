// The guessed-website re-check — Operation Data Trust B2, the slow lane.
//
// 13,020 companies carry a website the old finder INVENTED from their name, one company per
// domain (the shared-domain class has its own cleanup). Each is a claim customers can see, and
// nobody has ever checked it against the live page. Every night this examines a batch with the
// SAME gate the candidate queue uses (gateDecision — full-name-as-a-phrase + Qatar context) and
// records one of three honest outcomes:
//
//   CONFIRMED — the page states the company's name as a phrase, in a Qatar context. The claim
//     stops being a guess: method becomes 'guess_confirmed' (original kept), and the
//     contamination cleanup will no longer treat it as guessed.
//   WITHDRAWN — the domain is parked or the page is gone (404/410) on TWO nights. One bad
//     night is not evidence (the jobs-closure lesson: a hiccup must never delete a live
//     record) — the first strike only stamps recheck_miss; the second, on a later run,
//     withdraws the website and everything harvested from it, tombstoned, columns resynced.
//   UNPROVEN — reachable but the page doesn't prove the name (or the name is too generic to
//     prove). Nothing is deleted on absence-of-proof; the visit is stamped so the rotation
//     moves on and the claim can be judged by a human or a later signal.
//
// ~400/night → the whole pile is examined in about a month, free, on the ROG.
//
//   node scripts/guess_recheck.js [limit]     # run one batch by hand

import { query, pool } from '../db.js';
import { resyncContactColumns } from '../lib/contacts.js';
import { gateDecision, fetchPage } from './confirm_website_candidates.js';

const HOST_EXPR = `lower(regexp_replace(regexp_replace(website,'^https?://',''),'^www\\.|/.*$','','g'))`;

/** One nightly batch. fetchPageFn and onlyIds are injectable for tests (the auto_merge
 *  onlyBases precedent) — a test must never batch-mutate real rows. */
export async function recheckGuessedWebsites({ limit = 400, log = console.log, fetchPageFn = fetchPage, onlyIds = null } = {}) {
  // Single-owner guessed domains only, least-recently-examined first. Shared guessed domains
  // belong to the contamination cleanup (Apply Guessed Website Cleanup.command) — two tools
  // ruling on the same row would fight.
  const batch = (await query(`
    WITH guessed AS (
      SELECT id, name, website, extra_fields, ${HOST_EXPR} AS host
        FROM companies
       WHERE COALESCE(archived,false) = false AND website IS NOT NULL
         AND extra_fields->'website_found'->>'method' = 'guess'
         AND ($2::bigint[] IS NULL OR id = ANY($2::bigint[])))
    SELECT g.* FROM guessed g
     WHERE (SELECT count(*) FROM guessed g2 WHERE g2.host = g.host) = 1
     ORDER BY COALESCE((extra_fields->'website_found'->>'recheck_at')::timestamptz, 'epoch'::timestamptz), id
     LIMIT $1`, [limit, onlyIds])).rows;

  const out = { checked: 0, confirmed: 0, cleared: 0, unproven: 0, first_strikes: 0 };
  for (const c of batch) {
    out.checked++;
    const page = await fetchPageFn(c.website);
    const d = gateDecision({ companyName: c.name, url: c.website, status: page.status, html: page.html });
    const wf = (c.extra_fields || {}).website_found || {};

    if (d.verdict === 'approve') {
      // The page itself states the company — the claim is no longer a guess.
      await query(`
        UPDATE companies
           SET extra_fields = jsonb_set(extra_fields, '{website_found}',
                 (extra_fields->'website_found') - 'recheck_miss'
                 || jsonb_build_object('method', 'guess_confirmed', 'original_method', 'guess',
                                       'confirmed_at', now(), 'confirmed_why', $2::text)),
               updated_at = now()
         WHERE id = $1`, [c.id, d.why]);
      out.confirmed++;
      continue;
    }

    if (d.verdict === 'reject') {
      if (!wf.recheck_miss) {
        // FIRST strike: record it, withdraw nothing. A parked lander or a 404 tonight can be a
        // registrar hiccup or a migration; only the same verdict on a later night is evidence.
        await query(`
          UPDATE companies
             SET extra_fields = jsonb_set(extra_fields, '{website_found,recheck_miss}',
                   jsonb_build_object('at', now(), 'why', $2::text))
           WHERE id = $1`, [c.id, d.why]);
        out.first_strikes++;
        continue;
      }
      // SECOND strike: withdraw the claim and everything derived from it (the same treatment as
      // the shared-domain cleanup — description/keywords/logo describe a page that is not this
      // company's, and contacts harvested from it are not this company's contacts).
      await query(`
        WITH gone AS (
          DELETE FROM company_contacts
           WHERE company_id = $1
             AND (source ILIKE '%stage7%' OR source ILIKE '%website%' OR source ILIKE '%harvest%')
          RETURNING id)
        INSERT INTO sync_deletions (table_name, row_id) SELECT 'company_contacts', id FROM gone`,
        [c.id]);
      await query(`
        UPDATE companies
           SET website = NULL,
               extra_fields = (extra_fields - 'website_found' - 'website_description' - 'website_keywords' - 'website_logo_url')
                              || jsonb_build_object('website_guess_cleared',
                                   jsonb_build_object('host', ${HOST_EXPR.replace(/website/g, '$2::text')}, 'at', now(),
                                                      'why', $3::text, 'first_strike', $4::text)),
               stage8_status = 'no_data', stage8_at = now(),
               stage7_status = NULL, stage7_at = NULL,
               updated_at = now()
         WHERE id = $1`, [c.id, c.website, d.why, JSON.stringify(wf.recheck_miss)]);
      await resyncContactColumns('company', c.id).catch(() => {});
      out.cleared++;
      continue;
    }

    // pending — reachable-but-unproven, or unreachable tonight. Stamp the visit; touch nothing
    // else. An existing miss stamp stays: 'unreachable' tonight neither confirms nor clears a
    // parked verdict from last night.
    await query(`
      UPDATE companies
         SET extra_fields = jsonb_set(extra_fields, '{website_found}',
               extra_fields->'website_found'
               || jsonb_build_object('recheck_at', now(), 'recheck_why', $2::text))
       WHERE id = $1`, [c.id, d.why]);
    out.unproven++;
  }

  log(`guess re-check: ${out.checked} examined · ${out.confirmed} confirmed by the page · ` +
      `${out.cleared} withdrawn (second strike) · ${out.first_strikes} first-strike · ${out.unproven} unproven`);
  return out;
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const limit = Number(process.argv[2]) || 400;
  recheckGuessedWebsites({ limit })
    .then(() => pool.end()).then(() => process.exit(0))
    .catch(async (e) => { console.error('Stopped:', e.stack || e.message); await pool.end().catch(() => {}); process.exit(1); });
}

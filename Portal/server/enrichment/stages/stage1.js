// Stage 1 — Firecrawl LinkedIn URL discovery.
//
// For each company without a linkedin_url, ask Firecrawl to find the
// company's LinkedIn page. We capture not just the chosen URL but the FULL
// list of candidates Firecrawl considered + the confidence score, so admin
// can verify the pick in the Portal and override if wrong.

import * as firecrawl from '../clients/firecrawl.js';
import { scoreLinkedInMatch } from '../clients/firecrawl.js';
import { query } from '../../db.js';

export const TOOL_NAME = 'firecrawl_spark_pro';
export const STAGE_LABEL = 'LinkedIn Discovery';
const CONCURRENCY = 5;            // parallel Firecrawl requests at once

// ---------------------------------------------------------------------------
// Stale-data cleanup. Fires when Stage 1's self-heal detects a wrong
// linkedin_url and wipes it. Without this, all the downstream
// LinkedIn-derived data (LinkedIn description / HQ city / employees /
// jobs / website-scraped contacts) stays stuck from the WRONG company —
// we hit exactly this with Qatar Airways inheriting British Airways'
// "Middlesex" city and 86 BA-employee links on 2026-05-23.
//
// What we DON'T touch:
//   - Stage 5 (Google Maps) — uses company NAME, not the LinkedIn URL,
//     so its data is independent and trusted.
//   - Original `name`, `name_normalized`, `legal_name`, `primary_registration_no`,
//     BIN — these come from ingest and are stable.
//   - `company_sources` raw scrape payloads.
// ---------------------------------------------------------------------------
export async function wipeStaleEnrichmentAfterUrlReplace(companyId) {
  const summary = { fields_wiped: 0, people_links_removed: 0, jobs_removed: 0, web_contacts_removed: 0 };

  // 1. Wipe LinkedIn-derived columns + the field set Stage 2 typically populates
  //    using NULLIF-protected writes. By zeroing them here, the next Stage 2/5
  //    run will be free to repopulate from the correct source.
  const wipeRes = await query(`
    UPDATE companies
    SET linkedin_url          = NULL,
        linkedin_id           = NULL,
        linkedin_description  = NULL,
        linkedin_followers    = NULL,
        linkedin_logo_url     = NULL,
        linkedin_cover_url    = NULL,
        linkedin_specialties  = NULL,
        linkedin_headquarters = NULL,
        linkedin_locations    = NULL,
        industry              = NULL,
        employee_count        = NULL,
        employee_count_range  = NULL,
        founded_year          = NULL,
        website               = NULL,
        phone                 = NULL,
        address               = NULL,
        city                  = NULL,
        country               = NULL,
        email                 = NULL,
        extra_fields          = (SELECT coalesce(jsonb_object_agg(k, val), '{}'::jsonb)
                                   FROM jsonb_each(extra_fields) AS e(k, val)
                                  WHERE k NOT LIKE 'linkedin_%' AND k NOT LIKE 'firecrawl_%'),
        stage2_status         = 'pending',
        stage2_at             = NULL,
        stage3_status         = 'pending',
        stage3_at             = NULL,
        stage4_status         = 'pending',
        stage4_at             = NULL,
        stage6_status         = 'pending',
        stage6_at             = NULL,
        updated_at            = now()
    WHERE id = $1
  `, [companyId]);
  if (wipeRes.rowCount > 0) summary.fields_wiped = 20;  // incl. linkedin_url, email, extra_fields

  // 2. Drop person→company links for this company. The persons themselves stay
  //    (they may belong to other companies). Only the wrong-company link is
  //    severed.
  const peopleRes = await query(`DELETE FROM person_companies WHERE company_id = $1 RETURNING id`, [companyId]);
  summary.people_links_removed = peopleRes.rowCount;

  // 3. Drop jobs that were attributed to this company. linkedin_job_url is the
  //    unique key, so re-running Stage 4 will re-fetch only legitimate postings.
  const jobsRes = await query(`DELETE FROM jobs WHERE company_id = $1 RETURNING id`, [companyId]);
  summary.jobs_removed = jobsRes.rowCount;

  // 4. Drop ALL enrichment-derived contacts (LinkedIn Stage 2/3, website Stage 6),
  //    which is where the wrong-company email/phone came from. Stage 5 (Google
  //    Maps) and ingest-/manual-derived contacts stay intact.
  const contactsRes = await query(
    `DELETE FROM company_contacts
      WHERE company_id = $1 AND source LIKE 'stage%' AND source NOT LIKE 'stage5%' RETURNING id`,
    [companyId],
  );
  summary.web_contacts_removed = contactsRes.rowCount;

  // 5. Drop discovered "similar companies" (those came from the WRONG LinkedIn
  //    page, so they're meaningless once the bad match is reset).
  const simRes = await query(`DELETE FROM similar_company_queue WHERE source_company_id = $1 RETURNING id`, [companyId]);
  summary.similar_removed = simRes.rowCount;

  return summary;
}

// ---------- single ---------------------------------------------------------

export async function enrichCompany(company) {
  return runOne(company);
}

// ---------- bulk -----------------------------------------------------------

export async function enrichCompanies(companies, jobLog) {
  let done = 0, noData = 0, failed = 0, totalUsd = 0;

  // Mark every target as 'running' up front so the UI dots animate.
  for (const c of companies) {
    await query(`UPDATE companies SET stage1_status = 'running' WHERE id = $1`, [c.id]);
  }

  // Pool runner: pulls from the queue, runs CONCURRENCY at a time.
  const queue = [...companies];
  let processed = 0;

  async function worker(i) {
    while (queue.length > 0) {
      const c = queue.shift();
      if (!c) return;
      const r = await runOne(c).catch(err => ({ status: 'failed', reason: err.message }));
      if (r.status === 'done')        done++;
      else if (r.status === 'no_data') noData++;
      else                              failed++;
      totalUsd += Number(r.usd || 0);
      processed++;
      const tag = r.status === 'done' ? '✓' : (r.status === 'no_data' ? '·' : '✗');
      jobLog?.(`  ${tag} [${processed}/${companies.length}] ${c.bin || '—'}  ${c.name}  — ${r.status}${r.reason ? ' ('+r.reason+')' : ''}${r.url ? ' → '+r.url : ''}`);
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, companies.length) }, (_, i) => worker(i));
  await Promise.all(workers);

  return { done, no_data: noData, failed, usd: totalUsd };
}

// ---------- core ----------------------------------------------------------

async function runOne(company) {
  // Refuse to call Firecrawl on placeholder names
  if (!company.name || /\(name missing\)/i.test(company.name)) {
    await markStage(company.id, 'no_data', { firecrawl_skipped_reason: 'placeholder_name' });
    return { status: 'no_data', usd: 0, reason: 'placeholder_name' };
  }

  // Strip any legacy firecrawl_slug_guesses left over from earlier code.
  await query(
    `UPDATE companies SET extra_fields = extra_fields - 'firecrawl_slug_guesses' WHERE id = $1`,
    [company.id],
  );

  // If a linkedin_url is already on the row, validate it against the company
  // name BEFORE assuming it's correct. A previous Stage 1 run (before name-
  // overlap validation was added) may have written the wrong URL; we re-check
  // every run so Stage 1 is self-healing.
  let existingValid = false;
  if (company.linkedin_url && /linkedin\.com\/company\//i.test(company.linkedin_url)) {
    const m = scoreLinkedInMatch(company.name, company.linkedin_url, '');
    if (m.accept) {
      await markStage(company.id, 'done', {
        firecrawl_confidence: m.score,
        firecrawl_skipped_reason: 'already_set_and_valid',
      });
      return {
        status: 'done',
        usd: 0,
        url: company.linkedin_url,
        reason: 'already_set_and_valid',
        confidence: m.score,
      };
    }
    // Existing URL doesn't match — wipe it so the discovery write can replace it.
    await query(
      `UPDATE companies
       SET linkedin_url = NULL,
           extra_fields = extra_fields || $2::jsonb
       WHERE id = $1`,
      [company.id, JSON.stringify({
        firecrawl_rejected_previous_url: company.linkedin_url,
        firecrawl_rejected_score:         m.score,
        firecrawl_rejected_at:            new Date().toISOString(),
      })],
    );

    // Cascade-cleanup: the downstream stages (2/3/4/6) have been writing
    // data tied to the WRONG company. Wipe it so the next enrichment pass
    // starts from a clean slate. Stage 5 (Google Maps) is left intact —
    // it uses the company name, not the LinkedIn URL.
    try {
      const cleanup = await wipeStaleEnrichmentAfterUrlReplace(company.id);
      // Record the cleanup in extra_fields so admin can see what happened.
      await query(
        `UPDATE companies SET extra_fields = extra_fields || $2::jsonb WHERE id = $1`,
        [company.id, JSON.stringify({
          firecrawl_self_heal_cleanup: {
            ...cleanup,
            replaced_url:  company.linkedin_url,
            replaced_at:   new Date().toISOString(),
          },
        })],
      );
    } catch (cleanupErr) {
      // Cleanup failure is non-fatal — the URL was still wiped and Stage 1
      // can still proceed. We just log it loud so admin sees something went
      // sideways and can re-run a manual cleanup.
      console.error(`[stage1] wipeStaleEnrichmentAfterUrlReplace failed for company #${company.id}:`, cleanupErr.message);
    }
    existingValid = false;
  }

  let result;
  try {
    result = await firecrawl.findLinkedInCompanyUrl(company.name);
  } catch (err) {
    await query(
      `UPDATE companies SET stage1_status = 'failed', stage1_at = now(),
              extra_fields = extra_fields || $2::jsonb
       WHERE id = $1`,
      [company.id, JSON.stringify({ firecrawl_error: err.message, firecrawl_at: new Date().toISOString() })]
    );
    throw err;
  }

  if (!result.url) {
    await markStage(company.id, 'no_data', {
      firecrawl_candidates:     result.candidates?.slice(0, 5) || [],
      firecrawl_no_data_reason: result.reason || 'no_linkedin_results',
    });
    return {
      status: 'no_data',
      usd: 0,
      reason: result.reason,
      candidates: result.candidates,
    };
  }

  // Found a URL — apply it, but only if the company doesn't already have one
  // set (admin override wins).
  await query(`
    UPDATE companies
    SET
      linkedin_url   = COALESCE(NULLIF(linkedin_url, ''), $2),
      stage1_status  = 'done',
      stage1_at      = now(),
      extra_fields   = extra_fields || $3::jsonb
    WHERE id = $1
  `, [
    company.id,
    result.url,
    JSON.stringify({
      firecrawl_url:        result.url,
      firecrawl_confidence: result.confidence,
      firecrawl_candidates: result.candidates?.slice(0, 5) || [],
      firecrawl_at:         new Date().toISOString(),
    }),
  ]);

  return { status: 'done', usd: 0, url: result.url, confidence: result.confidence };
}

async function markStage(companyId, status, extras = null) {
  if (extras) {
    extras.firecrawl_at = new Date().toISOString();
    await query(
      `UPDATE companies
       SET stage1_status = $2, stage1_at = now(),
           extra_fields  = extra_fields || $3::jsonb
       WHERE id = $1`,
      [companyId, status, JSON.stringify(extras)]
    );
  } else {
    await query(
      `UPDATE companies SET stage1_status = $2, stage1_at = now() WHERE id = $1`,
      [companyId, status]
    );
  }
}

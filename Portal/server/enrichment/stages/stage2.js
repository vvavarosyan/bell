// Stage 2 — LinkedIn Company Profile via Apify dev_fusion/Linkedin-Company-Scraper.
//
// Pricing: $0.008 per result (pay-per-event). Input is a list of LinkedIn
// company URLs (bulk supported natively). Output is rich: company profile,
// locations, similar orgs, affiliated orgs, founding info, etc.

import * as apify from '../clients/apify.js';
import { query, withTransaction } from '../../db.js';
import { normalizeName } from '../../ingest/normalize.js';

const ACTOR_ID = 'dev_fusion/Linkedin-Company-Scraper';
export const STAGE_LABEL = 'LinkedIn Company Profile';
export const TOOL_NAME = 'apify_dev_fusion_company';
const BATCH_SIZE = 100;          // URLs per Apify run
const PER_RESULT_USD = 0.008;    // PAY_PER_EVENT rate from the actor's pricing

// ---------- helpers ------------------------------------------------------

function nz(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
function numericOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeLinkedInUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return ('https://www.linkedin.com' + u.pathname).replace(/\/$/, '').toLowerCase();
  } catch { return String(url).toLowerCase().replace(/\/$/, ''); }
}

function buildAddress(hq) {
  if (!hq) return null;
  const parts = [hq.line1, hq.line2, hq.city, hq.geographicArea, hq.postalCode, hq.country]
    .filter(p => p && String(p).trim());
  return parts.length ? parts.join(', ') : null;
}

function buildEmployeeRange(rng) {
  if (!rng) return null;
  if (rng.start && rng.end) return `${rng.start}-${rng.end}`;
  if (rng.start && !rng.end) return `${rng.start}+`;
  if (!rng.start && rng.end) return `up to ${rng.end}`;
  return null;
}

// ---------- single ------------------------------------------------------

export async function enrichCompany(company) {
  if (!company.linkedin_url || !/linkedin\.com\/company\//i.test(company.linkedin_url)) {
    await markStage(company.id, 'no_data', { stage2_skipped: 'no_linkedin_url' });
    return { status: 'no_data', usd: 0, reason: 'no_linkedin_url' };
  }

  const r = await apify.runSync(ACTOR_ID, { profileUrls: [company.linkedin_url] }, { timeoutMs: 240_000 });
  const item = r[0] || null;
  if (!item) {
    await markStage(company.id, 'no_data', { stage2_skipped: 'no_actor_result' });
    return { status: 'no_data', usd: 0, reason: 'no_actor_result' };
  }
  await applyProfile(company.id, item);
  return { status: 'done', usd: 0, item };
}

// ---------- bulk ---------------------------------------------------------

export async function enrichCompanies(companies, jobLog) {
  let done = 0, noData = 0, failed = 0, totalUsd = 0;

  const eligible = [];
  for (const c of companies) {
    if (!c.linkedin_url || !/linkedin\.com\/company\//i.test(c.linkedin_url)) {
      await markStage(c.id, 'no_data', { stage2_skipped: 'no_linkedin_url' });
      noData++;
    } else {
      eligible.push(c);
    }
  }
  if (eligible.length === 0) {
    jobLog?.('  Nothing to enrich (no LinkedIn URLs on selection)');
    return { done, no_data: noData, failed, usd: 0 };
  }

  // Mark eligible as running
  for (const c of eligible) {
    await query(`UPDATE companies SET stage2_status = 'running' WHERE id = $1`, [c.id]);
  }

  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    const urlToCompany = new Map();
    for (const c of batch) {
      urlToCompany.set(normalizeLinkedInUrl(c.linkedin_url), c);
    }

    jobLog?.(`  batch ${i+1}-${i+batch.length}: sending ${batch.length} URLs to ${ACTOR_ID}...`);

    let runResult;
    try {
      runResult = await apify.runAndWait(
        ACTOR_ID,
        { profileUrls: batch.map(c => c.linkedin_url) },
        { pollMs: 4000, maxWaitMs: 30 * 60_000 },
      );
    } catch (err) {
      for (const c of batch) {
        await markStage(c.id, 'failed', { stage2_error: err.message });
        failed++;
      }
      jobLog?.(`  batch failed: ${err.message}`);
      continue;
    }

    // dev_fusion is PAY_PER_EVENT — usageTotalUsd is always 0 on the run
    // object, so compute cost from result count × per-event rate.
    const usd = runResult.items.length * PER_RESULT_USD;
    totalUsd += usd;
    jobLog?.(`  batch returned ${runResult.items.length} item(s) · $${usd.toFixed(4)}`);

    const handled = new Set();
    for (const item of runResult.items) {
      const itemUrl = normalizeLinkedInUrl(item.url);
      if (!itemUrl) {
        jobLog?.(`  · skipping result with no url`);
        continue;
      }
      let c = urlToCompany.get(itemUrl);
      let matchKind = 'exact';
      if (!c) {
        for (const [k, v] of urlToCompany) {
          if (k && (k.includes(itemUrl) || itemUrl.includes(k))) { c = v; matchKind = 'fuzzy'; break; }
        }
      }
      if (!c) {
        jobLog?.(`  ? no company matches actor url: ${itemUrl}`);
        continue;
      }
      const hasProfile = !!(item.companyName || item.industry || item.description);
      if (!hasProfile) {
        jobLog?.(`  · ${c.bin || c.id} ${c.name} — actor returned empty profile (URL likely dead)`);
        await markStage(c.id, 'no_data', { stage2_skipped: 'empty_actor_response', stage2_url_sent: c.linkedin_url });
        handled.add(c.id);
        noData++;
        continue;
      }
      await applyProfile(c.id, item);
      handled.add(c.id);
      done++;
      jobLog?.(`  ✓ ${c.bin || c.id} ${c.name} — ${matchKind} match · ${item.companyName || '(no name)'} · ${item.industry || '(no industry)'}`);
    }
    // Anyone not returned by the actor → no_data
    for (const c of batch) {
      if (!handled.has(c.id)) {
        await markStage(c.id, 'no_data', { stage2_skipped: 'no_actor_result', stage2_url_sent: c.linkedin_url });
        noData++;
      }
    }
  }

  return { done, no_data: noData, failed, usd: totalUsd };
}

// ---------- write the profile back to Postgres --------------------------

async function applyProfile(companyId, item) {
  const hq           = item.headquarter || null;
  const employeeRng  = buildEmployeeRange(item.employeeCountRange);
  const foundedYear  = item.foundedOn?.year || null;
  const address      = buildAddress(hq);

  const extras = {
    linkedin_company_name:           nz(item.companyName),
    linkedin_universal_name:         nz(item.universalName),
    linkedin_company_id:             item.companyId ?? null,
    linkedin_tagline:                nz(item.tagline),
    linkedin_hashtag:                nz(item.hashtag),
    linkedin_industry_v2_taxonomy:   nz(item.industryV2Taxonomy),
    linkedin_call_to_action:         item.callToAction || null,
    linkedin_employee_count_range:   item.employeeCountRange || null,
    linkedin_founded_on:             item.foundedOn || null,
    linkedin_crunchbase_funding:     item.crunchbaseFundingData || null,
    linkedin_affiliated_by_employees: item.affiliatedOrganizationsByEmployees || [],
    linkedin_affiliated_by_showcases: item.affiliatedOrganizationsByShowcases || [],
    linkedin_locations_count:        Array.isArray(item.locations) ? item.locations.length : 0,
    linkedin_similar_count:          Array.isArray(item.similarOrganizations) ? item.similarOrganizations.length : 0,
    linkedin_scraped_at:             new Date().toISOString(),
  };

  await query(`
    UPDATE companies
    SET
      linkedin_description    = COALESCE($2, linkedin_description),
      linkedin_followers      = COALESCE($3, linkedin_followers),
      linkedin_logo_url       = COALESCE($4, linkedin_logo_url),
      linkedin_cover_url      = COALESCE($5, linkedin_cover_url),
      linkedin_specialties    = COALESCE($6, linkedin_specialties),
      linkedin_headquarters   = COALESCE($7, linkedin_headquarters),
      linkedin_locations      = COALESCE($8::jsonb, linkedin_locations),
      linkedin_id             = COALESCE(linkedin_id, $9),
      industry                = COALESCE(NULLIF(industry, ''), $10),
      employee_count          = COALESCE($11, employee_count),
      employee_count_range    = COALESCE(NULLIF(employee_count_range, ''), $12),
      founded_year            = COALESCE(founded_year, $13),
      website                 = COALESCE(NULLIF(website, ''), $14),
      city                    = COALESCE(NULLIF(city, ''), $15),
      country                 = COALESCE(NULLIF(country, ''), $16),
      address                 = COALESCE(NULLIF(address, ''), $17),
      extra_fields            = extra_fields || $18::jsonb,
      stage2_status           = 'done',
      stage2_at               = now()
    WHERE id = $1
  `, [
    companyId,
    nz(item.description),
    numericOrNull(item.followerCount),
    nz(item.logoResolutionResult),
    nz(item.originalCoverImage) || nz(item.croppedCoverImage),
    Array.isArray(item.specialities) ? item.specialities : null,
    hq?.description || null,
    Array.isArray(item.locations) ? JSON.stringify(item.locations) : null,
    item.companyId ? String(item.companyId) : null,
    nz(item.industry),
    numericOrNull(item.employeeCount),
    employeeRng,
    foundedYear,
    nz(item.websiteUrl),
    nz(hq?.city),
    nz(hq?.country),
    address,
    JSON.stringify(extras),
  ]);

  // Handle similar organizations:
  //   - Qatar-headquartered → auto-add to scope (create a new companies row
  //     pre-seeded with the LinkedIn URL + stage1='done' so Stage 2/3/4 can
  //     run immediately) AND log in similar_company_queue as added_to_scope
  //   - Non-Qatar → log as skipped (we don't want non-Qatar companies in the
  //     active dataset)
  if (Array.isArray(item.similarOrganizations)) {
    for (const so of item.similarOrganizations) {
      if (!so?.url || !/linkedin\.com\/company\//i.test(so.url)) continue;
      const url = so.url.replace(/\/$/, '');
      const country = nz(so.headquarter?.country);
      const isQatar = country === 'QA';

      if (isQatar) {
        // Check if a company with this LinkedIn URL already exists
        const existing = await query(
          `SELECT id FROM companies WHERE linkedin_url = $1 LIMIT 1`,
          [url],
        );
        let newCompanyId = existing.rows[0]?.id;
        if (!newCompanyId) {
          const name = nz(so.name) || ('LinkedIn ' + url.split('/company/').pop());
          const ins = await query(`
            INSERT INTO companies
              (name, name_normalized, linkedin_url, linkedin_logo_url, linkedin_followers,
               is_active, archived, status_normalized, country, industry,
               employee_count_range,
               stage1_status, stage1_at,
               extra_fields)
            VALUES ($1, lower($1), $2, $3, $4,
                    true, false, 'active', 'Qatar', $5,
                    $6,
                    'done', now(),
                    $7::jsonb)
            RETURNING id
          `, [
            name,
            url,
            nz(so.logoResolutionResult),
            numericOrNull(so.followerCount),
            nz(so.industry) || nz(so.industryV2Taxonomy),
            buildEmployeeRange(so.employeeCountRange),
            JSON.stringify({
              created_via:                'stage2_similar_company',
              source_company_id:          companyId,
              linkedin_company_id_hint:   so.companyId ?? null,
            }),
          ]);
          newCompanyId = ins.rows[0].id;
        }
        await query(`
          INSERT INTO similar_company_queue
            (source_company_id, similar_linkedin_url, similar_name, similar_industry, similar_size,
             decision, decided_at, decided_by)
          VALUES ($1, $2, $3, $4, $5, 'added_to_scope', now(), 'auto:qatar')
          ON CONFLICT (source_company_id, similar_linkedin_url) DO UPDATE
            SET decision = 'added_to_scope', decided_at = now(), decided_by = 'auto:qatar'
        `, [
          companyId,
          url,
          nz(so.name),
          nz(so.industry) || nz(so.industryV2Taxonomy),
          buildEmployeeRange(so.employeeCountRange),
        ]);
      } else {
        await query(`
          INSERT INTO similar_company_queue
            (source_company_id, similar_linkedin_url, similar_name, similar_industry, similar_size,
             decision, decided_at, decided_by)
          VALUES ($1, $2, $3, $4, $5, 'skipped', now(), 'auto:non_qatar')
          ON CONFLICT (source_company_id, similar_linkedin_url) DO UPDATE
            SET decision = 'skipped', decided_at = now(), decided_by = 'auto:non_qatar'
        `, [
          companyId,
          url,
          nz(so.name),
          nz(so.industry) || nz(so.industryV2Taxonomy),
          buildEmployeeRange(so.employeeCountRange),
        ]);

        // Retain the non-Qatar similar company in the International holding pen
        // (research_candidates, LOCAL-ONLY) for future expansion — instead of
        // discarding it. Deduped by linkedin_url so repeated Stage 2 runs and
        // other sources don't pile up duplicates. Never enters the live
        // companies table, so it never grows the online DB.
        const candName = nz(so.name) || ('LinkedIn ' + url.split('/company/').pop());
        const existsCand = await query(
          `SELECT id FROM research_candidates WHERE linkedin_url = $1 LIMIT 1`,
          [url],
        );
        if (!existsCand.rows.length) {
          await query(`
            INSERT INTO research_candidates
              (kind, name, name_normalized, country, website, linkedin_url, industry, raw, notes)
            VALUES ('non_qatar', $1, $2, $3, NULL, $4, $5, $6::jsonb, $7)
          `, [
            candName,
            normalizeName(candName),
            country,
            url,
            nz(so.industry) || nz(so.industryV2Taxonomy),
            JSON.stringify(so),
            'similar company of #' + companyId + ' (Stage 2)',
          ]);
        }
      }
    }
  }
}

async function markStage(companyId, status, extras = null) {
  if (extras) {
    extras.stage2_at = new Date().toISOString();
    await query(
      `UPDATE companies
       SET stage2_status = $2, stage2_at = now(),
           extra_fields  = extra_fields || $3::jsonb
       WHERE id = $1`,
      [companyId, status, JSON.stringify(extras)],
    );
  } else {
    await query(
      `UPDATE companies SET stage2_status = $2, stage2_at = now() WHERE id = $1`,
      [companyId, status],
    );
  }
}

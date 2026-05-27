// Stage 4 — LinkedIn Jobs scrape per company
// ----------------------------------------------------------------------------
// Default actor: curious_coder/linkedin-jobs-scraper
//   - 29K users, 4.9★ rating, actively maintained, no rental required
//   - Pricing: $1.00 per 1,000 results (PAY_PER_RESULT) = $0.001 per job
//   - Input shape: { urls: [<LinkedIn jobs search URL>], scrapeCompany, count }
//   - No LinkedIn login / cookies required — scrapes the public jobs SERP
//
// The actor expects search URLs from the public LinkedIn jobs search page
// (`/jobs/search/?keywords=…&location=…`). LinkedIn ranks the company's own
// postings highest for keyword=company-name queries, so for our Qatar-focused
// dataset the keyword "<company name>" + location=Qatar reliably returns the
// company's open roles.
//
// Output fields we map (per the actor's documented schema):
//   id, link, title, companyName, companyLinkedinUrl,
//   location, salaryInfo[], postedAt, applicantsCount, applyUrl,
//   seniorityLevel, employmentType, jobFunction, industries,
//   descriptionText, descriptionHtml, companyDescription, companyWebsite,
//   companyEmployeesCount, benefits[], jobPosterName/Title/Photo/ProfileUrl
//
// Admin can override `stage4_actor_id` and `stage4_per_result_usd` in
// Settings → Maintenance to swap to a different actor with no code change.

import * as apify from '../clients/apify.js';
import { query } from '../../db.js';
import { getSettingString, getSetting } from '../../lib/settings.js';

const DEFAULT_ACTOR_ID       = 'curious_coder/linkedin-jobs-scraper';
const DEFAULT_PER_RESULT_USD = 0.001;     // $1 / 1k results
const DEFAULT_PER_COMPANY_LIMIT = 100;    // cap per Apify run
const DEFAULT_LOCATION       = 'Qatar';

export const STAGE_LABEL = 'LinkedIn Jobs';
export const TOOL_NAME = 'apify_linkedin_jobs';

async function actorConfig() {
  const actorId      = await getSettingString('stage4_actor_id',        DEFAULT_ACTOR_ID);
  const perResultUsd = Number(await getSetting('stage4_per_result_usd', DEFAULT_PER_RESULT_USD)) || DEFAULT_PER_RESULT_USD;
  const perCompanyLimit = Number(await getSetting('stage4_per_company_limit', DEFAULT_PER_COMPANY_LIMIT)) || DEFAULT_PER_COMPANY_LIMIT;
  const location     = await getSettingString('stage4_location', DEFAULT_LOCATION);
  return { actorId, perResultUsd, perCompanyLimit, location };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nz(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function normalizeJobUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.search = ''; u.hash = '';
    return u.toString().replace(/\/$/, '').toLowerCase();
  } catch { return String(url).toLowerCase().replace(/\/$/, ''); }
}

/**
 * Build a public LinkedIn jobs SERP URL filtering by company name + location.
 * Strips legal-form noise so "DOC MEDICAL CENTER LLC" → "DOC MEDICAL CENTER".
 */
const NAME_STOPWORDS = new Set([
  'llc', 'wll', 'pjsc', 'plc', 'ltd', 'limited', 'inc', 'incorporated',
  'co', 'company', 'corp', 'corporation', 'qfc', 'qfz', 'qstp',
]);
function cleanCompanyName(name) {
  return String(name || '')
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(w => {
      const t = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      return t && !NAME_STOPWORDS.has(t);
    })
    .join(' ')
    .trim();
}
function searchUrlForCompany(name, location = DEFAULT_LOCATION) {
  const keywords = cleanCompanyName(name) || String(name || '').trim();
  if (!keywords) return null;
  const params = new URLSearchParams({
    keywords,
    location,
    sortBy: 'DD',   // sort by date descending — newest jobs first
  });
  return 'https://www.linkedin.com/jobs/search/?' + params.toString();
}

function pickEmploymentType(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return null;
  if (s.includes('full'))      return 'full_time';
  if (s.includes('part'))      return 'part_time';
  if (s.includes('contract'))  return 'contract';
  if (s.includes('intern'))    return 'internship';
  if (s.includes('temp'))      return 'temporary';
  if (s.includes('volunteer')) return 'volunteer';
  return s.replace(/\s+/g, '_');
}

function pickWorkplaceType(raw) {
  const s = String(raw || '').toLowerCase();
  if (!s) return 'unknown';
  if (s.includes('remote')) return 'remote';
  if (s.includes('hybrid')) return 'hybrid';
  if (s.includes('on-site') || s.includes('onsite') || s.includes('on site')) return 'onsite';
  return 'unknown';
}

function parsePostedAt(raw, fallbackRel) {
  if (raw) {
    const d = new Date(raw);
    if (!isNaN(d.valueOf())) return d.toISOString();
  }
  if (fallbackRel) {
    const m = /(\d+)\s*(minute|hour|day|week|month)/i.exec(fallbackRel);
    if (m) {
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      const ms = unit === 'minute' ? n*60_000
              : unit === 'hour'   ? n*3_600_000
              : unit === 'day'    ? n*86_400_000
              : unit === 'week'   ? n*604_800_000
              : n*2_592_000_000;
      return new Date(Date.now() - ms).toISOString();
    }
  }
  return null;
}

// Parse salary range like ["$17.00", "$19.00"] or ["50,000", "70,000"]
function parseSalaryInfo(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return { min: null, max: null, currency: null };
  const num = (s) => {
    const m = String(s || '').replace(/,/g, '').match(/\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  const cur = (s) => {
    const t = String(s || '');
    if (t.includes('$')) return 'USD';
    if (/qar|﷼/i.test(t)) return 'QAR';
    if (t.includes('€')) return 'EUR';
    if (t.includes('£')) return 'GBP';
    if (t.includes('AED')) return 'AED';
    return null;
  };
  return {
    min: num(arr[0]),
    max: num(arr[1] || arr[0]),
    currency: cur(arr[0]),
  };
}

// curious_coder returns industries as either array OR comma-joined string.
// "Retail Office Equipment" → ["Retail Office Equipment"].
function arrayish(v) {
  if (Array.isArray(v)) return v.filter(Boolean).map(String);
  if (typeof v === 'string' && v.trim()) return [v.trim()];
  return [];
}

/**
 * Is this job actually for the company we asked about, or LinkedIn returned a
 * lookalike? Match by companyLinkedinUrl when we have it, otherwise loose-match
 * the company name. Reduces false positives from keyword-based search.
 */
function jobMatchesCompany(item, company) {
  if (item.companyLinkedinUrl && company.linkedin_url) {
    const a = String(item.companyLinkedinUrl).toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '');
    const b = String(company.linkedin_url).toLowerCase().replace(/[?#].*$/, '').replace(/\/$/, '');
    if (a && b) return a.includes(b.split('/company/')[1] || '') || b.includes(a.split('/company/')[1] || '');
  }
  if (!item.companyName) return true;   // can't reject; keep
  const a = String(item.companyName).toLowerCase();
  const b = cleanCompanyName(company.name).toLowerCase();
  if (!b) return true;
  return a.includes(b.split(' ')[0]) || b.includes(a.split(' ')[0]);
}

// ---------------------------------------------------------------------------
// Upsert
// ---------------------------------------------------------------------------

async function upsertJob(company, item) {
  // curious_coder field names: id, link, title, companyName, companyLinkedinUrl,
  // location, salaryInfo[], postedAt, applicantsCount, applyUrl, seniorityLevel,
  // employmentType, jobFunction, industries, descriptionText, descriptionHtml.
  const url = normalizeJobUrl(item.link || item.url || item.jobUrl);
  if (!url) return { action: 'skipped', reason: 'no_url' };

  const title          = nz(item.title || item.position);
  if (!title) return { action: 'skipped', reason: 'no_title' };

  const description    = nz(item.descriptionText || item.description || item.descriptionHtml);
  const location       = nz(item.location);
  const workplaceType  = pickWorkplaceType(item.workplaceType || item.contractType || item.locationType || item.location);
  const employmentType = pickEmploymentType(item.employmentType || item.contractType);
  const seniorityLevel = nz(item.seniorityLevel || item.seniority);
  const jobFunction    = arrayish(item.jobFunction || item.functions || item.function);
  const industries     = arrayish(item.industries || item.industry);
  const postedAt       = parsePostedAt(item.postedAt || item.publishedAt || item.datePosted, item.postedTime);
  const applicantCount = Number(item.applicantsCount || item.applicants) || null;
  const isRemote       = workplaceType === 'remote' || /remote/i.test(item.location || '');

  const { min: salaryMin, max: salaryMax, currency: salaryCurrency } = parseSalaryInfo(item.salaryInfo);

  const upd = await query(`
    UPDATE jobs SET
      company_id      = $2,
      title           = $3,
      description     = COALESCE(NULLIF($4,''), description),
      location_text   = COALESCE(NULLIF($5,''), location_text),
      is_remote       = $6,
      workplace_type  = $7,
      employment_type = COALESCE($8, employment_type),
      seniority_level = COALESCE($9, seniority_level),
      job_function    = CASE WHEN $10::text[] = '{}' THEN job_function ELSE $10::text[] END,
      industries      = CASE WHEN $11::text[] = '{}' THEN industries  ELSE $11::text[] END,
      posted_at       = COALESCE(posted_at, $12::timestamptz),
      applicant_count = COALESCE($13, applicant_count),
      salary_min      = COALESCE(salary_min, $14),
      salary_max      = COALESCE(salary_max, $15),
      salary_currency = COALESCE(salary_currency, $16),
      raw_payload     = $17::jsonb,
      extra_fields    = extra_fields || $18::jsonb,
      updated_at      = now(),
      is_active       = true
    WHERE linkedin_job_url = $1
    RETURNING id
  `, [
    url, company.id, title, description, location, isRemote, workplaceType,
    employmentType, seniorityLevel, jobFunction, industries,
    postedAt, applicantCount,
    salaryMin, salaryMax, salaryCurrency,
    JSON.stringify(item),
    JSON.stringify({
      stage4_scraped_at: new Date().toISOString(),
      stage4_engine:     'apify_curious_coder_jobs',
    }),
  ]);
  if (upd.rows.length > 0) return { action: 'updated' };

  await query(`
    INSERT INTO jobs
      (company_id, linkedin_job_url, linkedin_job_id, title, description,
       location_text, is_remote, workplace_type, employment_type,
       seniority_level, job_function, industries,
       posted_at, applicant_count,
       salary_min, salary_max, salary_currency,
       raw_payload, extra_fields, is_active)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12::text[],
            $13::timestamptz, $14, $15, $16, $17,
            $18::jsonb, $19::jsonb, true)
  `, [
    company.id, url, nz(item.id || item.jobId), title, description,
    location, isRemote, workplaceType, employmentType,
    seniorityLevel, jobFunction, industries,
    postedAt, applicantCount,
    salaryMin, salaryMax, salaryCurrency,
    JSON.stringify(item),
    JSON.stringify({
      stage4_scraped_at: new Date().toISOString(),
      stage4_engine:     'apify_curious_coder_jobs',
    }),
  ]);
  return { action: 'inserted' };
}

// ---------------------------------------------------------------------------
// Per-company entry point
// ---------------------------------------------------------------------------

export async function enrichCompany(company, cfg = null) {
  cfg = cfg || await actorConfig();

  const searchUrl = searchUrlForCompany(company.name, cfg.location);
  if (!searchUrl) {
    await markStage(company.id, 'no_data', { stage4_skip_reason: 'no_searchable_name' });
    return { status: 'no_data', usd: 0, reason: 'no_searchable_name' };
  }

  await markStage(company.id, 'running');

  let runResult;
  try {
    runResult = await apify.runAndWait(
      cfg.actorId,
      buildActorInput(cfg.actorId, searchUrl, cfg.perCompanyLimit),
      { pollMs: 4000, maxWaitMs: 15 * 60_000 },
    );
  } catch (err) {
    const friendly = explainActorError(err, cfg.actorId);
    await markStage(company.id, 'failed', { stage4_error: friendly.slice(0, 250), stage4_actor: cfg.actorId });
    return { status: 'failed', reason: friendly, usd: 0 };
  }

  const rawItems = Array.isArray(runResult.items) ? runResult.items : [];
  // Filter out items that don't actually belong to this company. The actor
  // returns keyword-matches which can include lookalikes.
  const items = rawItems.filter(it => jobMatchesCompany(it, company));
  const filteredOut = rawItems.length - items.length;
  const usd = rawItems.length * cfg.perResultUsd;   // we pay for what Apify returned, not what we kept

  if (items.length === 0) {
    await markStage(company.id, 'no_data', {
      stage4_no_data_reason:     rawItems.length === 0 ? 'no_jobs_found' : 'no_company_match',
      stage4_filtered_lookalikes: filteredOut,
    });
    return { status: 'no_data', usd, found: 0, filtered: filteredOut };
  }

  let inserted = 0, updated = 0, skipped = 0;
  for (const item of items) {
    try {
      const r = await upsertJob(company, item);
      if (r.action === 'inserted')      inserted++;
      else if (r.action === 'updated')  updated++;
      else                              skipped++;
    } catch (err) {
      skipped++;
    }
  }

  await markStage(company.id, 'done', {
    stage4_jobs_total:          items.length,
    stage4_jobs_new:            inserted,
    stage4_jobs_updated:        updated,
    stage4_filtered_lookalikes: filteredOut,
  });

  return { status: 'done', usd, found: items.length, inserted, updated, filtered: filteredOut };
}

// ---------------------------------------------------------------------------
// Bulk entry point
// ---------------------------------------------------------------------------

export async function enrichCompanies(companies, jobLog = null) {
  const cfg = await actorConfig();
  jobLog?.(`  Actor: ${cfg.actorId}  ·  ~$${cfg.perResultUsd.toFixed(4)}/result  ·  cap ${cfg.perCompanyLimit}/company  ·  location ${cfg.location}`);

  let done = 0, noData = 0, failed = 0, usdTotal = 0;
  let rentalErrorSeen = false;

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    try {
      const r = await enrichCompany(c, cfg);
      usdTotal += r.usd || 0;
      if (r.status === 'done')          done++;
      else if (r.status === 'no_data')  noData++;
      else                              failed++;
      const tag = r.status === 'done' ? '✓' : (r.status === 'no_data' ? '·' : '✗');
      jobLog?.(`  ${tag} [${i+1}/${companies.length}] ${c.name}` +
        (r.found != null ? ` — ${r.found} jobs (+${r.inserted||0} new)` : '') +
        (r.filtered ? `, filtered ${r.filtered} lookalikes` : '') +
        (r.reason ? ` (${r.reason})` : '') +
        (r.usd ? ` · $${r.usd.toFixed(4)}` : ''));

      // If the actor itself is broken (404, rental, etc.), stop hammering — every
      // subsequent call will fail the same way and waste minutes.
      if (r.status === 'failed' && /not found|rent|trial has expired|404/i.test(r.reason || '')) {
        if (!rentalErrorSeen) {
          jobLog?.(`  ✗ Actor "${cfg.actorId}" is unavailable. Aborting batch — go to Settings → Maintenance to pick another LinkedIn Jobs actor.`);
          rentalErrorSeen = true;
        }
        for (let j = i + 1; j < companies.length; j++) {
          await markStage(companies[j].id, 'failed', { stage4_error: 'aborted_after_actor_unavailable' });
          failed++;
        }
        break;
      }
    } catch (err) {
      failed++;
      jobLog?.(`  ✗ [${i+1}/${companies.length}] ${c.name} — ${err.message}`);
    }
  }

  return { done, no_data: noData, failed, usd: usdTotal };
}

// ---------------------------------------------------------------------------
// Per-actor input shape adapter
// ---------------------------------------------------------------------------

/**
 * Build the Apify actor input. curious_coder/linkedin-jobs-scraper expects
 * `urls` (search URLs), `count` (cap), and `scrapeCompany` (boolean). Other
 * keys we include are harmless fallbacks for sibling actors users might swap to.
 */
function buildActorInput(actorId, searchUrl, count) {
  return {
    // curious_coder — primary input
    urls:          [searchUrl],
    count:         count,
    scrapeCompany: true,

    // bebity / valig / dev_fusion fallbacks (ignored by actors that don't use them)
    startUrls:     [{ url: searchUrl }],
    searchUrls:    [searchUrl],
    rows:          count,
    maxResults:    count,
    proxy:         { useApifyProxy: true },
  };
}

function explainActorError(err, actorId) {
  const msg = err.message || String(err);
  if (err.status === 404 || /not\s*found/i.test(msg)) {
    return (
      `Actor "${actorId}" was not found on Apify. ` +
      `Check Settings → Maintenance → "Stage 4 actor" — the actor id is case-sensitive ` +
      `and uses '/'. Confirmed-working defaults: curious_coder/linkedin-jobs-scraper ($0.001/result), ` +
      `apimaestro/linkedin-jobs-scraper-no-cookies.`
    );
  }
  if (/rent|trial has expired/i.test(msg) || err.status === 403) {
    return (
      `Apify actor "${actorId}" requires a paid rental. ` +
      `Either subscribe at https://console.apify.com/actors OR ` +
      `change the actor in Portal → Settings → Maintenance → "Stage 4 actor". ` +
      `No-rental alternatives: curious_coder/linkedin-jobs-scraper, apimaestro/linkedin-jobs-scraper-no-cookies.`
    );
  }
  return msg;
}

// ---------------------------------------------------------------------------

async function markStage(companyId, status, extras = null) {
  if (extras) {
    await query(
      `UPDATE companies
       SET stage4_status = $2, stage4_at = now(),
           extra_fields  = extra_fields || $3::jsonb
       WHERE id = $1`,
      [companyId, status, JSON.stringify(extras)],
    );
  } else {
    await query(
      `UPDATE companies SET stage4_status = $2, stage4_at = now() WHERE id = $1`,
      [companyId, status],
    );
  }
}

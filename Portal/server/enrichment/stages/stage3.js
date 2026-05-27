// Stage 3 — LinkedIn Employees via automation-lab/linkedin-company-employees-scraper.
//
// Mode: SERP only (cookie-less). The cookie/Voyager path was unreliable in
// practice because LinkedIn flags datacenter IPs even with a valid cookie.
// SERP mode returns up to ~100 publicly-searchable employees per company —
// the high-value cohort (executives, sales, HR, anyone who keeps their
// profile public).
//
// Pricing (PAY_PER_EVENT):
//   - $0.005 per actor start
//   - $0.00575 per profile (FREE tier), drops on higher tiers
//
// Profile data returned is BASIC: full name, job title/headline, profile URL,
// location, company metadata. No email or experience (use a separate
// per-profile enrichment stage for those if/when needed).

import * as apify from '../clients/apify.js';
import { query } from '../../db.js';
import { inferSeniority, recomputeAllSeniority } from '../seniority.js';

const ACTOR_ID = 'automation-lab/linkedin-company-employees-scraper';
export const STAGE_LABEL = 'LinkedIn Employees';
export const TOOL_NAME = 'apify_automation_lab_employees';

const START_FEE_USD     = 0.005;
const PER_PROFILE_USD   = 0.00575;
const URLS_PER_BATCH    = 10;         // companies per actor run
const MAX_EMPLOYEES     = 500;        // actor's hard cap; SERP-side LinkedIn ceiling is ~100

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
function normalizeUrl(u) {
  if (!u) return null;
  try {
    const url = new URL(u);
    url.search = ''; url.hash = '';
    return url.toString().replace(/\/$/, '').toLowerCase();
  } catch { return String(u).toLowerCase().replace(/\/$/, ''); }
}

// inferSeniority moved to ../seniority.js (shared with Stage 3.5 + recompute endpoint)

// ---------- single ------------------------------------------------------

export async function enrichCompany(company) {
  const r = await enrichCompanies([company]);
  return { status: r.done > 0 ? 'done' : 'no_data', usd: r.usd, profiles: r.profiles };
}

// ---------- bulk --------------------------------------------------------

export async function enrichCompanies(companies, jobLog) {
  jobLog?.(`  Mode: SERP (Google discovery — public profiles, ~80-100 max/company)`);

  let done = 0, noData = 0, failed = 0, totalUsd = 0;
  const eligible = [];
  for (const c of companies) {
    if (!c.linkedin_url || !/linkedin\.com\/company\//i.test(c.linkedin_url)) {
      await markStage(c.id, 'no_data', { stage3_skipped: 'no_linkedin_url' });
      noData++;
    } else {
      eligible.push(c);
    }
  }
  if (eligible.length === 0) {
    jobLog?.('  Nothing to enrich (no LinkedIn URLs on selection)');
    return { done, no_data: noData, failed, usd: 0 };
  }
  for (const c of eligible) {
    await query(`UPDATE companies SET stage3_status = 'running' WHERE id = $1`, [c.id]);
  }

  for (let i = 0; i < eligible.length; i += URLS_PER_BATCH) {
    const batch = eligible.slice(i, i + URLS_PER_BATCH);
    const urlToCompany = new Map();
    for (const c of batch) urlToCompany.set(normalizeUrl(c.linkedin_url), c);

    jobLog?.(`  Batch ${i+1}-${i+batch.length}: deploying SERP agents on ${batch.length} compan${batch.length===1?'y':'ies'}…`);

    const actorInput = {
      companyUrls:  batch.map(c => c.linkedin_url),
      maxEmployees: MAX_EMPLOYEES,
    };
    // li_at cookie deliberately NOT passed — see file header comment.

    let runResult;
    try {
      runResult = await apify.runAndWait(
        ACTOR_ID,
        actorInput,
        { pollMs: 5000, maxWaitMs: 60 * 60_000 },
      );
    } catch (err) {
      for (const c of batch) {
        await markStage(c.id, 'failed', { stage3_error: err.message });
        failed++;
      }
      jobLog?.(`  ✗ batch failed: ${err.message}`);
      continue;
    }

    // automation-lab returns either flat profiles OR a wrapped { company,
    // employees: [...] } shape. It can also return ERROR items where the
    // `error` field is set and `profileUrl` is missing — those represent
    // per-company failures (cookie expired, rate-limit, etc.), not real
    // profiles. We separate them.
    const flatProfiles = [];
    const errorItems   = [];
    for (const it of runResult.items) {
      if (Array.isArray(it?.employees)) {
        for (const emp of it.employees) {
          flatProfiles.push({ ...emp, _sourceCompanyUrl: it.company?.url || it.companyUrl || it.queriedCompanyUrl });
        }
      } else if (Array.isArray(it?.profiles)) {
        for (const emp of it.profiles) {
          flatProfiles.push({ ...emp, _sourceCompanyUrl: it.company?.url || it.companyUrl });
        }
      } else if (it && typeof it === 'object') {
        // Error item — has `error` field, missing profileUrl/name
        if (it.error && !it.profileUrl) {
          errorItems.push(it);
        } else {
          flatProfiles.push(it);
        }
      }
    }
    const profileCount = flatProfiles.length;
    const usd = START_FEE_USD + (profileCount * PER_PROFILE_USD);
    totalUsd += usd;
    jobLog?.(`  ◇ Recovered ${profileCount.toLocaleString()} profile(s) · $${usd.toFixed(4)}`);

    // Surface actor-side errors prominently
    for (const ei of errorItems) {
      const companyLabel = ei.companyName || ei.companyUrl || ei.companySlug || '(unknown)';
      jobLog?.(`  ⚠ Actor error for ${companyLabel}: ${ei.error}`);
    }

    // Group profiles by their source company. automation-lab's output
    // typically includes `companyUrl` / `sourceCompanyUrl` on each profile
    // since this is a per-company scrape. We also fall back to matching via
    // currentPosition.companyLinkedinUrl or experience entries.
    const profilesByCompanyId = new Map();
    let unmatched = 0;
    for (const profile of flatProfiles) {
      const companyRefs = [
        profile._sourceCompanyUrl,
        profile.companyUrl,
        profile.sourceCompanyUrl,
        profile.companyLinkedinUrl,
        profile.queriedCompanyUrl,
        profile.linkedinCompanyUrl,
        profile.currentCompany?.url,
        profile.currentCompany?.linkedinUrl,
        profile.company?.url,
        profile.company?.linkedinUrl,
      ];
      let targetCompany = null;
      for (const ref of companyRefs) {
        const n = normalizeUrl(ref);
        if (n && urlToCompany.has(n)) { targetCompany = urlToCompany.get(n); break; }
      }
      if (!targetCompany) {
        // Try matching by slug (handles vanity → canonical redirects)
        for (const ref of companyRefs) {
          const slug = String(ref || '').match(/linkedin\.com\/company\/([^\/?#]+)/i)?.[1]?.toLowerCase();
          if (!slug) continue;
          for (const [k, v] of urlToCompany) {
            if (k.includes('/' + slug)) { targetCompany = v; break; }
          }
          if (targetCompany) break;
        }
      }
      // If batch has only 1 company, any unmatched profile MUST belong to it.
      if (!targetCompany && batch.length === 1) targetCompany = batch[0];

      if (!targetCompany) { unmatched++; continue; }
      if (!profilesByCompanyId.has(targetCompany.id)) profilesByCompanyId.set(targetCompany.id, []);
      profilesByCompanyId.get(targetCompany.id).push(profile);
    }
    if (unmatched > 0) jobLog?.(`  · ${unmatched} profile(s) could not be matched to a company`);

    for (const c of batch) {
      const profiles = profilesByCompanyId.get(c.id) || [];
      if (profiles.length === 0) {
        await markStage(c.id, 'no_data', { stage3_skipped: 'no_profiles_found' });
        noData++;
        jobLog?.(`  · ${c.bin || c.id} ${c.name} — no profiles found`);
        continue;
      }
      let inserted = 0, updated = 0;
      for (const p of profiles) {
        const r = await upsertPerson(p, c);
        if (r === 'inserted') inserted++;
        else if (r === 'updated') updated++;
      }
      await markStage(c.id, 'done', {
        stage3_profile_count: profiles.length,
        stage3_inserted:      inserted,
        stage3_updated:       updated,
        stage3_mode:          'SERP',
      });
      done++;
      jobLog?.(`  ✓ ${c.bin || c.id} ${c.name} — ${profiles.length} profile${profiles.length===1?'':'s'} · +${inserted} new / +${updated} updated`);
    }
  }

  return { done, no_data: noData, failed, usd: totalUsd };
}

// ---------- person upsert ----------------------------------------------

async function upsertPerson(profile, company) {
  // Resolve the LinkedIn /in/ URL across the various field names automation-lab uses.
  // Tries direct fields first, then searches ALL string values for any linkedin.com/in/ URL.
  const candidateUrls = [
    profile.profileUrl,
    profile.linkedinUrl,
    profile.linkedinProfileUrl,
    profile.publicProfileUrl,
    profile.url,
    profile.profile?.url,
    profile.profile?.linkedinUrl,
  ];
  let linkedinUrl = null;
  for (const u of candidateUrls) {
    const n = normalizeUrl(u);
    if (n && /linkedin\.com\/in\//i.test(n)) { linkedinUrl = n; break; }
  }
  // Last resort: scan all string fields for any linkedin /in/ URL
  if (!linkedinUrl) {
    for (const v of Object.values(profile)) {
      if (typeof v === 'string' && /linkedin\.com\/in\//i.test(v)) {
        linkedinUrl = normalizeUrl(v);
        if (linkedinUrl) break;
      }
    }
  }
  if (!linkedinUrl) return 'skipped';

  const fullName    = nz(profile.fullName) || nz(profile.name) || [nz(profile.firstName), nz(profile.lastName)].filter(Boolean).join(' ') || 'Unknown';
  const firstName   = nz(profile.firstName) || (fullName.split(' ')[0] || null);
  const lastName    = nz(profile.lastName)  || (fullName.split(' ').slice(1).join(' ') || null);
  const headline    = nz(profile.headline) || nz(profile.title) || nz(profile.jobTitle);
  const locTxt      = nz(profile.location) || nz(profile.locationName);
  const country     = nz(profile.country) || nz(profile.countryCode);
  const city        = nz(profile.city);
  const picUrl      = nz(profile.profilePicture) || nz(profile.pictureUrl) || nz(profile.photo);
  const linkedinId  = nz(profile.publicIdentifier) || nz(profile.profileId);

  const existing = await query(`SELECT id FROM people WHERE linkedin_url = $1`, [linkedinUrl]);
  let personId, action;
  if (existing.rows.length) {
    personId = existing.rows[0].id;
    await query(`
      UPDATE people SET
        full_name           = COALESCE(NULLIF(full_name, ''), $2),
        first_name          = COALESCE(first_name, $3),
        last_name           = COALESCE(last_name, $4),
        headline            = COALESCE(NULLIF(headline, ''), $5),
        location_text       = COALESCE(NULLIF(location_text, ''), $6),
        country             = COALESCE(NULLIF(country, ''), $7),
        city                = COALESCE(NULLIF(city, ''), $8),
        profile_picture_url = COALESCE(NULLIF(profile_picture_url, ''), $9),
        linkedin_public_id  = COALESCE(linkedin_public_id, $10),
        extra_fields        = extra_fields || $11::jsonb
      WHERE id = $1
    `, [
      personId, fullName, firstName, lastName, headline,
      locTxt, country, city, picUrl, linkedinId,
      JSON.stringify({
        linkedin_scraped_at:    new Date().toISOString(),
        linkedin_scrape_engine: 'automation-lab',
      }),
    ]);
    action = 'updated';
  } else {
    const ins = await query(`
      INSERT INTO people
        (full_name, first_name, last_name, headline,
         linkedin_url, linkedin_public_id,
         location_text, country, city, profile_picture_url,
         extra_fields)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
      RETURNING id
    `, [
      fullName, firstName, lastName, headline,
      linkedinUrl, linkedinId,
      locTxt, country, city, picUrl,
      JSON.stringify({
        linkedin_scraped_at:    new Date().toISOString(),
        linkedin_scrape_engine: 'automation-lab',
      }),
    ]);
    personId = ins.rows[0].id;
    action = 'inserted';
  }

  // Link to source company
  const title = headline;
  const { seniority_level, org_chart_level } = inferSeniority(title);

  // Idempotent link: drop any existing Stage-3 current-employee link for this
  // (person, company) pair before inserting the new one. Title text varies
  // slightly between scrape runs, which is too narrow for ON CONFLICT to
  // catch — so we explicitly delete-then-insert here.
  await query(
    `DELETE FROM person_companies
     WHERE person_id = $1 AND company_id = $2 AND source_stage = 3 AND is_current = true`,
    [personId, company.id],
  );
  await query(`
    INSERT INTO person_companies
      (person_id, company_id, title, seniority_level, org_chart_level,
       is_current, source_stage, raw_payload)
    VALUES ($1, $2, $3, $4, $5, true, 3, $6::jsonb)
  `, [personId, company.id, title, seniority_level, org_chart_level, JSON.stringify(profile)]);

  return action;
}

async function markStage(companyId, status, extras = null) {
  if (extras) {
    extras.stage3_at = new Date().toISOString();
    await query(
      `UPDATE companies
       SET stage3_status = $2, stage3_at = now(),
           extra_fields  = extra_fields || $3::jsonb
       WHERE id = $1`,
      [companyId, status, JSON.stringify(extras)],
    );
  } else {
    await query(
      `UPDATE companies SET stage3_status = $2, stage3_at = now() WHERE id = $1`,
      [companyId, status],
    );
  }
}

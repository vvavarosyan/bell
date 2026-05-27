// Stage 3.5 — Deep-enrich People via harvestapi/linkedin-profile-scraper.
//
// Per-profile enrichment that runs on individual LinkedIn /in/ URLs and pulls
// the rich layer: photo, email, full work experience, education, skills,
// languages, certifications, connections + follower counts.
//
// Pricing (PAY_PER_EVENT):
//   - Basic profile:               $0.004 / profile
//   - Profile details + email:     $0.010 / profile (what we use by default)
//
// Idempotent: existing fields are only overwritten when the new value is
// non-null. Stage 3.5 status is stored in extra_fields.stage3_5_at +
// extra_fields.stage3_5_engine.

import * as apify from '../clients/apify.js';
import { query } from '../../db.js';

const ACTOR_ID         = 'harvestapi/linkedin-profile-scraper';
export const STAGE_LABEL = 'Deep-enrich People';
export const TOOL_NAME = 'apify_harvestapi_profile';

const PER_PROFILE_USD  = 0.010;      // "Profile details + email search"
const URLS_PER_BATCH   = 50;         // profiles per actor run

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

/**
 * Enrich a list of person IDs. Pulls their linkedin_url, calls the actor
 * with batches of 50, updates each person row idempotently.
 */
export async function enrichPeople(personIds, jobLog = null) {
  if (!Array.isArray(personIds) || personIds.length === 0) {
    throw new Error('No person IDs supplied');
  }

  const r = await query(
    `SELECT id, pin, full_name, linkedin_url FROM people WHERE id = ANY($1)`,
    [personIds],
  );
  const people = r.rows.filter(p => p.linkedin_url && /linkedin\.com\/in\//i.test(p.linkedin_url));
  const skipped = r.rows.length - people.length;
  if (skipped > 0) jobLog?.(`  Skipping ${skipped} ${skipped === 1 ? 'person' : 'people'} (no LinkedIn URL)`);
  if (people.length === 0) return { done: 0, no_data: 0, failed: 0, usd: 0, skipped };

  let done = 0, noData = 0, failed = 0, totalUsd = 0;

  for (let i = 0; i < people.length; i += URLS_PER_BATCH) {
    const batch = people.slice(i, i + URLS_PER_BATCH);
    const urlToPerson = new Map();
    for (const p of batch) urlToPerson.set(normalizeUrl(p.linkedin_url), p);

    jobLog?.(`  Batch ${i+1}-${i+batch.length}: scraping ${batch.length} profile${batch.length===1?'':'s'} (with email search)…`);

    let runResult;
    try {
      runResult = await apify.runAndWait(
        ACTOR_ID,
        {
          profileScraperMode: 'Profile details + email search ($10 per 1k)',
          urls: batch.map(p => p.linkedin_url),
        },
        { pollMs: 4000, maxWaitMs: 30 * 60_000 },
      );
    } catch (err) {
      const approvalNeeded = /requires full access|approve its permissions/i.test(err.message || '');
      const errMsg = approvalNeeded
        ? `ONE-TIME SETUP NEEDED: ${ACTOR_ID} requires Apify approval. Open https://apify.com/${ACTOR_ID} in your browser while signed in to Apify, click "Try for free" / "Run", approve permissions, then retry.`
        : err.message;
      failed += batch.length;
      jobLog?.(`  ✗ batch failed: ${errMsg}`);
      continue;
    }

    const profiles = runResult.items || [];
    const usd = profiles.length * PER_PROFILE_USD;
    totalUsd += usd;
    jobLog?.(`  ◇ Recovered ${profiles.length} deep profile${profiles.length===1?'':'s'} · $${usd.toFixed(4)}`);

    const handled = new Set();
    for (const profile of profiles) {
      const profileUrl = normalizeUrl(profile.linkedinUrl || profile.url || profile.publicProfileUrl);
      let target = profileUrl ? urlToPerson.get(profileUrl) : null;
      // Soft fallback: scan the profile for any linkedin /in/ URL and match
      if (!target) {
        for (const v of Object.values(profile)) {
          if (typeof v === 'string' && /linkedin\.com\/in\//i.test(v)) {
            const n = normalizeUrl(v);
            if (n && urlToPerson.has(n)) { target = urlToPerson.get(n); break; }
          }
        }
      }
      if (!target) continue;
      try {
        await applyDeepProfile(target.id, profile);
        handled.add(target.id);
        done++;
      } catch (err) {
        failed++;
        jobLog?.(`  ✗ ${target.full_name}: ${err.message}`);
      }
    }
    for (const p of batch) {
      if (!handled.has(p.id)) {
        noData++;
        jobLog?.(`  · ${p.full_name} — actor returned nothing (private/restricted profile)`);
      }
    }
  }

  return { done, no_data: noData, failed, usd: totalUsd, skipped };
}

async function applyDeepProfile(personId, profile) {
  const firstName  = nz(profile.firstName);
  const lastName   = nz(profile.lastName);
  const headline   = nz(profile.headline) || nz(profile.multiLocaleHeadline?.[0]?.headline);
  const summary    = nz(profile.about) || nz(profile.summary);
  const locTxt     = nz(profile.location?.linkedinText) || nz(profile.location?.parsed?.text) || nz(profile.location);
  const country    = nz(profile.location?.parsed?.country) || nz(profile.location?.countryCode) || nz(profile.country);
  const city       = nz(profile.location?.parsed?.city) || nz(profile.city);
  const picUrl     = nz(profile.profilePicture?.url) || nz(profile.photo) || nz(profile.profilePicture) || nz(profile.pictureUrl);
  const linkedinId = nz(profile.publicIdentifier) || nz(profile.profileId);

  let email = null;
  if (typeof profile.email === 'string') email = nz(profile.email);
  if (!email && Array.isArray(profile.emails) && profile.emails.length > 0) {
    email = nz(typeof profile.emails[0] === 'string' ? profile.emails[0] : profile.emails[0]?.email);
  }
  if (!email && typeof profile.foundEmail === 'string') email = nz(profile.foundEmail);

  const experience     = profile.experience     || profile.experiences     || null;
  const education      = profile.education      || profile.educations      || null;
  const skills         = profile.skills         || null;
  const languages      = profile.languages      || null;
  const certifications = profile.certifications || null;

  // Record any discovered email as a person_contact (provenance: LinkedIn deep
  // enrich). The legacy people.email column is also kept in sync below.
  if (email) {
    try {
      const { upsertContact } = await import('../../lib/contacts.js');
      await upsertContact('person', personId, {
        type: 'email', value: email, value_display: email,
        source: 'stage3.5-harvestapi',
      });
    } catch { /* migration may not have been applied yet */ }
  }

  await query(`
    UPDATE people SET
      first_name          = COALESCE(first_name, $2),
      last_name           = COALESCE(last_name, $3),
      headline            = COALESCE(NULLIF(headline, ''), $4),
      summary             = COALESCE(NULLIF(summary, ''), $5),
      location_text       = COALESCE(NULLIF(location_text, ''), $6),
      country             = COALESCE(NULLIF(country, ''), $7),
      city                = COALESCE(NULLIF(city, ''), $8),
      profile_picture_url = COALESCE(NULLIF(profile_picture_url, ''), $9),
      linkedin_public_id  = COALESCE(linkedin_public_id, $10),
      email               = COALESCE(email, $11),
      experience          = COALESCE($12::jsonb, experience),
      education           = COALESCE($13::jsonb, education),
      skills              = COALESCE($14::jsonb, skills),
      languages           = COALESCE($15::jsonb, languages),
      certifications      = COALESCE($16::jsonb, certifications),
      extra_fields        = extra_fields || $17::jsonb
    WHERE id = $1
  `, [
    personId, firstName, lastName, headline, summary, locTxt, country, city, picUrl, linkedinId, email,
    experience     ? JSON.stringify(experience)     : null,
    education      ? JSON.stringify(education)      : null,
    skills         ? JSON.stringify(skills)         : null,
    languages      ? JSON.stringify(languages)      : null,
    certifications ? JSON.stringify(certifications) : null,
    JSON.stringify({
      stage3_5_engine:           'harvestapi_profile',
      stage3_5_at:               new Date().toISOString(),
      linkedin_connections:      numericOrNull(profile.connectionsCount),
      linkedin_followers:        numericOrNull(profile.followerCount),
      linkedin_verified:         profile.verified === true,
      linkedin_open_to_work:     profile.openToWork === true,
      linkedin_hiring:           profile.hiring === true,
    }),
  ]);
}

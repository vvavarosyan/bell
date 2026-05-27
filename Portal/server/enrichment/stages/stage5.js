// Stage 5 — Google Maps enrichment via Apify compass/crawler-google-places.
//
// Two modes:
//   enrichCompany(c)           - single-company, runs ONE search.
//                                Used by the orchestrator's per-company loop
//                                fallback.
//   enrichCompanies([c, c, c]) - bulk, batches up to 100 search terms into a
//                                single Apify run. Results are matched back
//                                to companies by searchString. Drops the time
//                                cost ~100x vs sequential.

import * as apify from '../clients/apify.js';
import { query } from '../../db.js';

const ACTOR_ID = 'compass/crawler-google-places';
export const STAGE_LABEL = 'Google Maps';
export const TOOL_NAME = 'apify_google_maps';
const BATCH_SIZE = 100;

// ---------- shared helpers ------------------------------------------------

function tokenize(s) {
  if (!s) return new Set();
  return new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 2));
}

function nameLikelyMatches(a, b) {
  if (!a || !b) return false;
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return false;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap >= Math.min(2, Math.min(ta.size, tb.size));
}

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

function buildSearchString(company) {
  // "Qatar Airways Club Qatar" — name + country hint
  return `${company.name.trim()} Qatar`;
}

function isUnenrichable(company) {
  if (!company.name) return 'no_name';
  if (/\(name missing\)/i.test(company.name)) return 'placeholder_name';
  return null;
}

async function applyPlace(companyId, place) {
  const website     = nz(place.website) || nz(place.websiteUrl);
  const phone       = nz(place.phone) || nz(place.phoneUnformatted);
  const address     = nz(place.address);

  // Record the phone (and primary website signal) as a contact row so the new
  // multi-contacts UI can attribute it to "Google Maps".
  if (phone) {
    try {
      const { upsertContact } = await import('../../lib/contacts.js');
      await upsertContact('company', companyId, {
        type: 'phone', value: phone, value_display: phone,
        source: 'stage5-gmaps',
      });
    } catch { /* contacts table may not exist yet pre-migration */ }
  }
  const lat         = place.location?.lat ?? place.latitude ?? null;
  const lng         = place.location?.lng ?? place.longitude ?? null;
  const gmapsUrl    = nz(place.url) || nz(place.googleMapsUrl);
  const placeId     = nz(place.placeId) || nz(place.place_id);
  const rating      = numericOrNull(place.totalScore ?? place.rating);
  const reviewsCount = numericOrNull(place.reviewsCount ?? place.userRatingCount);
  const photos      = place.imageUrls || place.images || null;
  const hours       = place.openingHours || place.hours || null;

  await query(`
    UPDATE companies
    SET
      gmaps_place_id       = COALESCE($2, gmaps_place_id),
      gmaps_url            = COALESCE($3, gmaps_url),
      gmaps_rating         = COALESCE($4, gmaps_rating),
      gmaps_reviews_count  = COALESCE($5, gmaps_reviews_count),
      gmaps_hours          = COALESCE($6::jsonb, gmaps_hours),
      gmaps_photos         = COALESCE($7::jsonb, gmaps_photos),
      website              = COALESCE(NULLIF(website, ''), $8),
      phone                = COALESCE(NULLIF(phone, ''), $9),
      address              = COALESCE(NULLIF(address, ''), $10),
      latitude             = COALESCE(latitude, $11),
      longitude            = COALESCE(longitude, $12),
      extra_fields         = extra_fields || $13::jsonb,
      stage5_status        = 'done',
      stage5_at            = now()
    WHERE id = $1
  `, [
    companyId,
    placeId,
    gmapsUrl,
    rating,
    reviewsCount,
    hours ? JSON.stringify(hours) : null,
    photos ? JSON.stringify(photos) : null,
    website,
    phone,
    address,
    lat,
    lng,
    JSON.stringify({
      gmaps_title:        nz(place.title),
      gmaps_categories:   place.categories || null,
      gmaps_category:     nz(place.categoryName),
      gmaps_raw_features: place.additionalInfo || null,
    }),
  ]);
}

async function markStage(companyId, status) {
  await query(
    `UPDATE companies SET stage5_status = $2, stage5_at = now() WHERE id = $1`,
    [companyId, status]
  );
}

// ---------- single ---------------------------------------------------------

export async function enrichCompany(company) {
  const reason = isUnenrichable(company);
  if (reason) {
    await markStage(company.id, 'no_data');
    return { status: 'no_data', usd: 0, reason, place: null };
  }

  const input = {
    searchStringsArray: [buildSearchString(company)],
    locationQuery: 'Qatar',
    maxCrawledPlacesPerSearch: 1,
    language: 'en',
    skipClosedPlaces: false,
    scrapeContacts: true,
    scrapeImageAuthors: false,
    maxImages: 5,
    maxReviews: 0,
  };

  const items = await apify.runSync(ACTOR_ID, input, { timeoutMs: 180_000 });
  const place = items[0] || null;
  if (!place) {
    await markStage(company.id, 'no_data');
    return { status: 'no_data', usd: 0, reason: 'no_place_found', place: null };
  }
  if (!nameLikelyMatches(company.name, place.title)) {
    await markStage(company.id, 'no_data');
    return { status: 'no_data', usd: 0, reason: 'name_mismatch', place };
  }
  await applyPlace(company.id, place);
  return { status: 'done', usd: 0, place };
}

// ---------- bulk -----------------------------------------------------------

/**
 * Bulk enrichment for a list of companies. Single Apify run per batch of
 * BATCH_SIZE. Returns aggregate { done, no_data, failed, usd, perCompany }.
 *
 * jobLog(msg) is optional and is invoked with progress updates.
 */
export async function enrichCompanies(companies, jobLog) {
  const perCompany = []; // [{ company_id, status, reason }]
  let done = 0, noData = 0, failed = 0, totalUsd = 0;

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);

    // Filter out unenrichable up front and mark them no_data
    const eligible = [];
    for (const c of batch) {
      const reason = isUnenrichable(c);
      if (reason) {
        await markStage(c.id, 'no_data');
        perCompany.push({ company_id: c.id, status: 'no_data', reason });
        noData++;
      } else {
        eligible.push(c);
      }
    }

    if (eligible.length === 0) {
      jobLog?.(`  batch ${i+1}-${i+batch.length}: all unenrichable, skipped`);
      continue;
    }

    // Build searchString -> company map so we can match results back
    const searchToCompany = new Map();
    for (const c of eligible) {
      // Mark as running for the UI dot
      await query(`UPDATE companies SET stage5_status = 'running' WHERE id = $1`, [c.id]);
      const s = buildSearchString(c);
      // If two companies share the same search string (unlikely but possible),
      // the last one wins for matching purposes. Both still get processed.
      if (!searchToCompany.has(s)) searchToCompany.set(s, []);
      searchToCompany.get(s).push(c);
    }

    const input = {
      searchStringsArray: [...searchToCompany.keys()],
      locationQuery: 'Qatar',
      maxCrawledPlacesPerSearch: 1,
      language: 'en',
      skipClosedPlaces: false,
      scrapeContacts: true,
      scrapeImageAuthors: false,
      maxImages: 5,
      maxReviews: 0,
    };

    jobLog?.(`  batch ${i+1}-${i+batch.length}: ${eligible.length} searches in one Apify run...`);
    let result;
    try {
      result = await apify.runAndWait(ACTOR_ID, input, { pollMs: 4000, maxWaitMs: 25 * 60_000 });
    } catch (err) {
      // Mark everyone in the batch as failed
      for (const c of eligible) {
        await markStage(c.id, 'failed');
        perCompany.push({ company_id: c.id, status: 'failed', reason: err.message });
        failed++;
      }
      jobLog?.(`  batch failed: ${err.message}`);
      continue;
    }

    const usd = Number(result.run?.usageTotalUsd || 0);
    totalUsd += usd;
    jobLog?.(`  batch returned ${result.items.length} place(s) · $${usd.toFixed(4)}`);

    // Match results back to companies by searchString
    const handled = new Set();
    for (const item of result.items) {
      const searchedFor = item.searchString || item.searchQuery || null;
      const companies = searchedFor ? searchToCompany.get(searchedFor) : null;
      if (!companies || companies.length === 0) {
        // No mappable company — skip silently
        continue;
      }
      // Use the first company waiting on this search string.
      const c = companies.shift();
      handled.add(c.id);
      if (!nameLikelyMatches(c.name, item.title)) {
        await markStage(c.id, 'no_data');
        perCompany.push({ company_id: c.id, status: 'no_data', reason: 'name_mismatch', place_title: item.title });
        noData++;
      } else {
        await applyPlace(c.id, item);
        perCompany.push({ company_id: c.id, status: 'done' });
        done++;
      }
    }

    // Any eligible company with no result → no_data
    for (const c of eligible) {
      if (!handled.has(c.id)) {
        await markStage(c.id, 'no_data');
        perCompany.push({ company_id: c.id, status: 'no_data', reason: 'no_place_found' });
        noData++;
      }
    }
  }

  return { done, no_data: noData, failed, usd: totalUsd, perCompany };
}

// Google Maps sweep (LOCAL) — staging + matching for the Qatar-wide places program.
//
// TEST MODE first (Val 2026-07-20): run BOTH candidate actors on identical small searches and
// compare yield/fields/cost before committing the monthly $5 free credit to one:
//   compass/crawler-google-places    — the proven actor Bell already uses per-company (~$4/1k)
//   microworlds/crawler-google-places — ~$1.5/1k INCLUDING email enrichment (less proven)
//
// Places land in gmaps_places (place_id-deduped, verbatim raw kept). The matcher links places
// to existing companies by phone → website-domain → exact-name (in that order — strongest
// signal first); matched places enrich (rating/hours/coords only-if-empty); unmatched become
// 'candidate_new' for review — never auto-created (Rule 2.1: a Maps listing alone doesn't
// prove a registrable company).

import { query } from '../db.js';
import { runSync } from './clients/apify.js';
import { packRaw } from '../tenders/raw.js';

export const ACTORS = {
  compass: 'compass/crawler-google-places',
  microworlds: 'microworlds/crawler-google-places',
};

function inputFor(actorKey, searchTerm, maxPlaces) {
  // Both actors accept searchStringsArray + max item caps; keep inputs minimal + identical.
  const base = { searchStringsArray: [searchTerm], language: 'en' };
  if (actorKey === 'compass') return { ...base, maxCrawledPlacesPerSearch: maxPlaces, skipClosedPlaces: false };
  return { ...base, maxCrawledPlacesPerSearch: maxPlaces };
}

function normPlace(item) {
  return {
    place_id: item.placeId || item.place_id || null,
    title: item.title || item.name || null,
    category: item.categoryName || item.category || null,
    address: item.address || null,
    phone: item.phone || item.phoneUnformatted || null,
    website: item.website || item.url === item.website ? item.website : (item.website || null),
    email: Array.isArray(item.emails) ? item.emails[0] : (item.email || null),
    latitude: item.location?.lat ?? item.latitude ?? null,
    longitude: item.location?.lng ?? item.longitude ?? null,
    rating: item.totalScore ?? item.rating ?? null,
    reviews_count: item.reviewsCount ?? item.reviews_count ?? null,
  };
}

/** Run one actor on one search term; stage results. Returns {fetched, staged}. */
export async function sweepOne(actorKey, searchTerm, { maxPlaces = 25, timeoutMs = 300_000 } = {}) {
  const actorId = ACTORS[actorKey];
  if (!actorId) throw new Error('unknown actor ' + actorKey);
  const items = await runSync(actorId, inputFor(actorKey, searchTerm, maxPlaces), { timeoutMs });
  let staged = 0;
  for (const item of items || []) {
    const p = normPlace(item);
    if (!p.place_id || !p.title) continue;
    const r = await query(
      `INSERT INTO gmaps_places (place_id, actor, search_term, title, category, address, phone, website, email,
                                 latitude, longitude, rating, reviews_count, raw, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb, now())
       ON CONFLICT (place_id) DO UPDATE SET
         actor = gmaps_places.actor || '+' || EXCLUDED.actor,
         email = COALESCE(gmaps_places.email, EXCLUDED.email),
         updated_at = now()
       RETURNING id`,
      [p.place_id, actorKey, searchTerm, p.title, p.category, p.address, p.phone, p.website, p.email,
       p.latitude, p.longitude, p.rating, p.reviews_count, packRaw(item)]).catch(() => null);
    if (r?.rows?.[0]) staged += 1;
  }
  return { fetched: (items || []).length, staged };
}

const digits = (s) => String(s || '').replace(/[^\d]/g, '').slice(-8);   // Qatar NSN = 8 digits
const domainOf = (u) => { try { return new URL(String(u)).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };

/** Match staged 'new' places to companies: phone → website-domain → exact name. */
export async function matchPlaces({ limit = 500 } = {}) {
  const rows = (await query(`SELECT * FROM gmaps_places WHERE status='new' ORDER BY id LIMIT $1`, [limit])).rows;
  let matched = 0, candidates = 0;
  for (const p of rows) {
    let companyId = null, method = null;
    const ph = digits(p.phone);
    if (ph.length === 8) {
      const r = await query(
        `SELECT company_id FROM company_contacts WHERE type='phone' AND value LIKE '%' || $1 LIMIT 1`, [ph]);
      if (r.rows[0]) { companyId = r.rows[0].company_id; method = 'phone'; }
    }
    if (!companyId && p.website) {
      const d = domainOf(p.website);
      if (d) {
        const r = await query(
          `SELECT id FROM companies WHERE website ILIKE '%' || $1 || '%' AND COALESCE(archived,false)=false LIMIT 1`, [d]);
        if (r.rows[0]) { companyId = r.rows[0].id; method = 'website'; }
      }
    }
    if (!companyId && p.title) {
      const r = await query(
        `SELECT id FROM companies WHERE name_normalized = lower($1) AND COALESCE(archived,false)=false LIMIT 1`, [p.title.trim()]);
      if (r.rows[0]) { companyId = r.rows[0].id; method = 'name'; }
    }
    if (companyId) {
      await query(`UPDATE gmaps_places SET matched_company_id=$2, match_method=$3, status='matched', updated_at=now() WHERE id=$1`, [p.id, companyId, method]);
      // Enrich only blanks — the paid Stage-5 data and curated fields always win.
      await query(
        `UPDATE companies SET
           gmaps_place_id = COALESCE(gmaps_place_id, $2),
           gmaps_rating = COALESCE(gmaps_rating, $3),
           gmaps_reviews_count = COALESCE(gmaps_reviews_count, $4),
           latitude = COALESCE(latitude, $5), longitude = COALESCE(longitude, $6)
         WHERE id=$1`,
        [companyId, p.place_id, p.rating, p.reviews_count, p.latitude, p.longitude]).catch(() => {});
      if (p.email) await import('../lib/contacts.js').then(({ upsertContact }) =>
        upsertContact('company', companyId, { type: 'email', value: p.email, source: 'gmaps-sweep', source_url: p.website || null })).catch(() => {});
      matched += 1;
    } else {
      await query(`UPDATE gmaps_places SET status='candidate_new', updated_at=now() WHERE id=$1`, [p.id]);
      candidates += 1;
    }
  }
  return { processed: rows.length, matched, candidates };
}

/** The side-by-side actor comparison over identical searches (test mode). */
export async function compareActors({ searches, maxPlaces = 25, log = () => {} } = {}) {
  const report = {};
  for (const key of Object.keys(ACTORS)) {
    report[key] = { fetched: 0, staged: 0, with_email: 0, with_website: 0, with_phone: 0, errors: [] };
    for (const s of searches) {
      log(`${key}: "${s}" …`);
      try {
        const r = await sweepOne(key, s, { maxPlaces });
        report[key].fetched += r.fetched;
        report[key].staged += r.staged;
      } catch (e) {
        report[key].errors.push(s + ': ' + String(e.message).slice(0, 200));
        log(`  ${key} error: ${e.message}`);
      }
    }
    const q = await query(
      `SELECT count(*) FILTER (WHERE email IS NOT NULL)::int AS em,
              count(*) FILTER (WHERE website IS NOT NULL)::int AS ws,
              count(*) FILTER (WHERE phone IS NOT NULL)::int AS ph
         FROM gmaps_places WHERE actor LIKE '%' || $1 || '%'`, [key]);
    Object.assign(report[key], { with_email: q.rows[0].em, with_website: q.rows[0].ws, with_phone: q.rows[0].ph });
  }
  const match = await matchPlaces({});
  return { report, match };
}

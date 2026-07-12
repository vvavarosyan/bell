// /api/real-estate — the Real Estate section (Val 2026-07-12). Market stats,
// buildings (GIS landmarks) and transactions, all from source-stated data:
// the Weekly Real Estate Sales Bulletin (real_estate_transactions) + the Qatar
// GIS layers. Feature-gated (signed in + subscription). Every number is a
// SUM/COUNT/AVG of figures the source itself published (Rule 2.1).

import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// ---- Market stats (6h process cache — pure aggregates over ~25k rows) --------
let statsCache = null;
let statsCacheAt = 0;
const STATS_TTL = 6 * 3600 * 1000;

async function computeStats() {
  const overall = (await query(`
    SELECT count(*)::int AS deals,
           sum(property_value)::bigint AS total_value,
           round(avg(price_per_sqm))::int AS avg_sqm,
           min(registration_date) AS oldest, max(registration_date) AS newest
      FROM real_estate_transactions WHERE property_value > 0`)).rows[0];

  const byDistrict = (await query(`
    SELECT district_name,
           count(*)::int AS deals,
           round(avg(price_per_sqm))::int AS avg_sqm,
           sum(property_value)::bigint AS total_value
      FROM real_estate_transactions
     WHERE district_name IS NOT NULL AND price_per_sqm > 0
     GROUP BY 1 ORDER BY deals DESC LIMIT 40`)).rows;

  const monthly = (await query(`
    SELECT to_char(date_trunc('month', registration_date), 'YYYY-MM') AS month,
           count(*)::int AS deals,
           round(avg(price_per_sqm))::int AS avg_sqm,
           sum(property_value)::bigint AS total_value
      FROM real_estate_transactions
     WHERE registration_date IS NOT NULL
     GROUP BY 1 ORDER BY 1 DESC LIMIT 24`)).rows;

  const byType = (await query(`
    SELECT coalesce(NULLIF(property_type,''), '—') AS property_type,
           count(*)::int AS deals,
           round(avg(price_per_sqm))::int AS avg_sqm
      FROM real_estate_transactions
     WHERE price_per_sqm > 0
     GROUP BY 1 ORDER BY deals DESC LIMIT 12`)).rows;

  // Movers — where prices are rising/falling. Anchored to the data's own latest
  // date (not wall-clock): compare avg price/sqm in the last 180 days of data vs
  // the prior 180 days, per district, requiring enough deals in BOTH windows to
  // be meaningful. Pure source data — no projection.
  const movers = (await query(`
    WITH bounds AS (SELECT max(registration_date) AS mx FROM real_estate_transactions),
    win AS (
      SELECT district_name,
             avg(price_per_sqm) FILTER (WHERE registration_date >  (SELECT mx FROM bounds) - interval '180 days') AS recent,
             count(*)           FILTER (WHERE registration_date >  (SELECT mx FROM bounds) - interval '180 days') AS n_recent,
             avg(price_per_sqm) FILTER (WHERE registration_date <= (SELECT mx FROM bounds) - interval '180 days'
                                          AND registration_date >  (SELECT mx FROM bounds) - interval '360 days') AS prior,
             count(*)           FILTER (WHERE registration_date <= (SELECT mx FROM bounds) - interval '180 days'
                                          AND registration_date >  (SELECT mx FROM bounds) - interval '360 days') AS n_prior
        FROM real_estate_transactions
       WHERE district_name IS NOT NULL AND price_per_sqm > 0
       GROUP BY district_name)
    SELECT district_name,
           round(recent)::int AS recent_sqm, round(prior)::int AS prior_sqm,
           round(((recent - prior) / prior * 100)::numeric, 1) AS pct_change,
           n_recent::int AS n_recent
      FROM win
     WHERE recent IS NOT NULL AND prior IS NOT NULL AND prior > 0
       AND n_recent >= 8 AND n_prior >= 8
     ORDER BY pct_change DESC`)).rows;

  const buildings = (await query(`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE latitude IS NOT NULL)::int AS mapped,
           count(DISTINCT category)::int AS categories
      FROM gis_landmarks`)).rows[0];
  const geo = (await query(`
    SELECT (SELECT count(*)::int FROM gis_municipalities) AS municipalities,
           (SELECT count(*)::int FROM gis_districts)      AS districts,
           (SELECT count(*)::int FROM gis_zones)          AS zones`)).rows[0];

  return {
    overall, byDistrict, monthly, byType,
    risers: movers.slice(0, 8),
    fallers: movers.slice(-8).reverse(),
    buildings, geo,
  };
}

router.get('/stats', async (req, res, next) => {
  try {
    if (!statsCache || Date.now() - statsCacheAt > STATS_TTL) {
      statsCache = await computeStats();
      statsCacheAt = Date.now();
    }
    res.json(statsCache);
  } catch (err) { next(err); }
});

// ---- Transactions (paginated, filterable) -----------------------------------
router.get('/transactions', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const where = ['1=1'];
    const params = [];
    if (req.query.district) { params.push('%' + String(req.query.district).toLowerCase() + '%'); where.push(`lower(district_name) LIKE $${params.length}`); }
    if (req.query.type)     { params.push(String(req.query.type)); where.push(`property_type = $${params.length}`); }
    const whereSql = 'WHERE ' + where.join(' AND ');
    const countR = await query(`SELECT count(*)::int AS total FROM real_estate_transactions ${whereSql}`, params);
    const dp = [...params, limit, offset];
    const rows = (await query(`
      SELECT id, registration_date, municipality_name, district_name, property_type, usage,
             property_value, area_sqm, price_per_sqm, currency
        FROM real_estate_transactions ${whereSql}
       ORDER BY registration_date DESC NULLS LAST, id DESC
       LIMIT $${dp.length - 1} OFFSET $${dp.length}`, dp)).rows;
    res.json({ rows, total: countR.rows[0].total });
  } catch (err) { next(err); }
});

// ---- Buildings (GIS landmarks — paginated, searchable) ----------------------
router.get('/buildings', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const offset = Math.max(0, Number(req.query.offset) || 0);
    const where = ['ename IS NOT NULL'];
    const params = [];
    const q = (req.query.q || '').trim();
    if (q) {
      params.push('%' + q.toLowerCase() + '%');
      const p = params.length;
      // Searchable across every text attribute — name (EN + AR), district (EN +
      // AR), street, category + subcategory — and by number (zone / building /
      // PO box) when the query is numeric. "Everything searchable" (Val).
      const conds = [
        `lower(ename) LIKE $${p}`, `lower(coalesce(aname,'')) LIKE $${p}`,
        `lower(coalesce(district_ename,'')) LIKE $${p}`, `lower(coalesce(district_aname,'')) LIKE $${p}`,
        `lower(coalesce(street_ename,'')) LIKE $${p}`, `lower(coalesce(street_aname,'')) LIKE $${p}`,
        `lower(coalesce(category,'')) LIKE $${p}`, `lower(coalesce(subcategory_name,'')) LIKE $${p}`,
      ];
      if (/^\d+$/.test(q)) { const n = Number(q); conds.push(`zone_no = ${n}`, `building_no = ${n}`, `pobox_no = ${n}`); }
      where.push('(' + conds.join(' OR ') + ')');
    }
    if (req.query.category) { params.push(String(req.query.category)); where.push(`category = $${params.length}`); }
    if (req.query.district) { params.push('%' + String(req.query.district).toLowerCase() + '%'); where.push(`lower(coalesce(district_ename,'')) LIKE $${params.length}`); }
    const whereSql = 'WHERE ' + where.join(' AND ');
    const countR = await query(`SELECT count(*)::int AS total FROM gis_landmarks ${whereSql}`, params);
    const dp = [...params, limit, offset];
    const rows = (await query(`
      SELECT l.id, l.ename, l.aname, l.category, l.subcategory_name, l.district_ename, l.street_ename,
             l.building_no, l.zone_no, l.phone, l.pobox_no, l.email, l.photo_url, l.latitude, l.longitude,
             l.company_id, c.name AS company_name
        FROM gis_landmarks l
        LEFT JOIN companies c ON c.id = l.company_id
        ${whereSql.replace(/\bename\b/g, 'l.ename').replace(/\bcategory\b/g, 'l.category').replace(/\baname\b/g, 'l.aname').replace(/\bdistrict_ename\b/g, 'l.district_ename').replace(/\bdistrict_aname\b/g, 'l.district_aname').replace(/\bstreet_ename\b/g, 'l.street_ename').replace(/\bstreet_aname\b/g, 'l.street_aname').replace(/\bsubcategory_name\b/g, 'l.subcategory_name').replace(/\bzone_no\b/g, 'l.zone_no').replace(/\bbuilding_no\b/g, 'l.building_no').replace(/\bpobox_no\b/g, 'l.pobox_no')}
       ORDER BY l.ename ASC
       LIMIT $${dp.length - 1} OFFSET $${dp.length}`, dp)).rows;
    res.json({ rows, total: countR.rows[0].total });
  } catch (err) { next(err); }
});

// Distinct building categories (for the filter chips).
router.get('/building-categories', async (req, res, next) => {
  try {
    const rows = (await query(`
      SELECT category, count(*)::int AS n FROM gis_landmarks
       WHERE category IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20`)).rows;
    res.json({ rows });
  } catch (err) { next(err); }
});

// ---- Map data (lazy layers for the Mapbox map) ------------------------------
// Building points + district markers (with their recent avg price/sqm). Capped;
// the heavy parcel/land-use polygons are a separate later layer.
router.get('/map', async (req, res, next) => {
  try {
    const buildings = (await query(`
      SELECT id, ename, category, latitude AS lat, longitude AS lng, district_ename
        FROM gis_landmarks
       WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       LIMIT 8000`)).rows;
    const districts = (await query(`
      SELECT d.ename, d.centroid_lat AS lat, d.centroid_lng AS lng,
             re.deals, re.avg_sqm
        FROM gis_districts d
        LEFT JOIN (
          SELECT district_name, count(*)::int AS deals, round(avg(price_per_sqm))::int AS avg_sqm
            FROM real_estate_transactions WHERE price_per_sqm > 0 GROUP BY 1
        ) re ON lower(re.district_name) = lower(d.ename)
       WHERE d.centroid_lat IS NOT NULL`)).rows;
    res.json({ buildings, districts });
  } catch (err) { next(err); }
});

export default router;

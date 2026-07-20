// OpenStreetMap reference layer — read API for the map, search, and Bella.
import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Qatar bbox guard (same as the rest of the app).
const inQatar = (lng, lat) => Number.isFinite(lng) && Number.isFinite(lat)
  && !(lng === 0 && lat === 0) && lng >= 50.55 && lng <= 51.85 && lat >= 24.40 && lat <= 26.30;

// GET /api/osm/places?bbox=w,s,e,n&group=Food%20%26%20Drink&limit= — map layer,
// viewport-lazy so we never ship all ~15k at once.
router.get('/places', async (req, res, next) => {
  try {
    const params = [];
    const where = ['latitude IS NOT NULL', 'longitude IS NOT NULL',
      'longitude BETWEEN 50.55 AND 51.85', 'latitude BETWEEN 24.40 AND 26.30'];
    if (req.query.bbox) {
      const [w, s, e, n] = String(req.query.bbox).split(',').map(Number);
      if ([w, s, e, n].every(Number.isFinite)) {
        params.push(w, s, e, n);
        where.push(`longitude BETWEEN $${params.length - 3} AND $${params.length - 1}`);
        where.push(`latitude BETWEEN $${params.length - 2} AND $${params.length}`);
      }
    }
    if (req.query.group) { params.push(String(req.query.group)); where.push(`category_group = $${params.length}`); }
    const limit = Math.min(Number(req.query.limit) || 4000, 8000);
    const rows = (await query(
      `SELECT id, name, name_ar, category, category_group, latitude, longitude, phone, website,
              opening_hours, address, matched_company_id
         FROM osm_places WHERE ${where.join(' AND ')}
         ORDER BY (matched_company_id IS NOT NULL) DESC, id
         LIMIT ${limit}`, params)).rows;
    res.json({
      type: 'FeatureCollection',
      features: rows.filter((r) => inQatar(Number(r.longitude), Number(r.latitude))).map((r) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [Number(r.longitude), Number(r.latitude)] },
        properties: {
          id: r.id, name: r.name, category: r.category, group: r.category_group,
          phone: r.phone, website: r.website, opening_hours: r.opening_hours,
          address: r.address, company_id: r.matched_company_id || null,
        },
      })),
      total: rows.length,
    });
  } catch (err) { next(err); }
});

// GET /api/osm/search?q=&group=&near=lng,lat&limit= — text/category search (UI + Bella).
router.get('/search', async (req, res, next) => {
  try {
    const params = [];
    const where = [];
    if (req.query.q) {
      params.push(`%${String(req.query.q).trim()}%`);
      where.push(`(name ILIKE $${params.length} OR name_ar ILIKE $${params.length} OR category ILIKE $${params.length})`);
    }
    if (req.query.group)    { params.push(String(req.query.group));    where.push(`category_group = $${params.length}`); }
    if (req.query.category) { params.push(String(req.query.category)); where.push(`category = $${params.length}`); }
    const limit = Math.min(Number(req.query.limit) || 30, 100);

    let order = 'name';
    if (req.query.near) {
      const [lng, lat] = String(req.query.near).split(',').map(Number);
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        params.push(lng, lat);
        // Cheap planar distance for ordering (Qatar is small).
        order = `((longitude - $${params.length - 1})^2 + (latitude - $${params.length})^2)`;
      }
    }
    const rows = (await query(
      `SELECT id, name, name_ar, category, category_group, latitude, longitude, phone,
              website, opening_hours, address, matched_company_id
         FROM osm_places ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
         ORDER BY ${order} LIMIT ${limit}`, params)).rows;
    res.json({ rows, count: rows.length });
  } catch (err) { next(err); }
});

// GET /api/osm/stats — counts by group + totals (legend + Bella + admin).
router.get('/stats', async (_req, res, next) => {
  try {
    const groups = (await query(
      `SELECT category_group AS group, count(*)::int AS n
         FROM osm_places WHERE category_group IS NOT NULL
        GROUP BY category_group ORDER BY n DESC`)).rows;
    const t = (await query(
      `SELECT (SELECT count(*) FROM osm_places)::int AS places,
              (SELECT count(*) FROM osm_streets)::int AS streets,
              (SELECT count(*) FROM osm_places WHERE matched_company_id IS NOT NULL)::int AS matched`)).rows[0];
    res.json({ ...t, groups });
  } catch (err) { next(err); }
});

// GET /api/osm/streets?q= — street-name lookup (geocoder aid + Bella).
router.get('/streets', async (req, res, next) => {
  try {
    const params = [];
    let where = '';
    if (req.query.q) { params.push(`%${String(req.query.q).trim()}%`); where = `WHERE name ILIKE $1 OR name_ar ILIKE $1`; }
    const rows = (await query(
      `SELECT id, name, name_ar, highway, latitude, longitude, city, segment_count
         FROM osm_streets ${where} ORDER BY segment_count DESC LIMIT 50`, params)).rows;
    res.json({ rows, count: rows.length });
  } catch (err) { next(err); }
});

export default router;

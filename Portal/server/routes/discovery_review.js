// /api/discovery — the discovery review queue (LOCAL-ENGINE-ONLY, admin).
//
// The enrichment engines DISCOVER new companies that are never auto-added
// (Rule 2.1: a Google-Maps listing alone doesn't prove a registrable company;
// PDPPL: foreign entities are admin-only). They wait here for a decision:
//
//   gmaps_places   status='candidate_new'  — Maps businesses that matched no company
//   spark_discoveries status='new'         — companies Spark found while researching
//                                            (country='Qatar' → promotable; else admin-only)
//
//   GET  /summary                    counts per queue
//   GET  /gmaps                      Maps candidates (+ possible-existing-match hint)
//   GET  /spark?scope=qatar|foreign  Spark discoveries
//   POST /gmaps/:id/promote          create/link a Qatar company from the place
//   POST /gmaps/:id/ignore           mark ignored
//   POST /spark/:id/promote          create a Qatar company (Qatar discoveries only)
//   POST /spark/:id/ignore           mark ignored
//
// Promoting creates a real Qatar company on the local engine; it mirrors up to
// bell.qa via the normal push. Dedup guards ALWAYS run first so a promote never
// creates a duplicate of an existing company (the DOC-duplicate lesson).

import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { normalizeName } from '../ingest/normalize.js';
import { deriveIndustries } from '../lib/industry.js';
import { upsertContact } from '../lib/contacts.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';

const router = Router();

const digits = (s) => String(s || '').replace(/[^\d]/g, '').slice(-8);   // Qatar NSN = 8 digits
const domainOf = (u) => { try { return new URL(String(u)).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };
const isQatar = (c) => /qatar|qa\b/i.test(String(c || '')) || String(c || '').trim() === '';

// Find an existing company that this candidate is really the same as — phone
// (last 8 digits) → website domain → exact normalised name. Returns id or null.
async function findExisting(client, { phone, website, name }) {
  const ph = digits(phone);
  if (ph.length === 8) {
    const r = await client.query(
      `SELECT company_id AS id FROM company_contacts WHERE type='phone' AND value LIKE '%' || $1 LIMIT 1`, [ph]);
    if (r.rows[0]) return { id: Number(r.rows[0].id), method: 'phone' };
  }
  const d = domainOf(website);
  if (d) {
    const r = await client.query(
      `SELECT id FROM companies WHERE website ILIKE '%' || $1 || '%' AND COALESCE(archived,false)=false LIMIT 1`, [d]);
    if (r.rows[0]) return { id: Number(r.rows[0].id), method: 'website' };
  }
  const norm = normalizeName(name);
  if (norm && norm.length >= 3) {
    const r = await client.query(
      `SELECT id FROM companies WHERE name_normalized = $1 AND COALESCE(archived,false)=false LIMIT 1`, [norm]);
    if (r.rows[0]) return { id: Number(r.rows[0].id), method: 'name' };
  }
  return null;
}

// ---------------------------------------------------------------------------
// GET /summary
router.get('/summary', async (_req, res, next) => {
  try {
    const g = await query(`SELECT count(*) FILTER (WHERE status='candidate_new')::int AS candidates FROM gmaps_places`);
    const s = await query(
      `SELECT count(*) FILTER (WHERE status='new' AND country ILIKE '%qatar%')::int AS qatar,
              count(*) FILTER (WHERE status='new' AND NOT (country ILIKE '%qatar%'))::int AS foreign
         FROM spark_discoveries`);
    const o = await query(
      `SELECT count(*)::int AS candidates FROM osm_places
        WHERE matched_company_id IS NULL AND review_status IS NULL
          AND name IS NOT NULL
          AND category_group = ANY($1) AND latitude IS NOT NULL`, [OSM_BUSINESS_GROUPS]).catch(() => ({ rows: [{ candidates: 0 }] }));
    res.json({ gmaps_candidates: g.rows[0].candidates, spark_qatar: s.rows[0].qatar, spark_foreign: s.rows[0].foreign, osm_candidates: o.rows[0].candidates });
  } catch (err) { next(err); }
});

// GET /gmaps — Maps candidates, newest first, with a possible-existing-match hint.
router.get('/gmaps', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const rows = (await query(
      `SELECT id, place_id, title, category, address, phone, website, email,
              latitude, longitude, rating, reviews_count, search_term, created_at
         FROM gmaps_places WHERE status='candidate_new' ORDER BY id DESC LIMIT $1`, [limit])).rows;
    // Cheap possible-match hint per row (name only — the promote path does the full check).
    for (const r of rows) {
      const norm = normalizeName(r.title);
      if (norm && norm.length >= 3) {
        const m = await query(`SELECT id, name FROM companies WHERE name_normalized=$1 AND COALESCE(archived,false)=false LIMIT 1`, [norm]);
        r.maybe_existing = m.rows[0] || null;
      }
    }
    res.json({ rows });
  } catch (err) { next(err); }
});

// GET /spark?scope=qatar|foreign
router.get('/spark', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 100), 500);
    const foreign = req.query.scope === 'foreign';
    const rows = (await query(
      `SELECT id, name, country, website, relation, source_company_id, source_url, created_at
         FROM spark_discoveries
        WHERE status='new' AND ${foreign ? `NOT (country ILIKE '%qatar%')` : `country ILIKE '%qatar%'`}
        ORDER BY id DESC LIMIT $1`, [limit])).rows;
    for (const r of rows) {
      if (r.source_company_id) {
        const sc = await query(`SELECT name FROM companies WHERE id=$1`, [r.source_company_id]);
        r.source_company_name = sc.rows[0]?.name || null;
      }
    }
    res.json({ rows });
  } catch (err) { next(err); }
});

// Shared: create OR link a Qatar company, attach contacts/location, rescore.
async function promoteToCompany(client, { name, website, phone, email, city, category, latitude, longitude,
  place_id, rating, reviews_count, country, source, sourceRecordId, raw }) {
  const existing = await findExisting(client, { phone, website, name });
  let companyId = existing?.id || null;
  let created = false;

  if (!companyId) {
    const norm = normalizeName(name);
    const { primary, tags } = deriveIndustries({ name, sector: category || null });
    const hasCoords = Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
    const ins = await client.query(
      `INSERT INTO companies (name, name_normalized, website, city, country, is_active, archived,
                              status_normalized, industry, industries, latitude, longitude,
                              gmaps_place_id, gmaps_rating, gmaps_reviews_count, extra_fields)
       VALUES ($1,$2,$3,$4,$5,true,false,'unknown',$6,$7::text[],$8,$9,$10,$11,$12,$13::jsonb)
       RETURNING id`,
      [name, norm, website || null, city || 'Doha', country || 'Qatar', primary, tags,
       hasCoords ? Number(latitude) : null, hasCoords ? Number(longitude) : null,
       place_id || null, rating ?? null, reviews_count ?? null,
       JSON.stringify({ promoted_from: source })]);
    companyId = Number(ins.rows[0].id);
    created = true;
  }

  // Provenance row.
  await client.query(
    `INSERT INTO company_sources (company_id, source, source_record_id, source_url, raw_payload)
     VALUES ($1,$2,$3,NULL,$4::jsonb) ON CONFLICT DO NOTHING`,
    [companyId, source, sourceRecordId, JSON.stringify(raw || {})]);

  return { companyId, created, matchedMethod: existing?.method || null };
}

// POST /gmaps/:id/promote
router.post('/gmaps/:id/promote', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const out = await withTransaction(async (client) => {
      const cr = await client.query(`SELECT * FROM gmaps_places WHERE id=$1 FOR UPDATE`, [id]);
      if (!cr.rows.length) return { error: 'not_found' };
      const p = cr.rows[0];
      if (p.status !== 'candidate_new') return { error: 'not_candidate', status: p.status };

      const { companyId, created, matchedMethod } = await promoteToCompany(client, {
        name: p.title, website: p.website, phone: p.phone, email: p.email,
        category: p.category, latitude: p.latitude, longitude: p.longitude,
        place_id: p.place_id, rating: p.rating, reviews_count: p.reviews_count,
        country: 'Qatar', source: 'gmaps', sourceRecordId: 'gmaps:' + p.place_id, raw: p.raw,
      });
      // Location (coords from the place) — safe inside the txn (raw SQL via client).
      if (Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))) {
        await client.query(
          `INSERT INTO company_locations (company_id, label, address, latitude, longitude, source, geocode_status, updated_at)
           VALUES ($1,'Head office',$2,$3,$4,'gmaps-review','website-maplink', now())
           ON CONFLICT (company_id, lower(address)) DO NOTHING`,
          [companyId, (p.address || (Number(p.latitude).toFixed(5) + ', ' + Number(p.longitude).toFixed(5))).slice(0, 300), Number(p.latitude), Number(p.longitude)]);
      }
      await client.query(
        `UPDATE gmaps_places SET status='matched', matched_company_id=$2, match_method=$3, updated_at=now() WHERE id=$1`,
        [id, companyId, matchedMethod || 'promoted']);
      return { promoted: id, company_id: companyId, created, phone: p.phone, email: p.email, website: p.website };
    });
    if (out.error === 'not_found') return res.status(404).json(out);
    if (out.error === 'not_candidate') return res.status(409).json(out);
    // Contacts + rescore AFTER commit (upsertContact uses the default pool, not
    // the txn client — writing them inside would orphan them on a rollback).
    if (out.phone) await upsertContact('company', out.company_id, { type: 'phone', value: out.phone, source: 'gmaps-review' }).catch(() => {});
    if (out.email) await upsertContact('company', out.company_id, { type: 'email', value: out.email, source: 'gmaps-review' }).catch(() => {});
    await recomputeBellScoreForCompany(out.company_id).catch(() => {});
    res.json({ promoted: out.promoted, company_id: out.company_id, created: out.created, linked_to_existing: !out.created });
  } catch (err) { next(err); }
});

// POST /gmaps/:id/ignore
router.post('/gmaps/:id/ignore', async (req, res, next) => {
  try {
    const r = await query(`UPDATE gmaps_places SET status='ignored', updated_at=now() WHERE id=$1 AND status='candidate_new' RETURNING id`, [Number(req.params.id)]);
    if (!r.rows.length) return res.status(409).json({ error: 'not_candidate' });
    res.json({ ignored: Number(req.params.id) });
  } catch (err) { next(err); }
});

// POST /spark/:id/promote — Qatar discoveries only (foreign stay admin-only).
router.post('/spark/:id/promote', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const out = await withTransaction(async (client) => {
      const cr = await client.query(`SELECT * FROM spark_discoveries WHERE id=$1 FOR UPDATE`, [id]);
      if (!cr.rows.length) return { error: 'not_found' };
      const d = cr.rows[0];
      if (d.status !== 'new') return { error: 'not_new', status: d.status };
      if (!isQatar(d.country)) return { error: 'foreign_admin_only' };

      const { companyId, created, matchedMethod } = await promoteToCompany(client, {
        name: d.name, website: d.website, country: 'Qatar',
        source: 'spark', sourceRecordId: 'spark:' + d.id, raw: d.raw,
      });
      await client.query(
        `UPDATE spark_discoveries SET status='promoted', promoted_company_id=$2, updated_at=now() WHERE id=$1`,
        [id, companyId]);
      return { promoted: id, company_id: companyId, created };
    });
    if (out.error === 'not_found') return res.status(404).json(out);
    if (out.error === 'not_new') return res.status(409).json(out);
    if (out.error === 'foreign_admin_only') return res.status(403).json(out);
    // Rescore AFTER commit (recompute uses the pool — can't see the uncommitted row).
    await recomputeBellScoreForCompany(out.company_id).catch(() => {});
    res.json({ promoted: out.promoted, company_id: out.company_id, created: out.created, linked_to_existing: !out.created });
  } catch (err) { next(err); }
});

// POST /spark/:id/ignore
router.post('/spark/:id/ignore', async (req, res, next) => {
  try {
    const r = await query(`UPDATE spark_discoveries SET status='ignored', updated_at=now() WHERE id=$1 AND status='new' RETURNING id`, [Number(req.params.id)]);
    if (!r.rows.length) return res.status(409).json({ error: 'not_new' });
    res.json({ ignored: Number(req.params.id) });
  } catch (err) { next(err); }
});

// --- OpenStreetMap place candidates ---------------------------------------
// Named Qatar businesses OSM knows that Bell doesn't (unmatched + reachable).
// review_status: NULL candidate → 'promoted' | 'ignored'. Business-y groups only.
// Contact info is NOT required (Val 2026-07-21) — enrichment fills phones/emails
// in later and those flow onto the promoted company automatically.
const OSM_BUSINESS_GROUPS = ['Food & Drink', 'Shopping', 'Health', 'Finance', 'Offices & Business', 'Tourism & Hotels', 'Automotive', 'Education'];

// GET /osm — candidates, newest first, with a name-match hint.
router.get('/osm', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 300);
    const rows = (await query(
      `SELECT id, name, category, category_group, address, phone, website, latitude, longitude
         FROM osm_places
        WHERE matched_company_id IS NULL AND review_status IS NULL
          AND name IS NOT NULL
          AND category_group = ANY($1)
          AND latitude IS NOT NULL
        -- Richest first: a place with a website AND phone is the best use of a
        -- review click; bare name+location entries sort last.
        ORDER BY ((website IS NOT NULL)::int + (phone IS NOT NULL)::int) DESC, id DESC
        LIMIT $2`, [OSM_BUSINESS_GROUPS, limit])).rows;
    for (const r of rows) {
      const norm = normalizeName(r.name || '');
      if (norm) {
        const m = await query(`SELECT id, name FROM companies WHERE name_normalized=$1 AND COALESCE(archived,false)=false LIMIT 1`, [norm]);
        r.possible_match = m.rows[0] || null;
      }
    }
    res.json({ rows, count: rows.length });
  } catch (err) { next(err); }
});

// POST /osm/:id/promote
router.post('/osm/:id/promote', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const out = await withTransaction(async (client) => {
      const cr = await client.query(`SELECT * FROM osm_places WHERE id=$1 FOR UPDATE`, [id]);
      if (!cr.rows.length) return { error: 'not_found' };
      const p = cr.rows[0];
      if (p.matched_company_id || p.review_status) return { error: 'not_candidate', status: p.review_status || 'matched' };

      const { companyId, created, matchedMethod } = await promoteToCompany(client, {
        name: p.name, website: p.website, phone: p.phone, category: p.category,
        latitude: p.latitude, longitude: p.longitude, country: 'Qatar',
        source: 'osm', sourceRecordId: 'osm:' + p.osm_type + '/' + p.osm_id, raw: p.tags,
      });
      if (Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude))) {
        await client.query(
          `INSERT INTO company_locations (company_id, label, address, latitude, longitude, source, geocode_status, updated_at)
           VALUES ($1,'Head office',$2,$3,$4,'osm-review','osm', now())
           ON CONFLICT (company_id, lower(address)) DO NOTHING`,
          [companyId, (p.address || (Number(p.latitude).toFixed(5) + ', ' + Number(p.longitude).toFixed(5))).slice(0, 300), Number(p.latitude), Number(p.longitude)]);
      }
      await client.query(`UPDATE osm_places SET matched_company_id=$2, review_status='promoted', updated_at=now() WHERE id=$1`, [id, companyId]);
      return { promoted: id, company_id: companyId, created, phone: p.phone, matchedMethod };
    });
    if (out.error === 'not_found') return res.status(404).json(out);
    if (out.error === 'not_candidate') return res.status(409).json(out);
    if (out.phone) await upsertContact('company', out.company_id, { type: 'phone', value: out.phone, source: 'osm-review' }).catch(() => {});
    await recomputeBellScoreForCompany(out.company_id).catch(() => {});
    res.json({ promoted: out.promoted, company_id: out.company_id, created: out.created, linked_to_existing: !out.created });
  } catch (err) { next(err); }
});

// POST /osm/:id/ignore
router.post('/osm/:id/ignore', async (req, res, next) => {
  try {
    const r = await query(`UPDATE osm_places SET review_status='ignored', updated_at=now() WHERE id=$1 AND review_status IS NULL AND matched_company_id IS NULL RETURNING id`, [Number(req.params.id)]);
    if (!r.rows.length) return res.status(409).json({ error: 'not_candidate' });
    res.json({ ignored: Number(req.params.id) });
  } catch (err) { next(err); }
});

export default router;

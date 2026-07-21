// /api/location-review — pair a nameless map pin with the company's own written address.
//
// The harvester stores two rows from the same website and never links them: a PINNED row
// whose "address" is just the coordinate ("25.38433, 51.52486") and an UNPINNED row with the
// company's real words ("Marina 50 Tower, 1st Floor, Lusail City, Lusail"). Joining them
// automatically was adversarially REFUTED — the strongest signal (a surveyed landmark's name
// appearing in the text) also pairs neighbours in the same tower. So Bell only PROPOSES,
// showing the evidence, and Val confirms. His click is the merge authority.
//
// Evidence per proposal: the nearest SURVEYED government landmark to the pin (gis_landmarks,
// 7,227 points), its distance in metres, and the exact name token that appears in the text
// address. DOC's Lusail pin is 6.8 m from the surveyed point literally named "Marina 50".
//
// Local engine only — it mutates canonical data; prod is a mirror.

import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';
import { isCoordinateAddress } from '../lib/location_display.js';

const router = Router();

// Words that appear in nearly every Qatar address/landmark — matching on one of these would
// pair anything with anything (the loose-name-matching trap that set thousands of wrong
// websites once). A token must be specific to count as evidence.
const GENERIC = new Set(['tower', 'towers', 'center', 'centre', 'building', 'complex', 'street',
  'plaza', 'mall', 'doha', 'qatar', 'lusail', 'west', 'east', 'north', 'south', 'bay', 'area',
  'zone', 'road', 'gate', 'floor', 'office', 'shop', 'villa', 'hotel', 'city', 'district',
  'company', 'trading', 'group', 'medical', 'clinic', 'branch', 'main', 'first', 'second']);

const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const specificTokens = (s) => tokens(s).filter((t) => t.length >= 5 && !GENERIC.has(t) && !/^\d+$/.test(t));

const MAX_LANDMARK_M = 60;   // beyond this the "nearest building" is a different building

/**
 * Build the proposals: one card per nameless pin, with every same-company text row whose
 * words contain a specific token of the surveyed landmark at that pin.
 */
async function buildPairs() {
  // Nameless pins + their nearest surveyed landmark, one LATERAL pass.
  const bare = (await query(`
    SELECT l.id, l.company_id, c.name AS company_name, l.latitude, l.longitude,
           l.geocode_status, l.source AS pin_source, l.raw,
           lm.ename AS landmark, lm.zone_no, lm.district_ename, lm.m AS landmark_m
      FROM company_locations l
      JOIN companies c ON c.id = l.company_id AND COALESCE(c.archived,false) = false
      LEFT JOIN LATERAL (
        SELECT g.ename, g.zone_no, g.district_ename,
               round((6371000*acos(least(1,
                 cos(radians(l.latitude))*cos(radians(g.latitude))*cos(radians(g.longitude)-radians(l.longitude))
                 + sin(radians(l.latitude))*sin(radians(g.latitude)))))::numeric, 1) AS m
          FROM gis_landmarks g
         WHERE g.latitude IS NOT NULL
         ORDER BY (g.latitude - l.latitude)^2 + (g.longitude - l.longitude)^2
         LIMIT 1
      ) lm ON true
     WHERE l.latitude IS NOT NULL
       AND btrim(l.address) ~ '^-?[0-9]{1,3}\\.[0-9]+\\s*,\\s*-?[0-9]{1,3}\\.[0-9]+$'`)).rows;

  const companyIds = [...new Set(bare.map((b) => Number(b.company_id)))];
  if (!companyIds.length) return [];
  // Unpinned rows holding a real written address for those companies.
  const texts = (await query(`
    SELECT id, company_id, label, address, source
      FROM company_locations
     WHERE company_id = ANY($1) AND latitude IS NULL
       AND address IS NOT NULL AND btrim(address) <> ''`, [companyIds])).rows
    .filter((t) => !isCoordinateAddress(t.address));
  const textByCo = new Map();
  for (const t of texts) {
    const k = Number(t.company_id);
    if (!textByCo.has(k)) textByCo.set(k, []);
    textByCo.get(k).push(t);
  }

  const pairs = [];
  for (const b of bare) {
    if (!b.landmark || Number(b.landmark_m) > MAX_LANDMARK_M) continue;
    const marks = specificTokens(b.landmark);
    if (!marks.length) continue;
    const rejected = new Set(((b.raw || {}).pair_rejected || []).map((r) => `${r.keep_id}`));
    const candidates = [];
    for (const t of textByCo.get(Number(b.company_id)) || []) {
      if (rejected.has(String(t.id))) continue;
      const addr = ' ' + tokens(t.address).join(' ') + ' ';
      const hit = marks.find((m) => addr.includes(' ' + m + ' ') || addr.includes(' ' + m));
      if (hit) candidates.push({ ...t, matched_token: hit });
    }
    if (!candidates.length) continue;
    pairs.push({
      drop_id: b.id, company_id: Number(b.company_id), company_name: b.company_name,
      latitude: Number(b.latitude), longitude: Number(b.longitude),
      pin_source: b.pin_source, geocode_status: b.geocode_status,
      landmark: b.landmark, landmark_m: Number(b.landmark_m),
      zone_no: b.zone_no, district: b.district_ename,
      candidates,
    });
  }
  pairs.sort((a, b) => a.landmark_m - b.landmark_m);
  return pairs;
}

let cache = null;
const CACHE_MS = 120_000;
const invalidate = () => { cache = null; };
async function getPairs() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await buildPairs();
  cache = { at: Date.now(), data };
  return data;
}

router.get('/summary', async (_req, res, next) => {
  try {
    const [p, t] = await Promise.all([getPairs(), getTwins()]);
    res.json({ pairs: p.length, twins: t.length });
  } catch (e) { next(e); }
});

router.get('/pairs', async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const p = await getPairs();
    res.json({ total: p.length, rows: p.slice(0, limit) });
  } catch (e) { next(e); }
});

// Approve: the written address gains the pin's coordinates; the nameless pin row is
// tombstoned and deleted. Val's click IS the evidence that they are one site.
router.post('/approve', async (req, res, next) => {
  try {
    const dropId = Number(req.body?.drop_id), keepId = Number(req.body?.keep_id);
    if (!dropId || !keepId) return res.status(400).json({ error: 'ids_required' });
    const out = await withTransaction(async (client) => {
      // Re-verify the shape under lock — never merge on a stale proposal.
      const rows = (await client.query(
        `SELECT id, company_id, label, address, latitude, longitude, geocode_status, geocode_method, source, source_url, raw
           FROM company_locations WHERE id = ANY($1) FOR UPDATE`, [[dropId, keepId]])).rows;
      const drop = rows.find((r) => Number(r.id) === dropId);
      const keep = rows.find((r) => Number(r.id) === keepId);
      if (!drop || !keep) return { error: 'row_gone' };
      if (Number(drop.company_id) !== Number(keep.company_id)) return { error: 'different_companies' };
      if (drop.latitude == null || !isCoordinateAddress(drop.address)) return { error: 'not_a_bare_pin' };
      if (keep.latitude != null) return { error: 'already_pinned' };

      await client.query(`
        UPDATE company_locations
           SET latitude = $2, longitude = $3,
               geocode_status = COALESCE($4, geocode_status),
               geocode_method = 'pair-confirmed', geocoded_at = now(),
               raw = COALESCE(raw,'{}'::jsonb) || jsonb_build_object('merged_from',
                 COALESCE(raw->'merged_from','[]'::jsonb) || jsonb_build_object(
                   'id', $5::bigint, 'source', $6::text, 'source_url', $7::text,
                   'geocode_status', $4::text, 'confirmed_by', 'val', 'at', now()::text)),
               updated_at = now()
         WHERE id = $1`,
        [keepId, drop.latitude, drop.longitude, drop.geocode_status, dropId, drop.source, drop.source_url]);
      // company_locations has NO delete trigger — tombstone BEFORE delete, or prod keeps it.
      await client.query(`INSERT INTO sync_deletions (table_name, row_id) VALUES ('company_locations', $1)`, [dropId]);
      await client.query(`DELETE FROM company_locations WHERE id = $1`, [dropId]);
      return { ok: true, company_id: Number(drop.company_id) };
    });
    if (out.error) return res.status(409).json(out);
    invalidate();
    await recomputeBellScoreForCompany(out.company_id).catch(() => {});
    res.json(out);
  } catch (e) { next(e); }
});

// Reject: remembered on the PIN row keyed by the text row's id, so the pair is never
// re-proposed — and because it lives on the row, a re-harvest that re-mints the pin
// (pre-guard rows) starts fresh, which is correct: the evidence deserves a second look
// only if the data actually changed.
router.post('/reject', async (req, res, next) => {
  try {
    const dropId = Number(req.body?.drop_id), keepId = Number(req.body?.keep_id);
    if (!dropId || !keepId) return res.status(400).json({ error: 'ids_required' });
    await query(`
      UPDATE company_locations
         SET raw = COALESCE(raw,'{}'::jsonb) || jsonb_build_object('pair_rejected',
               COALESCE(raw->'pair_rejected','[]'::jsonb) || jsonb_build_object('keep_id', $2::bigint, 'at', now()::text)),
             updated_at = now()
       WHERE id = $1`, [dropId, keepId]);
    invalidate();
    res.json({ ok: true });
  } catch (e) { next(e); }
});


// ---------------------------------------------------------------------------
// ADDRESS TWINS — the same site written twice by different sources.
// DOC id 20 "27 Al Kinana St, Doha, Qatar" and id 11910 "27 Al Kinana Street, Al Sadd
// District, Doha" are one clinic; the drawer lists both. Automatic collapse was
// adversarially REFUTED (the text normalizer strips Arabic to an empty string, which
// collided three real sites 53 km apart, and keep-lowest-id once destroyed a verified
// geocode), so — like pairs — Bell only PROPOSES, and Val picks which written form
// survives. The survivor inherits the loser's coordinates when it has none.

const zoneOf = (s) => { const m = String(s || '').match(/zone\s*(\d{1,3})/i); return m ? m[1] : null; };
const numTokens = (s) => tokens(s).filter((t) => /^\d{1,5}$/.test(t));
const normText = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Metres between two points, or null when either is unpinned. */
function metresApart(a, b) {
  if (a.latitude == null || b.latitude == null) return null;
  const rad = (d) => (Number(d) * Math.PI) / 180;
  const [la1, lo1, la2, lo2] = [rad(a.latitude), rad(a.longitude), rad(b.latitude), rad(b.longitude)];
  return Math.round(6371000 * Math.acos(Math.min(1,
    Math.cos(la1) * Math.cos(la2) * Math.cos(lo2 - lo1) + Math.sin(la1) * Math.sin(la2))));
}

async function buildTwins() {
  const rows = (await query(`
    SELECT l.id, l.company_id, c.name AS company_name, l.label, l.address, l.source,
           l.latitude, l.longitude, l.geocode_status, l.raw
      FROM company_locations l
      JOIN companies c ON c.id = l.company_id AND COALESCE(c.archived,false) = false
     WHERE l.address IS NOT NULL AND btrim(l.address) <> ''`)).rows
    .filter((r) => !isCoordinateAddress(r.address));
  const byCo = new Map();
  for (const r of rows) {
    const k = Number(r.company_id);
    if (!byCo.has(k)) byCo.set(k, []);
    byCo.get(k).push(r);
  }

  const twins = [];
  for (const list of byCo.values()) {
    if (list.length < 2 || list.length > 12) continue;   // >12 rows = a different defect, not twins
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
      const a = list[i], b = list[j];
      const rejected = new Set([...(a.raw?.twin_rejected || []), ...(b.raw?.twin_rejected || [])].map((x) => String(x.other_id)));
      if (rejected.has(String(a.id)) || rejected.has(String(b.id))) continue;
      // PROVEN-DIFFERENT guard: two pins more than 150 m apart are two real sites —
      // this is what protects the three-Arabic-addresses-53-km-apart case.
      const dist = metresApart(a, b);
      if (dist != null && dist > 150) continue;

      const sa = [...new Set(specificTokens(a.address))], sb = [...new Set(specificTokens(b.address))];
      const shared = sa.filter((t) => sb.includes(t));
      const na = normText(a.address), nb = normText(b.address);
      const sameNorm = na.length >= 12 && na === nb;     // >=12 chars: an Arabic address that
                                                          // normalizes to '' must never "match"
      const sameZone = zoneOf(a.address) && zoneOf(a.address) === zoneOf(b.address);
      const sharedNum = numTokens(a.address).filter((t) => numTokens(b.address).includes(t));
      // Identical wording (punctuation/whitespace variants) is MECHANICAL — it goes to
      // "Preview/Apply Location Merge.command" in one click, not to a 187-card queue.
      // Only genuine judgment calls are shown here.
      if (sameNorm) continue;
      const strength = shared.length >= 2 ? 'two shared place words'
        : (shared.length === 1 && (sameZone || sharedNum.length)) ? 'a shared place word plus a matching number'
        : null;
      if (!strength) continue;
      twins.push({
        company_id: Number(a.company_id), company_name: a.company_name,
        strength, shared_tokens: shared.slice(0, 4), distance_m: dist,
        rows: [a, b].map((r) => ({ id: r.id, label: r.label, address: r.address, source: r.source,
          pinned: r.latitude != null })),
      });
    }
  }
  const rank = { 'two shared place words': 0, 'a shared place word plus a matching number': 1 };
  twins.sort((x, y) => (rank[x.strength] ?? 9) - (rank[y.strength] ?? 9));
  return twins.slice(0, 300);
}

let twinCache = null;
async function getTwins() {
  if (twinCache && Date.now() - twinCache.at < CACHE_MS) return twinCache.data;
  const data = await buildTwins();
  twinCache = { at: Date.now(), data };
  return data;
}
const invalidateTwins = () => { twinCache = null; };

router.get('/twins', async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    const t = await getTwins();
    res.json({ total: t.length, rows: t.slice(0, limit) });
  } catch (e) { next(e); }
});

// Approve: keeper's written address survives; it inherits the loser's coordinates
// (with their geocode provenance) when it has none — never the other way round.
router.post('/twin-approve', async (req, res, next) => {
  try {
    const keepId = Number(req.body?.keep_id), dropId = Number(req.body?.drop_id);
    if (!keepId || !dropId || keepId === dropId) return res.status(400).json({ error: 'ids_required' });
    const out = await withTransaction(async (client) => {
      const rows = (await client.query(
        `SELECT id, company_id, label, address, latitude, longitude, geocode_status, geocode_method,
                geocode_score, geocoded_at, source, source_url, is_primary
           FROM company_locations WHERE id = ANY($1) FOR UPDATE`, [[keepId, dropId]])).rows;
      const keep = rows.find((r) => Number(r.id) === keepId);
      const drop = rows.find((r) => Number(r.id) === dropId);
      if (!keep || !drop) return { error: 'row_gone' };
      if (Number(keep.company_id) !== Number(drop.company_id)) return { error: 'different_companies' };
      await client.query(`
        UPDATE company_locations
           SET latitude  = COALESCE(latitude,  $2),
               longitude = COALESCE(longitude, $3),
               geocode_status = CASE WHEN latitude IS NULL THEN $4 ELSE geocode_status END,
               geocode_method = CASE WHEN latitude IS NULL THEN $5 ELSE geocode_method END,
               is_primary = is_primary OR $6,
               raw = COALESCE(raw,'{}'::jsonb) || jsonb_build_object('merged_from',
                 COALESCE(raw->'merged_from','[]'::jsonb) || jsonb_build_object(
                   'id', $7::bigint, 'address', $8::text, 'label', $9::text, 'source', $10::text,
                   'confirmed_by', 'val', 'at', now()::text)),
               updated_at = now()
         WHERE id = $1`,
        [keepId, drop.latitude, drop.longitude, drop.geocode_status, drop.geocode_method,
         drop.is_primary === true, dropId, drop.address, drop.label, drop.source]);
      await client.query(`INSERT INTO sync_deletions (table_name, row_id) VALUES ('company_locations', $1)`, [dropId]);
      await client.query(`DELETE FROM company_locations WHERE id = $1`, [dropId]);
      return { ok: true, company_id: Number(keep.company_id) };
    });
    if (out.error) return res.status(409).json(out);
    invalidateTwins(); invalidate();
    await recomputeBellScoreForCompany(out.company_id).catch(() => {});
    res.json(out);
  } catch (e) { next(e); }
});

router.post('/twin-reject', async (req, res, next) => {
  try {
    const aId = Number(req.body?.a_id), bId = Number(req.body?.b_id);
    if (!aId || !bId) return res.status(400).json({ error: 'ids_required' });
    for (const [id, other] of [[aId, bId], [bId, aId]]) {
      await query(`
        UPDATE company_locations
           SET raw = COALESCE(raw,'{}'::jsonb) || jsonb_build_object('twin_rejected',
                 COALESCE(raw->'twin_rejected','[]'::jsonb) || jsonb_build_object('other_id', $2::bigint, 'at', now()::text)),
               updated_at = now()
         WHERE id = $1`, [id, other]);
    }
    invalidateTwins();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;

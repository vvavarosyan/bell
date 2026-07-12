// Ingest the full Qatar cadastre (~253k land parcels) + land-use (~190k zoning
// areas). Each feature is located inside its district by point-in-polygon (JS,
// no PostGIS) — only the centroid + district id are stored, never the heavy
// polygon. STREAMING + RESUMABLE + memory-safe for the 8 GB Mac: one page in
// flight, progress persisted, so Val can close the window and re-run.

import { query } from '../db.js';
import { pointInPolygon, ringsBbox, polygonCentroid, buildPolygonIndex, locateInIndex } from './spatial.js';

const BASE = 'https://services.gisqatar.org.qa/server/rest/services/Vector';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; BellDataIntelligence/1.0)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (j.error) throw new Error('ArcGIS: ' + (j.error.message || 'error'));
      return j;
    } catch (e) { last = e; await sleep(600 * (i + 1)); }
  }
  throw last;
}

// Friendly grouping of a zoning code (derived, not source-stated — the raw code
// in `zoning` is authoritative). Only confident, standard prefixes are grouped.
export function zoningLabel(code) {
  const z = String(code || '').toUpperCase().trim();
  if (!z) return null;
  if (/^R\d|^RES\b|^RESIDENTIAL/.test(z)) return 'Residential';
  if (/^MU\d|^MIXED/.test(z)) return 'Mixed use';
  if (/IND\b|INDUSTR/.test(z)) return 'Industrial';
  if (/^CF\b|COMMUNITY/.test(z)) return 'Community facility';
  if (/^COMM|^C\d/.test(z)) return 'Commercial';
  return z;   // unknown code → keep verbatim (never guessed)
}

// Load a small polygon layer (districts/zones) from ArcGIS and index it, mapping
// each source OBJECTID to its Bell id so parcels store district_id/zone_id.
async function loadIndex(layer, dbTable) {
  const feats = [];
  let offset = 0;
  for (;;) {
    const p = new URLSearchParams({ where: '1=1', outFields: 'OBJECTID', returnGeometry: 'true',
      outSR: '4326', maxAllowableOffset: '0.0008', f: 'json', resultOffset: String(offset), resultRecordCount: '2000' });
    const r = await fetchJson(`${BASE}/${layer}/query?${p}`);
    const rows = r.features || [];
    for (const f of rows) {
      const rings = f.geometry && f.geometry.rings;
      if (rings && rings.length) feats.push({ oid: f.attributes.OBJECTID, rings, bbox: ringsBbox(rings) });
    }
    if (rows.length < 2000) break;
    offset += rows.length;
    await sleep(120);
  }
  // Map source OBJECTID → Bell id.
  const idMap = new Map((await query(`SELECT id, gf_objectid FROM ${dbTable}`)).rows.map((x) => [x.gf_objectid, Number(x.id)]));
  const indexed = feats.filter((f) => idMap.has(f.oid)).map((f) => ({ id: idMap.get(f.oid), rings: f.rings, bbox: f.bbox }));
  return buildPolygonIndex(indexed, 0.02);
}

async function getProgress(layer) {
  const r = await query(`SELECT next_offset, done FROM gis_scan_progress WHERE layer = $1`, [layer]);
  return r.rows[0] || { next_offset: 0, done: false };
}
async function setProgress(layer, nextOffset, total, done) {
  await query(`INSERT INTO gis_scan_progress (layer, next_offset, total, done, updated_at)
               VALUES ($1,$2,$3,$4, now())
               ON CONFLICT (layer) DO UPDATE SET next_offset = $2, total = $3, done = $4, updated_at = now()`,
    [layer, nextOffset, total, done]);
}

async function layerCount(layer) {
  const r = await fetchJson(`${BASE}/${layer}/query?where=1%3D1&returnCountOnly=true&f=json`);
  return r.count || 0;
}

// Generic streaming ingest of a polygon layer → rows located to a district.
async function ingestLayer({ layer, dbLayer, table, mapFeature, districtIdx, zoneIdx, onProgress, maxBatches = Infinity }) {
  const total = await layerCount(layer);
  let { next_offset: offset, done } = await getProgress(dbLayer);
  if (done && offset >= total) { onProgress(`${dbLayer}: already complete (${total.toLocaleString()})`); return { total, inserted: 0, done: true }; }
  let inserted = 0, batches = 0;
  for (;;) {
    if (batches >= maxBatches) break;
    const p = new URLSearchParams({ where: '1=1', outFields: '*', returnGeometry: 'true', outSR: '4326',
      maxAllowableOffset: '0.0008', f: 'json', resultOffset: String(offset), resultRecordCount: '1000' });
    const r = await fetchJson(`${BASE}/${layer}/query?${p}`);
    const feats = r.features || [];
    if (!feats.length) { await setProgress(dbLayer, offset, total, true); break; }

    const rows = [];
    for (const f of feats) {
      const rings = f.geometry && f.geometry.rings;
      const c = rings ? polygonCentroid(rings) : null;
      const district_id = c ? locateInIndex(districtIdx, c.lng, c.lat) : null;
      const zone_id = (c && zoneIdx) ? locateInIndex(zoneIdx, c.lng, c.lat) : null;
      rows.push(mapFeature(f.attributes, c, district_id, zone_id));
    }
    inserted += await upsertBatch(table, rows);
    offset += feats.length;
    batches++;
    const complete = feats.length < 1000;
    await setProgress(dbLayer, offset, total, complete);
    onProgress(`${dbLayer}: ${Math.min(offset, total).toLocaleString()} / ${total.toLocaleString()}`);
    if (complete) break;
    await sleep(150);
  }
  return { total, inserted, done: offset >= total };
}

async function upsertBatch(table, rows) {
  if (!rows.length) return 0;
  const cols = Object.keys(rows[0]);
  const updatable = cols.filter((c) => c !== 'gf_objectid');
  const setSql = updatable.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  let n = 0;
  const B = 500;
  for (let i = 0; i < rows.length; i += B) {
    const batch = rows.slice(i, i + B);
    const values = [];
    const params = [];
    batch.forEach((row, j) => {
      const o = j * cols.length;
      values.push('(' + cols.map((_, k) => `$${o + k + 1}`).join(',') + ')');
      cols.forEach((c) => params.push(row[c] === undefined ? null : row[c]));
    });
    await query(`INSERT INTO ${table} (${cols.join(',')}) VALUES ${values.join(',')}
                 ON CONFLICT (gf_objectid) DO UPDATE SET ${setSql}, updated_at = now()`, params);
    n += batch.length;
  }
  return n;
}

export async function parcelsTablesReady() {
  try {
    const r = await query(`SELECT to_regclass('public.gis_cadastre_plots') AS a, to_regclass('public.gis_landuse') AS b`);
    return !!(r.rows[0].a && r.rows[0].b);
  } catch { return false; }
}

export async function ingestParcels({ onProgress = () => {}, maxBatches = Infinity } = {}) {
  onProgress('Loading district + zone boundaries…');
  const districtIdx = await loadIndex('Districts/MapServer/0', 'gis_districts');
  const zoneIdx = await loadIndex('Zones/MapServer/0', 'gis_zones');

  onProgress('Cadastre plots…');
  const cad = await ingestLayer({
    layer: 'CadastrePlots/MapServer/0', dbLayer: 'cadastre', table: 'gis_cadastre_plots',
    districtIdx, zoneIdx, onProgress, maxBatches,
    mapFeature: (a, c, district_id, zone_id) => ({
      gf_objectid: a.OBJECTID,
      pin: a.PIN == null ? null : String(a.PIN),
      area_sqm: a['SHAPE.AREA'] != null ? Number(a['SHAPE.AREA']) : (a.PDAREA != null ? Number(a.PDAREA) : null),
      cdst_key: a.CDST_KEY == null ? null : String(a.CDST_KEY),
      centroid_lat: c ? c.lat : null, centroid_lng: c ? c.lng : null,
      district_id, zone_id,
    }),
  });

  onProgress('Land-use areas…');
  const lu = await ingestLayer({
    layer: 'ZoningE/MapServer/0', dbLayer: 'landuse', table: 'gis_landuse',
    districtIdx, zoneIdx: null, onProgress, maxBatches,
    mapFeature: (a, c, district_id) => ({
      gf_objectid: a.OBJECTID,
      zoning: a.ZONING == null ? null : String(a.ZONING),
      zoning_label: zoningLabel(a.ZONING),
      code: a.CODE != null ? Number(a.CODE) : null,
      area_sqm: a['SHAPE.AREA'] != null ? Number(a['SHAPE.AREA']) : null,
      centroid_lat: c ? c.lat : null, centroid_lng: c ? c.lng : null,
      district_id,
    }),
  });

  return { cadastre: cad, landuse: lu };
}

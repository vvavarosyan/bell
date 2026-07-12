// Qatar GIS scraper — pulls the public ArcGIS layers (geography spine + named
// buildings) from services.gisqatar.org.qa. Plain fetch, no browser, paginated
// and politely paced, resumable-by-nature (idempotent upsert on the source
// OBJECTID). Every value is the source's own (Rule 2.1).
//
// Layers (this phase): Municipalities (8), Districts (~846), Zones (~91),
// Landmarks (~7,227). Heavy parcel/land-use polygons (253k/190k) are a later,
// lazily-loaded map layer, not ingested here.

const BASE = 'https://services.gisqatar.org.qa/server/rest/services/Vector';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; BellDataIntelligence/1.0)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (j.error) throw new Error('ArcGIS: ' + (j.error.message || JSON.stringify(j.error)));
      return j;
    } catch (e) { lastErr = e; await sleep(500 * (i + 1)); }
  }
  throw lastErr;
}

// Fetch EVERY feature of a layer, paging by resultOffset/resultRecordCount.
async function arcgisAll(layer, { outFields = '*', geometry = false, pageSize = 1000, onProgress } = {}) {
  const out = [];
  let offset = 0;
  for (;;) {
    const p = new URLSearchParams({
      where: '1=1', outFields, returnGeometry: String(!!geometry), f: 'json',
      resultOffset: String(offset), resultRecordCount: String(pageSize),
    });
    if (geometry) { p.set('outSR', '4326'); p.set('maxAllowableOffset', '0.002'); }
    const r = await fetchJson(`${BASE}/${layer}/query?${p.toString()}`);
    const feats = r.features || [];
    out.push(...feats);
    if (onProgress) onProgress(out.length);
    if (feats.length < pageSize) break;
    offset += feats.length;
    await sleep(150);
  }
  return out;
}

// Centroid of a polygon ring set (average of the exterior ring vertices) — good
// enough to place a map label; we don't need PostGIS-grade centroids.
function ringCentroid(geom) {
  const ring = geom && geom.rings && geom.rings[0];
  if (!ring || !ring.length) return { lat: null, lng: null };
  let sx = 0, sy = 0, n = 0;
  for (const pt of ring) { if (Array.isArray(pt) && pt.length >= 2) { sx += pt[0]; sy += pt[1]; n++; } }
  return n ? { lng: sx / n, lat: sy / n } : { lat: null, lng: null };
}
const numOrNull = (v) => (v == null || v === '' ? null : Number(v));
const strOrNull = (v) => { const s = (v == null ? '' : String(v)).trim(); return s || null; };

export async function scrapeMunicipalities(onProgress) {
  const feats = await arcgisAll('MunicipalityE/MapServer/0', { geometry: true, pageSize: 2000, onProgress });
  return feats.map((f) => {
    const a = f.attributes, c = ringCentroid(f.geometry);
    return { gf_objectid: a.OBJECTID, mncp_no: numOrNull(a.MNCP_NO), code: strOrNull(a.CODE),
      ename: strOrNull(a.ENAME), aname: strOrNull(a.ANAME), area_sqm: numOrNull(a['SHAPE.AREA']),
      centroid_lat: c.lat, centroid_lng: c.lng };
  });
}

export async function scrapeDistricts(onProgress) {
  const feats = await arcgisAll('Districts/MapServer/0', { geometry: true, pageSize: 1000, onProgress });
  return feats.map((f) => {
    const a = f.attributes, c = ringCentroid(f.geometry);
    return { gf_objectid: a.OBJECTID, dist_no: numOrNull(a.DIST_NO), code: strOrNull(a.CODE),
      ename: strOrNull(a.ENAME), aname: strOrNull(a.ANAME), key_no: numOrNull(a.KEY_NO),
      area_sqm: numOrNull(a['SHAPE.AREA']), centroid_lat: c.lat, centroid_lng: c.lng };
  });
}

export async function scrapeZones(onProgress) {
  const feats = await arcgisAll('Zones/MapServer/0', { geometry: true, pageSize: 2000, onProgress });
  return feats.map((f) => {
    const a = f.attributes, c = ringCentroid(f.geometry);
    return { gf_objectid: a.OBJECTID, zone_no: numOrNull(a.ZONE_NO), municipal_code: strOrNull(a.MUNICIPAL_CODE),
      ename: strOrNull(a.ENAME), aname: strOrNull(a.ANAME), key_no: numOrNull(a.KEY_NO),
      area_sqm: numOrNull(a['SHAPE.AREA']), centroid_lat: c.lat, centroid_lng: c.lng };
  });
}

export async function scrapeLandmarks(onProgress) {
  const feats = await arcgisAll('Landmarks/MapServer/0', { geometry: true, pageSize: 5000, onProgress });
  return feats.map((f) => {
    const a = f.attributes, g = f.geometry || {};
    return { gf_objectid: a.OBJECTID, landmark_id: numOrNull(a.LANDMARK_ID),
      category: strOrNull(a.CATEGORY), category_aname: strOrNull(a.CATEGORY_ANAME),
      subcategory_name: strOrNull(a.SUBCATEGORY_ANAME),
      ename: strOrNull(a.ENAME), aname: strOrNull(a.ANAME),
      building_no: numOrNull(a.BUILDING_NO), zone_no: numOrNull(a.ZONE_NO),
      street_no: numOrNull(a.STREET_NO), street_ename: strOrNull(a.STREET_ENAME), street_aname: strOrNull(a.STREET_ANAME),
      district_ename: strOrNull(a.DISTRICT_ENAME), district_aname: strOrNull(a.DISTRICT_ANAME),
      email: strOrNull(a.EMAIL), phone: strOrNull(a.PHONE), pobox_no: numOrNull(a.POBOX_NO),
      photo_url: strOrNull(a.PHOTO_URL),
      latitude: g.y != null ? Number(g.y) : null, longitude: g.x != null ? Number(g.x) : null };
  });
}

export async function scrapeGisAll(onProgress = () => {}) {
  const log = (m) => onProgress(m);
  log('Municipalities…');   const municipalities = await scrapeMunicipalities((n) => log(`  municipalities: ${n}`));
  log('Districts…');        const districts      = await scrapeDistricts((n) => log(`  districts: ${n}`));
  log('Zones…');            const zones          = await scrapeZones((n) => log(`  zones: ${n}`));
  log('Landmarks…');        const landmarks      = await scrapeLandmarks((n) => log(`  landmarks: ${n}`));
  return { municipalities, districts, zones, landmarks };
}

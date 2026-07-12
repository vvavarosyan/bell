// Ingest the scraped GIS layers + promote the Weekly Real Estate Sales Bulletin
// (od_records) into first-class tables. Idempotent: upsert on the source key
// (gf_objectid / od_record_id), so re-running never duplicates. Mirror to prod
// by id via the standard sync push.

import { query } from '../db.js';

export async function gisTablesReady() {
  try {
    const r = await query(`SELECT to_regclass('public.gis_landmarks') AS t, to_regclass('public.real_estate_transactions') AS r`);
    return !!(r.rows[0].t && r.rows[0].r);
  } catch { return false; }
}

// Generic batched upsert keyed on gf_objectid.
async function upsertRows(table, cols, rows, conflictCol = 'gf_objectid') {
  if (!rows.length) return 0;
  const updatable = cols.filter((c) => c !== conflictCol);
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
    await query(
      `INSERT INTO ${table} (${cols.join(',')}) VALUES ${values.join(',')}
       ON CONFLICT (${conflictCol}) DO UPDATE SET ${setSql}, updated_at = now()`,
      params);
    n += batch.length;
  }
  return n;
}

export async function ingestMunicipalities(rows) {
  return upsertRows('gis_municipalities',
    ['gf_objectid', 'mncp_no', 'code', 'ename', 'aname', 'centroid_lat', 'centroid_lng', 'area_sqm'], rows);
}
export async function ingestDistricts(rows) {
  return upsertRows('gis_districts',
    ['gf_objectid', 'dist_no', 'code', 'ename', 'aname', 'key_no', 'centroid_lat', 'centroid_lng', 'area_sqm'], rows);
}
export async function ingestZones(rows) {
  return upsertRows('gis_zones',
    ['gf_objectid', 'zone_no', 'municipal_code', 'ename', 'aname', 'key_no', 'centroid_lat', 'centroid_lng', 'area_sqm'], rows);
}
export async function ingestLandmarks(rows) {
  return upsertRows('gis_landmarks',
    ['gf_objectid', 'landmark_id', 'category', 'category_aname', 'subcategory_name', 'ename', 'aname',
     'building_no', 'zone_no', 'street_no', 'street_ename', 'street_aname', 'district_ename', 'district_aname',
     'email', 'phone', 'pobox_no', 'photo_url', 'latitude', 'longitude'], rows);
}

// Promote the Weekly Real Estate Sales Bulletin rows (od_records) into
// real_estate_transactions. Pure SQL over already-ingested source data — every
// figure is the bulletin's own; parties stay anonymized (never linked).
export async function promoteRealEstate() {
  const r = await query(`
    INSERT INTO real_estate_transactions
      (od_record_id, registration_date, municipality_name, district_name, property_type, usage,
       property_value, area_sqm, price_per_sqm, price_per_sqft, currency)
    SELECT r.id,
           NULLIF(r.data->>'registration_date','')::date,
           NULLIF(r.data->>'municipality_name',''),
           NULLIF(r.data->>'district_name',''),
           NULLIF(r.data->>'property_type',''),
           NULLIF(r.data->>'usage',''),
           CASE WHEN (r.data->>'property_value') ~ '^[0-9.]+$'        THEN (r.data->>'property_value')::numeric END,
           CASE WHEN (r.data->>'area_square_meters') ~ '^[0-9.]+$'    THEN (r.data->>'area_square_meters')::numeric END,
           CASE WHEN (r.data->>'price_per_square_meter') ~ '^[0-9.]+$' THEN (r.data->>'price_per_square_meter')::numeric END,
           CASE WHEN (r.data->>'price_per_square_foot') ~ '^[0-9.]+$'  THEN (r.data->>'price_per_square_foot')::numeric END,
           'QAR'
      FROM od_records r
      JOIN od_datasets d ON d.id = r.dataset_id_fk
     WHERE d.title = 'Weekly Real Estates Sales Bulletin'
       AND (r.data->>'registration_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
    ON CONFLICT (od_record_id) DO UPDATE SET
       registration_date = EXCLUDED.registration_date,
       municipality_name = EXCLUDED.municipality_name,
       district_name     = EXCLUDED.district_name,
       property_type     = EXCLUDED.property_type,
       usage             = EXCLUDED.usage,
       property_value    = EXCLUDED.property_value,
       area_sqm          = EXCLUDED.area_sqm,
       price_per_sqm     = EXCLUDED.price_per_sqm,
       price_per_sqft    = EXCLUDED.price_per_sqft,
       updated_at        = now()`);
  return r.rowCount || 0;
}

export async function pushGisToProd() {
  try {
    const { runPush } = await import('../sync/push.js');
    return await runPush({});
  } catch (e) {
    return { skipped: e.message };
  }
}

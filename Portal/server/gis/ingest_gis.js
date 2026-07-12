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

// Link a building (landmark) to a company ONLY when its email resolves to
// EXACTLY ONE company and is a real, non-generic address (Rule 2.1: a shared/
// generic email that maps to several companies is NEVER guessed to one). Matches
// against both companies.email and company_contacts. Idempotent: clears the
// email-set links then re-asserts, so a company rename/delete self-heals.
const LINK_CTE = `
  WITH company_emails AS (
    SELECT lower(btrim(email)) AS email, id AS company_id
      FROM companies WHERE email IS NOT NULL AND btrim(email) <> ''
    UNION
    SELECT lower(btrim(value)) AS email, company_id
      FROM company_contacts WHERE type = 'email' AND value IS NOT NULL AND btrim(value) <> ''
  ),
  unique_emails AS (
    SELECT email, min(company_id) AS company_id
      FROM company_emails
     GROUP BY email HAVING count(DISTINCT company_id) = 1
  )`;
// A landmark email only qualifies if it is well-formed and not a generic mailbox.
const LINK_WHERE = `
      l.email ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'
  AND split_part(lower(l.email), '@', 1) NOT IN
    ('info','admin','contact','sales','enquiries','enquiry','mail','office','support',
     'hello','general','reception','marketing','hr','careers','jobs','noreply','no-reply','webmaster')`;

// Generic name words that must NOT be the sole basis of a match — two different
// firms often share only an industry word ("pharmacy", "trading"). A link needs
// a DISTINCTIVE shared token (or high overall similarity) to be asserted.
const NAME_STOP = new Set([
  'company','trading','contracting','general','services','service','group','holding','holdings',
  'international','establishment','centre','center','qatar','doha','pharmacy','school','travel',
  'tours','tour','agency','agencies','business','store','stores','trade','industries','industrial',
  'national','restaurant','cafe','hotel','resort','exchange','bookstore','press','printing','the',
  'and','for','est','bin','ben','abu','umm','wll','llc','qpsc','company','terminal',
]);
function sigTokens(name) {
  return new Set(String(name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((t) => t.length >= 4 && !NAME_STOP.has(t)));
}
function sharesDistinctiveToken(a, b) {
  const A = sigTokens(a);
  for (const t of sigTokens(b)) if (A.has(t)) return true;
  return false;
}
// Emails a 3-judge adversarial audit (2026-07-12) found link to a DIFFERENT or
// merely-uncertain company than the building (e.g. "Ambassador Travels" vs "The
// Ambassador"; a gmail address that doesn't corroborate the name). Excluded so
// only genuinely-same-entity links are ever asserted (Val: never unreliable data).
const LINK_EMAIL_DENY = new Set([
  'ambassador@qatar.net.qa', 'gatholdings@qatar.net.qa', 'alhassanint@qatar.net.qa', 'pcpcqatar@gmail.com',
]);
// A candidate email-unique link is CONFIRMED only if the names corroborate it:
// a distinctive shared token, or trigram similarity ≥ 0.30 — and it is not on the
// audit denylist. Otherwise it's an email coincidence and stays UNLINKED (2.1).
function confirmLink(m) {
  if (LINK_EMAIL_DENY.has(String(m.email || '').toLowerCase().trim())) return false;
  return Number(m.sim) >= 0.30 || sharesDistinctiveToken(m.ename, m.company_name);
}

export async function linkLandmarkCompanies({ apply = false } = {}) {
  const candidates = (await query(`
    ${LINK_CTE}
    SELECT l.id AS landmark_id, l.ename, l.email, l.category, l.district_ename,
           ue.company_id, c.name AS company_name,
           similarity(lower(regexp_replace(l.ename, '[^a-zA-Z0-9 ]', '', 'g')),
                      lower(regexp_replace(c.name,  '[^a-zA-Z0-9 ]', '', 'g'))) AS sim
      FROM gis_landmarks l
      JOIN unique_emails ue ON lower(btrim(l.email)) = ue.email
      JOIN companies c ON c.id = ue.company_id
     WHERE ${LINK_WHERE}
     ORDER BY l.ename`)).rows;
  const confirmed = candidates.filter(confirmLink);
  const rejected = candidates.filter((m) => !confirmLink(m));

  if (!apply) {
    return { candidates: candidates.length, confirmed: confirmed.length,
      samples: confirmed.slice(0, 25), rejected: rejected.slice(0, 25), applied: false };
  }

  await query(`UPDATE gis_landmarks SET company_id = NULL, updated_at = now() WHERE company_id IS NOT NULL`);
  let linked = 0;
  const B = 500;
  for (let i = 0; i < confirmed.length; i += B) {
    const batch = confirmed.slice(i, i + B);
    const vals = batch.map((_, j) => `($${j * 2 + 1}::bigint,$${j * 2 + 2}::bigint)`).join(',');
    const params = batch.flatMap((m) => [m.landmark_id, m.company_id]);
    await query(`UPDATE gis_landmarks l SET company_id = v.cid, updated_at = now()
                   FROM (VALUES ${vals}) AS v(lid, cid) WHERE l.id = v.lid`, params);
    linked += batch.length;
  }
  return { candidates: candidates.length, confirmed: confirmed.length, linked,
    samples: confirmed.slice(0, 25), applied: true };
}

export async function pushGisToProd() {
  try {
    const { runPush } = await import('../sync/push.js');
    return await runPush({});
  } catch (e) {
    return { skipped: e.message };
  }
}

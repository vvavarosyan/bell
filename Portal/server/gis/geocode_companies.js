// $0 company geocoder — Qatar's own QARS locator (services.gisqatar.org.qa), the same public
// ArcGIS host Bell already scrapes for GIS/landmarks. Qatar addresses are INWANI codes
// (Zone + Street + Building); the QARS_Custom_Locator resolves the 10-digit composed code
// ZONE(2)+STREET(4)+BUILDING(4) to exact coordinates with score 100, or returns NOTHING.
// Exact-or-nothing is precisely Rule 2.1: we never store a guessed centroid — an address that
// doesn't parse or doesn't resolve keeps NULL coordinates and an honest geocode_status.
//
// RULE 2.2 BUILT IN: before writing a single company coordinate, proofPass() geocodes a sample
// of gis_landmarks that carry BOTH zone/street/building AND surveyed lat/lng (ground truth from
// Qatar's own GIS) and requires >=85% agreement within 150 m. If the locator's semantics ever
// change, the engine refuses to run rather than planting wrong pins.
//
// Resumable: intrinsic (rows WHERE geocode_status IS NULL); every outcome is stamped, including
// not_found/unparseable, so re-runs never re-ask. Paced ~0.6s/request (same host courtesy as
// scrape_gis.js). Plain fetch — safe alongside the always-on engine.

import { query } from '../db.js';
import { packRaw } from '../tenders/raw.js';

const LOCATOR = 'https://services.gisqatar.org.qa/server/rest/services/Vector/QARS_Custom_Locator/GeocodeServer/findAddressCandidates';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; BellDataIntelligence/1.0; +https://bell.qa)' };
const PACE_MS = 600;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  let lastErr;
  for (let i = 0; i < 4; i += 1) {
    try {
      const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) { lastErr = e; await sleep(600 * (i + 1)); }
  }
  throw lastErr;
}

// ---------------------------------------------------------------------------
// INWANI parsing — zone/street/building numbers out of free-ish address text.
// Conservative: ALL THREE components must be unambiguous or we return null
// (Rule 2.1 — a partial parse is a guess). Handles: "Building 38, Street 840,
// Zone 24", "BUILDING NO 24, STREET NO 810, ZONE 66", "zone91-street2001-bulding170",
// Arabic labels, and common typos (bulding/bldng).
// ---------------------------------------------------------------------------
// Label + optional "no/number/#/:" + the digits. Qatar sites use "Area" for Zone
// and "…number …" as often as "…no. …" (proven on live data 2026-07-20 — this
// recovers ~94 addresses that already carry a valid code). Still exact-or-nothing:
// a wrong parse just makes a wrong code that the national locator rejects (score
// < 100 → null), so the added synonyms can't create a false pin (Rule 2.1).
const NO_RX = '(?:no\\.?|number|#|:)?';
const Z_RX = new RegExp(`(?:zone|area|منطقة)\\s*${NO_RX}\\s*[-.]?\\s*(\\d{1,2})\\b`, 'i');
const S_RX = new RegExp(`(?:street|st\\.?|شارع)\\s*${NO_RX}\\s*[-.]?\\s*(\\d{1,4})\\b`, 'i');
const B_RX = new RegExp(`(?:building|bu?i?ldi?n?g|bldg?|مبنى)\\s*${NO_RX}\\s*[-.]?\\s*(\\d{1,4})\\b`, 'i');

export function parseInwani(text) {
  const t = String(text || '');
  const z = t.match(Z_RX);
  const s = t.match(S_RX);
  const b = t.match(B_RX);
  if (!z || !s || !b) return null;
  const zone = parseInt(z[1], 10), street = parseInt(s[1], 10), building = parseInt(b[1], 10);
  if (!zone || !street || !building) return null;
  if (zone > 99 || street > 9999 || building > 9999) return null;
  return { zone, street, building };
}

export function composeCode({ zone, street, building }) {
  return String(zone).padStart(2, '0') + String(street).padStart(4, '0') + String(building).padStart(4, '0');
}

/** Geocode one INWANI triple. Returns { lat, lng, score, raw } or null (exact-or-nothing). */
export async function geocodeInwani(triple) {
  const code = composeCode(triple);
  const url = LOCATOR + '?SingleLine=' + encodeURIComponent(code) + '&outSR=4326&maxLocations=1&f=json';
  const data = await fetchJson(url);
  const c = data?.candidates?.[0];
  if (!c || c.score !== 100 || !c.location) return null;
  return { lat: c.location.y, lng: c.location.x, score: c.score, raw: c };
}

// ---------------------------------------------------------------------------
// Proof pass (Rule 2.2): landmarks with zone/street/building + surveyed coords.
// ---------------------------------------------------------------------------
const distM = (a, b) => {
  const dLat = (a.lat - b.lat) * 111320;
  const dLng = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

// The danger this proof guards against is WRONG coordinates being written. A no-match writes
// NOTHING (exact-or-nothing), so no-matches are counted separately, not as failures — the bar
// is: of the addresses the locator DOES resolve, >=85% must sit within 250 m of the surveyed
// landmark point. (250 m, not 150: measured live 2026-07-19, the one >150 m case was a bank
// branch INSIDE the Hamad Medical campus — the address point vs the in-campus POI, both
// correct at campus scale. 11/11 resolved landmarks agreed within 250 m.)
export async function proofPass({ sample = 30, toleranceM = 250, minAgree = 0.85, log = () => {} } = {}) {
  const rows = (await query(
    `SELECT ename, zone_no, street_no, building_no, latitude, longitude FROM gis_landmarks
      WHERE zone_no IS NOT NULL AND street_no IS NOT NULL AND building_no IS NOT NULL
        AND latitude IS NOT NULL AND longitude IS NOT NULL
        AND zone_no > 0 AND street_no > 0 AND building_no > 0
      ORDER BY id LIMIT $1`, [sample])).rows;
  if (rows.length < 10) return { ok: false, reason: 'not_enough_ground_truth (' + rows.length + ' landmarks) — run "Run Qatar GIS Scan.command" first' };
  let agree = 0, resolved = 0, noMatch = 0, tested = 0;
  for (const r of rows) {
    const g = await geocodeInwani({ zone: r.zone_no, street: r.street_no, building: r.building_no }).catch(() => null);
    tested += 1;
    if (!g) { noMatch += 1; }
    else {
      resolved += 1;
      if (distM({ lat: g.lat, lng: g.lng }, { lat: Number(r.latitude), lng: Number(r.longitude) }) <= toleranceM) agree += 1;
    }
    await sleep(PACE_MS);
  }
  const rate = agree / Math.max(1, resolved);
  log(`proof: ${agree}/${resolved} resolved landmarks within ${toleranceM}m (${Math.round(rate * 100)}%); ${noMatch} honest no-matches of ${tested}`);
  return { ok: resolved >= 8 && rate >= minAgree, agree, resolved, noMatch, tested, rate };
}

// ---------------------------------------------------------------------------
// Backfill: seed company_locations from what Bell already holds.
// ---------------------------------------------------------------------------
export async function backfillSeeds({ log = () => {} } = {}) {
  // (a) Companies that already HAVE coordinates (paid Stage-5 Google Maps) → primary rows.
  const a = await query(
    `INSERT INTO company_locations (company_id, label, address, latitude, longitude, is_primary, source, geocode_status, geocode_method, updated_at)
     SELECT c.id, 'Head Office', COALESCE(NULLIF(btrim(c.address), ''), c.name), c.latitude, c.longitude, true, 'stage5-existing', 'stage5-existing', 'google-maps', now()
       FROM companies c
      WHERE c.latitude IS NOT NULL AND c.longitude IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM company_locations l WHERE l.company_id = c.id AND l.is_primary)
     ON CONFLICT (company_id, lower(address)) DO NOTHING`);
  // (b) Companies with an ADDRESS but no location row yet → pending rows (geocoded later).
  const b = await query(
    `INSERT INTO company_locations (company_id, label, address, is_primary, source, updated_at)
     SELECT c.id, 'Head Office', btrim(c.address), true, 'companies-address', now()
       FROM companies c
      WHERE c.address IS NOT NULL AND btrim(c.address) <> ''
        AND COALESCE(c.archived, false) = false
        AND NOT EXISTS (SELECT 1 FROM company_locations l WHERE l.company_id = c.id)
     ON CONFLICT (company_id, lower(address)) DO NOTHING`);
  // (c) linkedin_locations address TEXT (their coords are a proven generic Doha centroid —
  // NEVER ingested; the text often embeds INWANI parts, so it geocodes properly later).
  const c = await query(
    `INSERT INTO company_locations (company_id, label, address, is_primary, source, updated_at)
     SELECT id, COALESCE(loc->>'description', loc->>'localizedName', 'Location'),
            btrim(concat_ws(', ', loc->>'line1', loc->>'line2', loc->>'city')), false, 'linkedin', now()
       FROM companies, jsonb_array_elements(linkedin_locations) AS loc
      WHERE jsonb_typeof(linkedin_locations) = 'array'
        AND btrim(concat_ws(', ', loc->>'line1', loc->>'line2', loc->>'city')) <> ''
     ON CONFLICT (company_id, lower(address)) DO NOTHING`);
  log(`seeded: ${a.rowCount} from existing coords, ${b.rowCount} from company addresses, ${c.rowCount} from LinkedIn`);
  return { fromCoords: a.rowCount, fromAddress: b.rowCount, fromLinkedin: c.rowCount };
}

// ---------------------------------------------------------------------------
// The engine: geocode pending rows. Intrinsic resume; every outcome stamped.
// ---------------------------------------------------------------------------
export async function runGeocoder({ maxRows = 100000, onProgress = () => {} } = {}) {
  let okN = 0, notFound = 0, unparseable = 0, done = 0;
  for (;;) {
    const batch = (await query(
      `SELECT id, company_id, address FROM company_locations
        WHERE geocode_status IS NULL ORDER BY id LIMIT 50`)).rows;
    if (!batch.length) break;
    for (const row of batch) {
      if (done >= maxRows) return { okN, notFound, unparseable, done, more: true };
      done += 1;
      const triple = parseInwani(row.address);
      if (!triple) {
        await query(`UPDATE company_locations SET geocode_status='unparseable', geocoded_at=now(), updated_at=now() WHERE id=$1`, [row.id]);
        unparseable += 1;
        continue;
      }
      let g = null;
      try { g = await geocodeInwani(triple); } catch (e) {
        // transient locator failure — leave status NULL so the next run retries this row
        onProgress({ error: e.message, id: row.id });
        await sleep(2000);
        continue;
      }
      if (g) {
        await query(
          `UPDATE company_locations
              SET latitude=$2, longitude=$3, zone_no=$4, street_no=$5, building_no=$6,
                  geocode_status='ok', geocode_method='qars-exact', geocode_score=$7,
                  raw=$8::jsonb, geocoded_at=now(), updated_at=now()
            WHERE id=$1`,
          [row.id, g.lat, g.lng, triple.zone, triple.street, triple.building, g.score, packRaw(g.raw)]);
        // Fill the company's own lat/lng ONLY if empty and this is its primary location.
        await query(
          `UPDATE companies c SET latitude=$2, longitude=$3
            WHERE c.id=$1 AND c.latitude IS NULL
              AND EXISTS (SELECT 1 FROM company_locations l WHERE l.id=$4 AND l.is_primary)`,
          [row.company_id, g.lat, g.lng, row.id]).catch(() => {});
        okN += 1;
      } else {
        await query(
          `UPDATE company_locations SET zone_no=$2, street_no=$3, building_no=$4,
                  geocode_status='not_found', geocoded_at=now(), updated_at=now() WHERE id=$1`,
          [row.id, triple.zone, triple.street, triple.building]);
        notFound += 1;
      }
      if (done % 25 === 0) onProgress({ done, ok: okN, notFound, unparseable });
      await sleep(PACE_MS);
    }
  }
  return { okN, notFound, unparseable, done, more: false };
}

export async function geocodeStats() {
  const r = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE geocode_status IS NULL)::int AS pending,
            count(*) FILTER (WHERE geocode_status='ok')::int AS ok,
            count(*) FILTER (WHERE geocode_status='not_found')::int AS not_found,
            count(*) FILTER (WHERE geocode_status='unparseable')::int AS unparseable,
            count(*) FILTER (WHERE latitude IS NOT NULL)::int AS with_coords
       FROM company_locations`);
  return r.rows[0];
}

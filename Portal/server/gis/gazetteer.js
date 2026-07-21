// Gazetteer resolver — turn a HUMAN-written Qatari address into an exact INWANI
// triple using Qatar's own surveyed landmark register (gis_landmarks, 7,227 rows),
// which Bell already holds and the geocoder never consulted.
//
// Most Qatari sites write "Marina 50, Lusail" or "27 Al Kinana Street, Al Sadd" —
// a building NAME or a street NAME — while parseInwani only understands the
// numeric dialect ("Zone 69, Street 315, Building 5"). That single gap is why
// 4,285 addresses sit unplaced.
//
// EXACT-OR-NOTHING (Rule 2.1). A resolution is returned ONLY when:
//   • the name matches EXACTLY ONE place in the register (never a guess between
//     candidates), and
//   • every INWANI number the address ITSELF states agrees with the register.
// The caller still ends at the national locator, which writes nothing below
// score 100 — so a bad resolve produces no pin, never a wrong one.
//
// Proven live on DOC Medical Center: "No. 315 Zone 69, 1st Floor Marina 50,
// Lusail" → the register's sole "Marina 50" (zone 69, street 315, building 5);
// the address's own "Zone 69" and "No. 315" both agree → locator score 100.
// And "27 Al Kinana Street, Al Sadd District" resolved to within 6.5 m of DOC's
// independent Google-Maps pin — a cross-source proof that the join is sound.

import { query } from '../db.js';

// Numbers the address states itself — used only to CORROBORATE, never to fill in.
const Z_RX = /(?:zone|area|منطقة)\s*(?:no\.?|number|#|:)?\s*[-.]?\s*(\d{1,2})\b/i;
const S_RX = /(?:street|st\.?|str\.?|شارع)\s*(?:no\.?|number|#|:)?\s*[-.]?\s*(\d{1,4})\b/i;
const B_RX = /(?:building|bu?i?ldi?n?g|bldg?|مبنى)\s*(?:no\.?|number|#|:)?\s*[-.]?\s*(\d{1,4})\b/i;
export function statedNumbers(text) {
  const t = String(text || '');
  const z = t.match(Z_RX), s = t.match(S_RX), b = t.match(B_RX);
  return {
    zone: z ? parseInt(z[1], 10) : null,
    street: s ? parseInt(s[1], 10) : null,
    building: b ? parseInt(b[1], 10) : null,
  };
}

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

let CACHE = null;
/** Load the register once (7k rows) and index it for in-memory matching. */
export async function loadGazetteer() {
  if (CACHE) return CACHE;
  const rows = (await query(`
    SELECT ename, street_ename, district_ename, zone_no, street_no, building_no, latitude, longitude
      FROM gis_landmarks
     WHERE zone_no IS NOT NULL AND street_no IS NOT NULL`)).rows;

  // Building index: a name is usable only if it maps to ONE place.
  const byName = new Map();
  for (const r of rows) {
    const n = norm(r.ename);
    if (n.length < 6) continue;                 // too short/generic to match on
    if (!byName.has(n)) byName.set(n, []);
    byName.get(n).push(r);
  }
  // Longest names first so "marina 50 tower" wins over "marina 50".
  const names = [...byName.keys()].sort((a, b) => b.length - a.length);

  // Street index: street name -> the distinct (zone,street) pairs it appears on.
  const byStreet = new Map();
  for (const r of rows) {
    const n = norm(r.street_ename);
    if (n.length < 4) continue;
    if (!byStreet.has(n)) byStreet.set(n, new Map());
    byStreet.get(n).set(`${r.zone_no}|${r.street_no}`, r);
  }
  CACHE = { rows, byName, names, byStreet };
  return CACHE;
}

/** FIX A — the address names a building the register knows, uniquely. */
export async function resolveByBuilding(address) {
  const g = await loadGazetteer();
  const addr = norm(address);
  if (!addr) return null;
  for (const name of g.names) {
    if (!addr.includes(name)) continue;
    const hits = g.byName.get(name);
    // Unique PLACE (same zone/street/building) — several register rows may
    // describe one building; differing triples mean the name is ambiguous.
    const triples = new Set(hits.map((h) => `${h.zone_no}|${h.street_no}|${h.building_no}`));
    if (triples.size !== 1) return null;        // ambiguous name → refuse
    const h = hits[0];
    if (h.building_no == null) return null;
    const said = statedNumbers(address);
    // Every number the address states must AGREE with the register.
    if (said.zone != null && said.zone !== h.zone_no) return null;
    if (said.street != null && said.street !== h.street_no) return null;
    if (said.building != null && said.building !== h.building_no) return null;
    const corroborated = (said.zone != null) || (said.street != null) || (said.building != null);
    return {
      zone: h.zone_no, street: h.street_no, building: h.building_no,
      via: 'gazetteer-building', matchedName: name, corroborated,
      surveyed: h.latitude != null ? { lat: Number(h.latitude), lng: Number(h.longitude) } : null,
    };
  }
  return null;
}

/** FIX B — "<building no> <NAME> Street" where the name maps to one (zone,street). */
const NAMED_STREET_RX = /(\d{1,4})[,\s]+([A-Za-z؀-ۿ][A-Za-z؀-ۿ' -]{2,40}?)\s+(?:street|st\.?|road|rd\.?)\b/i;
export async function resolveByStreet(address) {
  const g = await loadGazetteer();
  const m = String(address || '').match(NAMED_STREET_RX);
  if (!m) return null;
  const building = parseInt(m[1], 10);
  if (!building || building > 9999) return null;
  const name = norm(m[2]);
  if (name.length < 4) return null;

  // Accept an exact street name, or a unique prefix match.
  let pairs = g.byStreet.get(name);
  if (!pairs) {
    const cands = [...g.byStreet.keys()].filter((k) => k.startsWith(name) || name.startsWith(k));
    if (cands.length !== 1) return null;
    pairs = g.byStreet.get(cands[0]);
  }
  if (!pairs || pairs.size !== 1) return null;   // name spans several streets → refuse
  const h = [...pairs.values()][0];

  const said = statedNumbers(address);
  if (said.zone != null && said.zone !== h.zone_no) return null;
  if (said.street != null && said.street !== h.street_no) return null;

  // If the address names a district, it must match the register's.
  const addrN = norm(address), dist = norm(h.district_ename).replace(/\s*\d+$/, '');
  if (dist.length >= 4 && !addrN.includes(dist)) return null;

  return {
    zone: h.zone_no, street: h.street_no, building,
    via: 'gazetteer-street', matchedName: name, corroborated: true,
    surveyed: h.latitude != null ? { lat: Number(h.latitude), lng: Number(h.longitude) } : null,
  };
}

/** Building name first (more specific), then named street. */
export async function resolveAddress(address) {
  return (await resolveByBuilding(address)) || (await resolveByStreet(address));
}

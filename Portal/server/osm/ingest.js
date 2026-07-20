// Ingest OpenStreetMap Qatar into osm_places + osm_streets. Resumable and
// idempotent (upsert on the OSM id / the street name). Best-effort links each
// place to a Bell company when phone or website match — never creates a company.

import { query } from '../db.js';
import { overpass, elementCoord, QATAR_AREA } from './overpass.js';

// The tag keys we treat as "a place". category_key = the key; category = its value.
const PLACE_KEYS = ['amenity', 'shop', 'office', 'tourism', 'leisure', 'healthcare'];

// Friendly grouping so the UI/Bella can say "restaurants", "clinics", "hotels".
const FOOD = new Set(['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'food_court', 'ice_cream', 'biergarten']);
const MONEY = new Set(['bank', 'atm', 'bureau_de_change', 'money_transfer']);
const MED = new Set(['pharmacy', 'hospital', 'clinic', 'doctors', 'dentist', 'veterinary']);
const AUTO = new Set(['fuel', 'car_rental', 'car_wash', 'car_repair', 'charging_station', 'parking']);
const EDU = new Set(['school', 'university', 'college', 'kindergarten', 'language_school', 'driving_school']);
const PUBLIC = new Set(['place_of_worship', 'police', 'fire_station', 'townhall', 'courthouse', 'embassy', 'post_office', 'library', 'community_centre']);

function groupFor(key, value) {
  if (key === 'shop') return 'Shopping';
  if (key === 'office') return 'Offices & Business';
  if (key === 'tourism') return 'Tourism & Hotels';
  if (key === 'leisure') return 'Leisure & Sport';
  if (key === 'healthcare') return 'Health';
  // amenity — split by value
  if (FOOD.has(value)) return 'Food & Drink';
  if (MED.has(value)) return 'Health';
  if (MONEY.has(value)) return 'Finance';
  if (AUTO.has(value)) return 'Automotive';
  if (EDU.has(value)) return 'Education';
  if (PUBLIC.has(value)) return 'Public & Community';
  return 'Amenities';
}

function composeAddress(t) {
  const parts = [];
  if (t['addr:housename']) parts.push(t['addr:housename']);
  if (t['addr:housenumber'] || t['addr:street']) parts.push([t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' '));
  if (t['addr:city']) parts.push(t['addr:city']);
  const s = parts.filter(Boolean).join(', ').trim();
  return s || null;
}

function mapPlace(el, key) {
  const t = el.tags || {};
  const name = t.name || t['name:en'] || t['name:ar'];
  if (!name) return null;                          // a directory needs a name
  const coord = elementCoord(el);
  if (!coord) return null;
  const value = t[key] || null;
  return {
    osm_type: el.type, osm_id: el.id,
    name, name_en: t['name:en'] || null, name_ar: t['name:ar'] || null,
    category: value, category_key: key, category_group: groupFor(key, value),
    lng: coord[0], lat: coord[1],
    phone: t.phone || t['contact:phone'] || null,
    website: t.website || t['contact:website'] || null,
    opening_hours: t.opening_hours || null,
    address: composeAddress(t),
    cuisine: t.cuisine || null,
    tags: t,
  };
}

async function upsertPlace(p) {
  await query(`
    INSERT INTO osm_places
      (osm_type, osm_id, name, name_en, name_ar, category, category_key, category_group,
       latitude, longitude, phone, website, opening_hours, address, cuisine, tags, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb, now())
    ON CONFLICT (osm_type, osm_id) DO UPDATE SET
      name=EXCLUDED.name, name_en=EXCLUDED.name_en, name_ar=EXCLUDED.name_ar,
      category=EXCLUDED.category, category_key=EXCLUDED.category_key, category_group=EXCLUDED.category_group,
      latitude=EXCLUDED.latitude, longitude=EXCLUDED.longitude, phone=EXCLUDED.phone, website=EXCLUDED.website,
      opening_hours=EXCLUDED.opening_hours, address=EXCLUDED.address, cuisine=EXCLUDED.cuisine,
      tags=EXCLUDED.tags, updated_at=now()`,
    [p.osm_type, p.osm_id, p.name, p.name_en, p.name_ar, p.category, p.category_key, p.category_group,
     p.lat, p.lng, p.phone, p.website, p.opening_hours, p.address, p.cuisine, JSON.stringify(p.tags)]);
}

/** Fetch + store all named POIs, one category at a time (resumable/idempotent). */
export async function ingestPlaces({ onProgress = () => {}, only = null } = {}) {
  const keys = only ? [only] : PLACE_KEYS;
  let total = 0;
  for (const key of keys) {
    onProgress(`▸ Fetching ${key}…`);
    const ql = `[out:json][timeout:180];${QATAR_AREA}(node["${key}"](area.qa);way["${key}"](area.qa););out center tags;`;
    const els = await overpass(ql, { onProgress });
    let kept = 0;
    for (const el of els) {
      const p = mapPlace(el, key);
      if (!p) continue;
      await upsertPlace(p);
      kept += 1;
    }
    total += kept;
    onProgress(`  ${key}: ${els.length} elements → ${kept} named places stored`);
  }
  return total;
}

// Named highways, split by class so no single Overpass response is huge. Only
// through-roads (named) — service/track/footway are mostly unnamed and noise.
const STREET_CLASSES = [
  'motorway|trunk|primary|secondary|tertiary',
  'residential|unclassified|living_street|road',
];

/** Fetch named streets (area-filtered), store ONE row per distinct name. */
export async function ingestStreets({ onProgress = () => {} } = {}) {
  let names = 0;
  for (let i = 0; i < STREET_CLASSES.length; i += 1) {
    const cls = STREET_CLASSES[i];
    onProgress(`▸ Streets group ${i + 1}/${STREET_CLASSES.length} (${cls.split('|')[0]}…)…`);
    const ql = `[out:json][timeout:180];${QATAR_AREA}way["highway"~"^(${cls})$"]["name"](area.qa);out center tags;`;
    const els = await overpass(ql, { onProgress });
    const byName = new Map();
    for (const el of els) {
      const t = el.tags || {};
      const name = t.name || t['name:en'] || t['name:ar'];
      const coord = elementCoord(el);
      if (!name || !coord) continue;
      const k = name.trim().toLowerCase();
      if (!byName.has(k)) byName.set(k, { name: name.trim(), name_ar: t['name:ar'] || null, highway: t.highway || null, coord, count: 0 });
      byName.get(k).count += 1;
    }
    for (const st of byName.values()) {
      await query(`
        INSERT INTO osm_streets (name, name_ar, highway, latitude, longitude, segment_count, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6, now())
        ON CONFLICT (lower(name)) DO UPDATE SET
          segment_count = osm_streets.segment_count + EXCLUDED.segment_count,
          name_ar = COALESCE(osm_streets.name_ar, EXCLUDED.name_ar),
          highway = COALESCE(osm_streets.highway, EXCLUDED.highway),
          updated_at = now()`,
        [st.name, st.name_ar, st.highway, st.coord[1], st.coord[0], st.count]);
      names += 1;
    }
    onProgress(`  group ${i + 1}: ${els.length} segments → ${byName.size} distinct names`);
  }
  return names;
}

/**
 * Best-effort: link an OSM place to a Bell company when a hard identifier matches
 * — exact website domain, then normalized phone. Set-based, fast, re-runnable.
 * Never creates a company; unmatched places just stay as reference POIs.
 */
export async function linkToCompanies({ onProgress = () => {} } = {}) {
  // (a) website domain (strip scheme/www/path on both sides).
  const dom = (col) => `lower(regexp_replace(regexp_replace(${col}, '^https?://', ''), '^www\\.', '')) `;
  const byWeb = await query(`
    UPDATE osm_places p SET matched_company_id = c.id, updated_at = now()
      FROM companies c
     WHERE p.matched_company_id IS NULL
       AND p.website IS NOT NULL AND btrim(p.website) <> ''
       AND c.website IS NOT NULL AND COALESCE(c.archived,false)=false
       AND split_part(${dom('p.website')}, '/', 1) = split_part(${dom('c.website::text')}, '/', 1)`);
  onProgress(`  linked by website: ${byWeb.rowCount}`);

  // (b) normalized phone (digits only, last 8 — Qatar national number).
  const last8 = (col) => `right(regexp_replace(${col}, '[^0-9]', '', 'g'), 8)`;
  const byPhone = await query(`
    UPDATE osm_places p SET matched_company_id = c.id, updated_at = now()
      FROM companies c
     WHERE p.matched_company_id IS NULL
       AND p.phone IS NOT NULL AND length(regexp_replace(p.phone,'[^0-9]','','g')) >= 8
       AND COALESCE(c.archived,false)=false
       AND c.phone IS NOT NULL
       AND ${last8('p.phone')} = ${last8('c.phone')}`);
  onProgress(`  linked by phone: ${byPhone.rowCount}`);
  return byWeb.rowCount + byPhone.rowCount;
}

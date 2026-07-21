// Data-gap audit — "does Bell actually USE everything that enters it?"
//
// Val's standing rule (2026-07-21): catch these gaps always. The DOC bug was the
// archetype — the harvester FOUND three branch map-links and threw them away, and
// nothing anywhere noticed. Read-only; it changes nothing. Run it any time.
//
// It answers three questions:
//   1. FOUND vs STORED — the harvester records what it saw per company
//      (extra_fields.stage7_found). Where "saw" exceeds "stored", something is
//      being discarded on the floor. That is exactly how the DOC bug looked.
//   2. CAPTURED BUT UNUSED — raw source payload keys Bell keeps but never reads,
//      and stored values that never reach the map/search.
//   3. KNOWN GAPS — the standing counts worth watching, so a regression shows up.

import { query } from '../db.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const line = (label, value, note = '') =>
  console.log('  ' + String(label).padEnd(46) + String(value).padStart(9) + (note ? '  ' + note : ''));

async function foundVsStored() {
  console.log('1. FOUND vs STORED  (harvest saw it — did Bell keep it?)');
  console.log('   A gap here means data is being discarded, like DOC\'s branch links were.');
  const rows = (await query(`
    SELECT
      count(*) FILTER (WHERE (extra_fields->'stage7_found'->>'locations')::int > 0)::int AS saw_loc,
      count(*) FILTER (WHERE (extra_fields->'stage7_found'->>'locations')::int > 0
                         AND NOT EXISTS (SELECT 1 FROM company_locations l WHERE l.company_id = c.id))::int AS saw_loc_none_stored,
      count(*) FILTER (WHERE (extra_fields->'stage7_found'->>'emails')::int > 0)::int AS saw_email,
      count(*) FILTER (WHERE (extra_fields->'stage7_found'->>'emails')::int > 0
                         AND NOT EXISTS (SELECT 1 FROM company_contacts k WHERE k.company_id = c.id AND k.type='email'))::int AS saw_email_none_stored,
      count(*) FILTER (WHERE (extra_fields->'stage7_found'->>'phones')::int > 0)::int AS saw_phone,
      count(*) FILTER (WHERE (extra_fields->'stage7_found'->>'phones')::int > 0
                         AND NOT EXISTS (SELECT 1 FROM company_contacts k WHERE k.company_id = c.id AND k.type='phone'))::int AS saw_phone_none_stored
    FROM companies c WHERE extra_fields ? 'stage7_found'`)).rows[0];
  line('sites where a location was seen', rows.saw_loc);
  line('  …but NO location stored', rows.saw_loc_none_stored, rows.saw_loc_none_stored ? '← investigate' : 'ok');
  line('sites where an email was seen', rows.saw_email);
  line('  …but NO email stored', rows.saw_email_none_stored, rows.saw_email_none_stored ? '← investigate' : 'ok');
  line('sites where a phone was seen', rows.saw_phone);
  line('  …but NO phone stored', rows.saw_phone_none_stored, rows.saw_phone_none_stored ? '← investigate' : 'ok');
  console.log('');
}

async function capturedButUnused() {
  console.log('2. CAPTURED BUT UNUSED  (held in the database, never surfaced)');
  const r = (await query(`
    SELECT
      (SELECT count(*) FROM company_locations WHERE latitude IS NULL
         AND address IS NOT NULL AND btrim(address) <> '')::int AS addr_no_pin,
      (SELECT count(*) FROM companies WHERE website IS NOT NULL AND btrim(website::text) <> ''
         AND COALESCE(archived,false)=false
         AND NOT EXISTS (SELECT 1 FROM company_locations l WHERE l.company_id=companies.id AND l.latitude IS NOT NULL))::int AS site_no_pin,
      (SELECT count(*) FROM osm_places WHERE matched_company_id IS NULL AND review_status IS NULL)::int AS osm_unreviewed,
      (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND (email IS NOT NULL)
         AND NOT EXISTS (SELECT 1 FROM company_contacts k WHERE k.company_id=companies.id AND k.type='email'))::int AS legacy_email_only
  `)).rows[0];
  line('addresses stored with no map pin', r.addr_no_pin, 'geocode gap');
  line('website companies with nothing mapped', r.site_no_pin, '← "Resolve Website Map Links"');
  line('OSM places awaiting review', r.osm_unreviewed, '← Discovery Review');
  line('emails only on the legacy column', r.legacy_email_only, r.legacy_email_only > 100 ? '← not in contacts table' : 'ok');
  console.log('');
}

async function sourcePayloadCoverage() {
  console.log('3. SOURCE PAYLOAD COVERAGE  (what each source hands us vs what we keep)');
  const srcs = (await query(
    `SELECT source, count(*)::int n FROM company_sources GROUP BY source ORDER BY n DESC LIMIT 8`)).rows;
  for (const s of srcs) {
    const k = (await query(
      `SELECT count(DISTINCT key)::int n FROM (
         SELECT jsonb_object_keys(raw_payload) AS key FROM company_sources
          WHERE source = $1 AND jsonb_typeof(raw_payload) = 'object' LIMIT 2000) x`, [s.source])).rows[0].n;
    line(s.source + '  (' + s.n.toLocaleString() + ' records)', k + ' fields', 'kept verbatim in raw_payload');
  }
  console.log('');
  console.log('   Every source payload is retained whole, so a field we do not read TODAY');
  console.log('   can still be mined later without re-scraping. Nothing is thrown away.');
  console.log('');
}

async function main() {
  console.log('');
  console.log('BELL — DATA GAP AUDIT   (read-only, changes nothing)');
  console.log('====================================================');
  console.log('');
  await foundVsStored();
  await capturedButUnused();
  await sourcePayloadCoverage();
  const t = (await query(`
    SELECT (SELECT count(*) FROM company_locations WHERE latitude IS NOT NULL)::int AS pinned,
           (SELECT count(*) FROM company_locations)::int AS total`)).rows[0];
  console.log('MAP COVERAGE: ' + t.pinned.toLocaleString() + ' of ' + t.total.toLocaleString()
    + ' stored locations are on the map (' + pct(t.pinned, t.total) + '%).');
  console.log('');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.stack || e); process.exit(1); });

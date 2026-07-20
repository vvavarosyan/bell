// Ingest OpenStreetMap Qatar — POIs (businesses/restaurants/shops/establishments)
// + named streets — then link places to Bell companies and push to production.
// Open data © OpenStreetMap contributors (ODbL). Resumable + idempotent: every
// upsert keys on the OSM id / the street name, so re-running after an interruption
// just continues. Light (network + DB, no browser) — but still, don't run it at the
// same time as a harvester on the 8 GB Mac.

import { ingestPlaces, ingestStreets, linkToCompanies } from '../osm/ingest.js';
import { query } from '../db.js';

const log = (m) => console.log(m);

async function main() {
  log('');
  log('OPENSTREETMAP QATAR INGEST');
  log('==========================');
  log('');

  log('STEP 1/4 — Places (businesses, restaurants, shops, offices, clinics, hotels)…');
  const places = await ingestPlaces({ onProgress: log });
  log(`  → ${places} named places stored/updated.`);
  log('');

  log('STEP 2/4 — Streets (named roads)…');
  const streets = await ingestStreets({ onProgress: log });
  log(`  → ${streets} distinct street names stored/updated.`);
  log('');

  log('STEP 3/4 — Linking places to Bell companies (website / phone)…');
  const linked = await linkToCompanies({ onProgress: log });
  log(`  → ${linked} places linked to an existing company.`);
  log('');

  const totals = (await query(`
    SELECT (SELECT count(*) FROM osm_places)  AS places,
           (SELECT count(*) FROM osm_streets) AS streets,
           (SELECT count(*) FROM osm_places WHERE matched_company_id IS NOT NULL) AS matched`)).rows[0];
  log(`Totals now: ${totals.places} places, ${totals.streets} streets, ${totals.matched} matched to companies.`);
  log('');

  log('STEP 4/4 — Pushing to production…');
  const { runPush } = await import('../sync/push.js');
  await runPush({});
  log('  → Done. Production updated.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nINGEST FAILED:', e.stack || e); process.exit(1); });

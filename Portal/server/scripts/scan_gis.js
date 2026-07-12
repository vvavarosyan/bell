// Standalone Qatar GIS scan — run via "Run Qatar GIS Scan.command".
//
// Pulls the public Qatar GIS geography (municipalities, districts, zones) + named
// buildings (landmarks) from services.gisqatar.org.qa, and promotes the Weekly
// Real Estate Sales Bulletin (already in od_records) into a first-class table.
// Plain fetch — no browser — safe to run any time. Idempotent: re-running never
// duplicates. A few minutes. Publishes to the live site at the end.

import { scrapeGisAll } from '../gis/scrape_gis.js';
import {
  gisTablesReady, ingestMunicipalities, ingestDistricts, ingestZones, ingestLandmarks,
  promoteRealEstate, pushGisToProd,
} from '../gis/ingest_gis.js';

(async () => {
  console.log('Bell — Qatar GIS + Real Estate scan');
  console.log('Plain web fetch — no browser needed. A few minutes.\n');
  try {
    if (!(await gisTablesReady())) {
      console.log('⚠ The local database does not have the GIS tables yet.');
      console.log('  Fix: double-click "Open Bell.qa Portal.command" once (it applies the');
      console.log('  database upgrade on startup), then run this scan again.');
      return;
    }

    const { municipalities, districts, zones, landmarks } = await scrapeGisAll((m) => console.log('  ' + m));

    console.log('\nWriting…');
    const nM = await ingestMunicipalities(municipalities);
    const nD = await ingestDistricts(districts);
    const nZ = await ingestZones(zones);
    const nL = await ingestLandmarks(landmarks);
    const nRE = await promoteRealEstate();

    console.log('\n── Ingested ─────────────────────────────');
    console.log('  Municipalities:          ' + nM.toLocaleString());
    console.log('  Districts:               ' + nD.toLocaleString());
    console.log('  Zones:                   ' + nZ.toLocaleString());
    console.log('  Landmarks (buildings):   ' + nL.toLocaleString());
    console.log('  Real-estate transactions:' + nRE.toLocaleString());
    const withEmail = landmarks.filter((l) => l.email && /@/.test(l.email)).length;
    console.log('  Landmarks with a valid email (for company linking): ' + withEmail.toLocaleString());

    if (process.argv.includes('--no-push')) {
      console.log('\n(--no-push) Skipped the prod publish — data is local only.');
    } else {
      console.log('\nPublishing to the live site…');
      const push = await pushGisToProd();
      console.log('  Prod mirror push:', typeof push === 'object' ? JSON.stringify(push).slice(0, 200) : push);
    }

    console.log('\nDone. The Real Estate data is in Bell. (The map/section UI comes next.)');
  } catch (e) {
    console.error('\nFAILED:', e.message);
    console.error('If it was a network stall, just run this command again — it resumes cleanly.');
    process.exitCode = 1;
  }
})();

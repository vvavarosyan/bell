// Link buildings (GIS landmarks) to companies — run via
// "Link Buildings to Companies.command". Asserts a link ONLY when a building's
// email is a valid, non-generic address that maps to EXACTLY ONE company AND the
// names corroborate (shared distinctive token or high similarity), minus an
// adversarial-audit denylist. Everything else stays unlinked (Rule 2.1). Fast —
// no web fetch, just the link pass + a publish. Idempotent.

import { linkLandmarkCompanies, gisTablesReady, pushGisToProd } from '../gis/ingest_gis.js';

(async () => {
  console.log('Bell — Link Buildings to Companies');
  console.log('Only links when a verified, unique email + matching name agree (never guessed).\n');
  try {
    if (!(await gisTablesReady())) {
      console.log('⚠ No GIS data yet — run "Run Qatar GIS Scan.command" first.');
      return;
    }
    const r = await linkLandmarkCompanies({ apply: true });
    console.log(`Linked ${r.linked} buildings to companies.`);
    console.log(`(${r.candidates} email-matched candidates · ${r.candidates - r.confirmed} rejected as unreliable and left unlinked.)\n`);
    for (const s of r.samples) console.log('  ' + (s.ename || '').slice(0, 34).padEnd(36) + ' → ' + s.company_name);

    console.log('\nPublishing to the live site…');
    const push = await pushGisToProd();
    console.log('  Prod mirror push:', typeof push === 'object' ? JSON.stringify(push).slice(0, 160) : push);
    console.log('\nDone. Linked buildings show an "Occupied by …" chip on the Real Estate → Buildings cards.');
  } catch (e) {
    console.error('FAILED:', e.message);
    process.exitCode = 1;
  }
})().then(() => process.exit(process.exitCode || 0));

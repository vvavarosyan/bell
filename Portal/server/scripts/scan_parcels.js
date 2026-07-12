// Full Qatar cadastre + land-use scan — run via "Run Qatar Cadastre Scan.command".
//
// Ingests every land parcel (~253k, PIN + area) and land-use area (~190k, zoning)
// in Qatar, locating each inside its district by point-in-polygon. Plain fetch,
// no browser. RESUMABLE: if you close the window (or the network stalls), just
// re-run — it picks up exactly where it left off. ~20–30 minutes end to end.
// Memory-safe (one page at a time). Publishes to the live site at the end.

import { ingestParcels, parcelsTablesReady } from '../gis/ingest_parcels.js';
import { pushGisToProd } from '../gis/ingest_gis.js';
import { query } from '../db.js';

(async () => {
  console.log('Bell — Qatar Cadastre + Land-use scan');
  console.log('Every land parcel + land-use area in Qatar. Resumable — safe to close & re-run.\n');
  try {
    if (!(await parcelsTablesReady())) {
      console.log('⚠ The database does not have the parcel tables yet.');
      console.log('  Fix: double-click "Open Bell.qa Portal.command" once, then re-run this.');
      return;
    }
    const r = await ingestParcels({ onProgress: (m) => console.log('  ' + m) });

    const cad = (await query(`SELECT count(*)::int n, count(district_id)::int wd, round(sum(area_sqm)/1e6)::bigint km2 FROM gis_cadastre_plots`)).rows[0];
    const lu = (await query(`SELECT count(*)::int n FROM gis_landuse`)).rows[0];
    console.log('\n── Land data ────────────────────────────');
    console.log('  Cadastre plots:   ' + cad.n.toLocaleString() + '  (' + cad.wd.toLocaleString() + ' located to a district, ' + Number(cad.km2).toLocaleString() + ' km² total)');
    console.log('  Land-use areas:   ' + lu.n.toLocaleString());
    console.log('  Cadastre done:    ' + r.cadastre.done + '   Land-use done: ' + r.landuse.done);

    if (r.cadastre.done && r.landuse.done) {
      console.log('\nPublishing to the live site…');
      const push = await pushGisToProd();
      console.log('  Prod mirror push:', typeof push === 'object' ? JSON.stringify(push).slice(0, 160) : push);
      console.log('\nDone — every parcel of Qatar is in Bell.');
    } else {
      console.log('\nNot finished yet — re-run this command to continue (it resumes automatically).');
    }
  } catch (e) {
    console.error('\nStopped:', e.message);
    console.error('Just re-run the command — it resumes from where it left off.');
    process.exitCode = 1;
  }
})().then(() => process.exit(process.exitCode || 0));

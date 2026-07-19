// Runner for "Geocode Companies.command" — seeds company_locations from what Bell already
// holds, PROVES the QARS locator against Qatar-GIS ground truth (Rule 2.2 — aborts if the
// agreement bar isn't met), geocodes every pending address (exact-or-nothing), then pushes to
// prod when the queue is empty. Resumable: close the window any time and re-run.

import { query } from '../db.js';
import { proofPass, backfillSeeds, runGeocoder, geocodeStats } from '../gis/geocode_companies.js';

async function tablesReady() {
  const r = await query(`SELECT to_regclass('company_locations') AS t`);
  return !!r.rows[0].t;
}

async function main() {
  if (!(await tablesReady())) {
    console.error('The locations table is missing. Fix: double-click "Open Bell.qa Portal.command" once');
    console.error('(that applies the database upgrade), then run this command again.');
    process.exitCode = 1;
    return;
  }

  console.log('1/4  Seeding locations from data Bell already holds…');
  await backfillSeeds({ log: (m) => console.log('     ' + m) });

  console.log('2/4  Proving the Qatar locator against ground truth (~30 known buildings)…');
  const proof = await proofPass({ log: (m) => console.log('     ' + m) });
  if (!proof.ok) {
    console.error('');
    console.error('STOPPED — the locator did not meet the accuracy bar (' + (proof.reason || Math.round((proof.rate || 0) * 100) + '% agreement') + ').');
    console.error('No company coordinates were written. Copy this output to Claude.');
    process.exitCode = 1;
    return;
  }
  console.log('     ✓ accuracy proven — safe to geocode.');

  console.log('3/4  Geocoding pending addresses (~0.6s each, resumable — you can close any time)…');
  const r = await runGeocoder({
    onProgress: (p) => p.error
      ? console.log('     (transient error on row ' + p.id + ': ' + p.error + ' — will retry next run)')
      : console.log(`     ${p.done} processed · ${p.ok} located · ${p.notFound} not found · ${p.unparseable} unparseable`),
  });

  const s = await geocodeStats();
  console.log('');
  console.log('4/4  Results');
  console.log('     Locations total:      ' + s.total);
  console.log('     With coordinates:     ' + s.with_coords + '   ← these appear on the Map');
  console.log('     Address not in system:' + s.not_found + '   (the locator has no such building — honest miss)');
  console.log('     Unparseable address:  ' + s.unparseable + '   (no Zone+Street+Building in the text)');
  console.log('     Still pending:        ' + s.pending);

  if (s.pending === 0) {
    console.log('');
    console.log('Queue empty — pushing to the live site…');
    try {
      const { runPush } = await import('../sync/push.js');
      await runPush({});
      console.log('✓ Pushed. Branch pins appear on app.bell.qa → Map.');
    } catch (e) {
      console.error('Push failed (' + e.message + ') — run "Push Changes.command" later; the data is safe locally.');
    }
  } else {
    console.log('');
    console.log('Not finished yet — re-run this command to continue (it resumes automatically).');
  }
}

main().catch((e) => {
  console.error('ERROR: ' + (e.message || e));
  console.error('Just re-run the command — it resumes from where it left off.');
  process.exitCode = 1;
});

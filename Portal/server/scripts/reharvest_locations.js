// Runner for "Reharvest for Locations.command" — the location-capture payoff run.
//
// The location upgrade (2026-07-19) + website Google-Maps-link capture (2026-07-20)
// only help a company when it is RE-harvested. The no-email reharvest skips the
// ~7,700 companies that already have an email (DOC Medical Center included), so
// their website branches were never captured. This sweeps EVERY already-harvested
// company with a website through the improved harvester, once.
//
// Resumable: each processed company is stamped extra_fields.loc_reharvest_at and
// leaves the cohort, so closing the window and re-running continues where it
// stopped. Plain fetch (7 concurrent) + up to 2 page-renders per company. Long
// run (~thousands of companies) — leave it overnight; it stops by itself.
//
// After it finishes, run "Geocode Companies.command" to pin the new addresses.

import { query } from '../db.js';
import { enrichCompanies } from '../enrichment/local/harvester.js';

const BATCH = 40;
const MARK = 'loc_reharvest_at';
// Only companies not yet swept in THIS location pass (>= the upgrade date).
const NOT_DONE = `(extra_fields->>'${MARK}' IS NULL OR extra_fields->>'${MARK}' < '2026-07-20')`;
const COHORT = `c.stage7_status = 'done' AND c.website IS NOT NULL AND btrim(c.website) <> ''
                AND c.is_active = true AND COALESCE(c.archived, false) = false AND ${NOT_DONE}`;

async function cohortCount() {
  return (await query(`SELECT count(*)::int AS n FROM companies c WHERE ${COHORT}`)).rows[0].n;
}
async function nextBatch(afterId) {
  return (await query(
    `SELECT c.* FROM companies c WHERE c.id > $2 AND ${COHORT} ORDER BY c.id LIMIT $1`,
    [BATCH, afterId])).rows;
}

async function main() {
  const start = await cohortCount();
  console.log('Website-harvested companies not yet swept for locations: ' + start.toLocaleString());
  if (!start) { console.log('Nothing to do — every website company has been swept. 🎉'); return; }
  console.log('Re-harvesting each through the improved extractor — it now captures branch');
  console.log('addresses AND Google-Maps location links (exact coordinates) from the website.');
  console.log('~10-20s per company, 7 at a time. Close any time — re-running continues.');
  console.log('');

  let processed = 0, lastId = 0;
  for (;;) {
    const batch = await nextBatch(lastId);
    if (!batch.length) break;
    lastId = Number(batch[batch.length - 1].id);
    await enrichCompanies(batch, (m) => console.log(m));
    // Stamp them done for THIS pass so the cohort shrinks (resumable).
    await query(
      `UPDATE companies SET extra_fields = coalesce(extra_fields,'{}'::jsonb) || jsonb_build_object('${MARK}', now()::text)
        WHERE id = ANY($1)`, [batch.map((b) => b.id)]).catch(() => {});
    processed += batch.length;
    if (processed % 200 === 0 || batch.length < BATCH) {
      console.log(`— progress: ${processed.toLocaleString()} processed this run · ${(await cohortCount()).toLocaleString()} left —`);
    }
  }

  const gained = (await query(
    `SELECT count(DISTINCT company_id)::int AS n FROM company_locations WHERE geocode_status = 'website-maplink'`)).rows[0].n;
  console.log('');
  console.log('DONE for this run. ' + processed.toLocaleString() + ' companies re-harvested.');
  console.log(gained.toLocaleString() + ' companies now have exact map-pin branches from their website.');
  console.log('');
  console.log('Next: run "Geocode Companies.command" to pin the new text addresses, then ask');
  console.log('Claude to push (or run "Push Changes.command").');
}

main().catch((e) => {
  console.error('ERROR: ' + (e.message || e));
  console.error('Just re-run the command — it continues from where it left off.');
  process.exitCode = 1;
});

// Runner for "Resolve Website Map Links.command".
//
// Many Qatari sites pin their branches with SHORTENED Google-Maps share links
// (maps.app.goo.gl/…). Those carry no coordinates in the link itself — the pin
// only exists after following the redirect — and the harvester was throwing them
// away. That is why DOC Medical Center, whose home page links all three branches
// exactly that way, produced no branch pins no matter how often it was harvested.
//
// The harvester now follows them. This sweeps the companies that stand to gain:
// website companies that still have NO mapped location. Coordinates come from
// Google's own pin for that place — exact, not a name lookup, nothing guessed.
//
// Resumable: each company is stamped extra_fields.maplink_pass_at and leaves the
// cohort. Close any time and re-run. Pushes to production at the end.
//   --company=<id>   process just one company (used to prove it on DOC)

import { query } from '../db.js';
import { enrichCompanies } from '../enrichment/local/harvester.js';

const BATCH = 25;
const MARK = 'maplink_pass_at';
const ONE = (process.argv.find((a) => a.startsWith('--company=')) || '').split('=')[1];

// Companies with a website that have NOTHING on the map yet — the ones a branch
// share-link would actually help.
const COHORT = `c.website IS NOT NULL AND btrim(c.website) <> ''
  AND c.is_active = true AND COALESCE(c.archived,false) = false
  AND (c.extra_fields->>'${MARK}' IS NULL)
  AND NOT EXISTS (SELECT 1 FROM company_locations l
                   WHERE l.company_id = c.id AND l.latitude IS NOT NULL)`;

const countCohort = async () =>
  (await query(`SELECT count(*)::int n FROM companies c WHERE ${COHORT}`)).rows[0].n;

async function mappedFor(ids) {
  return (await query(
    `SELECT count(*)::int n FROM company_locations WHERE company_id = ANY($1) AND latitude IS NOT NULL`,
    [ids])).rows[0].n;
}

async function main() {
  console.log('');
  console.log('RESOLVE WEBSITE MAP LINKS');
  console.log('=========================');
  console.log('');

  if (ONE) {
    const rows = (await query(`SELECT * FROM companies WHERE id = $1`, [Number(ONE)])).rows;
    if (!rows.length) { console.log('No such company.'); return; }
    console.log('Company: ' + rows[0].name + '  (' + rows[0].website + ')');
    const before = await mappedFor([rows[0].id]);
    await enrichCompanies(rows, (m) => console.log('   ' + m));
    const after = await mappedFor([rows[0].id]);
    console.log('');
    console.log(`Mapped locations: ${before} → ${after}`);
    const locs = (await query(
      `SELECT label, address, latitude, longitude, geocode_status FROM company_locations
        WHERE company_id=$1 ORDER BY (latitude IS NULL), id`, [rows[0].id])).rows;
    for (const l of locs) {
      console.log('   ' + String(l.label || 'Location').slice(0, 24).padEnd(26)
        + (l.latitude != null ? (Number(l.latitude).toFixed(5) + ', ' + Number(l.longitude).toFixed(5)) : 'no coords').padEnd(24)
        + String(l.address || '').slice(0, 44));
    }
    console.log('');
    console.log('Pushing to production…');
    const { runPush } = await import('../sync/push.js');
    await runPush({});
    console.log('Done.');
    return;
  }

  const start = await countCohort();
  console.log('Website companies with nothing on the map yet: ' + start.toLocaleString());
  if (!start) { console.log('Nothing to do. 🎉'); return; }
  console.log('Re-reading each site and following its Google-Maps share links.');
  console.log('~10-20s per company. Close any time — re-running continues.');
  console.log('');

  let processed = 0, gained = 0;
  for (;;) {
    const batch = (await query(
      `SELECT c.* FROM companies c WHERE ${COHORT} ORDER BY c.id LIMIT $1`, [BATCH])).rows;
    if (!batch.length) break;
    const ids = batch.map((b) => b.id);
    const before = await mappedFor(ids);
    await enrichCompanies(batch, () => {});
    gained += (await mappedFor(ids)) - before;
    await query(
      `UPDATE companies SET extra_fields = coalesce(extra_fields,'{}'::jsonb)
         || jsonb_build_object('${MARK}', now()::text) WHERE id = ANY($1)`, [ids]).catch(() => {});
    processed += batch.length;
    console.log(`   ${processed.toLocaleString()} processed · ${gained.toLocaleString()} new mapped locations · ${(await countCohort()).toLocaleString()} left`);
  }

  console.log('');
  console.log('New mapped locations gained: ' + gained.toLocaleString());
  console.log('Pushing to production…');
  const { runPush } = await import('../sync/push.js');
  await runPush({});
  console.log('Done — production updated.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.stack || e); process.exit(1); });

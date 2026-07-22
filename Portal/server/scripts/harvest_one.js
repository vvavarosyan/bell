// Harvest ONE company by id — the smoke test the two-machine appendix promised.
//   node scripts/harvest_one.js --company=51641
// Exists because the ROG's first smoke test (2026-07-23) had to hand-write a harness:
// the appendix claimed this CLI existed when it did not, and the hand-written run then
// caught a real crash the Mac had shipped without executing the function end-to-end.
// Both lessons live here now: a real entry point, and a run that exercises the whole path.

import { query, pool } from '../db.js';
import { enrichCompany } from '../enrichment/local/harvester.js';
import { closeRenderer } from '../enrichment/local/render.js';

const arg = process.argv.find((a) => a.startsWith('--company='));
const id = Number(arg?.split('=')[1]);
if (!id) { console.error('Usage: node scripts/harvest_one.js --company=<id>'); process.exit(1); }

const co = (await query('SELECT * FROM companies WHERE id = $1', [id])).rows[0];
if (!co) { console.error('No company with id ' + id); process.exit(1); }
console.log(`Harvesting #${co.id} ${co.name} (${co.website || 'no website'}) …`);
const t0 = Date.now();
try {
  const r = await enrichCompany(co);
  const s = (await query('SELECT stage7_status FROM companies WHERE id=$1', [id])).rows[0];
  const c = (await query(`SELECT
      (SELECT count(*)::int FROM company_contacts WHERE company_id=$1) AS contacts,
      (SELECT count(*)::int FROM company_locations WHERE company_id=$1) AS locations`, [id])).rows[0];
  console.log(`COMPLETED in ${((Date.now() - t0) / 1000).toFixed(1)}s — status: ${r.status}, stage7: ${s.stage7_status}`);
  console.log(`   contacts on file: ${c.contacts} · locations on file: ${c.locations}`);
  process.exit(0);
} catch (e) {
  console.error('FAILED after ' + ((Date.now() - t0) / 1000).toFixed(1) + 's: ' + (e.stack || e.message));
  process.exit(1);
} finally {
  await closeRenderer().catch(() => {});
  await pool.end().catch(() => {});
}

// Read every vacancy board Bell can read, right now — the same work the nightly does.
//
// Val, 2026-08-07: cover the whole active company database, and "if the post is deleted or expired
// or they already hired somebody, we delete it from our portal, so it's not misleading information
// for our users."
//
// Safe to run any time and safe to re-run: nothing is duplicated (each board's postings upsert on
// their own id), and nothing is closed on a board that failed to read. It talks to the database
// directly, so no Portal needs to be open.
//
// The national career portal is the slow part — about 21 minutes, because it is read at the 5-second
// crawl delay that site's own robots.txt asks for. Everything else is minutes.

import { runJobSweep } from '../jobs/run_sweep.js';
import { recordJob, recordSourceOutcomes } from '../ops/job_log.js';
import { query, pool } from '../db.js';

const log = (m) => console.log(m);
const n = (v) => Number(v || 0).toLocaleString();

(async () => {
  console.log('');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('  Reading Qatar\'s job boards');
  console.log('══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  This takes roughly 25 minutes. You can close this window when');
  console.log('  it says FINISHED — nothing is lost if you close it earlier,');
  console.log('  it simply picks up where it left off next time.');
  console.log('');

  const before = (await query(
    `SELECT count(*) FILTER (WHERE closed_at IS NULL)::int AS open,
            count(company_id) FILTER (WHERE closed_at IS NULL)::int AS linked FROM jobs`)).rows[0];
  console.log(`  Before: ${n(before.open)} vacancies showing, ${n(before.linked)} tied to a company.`);
  console.log('');

  let r = null;
  try {
    r = await recordJob('job_sweep',
      () => runJobSweep({ limit: 80, staleHours: 0, log }),
      { yield: (x) => x?.jobs ?? 0, log });
    await recordSourceOutcomes('job_sweep', r?.sources, (v) => (v?.inserted ?? 0) + (v?.updated ?? 0));
  } catch (err) {
    console.log('');
    console.log(`  ✗ The run stopped: ${err.message}`);
  }

  const after = (await query(
    `SELECT count(*) FILTER (WHERE closed_at IS NULL)::int AS open,
            count(company_id) FILTER (WHERE closed_at IS NULL)::int AS linked FROM jobs`)).rows[0];

  console.log('');
  console.log('──────────────────────────────────────────────────────────────');
  console.log(`  FINISHED — ${n(after.open)} vacancies showing, ${n(after.linked)} tied to a company.`);
  if (r) {
    console.log(`  Boards read: ${r.read}   ·   unreadable: ${r.failed}   ·   closed as gone: ${r.closed}`);
    // A vacancy Bell cannot tie to a company is NOT a failure — it still shows who is hiring, in
    // the advertiser's own words. Saying so keeps the number from looking like data loss.
    if (r.unattributed) {
      console.log(`  ${n(r.unattributed)} vacancies name an employer Bell holds no record for — they still`);
      console.log('  show, marked "as advertised". That is correct, not a gap.');
    }
  }
  console.log('');
  console.log('  See them at:  local Portal (127.0.0.1:3939) → Jobs');
  console.log('──────────────────────────────────────────────────────────────');
  console.log('');
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(0);
})();

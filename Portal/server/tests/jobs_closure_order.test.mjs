// Does a vacancy REALLY survive one missed sweep?
//
// jobs_closure.test.mjs answers "does the closure SQL behave correctly on rows shaped like this",
// and it passes. Production still withdrew live vacancies after ONE missed read, because the rows
// it constructs are not the rows a real sweep leaves behind: it never writes the sweep that SAW
// the job. That sweep is the whole problem.
//
// closeVanished counts good sweeps whose swept_at is later than a job's last_seen_at. upsertJobs
// stamps last_seen_at = now(). So if the sweep row is recorded AFTER the upsert, its swept_at is
// later still and the sweep that just saw the job counts as a sweep "since it was seen" — every job
// starts at 1, the first absence makes 2, and MISSES_BEFORE_CLOSED fires a read early. One
// transient blip on a board, and a live vacancy vanishes from the customer portal.
//
// So this file tests the ORDER OF OPERATIONS, using the SHIPPED functions against real Postgres,
// with no SQL copied. A test that copies the query under test cannot catch a bug in how the query
// is called.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

// Point the engine's own pool at the Mac's DISPOSABLE copy BEFORE importing anything that opens
// it. Without this, db.js reads server/.db-target and these writes would land on the live engine
// database. The guard below refuses to run if that redirect did not take.
process.env.DATABASE_URL = process.env.BDI_TEST_DB || 'postgres://localhost:5432/bell_intel';
delete process.env.PGDATABASE;

let query, pool, upsertJobs, recordSweep, closeVanished;
let reachable = false;

try {
  ({ query, pool } = await import('../db.js'));
  ({ upsertJobs, recordSweep, closeVanished } = await import('../jobs/sweep.js'));
  const r = await query('SELECT current_database() AS d, inet_server_addr() AS a');
  // Belt and braces: never write to anything but a local disposable copy.
  reachable = r.rows[0].d === 'bell_intel' && (r.rows[0].a === null || String(r.rows[0].a).startsWith('127.'));
} catch { reachable = false; }

const skip = () => (reachable ? false : 'disposable Postgres not reachable — environmental, not a defect');

const KEY = 'zzorder:board';
const BOARD = {
  board_key: KEY, platform: 'zzorder', url: 'https://example.invalid/jobs',
  attribution: 'unverified', company_id: null,
};
// No extra_fields on purpose: jobs.extra_fields is NOT NULL DEFAULT '{}', so a reader that states
// none must still write successfully. Passing an explicit NULL aborted the whole board's loop.
const JOB = { external_id: 'ZZORDER-1', title: 'ZZ Order Test Vacancy', location_text: 'Doha' };

const clean = async () => {
  if (!reachable) return;
  await query('DELETE FROM jobs WHERE board_key = $1', [KEY]);
  await query('DELETE FROM job_board_sweeps WHERE board_key = $1', [KEY]);
};
before(clean);
after(async () => {
  await clean();
  try { await pool?.end(); } catch { /* ignore */ }
});

/** One sweep, in the order run_sweep.js actually uses. */
async function sweep(seen) {
  await recordSweep(KEY, { ok: true, jobsSeen: seen.length });
  await upsertJobs(BOARD, seen, {});
  return closeVanished(KEY, seen.map((j) => j.external_id), {});
}
const isOpen = async () => Number((await query(
  'SELECT count(*)::int n FROM jobs WHERE board_key = $1 AND closed_at IS NULL', [KEY])).rows[0].n) === 1;

test('a vacancy with no extra_fields still writes (the column is NOT NULL)', { skip: skip() }, async () => {
  await clean();
  const r = await sweep([JOB]);
  assert.equal(r.withdrawn, 0);
  assert.ok(await isOpen(), 'the job was written and is open');
  const ef = (await query('SELECT extra_fields FROM jobs WHERE board_key = $1', [KEY])).rows[0].extra_fields;
  assert.deepEqual(ef, {}, 'an absent payload becomes an empty object, not a NOT NULL violation');
});

test('ONE missed sweep does NOT withdraw a live vacancy', { skip: skip() }, async () => {
  await clean();
  await sweep([JOB]);            // seen
  const miss1 = await sweep([]); // gone for one read — a paginated hiccup, a brief drop
  assert.equal(miss1.withdrawn, 0, 'a board can paginate oddly or drop a row for one read');
  assert.ok(await isOpen(), 'the vacancy must still be showing');
});

test('TWO consecutive missed sweeps withdraw it', { skip: skip() }, async () => {
  await clean();
  await sweep([JOB]);
  await sweep([]);
  const miss2 = await sweep([]);
  assert.equal(miss2.withdrawn, 1);
  const row = (await query(
    'SELECT close_reason, is_active FROM jobs WHERE board_key = $1', [KEY])).rows[0];
  assert.equal(row.close_reason, 'withdrawn');
  assert.equal(row.is_active, false);
});

test('re-appearing on the board re-opens it', { skip: skip() }, async () => {
  await clean();
  await sweep([JOB]);
  await sweep([]);
  await sweep([]);                       // withdrawn
  assert.equal(await isOpen(), false);
  await sweep([JOB]);                    // the employer is advertising it again
  assert.ok(await isOpen(), 'a withdrawal must be reversible — the employer never stopped hiring');
  const row = (await query('SELECT close_reason FROM jobs WHERE board_key = $1', [KEY])).rows[0];
  assert.equal(row.close_reason, null);
});

test('the count is ZERO for a job the sweep just saw — the ordering invariant', { skip: skip() }, async () => {
  // This is the assertion that would have caught the defect on its own. If the sweep row is written
  // after upsertJobs, this comes back 1 and every job is one miss from being withdrawn.
  await clean();
  await sweep([JOB]);
  const n = Number((await query(`
    SELECT (SELECT count(*)::int FROM job_board_sweeps s
             WHERE s.board_key = $1 AND s.ok AND s.swept_at > COALESCE(j.last_seen_at, j.created_at)) AS good
      FROM jobs j WHERE j.board_key = $1`, [KEY])).rows[0].good);
  assert.equal(n, 0, 'a job seen in this sweep has no good sweeps SINCE it was seen');
});

test('a FAILED read closes nothing, however many times it fails', { skip: skip() }, async () => {
  await clean();
  await sweep([JOB]);
  // Rule 3: a board Bell cannot read closes nothing. run_sweep.js `continue`s before closeVanished,
  // and the failed rows are ok = false so they cannot count even if closure were reached.
  await recordSweep(KEY, { ok: false, error: 'timeout' });
  await recordSweep(KEY, { ok: false, error: 'timeout' });
  await recordSweep(KEY, { ok: false, error: 'timeout' });
  const r = await closeVanished(KEY, [], {});
  assert.equal(r.withdrawn, 0);
  assert.ok(await isOpen(), 'an outage is not evidence that anyone stopped hiring');
});

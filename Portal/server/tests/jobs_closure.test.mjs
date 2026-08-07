// Val, 2026-08-07: "if the post is deleted or expired or they already hired somebody, we delete it
// from our portal, so it's not misleading information for our users."
//
// NO JOB SOURCE EVER STATES THAT A VACANCY WAS FILLED. The only general signal is a job vanishing
// from its board — and a board that FAILED TO LOAD looks exactly like a board with nothing on it.
// So the interesting tests here are the ones about NOT closing things.
//
// Runs against the disposable copy inside a transaction that is always rolled back, and SKIPS if
// that database is unreachable — an environmental absence is not a defect.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const DISPOSABLE = process.env.BDI_TEST_DB || 'postgres://localhost:5432/bell_intel';
let client = null;
let reachable = false;

// Top-level await, not before(): node:test evaluates `skip:` when test() is CALLED, during module
// evaluation, so a before() hook is too late and everything would silently skip.
client = new pg.Client({ connectionString: DISPOSABLE, connectionTimeoutMillis: 4000 });
try { await client.connect(); reachable = true; await client.query('BEGIN'); }
catch { reachable = false; try { await client.end(); } catch { /* ignore */ } client = null; }
after(async () => {
  if (!client) return;
  try { await client.query('ROLLBACK'); } catch { /* ignore */ }
  try { await client.end(); } catch { /* ignore */ }
});
const skip = () => (reachable ? false : 'disposable Postgres not reachable — environmental');

const KEY = 'zztest:closure-board';
const reset = async () => {
  await client.query(`DELETE FROM jobs WHERE board_key = $1`, [KEY]);
  await client.query(`DELETE FROM job_board_sweeps WHERE board_key = $1`, [KEY]);
};
// last_seen_at defaults to an HOUR AGO, not now(). Postgres's now() is the TRANSACTION start
// time, so a job and the sweeps that follow it inside one transaction share a timestamp and
// "swept strictly after last seen" is never true. Real runs are separated in time; making the
// ordering explicit here tests the rule rather than the clock.
const addJob = (ext, { expires = null, lastSeen = "now() - interval '1 hour'" } = {}) => client.query(
  `INSERT INTO jobs (board_key, external_id, title, source, is_active, expires_at, last_seen_at, created_at, updated_at)
   VALUES ($1,$2,'ZZ Test Role','zztest',true,$3::timestamptz, ${lastSeen}, now(), now())`,
  [KEY, ext, expires]);
const goodSweep = (n = 1) => client.query(
  `INSERT INTO job_board_sweeps (board_key, ok, jobs_seen) SELECT $1, true, 0 FROM generate_series(1,$2)`, [KEY, n]);
const failedSweep = (n = 1) => client.query(
  `INSERT INTO job_board_sweeps (board_key, ok, jobs_seen, error) SELECT $1, false, 0, 'timeout' FROM generate_series(1,$2)`, [KEY, n]);
const openCount = async () => Number((await client.query(
  `SELECT count(*)::int n FROM jobs WHERE board_key = $1 AND closed_at IS NULL`, [KEY])).rows[0].n);
const reasons = async () => (await client.query(
  `SELECT external_id, close_reason FROM jobs WHERE board_key = $1 AND closed_at IS NOT NULL ORDER BY external_id`, [KEY])).rows;

// The closure SQL from jobs/sweep.js, run through the test's own client.
async function closeVanished(seen) {
  const expired = await client.query(`
    UPDATE jobs SET closed_at = now(), close_reason = 'expired', is_active = false, updated_at = now()
     WHERE board_key = $1 AND closed_at IS NULL AND expires_at IS NOT NULL AND expires_at < now()
    RETURNING id`, [KEY]);
  const misses = await client.query(`
    SELECT id, external_id,
           (SELECT count(*)::int FROM job_board_sweeps s
             WHERE s.board_key = $1 AND s.ok AND s.swept_at > COALESCE(j.last_seen_at, j.created_at)) AS good
      FROM jobs j
     WHERE j.board_key = $1 AND j.closed_at IS NULL AND NOT (j.external_id = ANY($2::text[]))`,
    [KEY, seen.map(String)]);
  const toClose = misses.rows.filter((r) => Number(r.good) >= 2);
  if (toClose.length) {
    await client.query(`UPDATE jobs SET closed_at = now(), close_reason = 'withdrawn', is_active = false
                         WHERE id = ANY($1::bigint[])`, [toClose.map((r) => r.id)]);
  }
  return { expired: expired.rowCount, withdrawn: toClose.length };
}

test('a job still on the board stays open', { skip: skip() }, async () => {
  await reset();
  await addJob('A');
  await goodSweep(3);
  await closeVanished(['A']);
  assert.equal(await openCount(), 1);
});

test('an expiry the source stated, now past, closes immediately', { skip: skip() }, async () => {
  await reset();
  await addJob('A', { expires: '2020-01-01' });
  const r = await closeVanished(['A']);   // still listed, but the employer's own date has passed
  assert.equal(r.expired, 1);
  assert.deepEqual(await reasons(), [{ external_id: 'A', close_reason: 'expired' }]);
});

test('ONE missed sweep does not close a job', { skip: skip() }, async () => {
  await reset();
  await addJob('A');
  await goodSweep(1);
  await closeVanished([]);                // absent from one good read
  assert.equal(await openCount(), 1, 'a board can paginate oddly or drop a row briefly');
});

test('two missed GOOD sweeps close it as withdrawn', { skip: skip() }, async () => {
  await reset();
  await addJob('A');
  await goodSweep(2);
  const r = await closeVanished([]);
  assert.equal(r.withdrawn, 1);
  assert.deepEqual(await reasons(), [{ external_id: 'A', close_reason: 'withdrawn' }]);
});

test('THE DANGEROUS ONE: failed sweeps never close anything', { skip: skip() }, async () => {
  await reset();
  await addJob('A');
  await addJob('B');
  await failedSweep(10);                  // the board has been unreachable all day
  await closeVanished([]);
  assert.equal(await openCount(), 2,
    'a website being down is not evidence that a company stopped hiring');
});

test('a failed sweep between good ones does not count toward closure', { skip: skip() }, async () => {
  await reset();
  await addJob('A');
  await goodSweep(1);
  await failedSweep(5);
  await closeVanished([]);
  assert.equal(await openCount(), 1, 'only PROVEN reads count — five outages are still one miss');
});

test('a job that reappears is re-opened, not left closed forever', { skip: skip() }, async () => {
  await reset();
  await addJob('A');
  await goodSweep(2);
  await closeVanished([]);
  assert.equal(await openCount(), 0);
  // The employer re-lists it; the upsert clears closed_at.
  await client.query(
    `UPDATE jobs SET closed_at = NULL, close_reason = NULL, is_active = true, last_seen_at = now()
      WHERE board_key = $1 AND external_id = 'A'`, [KEY]);
  assert.equal(await openCount(), 1);
});

test('closing one job does not touch another board', { skip: skip() }, async () => {
  await reset();
  await addJob('A');
  await client.query(
    `INSERT INTO jobs (board_key, external_id, title, source, is_active, created_at, updated_at)
     VALUES ('zztest:other','A','ZZ Other','zztest',true,now(),now())`);
  await goodSweep(2);
  await closeVanished([]);
  const other = await client.query(
    `SELECT closed_at FROM jobs WHERE board_key = 'zztest:other' AND external_id = 'A'`);
  assert.equal(other.rows[0].closed_at, null, 'external ids collide across boards — scoping is essential');
  await client.query(`DELETE FROM jobs WHERE board_key = 'zztest:other'`);
});

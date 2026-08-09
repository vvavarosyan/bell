// Can Bell tell that a scheduled duty stopped working?
//
// Three failures this month were invisible for the same reason, and a fourth turned up while
// writing these tests:
//   · Kahramaa answered HTTP 401 for FOURTEEN consecutive nights while the tender scan reported
//     "ok" every time — three healthy portals made the aggregate look fine and the scan recorded
//     one total, never a per-source breakdown.
//   · the ROG ran 12 days on stale code with a perfectly healthy heartbeat.
//   · all 9 Google News feeds died and the poller kept returning HTTP 200 on an empty feed.
//   · 2026-08-09: the nightly sweep started at 00:30 Qatar, self-updated, and then wrote NOTHING
//     for sixteen hours. Eight duties live in its `finally` block and none was reached. In a table
//     that only records COMPLETIONS that looked like silence — identical to "never scheduled".
//
// So the shape of every one of them is the same: SUCCESS-BY-ABSENCE. These tests pin down the
// three states that make absence legible — a per-source row, a 'zero' yield, and an open row that
// is never closed — against real Postgres, using the shipped queries.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

// The Mac's disposable copy, inside a transaction that is always rolled back. See
// auto_merge_rule.test.mjs for why this is Postgres and not PGlite, and why an unreachable
// database SKIPS rather than FAILS.
const DISPOSABLE = process.env.BDI_TEST_DB || 'postgres://localhost:5432/bell_intel';
let client = null;
let reachable = false;

// TOP-LEVEL await, not before(): node:test evaluates `skip:` when test() is CALLED.
client = new pg.Client({ connectionString: DISPOSABLE, connectionTimeoutMillis: 4000 });
try { await client.connect(); reachable = true; await client.query('BEGIN'); }
catch { reachable = false; try { await client.end(); } catch { /* ignore */ } client = null; }
after(async () => {
  if (!client) return;
  try { await client.query('ROLLBACK'); } catch { /* ignore */ }
  try { await client.end(); } catch { /* ignore */ }
});
const skip = () => (reachable ? false : 'disposable Postgres not reachable — environmental, not a defect');

const KIND = 'zzjv_scan';
const clear = () => client.query(`DELETE FROM job_runs WHERE kind LIKE 'zzjv_%'`);

/** The status rule from ops/job_log.js — a source that errored, produced nothing, or worked. */
const statusFor = (v) => {
  const error = v?.error ? String(v.error) : null;
  const produced = error ? null : (v?.inserted ?? 0) + (v?.updated ?? 0);
  return error ? 'error' : (produced === 0 ? 'zero' : 'ok');
};

async function recordNight(kind, sources) {
  for (const [source, v] of Object.entries(sources)) {
    await client.query(
      `INSERT INTO job_runs (id, kind, source, status, started_at, completed_at, result, error, triggered_by)
       VALUES (gen_random_uuid(), $1, $2, $3, now(), now(), $4::jsonb, $5, 'engine')`,
      [kind + ':source', source, statusFor(v),
       JSON.stringify({ produced: v?.error ? null : (v.inserted ?? 0) + (v.updated ?? 0) }),
       v?.error || null]);
  }
}

// The shipped silentSources() query, kept in step with ops/job_log.js by these tests.
const SILENT_SQL = `
  SELECT kind, source,
         count(*)::int                                  AS runs,
         count(*) FILTER (WHERE status = 'ok')::int     AS ok_runs,
         count(*) FILTER (WHERE status = 'error')::int  AS errors
    FROM job_runs
   WHERE source IS NOT NULL
     AND completed_at > now() - ($2 || ' days')::interval
     AND ($1::text IS NULL OR kind = $1)
   GROUP BY kind, source
  HAVING count(*) >= $3 AND count(*) FILTER (WHERE status = 'ok') = 0
   ORDER BY source`;
const silent = async (kind, { minRuns = 3, days = 7 } = {}) =>
  (await client.query(SILENT_SQL, [kind, String(days), minRuns])).rows;

// ── the Kahramaa shape ───────────────────────────────────────────────────────────────────────
// The night as it actually was: three portals producing plenty, one returning 401.
const DEAD_NIGHT = {
  monaqasat:   { scraped: 4200, inserted: 60, updated: 900 },
  ashghal:     { scraped: 1500, inserted: 30, updated: 200 },
  qatarenergy: { scraped: 809,  inserted: 14, updated: 40 },
  kahramaa:    { error: 'HTTP 401 Unauthorized' },
};

test('a dead source is named, and the healthy ones are not', { skip: skip() }, async () => {
  await clear();
  for (let i = 0; i < 3; i++) await recordNight(KIND, DEAD_NIGHT);

  const rows = await silent(KIND + ':source');
  assert.equal(rows.length, 1, 'exactly one source should be flagged');
  assert.equal(rows[0].source, 'kahramaa');
  assert.equal(rows[0].ok_runs, 0);
  assert.equal(rows[0].errors, 3);
});

test('the aggregate on those same nights looks perfectly healthy', { skip: skip() }, async () => {
  await clear();
  for (let i = 0; i < 3; i++) {
    await recordNight(KIND, DEAD_NIGHT);
    // What the scan used to record, and only this: one row, one total, 'ok'.
    await client.query(
      `INSERT INTO job_runs (id, kind, status, started_at, completed_at, result, triggered_by)
       VALUES (gen_random_uuid(), $1, 'ok', now(), now(), $2::jsonb, 'engine')`,
      [KIND, JSON.stringify({ produced: 1244 })]);
  }
  const agg = await client.query(
    `SELECT status, result->>'produced' AS produced FROM job_runs WHERE kind = $1`, [KIND]);
  assert.equal(agg.rows.length, 3);
  assert.ok(agg.rows.every((r) => r.status === 'ok'), 'the old record shows nothing wrong');
  // ...which is the whole point: the aggregate cannot see it, the per-source rows can.
  assert.equal((await silent(KIND + ':source')).length, 1);
});

test('a source that reads fine but yields nothing is caught too', { skip: skip() }, async () => {
  await clear();
  // MOCI's shape: the read succeeds, the register simply stops producing. 58 days went unnoticed.
  for (let i = 0; i < 4; i++) await recordNight('zzjv_reg', { moci: { scraped: 900, inserted: 0, updated: 0 } });
  const rows = await silent('zzjv_reg:source');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, 'moci');
  assert.equal(rows[0].errors, 0, 'nothing errored — it just produced nothing');
});

test('one bad night is not enough to raise an alarm', { skip: skip() }, async () => {
  await clear();
  // A portal can genuinely publish nothing for a day. minRuns exists so a single quiet night
  // does not cry wolf — an alarm nobody trusts is worse than no alarm.
  await recordNight(KIND, DEAD_NIGHT);
  assert.equal((await silent(KIND + ':source')).length, 0);
  await recordNight(KIND, DEAD_NIGHT);
  assert.equal((await silent(KIND + ':source')).length, 0);
  await recordNight(KIND, DEAD_NIGHT);
  assert.equal((await silent(KIND + ':source')).length, 1, 'the third consecutive failure does');
});

test('a source that recovers stops being flagged', { skip: skip() }, async () => {
  await clear();
  for (let i = 0; i < 3; i++) await recordNight(KIND, DEAD_NIGHT);
  assert.equal((await silent(KIND + ':source')).length, 1);
  await recordNight(KIND, { ...DEAD_NIGHT, kahramaa: { scraped: 1700, inserted: 5, updated: 12 } });
  assert.equal((await silent(KIND + ':source')).length, 0, 'one good read clears it');
});

// ── the hung-nightly shape ───────────────────────────────────────────────────────────────────
// openJob writes 'running' with no completed_at. jobHealth's rule: still running and young = fine;
// still running and old = started but never finished.
const healthOf = (status, ageH) =>
  status === 'running' ? (ageH != null && ageH < 8 ? 'running' : 'started but never finished')
  : status === 'error' ? 'failing'
  : ageH == null ? 'never run'
  : ageH > 36 ? 'overdue'
  : status === 'zero' ? 'producing nothing'
  : 'ok';

test('a run that started and never finished is visible as exactly that', { skip: skip() }, async () => {
  await clear();
  await client.query(
    `INSERT INTO job_runs (id, kind, status, started_at, result, triggered_by)
     VALUES (gen_random_uuid(), 'zzjv_night', 'running', now() - interval '16 hours', '{}'::jsonb, 'engine')`);
  // The row must be found by age even though completed_at is NULL — the bug that hid this was
  // measuring age from completed_at alone, which is NULL for precisely the runs that hung.
  const r = await client.query(`
    SELECT DISTINCT ON (kind) kind, status, started_at, completed_at
      FROM job_runs WHERE kind = 'zzjv_night'
     ORDER BY kind, COALESCE(completed_at, started_at) DESC NULLS LAST`);
  assert.equal(r.rows.length, 1);
  const at = r.rows[0].completed_at || r.rows[0].started_at;
  assert.ok(at, 'an open run still has a timestamp to age from');
  const ageH = (Date.now() - new Date(at).getTime()) / 3.6e6;
  assert.ok(ageH > 8);
  assert.equal(healthOf(r.rows[0].status, ageH), 'started but never finished');
});

test('a run that is genuinely still working is not called a hang', { skip: skip() }, async () => {
  assert.equal(healthOf('running', 0.5), 'running');
  assert.equal(healthOf('running', 7.9), 'running');
  assert.equal(healthOf('running', 8.1), 'started but never finished');
});

test('closing an open run leaves a normal completed row', { skip: skip() }, async () => {
  await clear();
  const ins = await client.query(
    `INSERT INTO job_runs (id, kind, status, started_at, result, triggered_by)
     VALUES (gen_random_uuid(), 'zzjv_night', 'running', now(), '{}'::jsonb, 'engine') RETURNING id`);
  await client.query(
    `UPDATE job_runs SET status = 'ok', completed_at = now(), result = $2::jsonb WHERE id = $1`,
    [ins.rows[0].id, JSON.stringify({ result: { rounds: 3 } })]);
  const r = (await client.query(`SELECT status, completed_at FROM job_runs WHERE id = $1`, [ins.rows[0].id])).rows[0];
  assert.equal(r.status, 'ok');
  assert.ok(r.completed_at, 'a closed run has a completion time');
  assert.equal(healthOf(r.status, 0.1), 'ok');
});

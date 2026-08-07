// The rule that decides when Bell merges two company records automatically.
//
// Val, 2026-07-22: "if CR number is matching let it link automatically." Measuring the live data
// showed the plain reading of that is unsafe, and these tests pin the safe version in place.
//
// Different issuing bodies number their own registers independently, so the SAME digits mean
// different things in different registers. Real live examples that a number-only rule would have
// merged into one record:
//     14173 → "Qatar ALhadeetha Kindergarteen"  +  "QATAR GROUP FOR PETROLWUM SERVICES"
//     15101 → "Dar AL-Doha modern electronics"  +  "The Gulf English School"
// Grouping by number alone produced 627 live groups. Adding the issuing body produced 41 — and all
// 41 turned out to be exact-name duplicates (Barclays Bank PLC twice, KPMG LLC twice).
//
// The SQL under test is the shipped SQL, run against real Postgres.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

// Runs against the Mac's DISPOSABLE copy inside a transaction that is always rolled back, so it
// touches nothing real and leaves nothing behind. PGlite would be the house default, but it is not
// an installed dependency and adding it would put a test-only package into the production install.
// If that database is not reachable (on a hotspot, on another machine) the tests SKIP rather than
// FAIL — an environmental absence is not a defect, and a suite that goes red when you change Wi-Fi
// teaches everyone to ignore it.
const DISPOSABLE = process.env.BDI_TEST_DB || 'postgres://localhost:5432/bell_intel';
let client = null;
let reachable = false;

// The grouping query from assembly/auto_merge.js, kept in step with it by these tests.
const GROUP_SQL = `
  SELECT r.body, r.registration_type, r.number,
         array_agg(c.id ORDER BY COALESCE(c.bell_score,0) DESC, c.id) AS ids,
         array_agg(c.name ORDER BY COALESCE(c.bell_score,0) DESC, c.id) AS names
    FROM companies c
    JOIN company_registrations r ON r.company_id = c.id
   WHERE COALESCE(c.archived, false) = false
     AND c.canonical_id IS NULL
     AND length(r.number) >= 5
     AND c.name LIKE 'ZZAM %'
   GROUP BY r.body, r.registration_type, r.number
  HAVING count(DISTINCT r.company_id) > 1`;

// TOP-LEVEL await, not a before() hook: node:test evaluates `skip:` when test() is CALLED, which
// happens while this module is still being evaluated — a before() hook runs later, so the guard
// would always read "unreachable" and silently skip everything. That is exactly what it did on the
// first run, and a suite that skips 7 of 7 while reporting success is worse than one that fails.
client = new pg.Client({ connectionString: DISPOSABLE, connectionTimeoutMillis: 4000 });
try { await client.connect(); reachable = true; await client.query('BEGIN'); }
catch { reachable = false; try { await client.end(); } catch { /* ignore */ } client = null; }
after(async () => {
  if (!client) return;
  try { await client.query('ROLLBACK'); } catch { /* ignore */ }
  try { await client.end(); } catch { /* ignore */ }
});

const skip = () => (reachable ? false : 'disposable Postgres not reachable — environmental, not a defect');

// Every fixture name is prefixed ZZAM so the query above can scope itself to this test's rows —
// the disposable copy holds 190,956 real companies and must not be swept into the results.
async function company(name, { archived = false, canonical = null, score = 0 } = {}) {
  const r = await client.query(
    `INSERT INTO companies (name, name_normalized, is_active, archived, canonical_id, bell_score)
     VALUES ($1,$2,true,$3,$4,$5) RETURNING id`,
    ['ZZAM ' + name, name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(), archived, canonical, score]);
  return Number(r.rows[0].id);
}
const reg = (companyId, body, number, type = 'commercial_registration') =>
  client.query(`INSERT INTO company_registrations (company_id, body, registration_type, number)
                VALUES ($1,$2,$3,$4)`, [companyId, body, type, number]);
const groups = async () => (await client.query(GROUP_SQL)).rows;
// Each test starts from a clean slate WITHIN the rolled-back transaction.
const clear = async () => {
  await client.query(`DELETE FROM company_registrations WHERE company_id IN (SELECT id FROM companies WHERE name LIKE 'ZZAM %')`);
  await client.query(`DELETE FROM companies WHERE name LIKE 'ZZAM %'`);
};

test('the same register stating the same number groups the two records', { skip: skip() }, async () => {
  await clear();
  const a = await company('Barclays Bank PLC', { score: 40 });
  const b = await company('Barclays Bank PLC', { score: 10 });
  await reg(a, 'company_record', '00018');
  await reg(b, 'company_record', '00018');
  const g = await groups();
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids.map(Number), [a, b], 'the higher Bell Score must be the survivor');
});

test('THE COUNTER-EXAMPLE: the same number in DIFFERENT registers never groups', { skip: skip() }, async () => {
  await clear();
  const kg = await company('Qatar ALhadeetha Kindergarteen');
  const oil = await company('QATAR GROUP FOR PETROLWUM SERVICES');
  await reg(kg, 'QFC', '14173');
  await reg(oil, 'company_record', '14173');
  assert.equal((await groups()).length, 0,
    'a kindergarten and a petroleum company sharing digits across registers must never merge');
});

test('a branch registration is a different number, so it is never merged', { skip: skip() }, async () => {
  await clear();
  const parent = await company('Al Jaber Trading');
  const branch = await company('Al Jaber Trading Branch 2');
  await reg(parent, 'MOCI', '42828');
  await reg(branch, 'MOCI', '42828/2');
  assert.equal((await groups()).length, 0,
    'branches are LINKED by the chain model, never merged — the two must not fight over these rows');
});

test('short numbers are excluded — they collide by chance', { skip: skip() }, async () => {
  await clear();
  const a = await company('Alpha Co');
  const b = await company('Beta Co');
  await reg(a, 'MOCI', '1234');
  await reg(b, 'MOCI', '1234');
  assert.equal((await groups()).length, 0);
});

test('already-merged and archived records are not re-merged', { skip: skip() }, async () => {
  await clear();
  const keeper = await company('KPMG LLC');
  const gone = await company('KPMG LLC', { canonical: keeper });
  const dead = await company('KPMG LLC', { archived: true });
  await reg(keeper, 'company_record', '00051');
  await reg(gone, 'company_record', '00051');
  await reg(dead, 'company_record', '00051');
  assert.equal((await groups()).length, 0, 'only LIVE, unmerged records are candidates');
});

test('a different registration_type in the same register does not group', { skip: skip() }, async () => {
  await clear();
  const a = await company('Some Co');
  const b = await company('Other Co');
  await reg(a, 'MOCI', '55555', 'commercial_registration');
  await reg(b, 'MOCI', '55555', 'establishment_licence');
  assert.equal((await groups()).length, 0);
});

test('three records on one registration collapse to one survivor', { skip: skip() }, async () => {
  await clear();
  const a = await company('CXO Prime LLC', { score: 70 });
  const b = await company('CXO Prime', { score: 20 });
  const c = await company('CXO PRIME LLC', { score: 5 });
  for (const id of [a, b, c]) await reg(id, 'company_record', '00704');
  const g = await groups();
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids.map(Number), [a, b, c], 'survivor first, then the records folded into it');
});

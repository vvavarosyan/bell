// The merge guard's registration test — drives the SHIPPED mergeCompanies/registrationBases
// against real Postgres.
//
//   DATABASE_URL=postgres://localhost:5432/bell_intel node --test tests/merge_registration_guard.test.mjs
//
// The defect this pins (found 2026-08-18): the guard compared ONE scalar per company,
// companies.primary_registration_no, and refused the merge whenever the two differed. That
// field is not "the company's CR" — it can hold a QFC LICENCE, or an arbitrary one of several
// commercial registrations. Measured across the 5,831 live cross-body pairs, it refused 110,
// and in 110 of 110 BOTH companies stated the shared base CR in company_registrations. The
// guard now compares the SETS of stated commercial registrations and refuses only when they
// are disjoint — which is what "a different legal entity" actually means.

import test from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../db.js';
import { registrationBases, mergeCompanies } from '../assembly/dedup.js';

const cleanup = [];
test.after(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  await pool.end();
});

async function makeCompany(name, regs) {
  const c = (await query(
    `INSERT INTO companies (name, name_normalized, primary_registration_no)
     VALUES ($1, lower($1), $2) RETURNING id`, [name, regs.primary || null])).rows[0];
  cleanup.push(() => query(`DELETE FROM companies WHERE id = $1`, [c.id]));
  for (const r of regs.rows || []) {
    await query(
      `INSERT INTO company_registrations (company_id, body, registration_type, number)
       VALUES ($1,$2,$3,$4)`, [c.id, r.body, r.type || 'commercial_registration', r.number]);
  }
  cleanup.push(() => query(`DELETE FROM company_registrations WHERE company_id = $1`, [c.id]));
  return Number(c.id);
}

test('registrationBases reads every stated CR, not just the primary field', async () => {
  const id = await makeCompany('Zzz Guard Multi CR Co', {
    primary: '02087',                                   // a QFC LICENCE, as on company #3973
    rows: [{ body: 'QFC', type: 'licence', number: '02087' },
           { body: 'company_record', number: '00097001' },
           { body: 'QCCI', number: '97001' }],
  });
  const { bases, primary } = await registrationBases(id);
  assert.equal(primary, '02087', 'the primary field is reported as stored');
  assert.ok(bases.has('97001'), 'the stated commercial registration is included');
  assert.ok(!bases.has('2087'), 'a QFC licence is not a commercial registration and is excluded');
});

test('a merge is REFUSED only when the two registration sets are disjoint', async () => {
  const a = await makeCompany('Zzz Guard Alpha Co', {
    primary: '97010', rows: [{ body: 'MOCI', number: '97010' }] });
  const b = await makeCompany('Zzz Guard Beta Co', {
    primary: '97011', rows: [{ body: 'MOCI', number: '97011' }] });
  await assert.rejects(() => mergeCompanies(a, b, () => {}),
    (err) => err.code === 'registration_conflict',
    'two firms stating different CRs are different firms — still refused');
});

test('the licence-vs-CR case now merges: both companies state the same CR', async () => {
  // Exactly company #3973 ↔ #51489: one record's "primary" is its QFC licence while both
  // state commercial registration 97020. The old scalar test compared 2087 against 97020.
  const a = await makeCompany('Zzz Guard Licence Holder', {
    primary: '02087',
    rows: [{ body: 'QFC', type: 'licence', number: '02087' },
           { body: 'company_record', number: '00097020' }],
  });
  const b = await makeCompany('Zzz Guard CR Shell', {
    primary: '97020', rows: [{ body: 'MOCI', number: '97020' }] });

  const [A, B] = await Promise.all([registrationBases(a), registrationBases(b)]);
  assert.ok([...A.bases].some((x) => B.bases.has(x)), 'the sets overlap on 97020');

  await mergeCompanies(a, b, () => {});
  const survivor = (await query(`SELECT canonical_id, archived FROM companies WHERE id = $1`, [b])).rows[0];
  assert.equal(Number(survivor.canonical_id), a, 'the duplicate now points at the survivor');
});

test('sibling branch registrations still refuse — /2 and /3 are two shops', async () => {
  const a = await makeCompany('Zzz Guard Branch Two', {
    primary: '97030/2', rows: [{ body: 'MOCI', number: '97030/2' }] });
  const b = await makeCompany('Zzz Guard Branch Three', {
    primary: '97030/3', rows: [{ body: 'MOCI', number: '97030/3' }] });
  await assert.rejects(() => mergeCompanies(a, b, () => {}),
    (err) => err.code === 'sibling_branches',
    'the registry\'s own /n numbering says these are two branches, not duplicates');
});

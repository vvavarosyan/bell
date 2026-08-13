// The cross-body CR finder: when do two registry bodies stating the same number mean ONE company?
//
// The same-body finder ran 'zero' five nights straight while 6,283 cross-body duplicate groups
// sat in the data, because QCCI writes "00036876" where CRA writes "36876". This finder joins on
// the leading-zero-stripped, branch-stripped base — a join proven sound before it was written:
// on the 4,312 companies carrying BOTH a MOCI and a QCCI row themselves, the numbers agree 94.3%.
// That missing 5.7% is also why nothing merges on the number alone: three tiers of conclusive
// evidence merge, everything else is held. "almustaqbal Engineering" and "Diplomat For Men's
// Supplies" really do share a base CR (measured, live) — the danger the tiers exist for.
//
// Drives the SHIPPED finder against real Postgres (the disposable Mac copy), fixtures scoped by
// the onlyBases hook so the thousands of real groups on the copy stay out of the assertions.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.BDI_TEST_DB || 'postgres://localhost:5432/bell_intel';
delete process.env.PGDATABASE;

let query, pool, findCrossBodyBaseCrGroups;
let reachable = false;

try {
  ({ query, pool } = await import('../db.js'));
  ({ findCrossBodyBaseCrGroups } = await import('../assembly/auto_merge.js'));
  const r = await query('SELECT current_database() AS d, inet_server_addr() AS a');
  reachable = r.rows[0].d === 'bell_intel' && (r.rows[0].a === null || String(r.rows[0].a).startsWith('127.'));
} catch { reachable = false; }

const skip = () => (reachable ? false : 'disposable Postgres not reachable — environmental, not a defect');

// Bases nothing real uses (checked: the live max base is 7 digits; these are 9).
const B = { exact: '990990011', shell: '990990022', corr: '990990033', danger: '990990044',
            branch: '990990055', wrongBody: '990990066' };
const madeCompanies = [];

async function mkCompany(name, extra = {}) {
  const r = await query(
    `INSERT INTO companies (name, name_normalized, country, is_active, website)
     VALUES ($1, lower(regexp_replace($1, '[^a-zA-Z0-9]+', ' ', 'g')), 'Qatar', true, $2) RETURNING id`,
    [name, extra.website || null]);
  const id = Number(r.rows[0].id);
  madeCompanies.push(id);
  return id;
}
async function mkReg(companyId, body, number, type = 'commercial_registration') {
  await query(
    `INSERT INTO company_registrations (company_id, body, registration_type, number)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`, [companyId, body, type, number]);
}
async function mkPhone(companyId, value) {
  await query(
    `INSERT INTO company_contacts (company_id, type, value, source) VALUES ($1, 'phone', $2, 'test-fixture')
     ON CONFLICT DO NOTHING`, [companyId, value]);
}

async function wipe() {
  if (!reachable) return;
  await query(`DELETE FROM company_contacts WHERE company_id = ANY($1::bigint[])`, [madeCompanies]).catch(() => {});
  await query(`DELETE FROM company_registrations WHERE company_id = ANY($1::bigint[])`, [madeCompanies]).catch(() => {});
  await query(`DELETE FROM companies WHERE name LIKE 'ZZXB %' OR name LIKE 'MOCI CR-9909900%'`).catch(() => {});
}

let groups = null;
const byBase = (b) => groups.find((g) => g.base === b);

before(async () => {
  if (!reachable) return;
  await wipe();
  // exact: leading-zero variant of the same number, identical names → the QCCI/CRA shape.
  const e1 = await mkCompany('ZZXB Encon Trading');
  const e2 = await mkCompany('ZZXB Encon Trading');
  await mkReg(e1, 'QCCI', '00' + B.exact);
  await mkReg(e2, 'CRA', B.exact);
  // shell: a nameless registry stub + one named row.
  const s1 = await mkCompany(`MOCI CR-${B.shell} (name missing)`);
  const s2 = await mkCompany('ZZXB Filled Company');
  await mkReg(s1, 'MOCI', B.shell);
  await mkReg(s2, 'QCCI', B.shell);
  // corroborated: names disagree (a translation), but both state the same phone.
  const c1 = await mkCompany('ZZXB Green Valley Trading');
  const c2 = await mkCompany('ZZXB Al Wadi Al Akhdar');
  await mkReg(c1, 'MOCI', B.corr);
  await mkReg(c2, 'QCCI', B.corr);
  await mkPhone(c1, '+974 4444 9911');
  await mkPhone(c2, '44449911');
  // danger: names disagree, nothing corroborates → must be HELD.
  const d1 = await mkCompany('ZZXB Future Engineering Consulting');
  const d2 = await mkCompany('ZZXB Diplomat Menswear Supplies');
  await mkReg(d1, 'MOCI', B.danger);
  await mkReg(d2, 'QCCI', B.danger);
  // branch rows: /2 suffix must keep the group out entirely (chain territory, never merge).
  const br1 = await mkCompany('ZZXB Branchy Base');
  const br2 = await mkCompany('ZZXB Branchy Base');
  await mkReg(br1, 'MOCI', B.branch);
  await mkReg(br2, 'MOCI', B.branch + '/2');
  // wrong body: company_record numbers its own register — identical names must NOT group here.
  const w1 = await mkCompany('ZZXB Own Register Co');
  const w2 = await mkCompany('ZZXB Own Register Co');
  await mkReg(w1, 'company_record', B.wrongBody);
  await mkReg(w2, 'company_record', B.wrongBody);

  groups = await findCrossBodyBaseCrGroups({ onlyBases: Object.values(B) });
});

after(async () => { await wipe(); try { await pool.end(); } catch { /* ignore */ } });

test('leading zeros do not hide a duplicate — QCCI 00X meets CRA X', { skip: skip() }, () => {
  const g = byBase(B.exact);
  assert.ok(g, 'the group is found across the zero-padding difference');
  assert.equal(g.tier, 'exact', 'identical names → conclusive');
});

test('a nameless registry shell merges into the named company', { skip: skip() }, () => {
  const g = byBase(B.shell);
  assert.ok(g);
  assert.equal(g.tier, 'shell', 'the shell asserts only the CR, and the CR matches');
});

test('a translated name is proven by a shared phone, not by string similarity', { skip: skip() }, () => {
  // "Green Valley Trading" and "Al Wadi Al Akhdar" are the same words in two languages; trigram
  // similarity scores them 0.00. The shared phone is the evidence that is actually conclusive.
  const g = byBase(B.corr);
  assert.ok(g);
  assert.equal(g.tier, 'corroborated');
});

test('the kindergarten shape is HELD — same number, unrelated names, no corroboration', { skip: skip() }, () => {
  const g = byBase(B.danger);
  assert.ok(g);
  assert.equal(g.tier, 'held', 'a base-CR match alone never merges: ~6% of cross-body numbers are typos');
});

test('branch registrations never enter — /2 is a different branch, chain territory', { skip: skip() }, () => {
  assert.equal(byBase(B.branch), undefined, 'the /2 row is excluded, so no group forms');
});

test("company_record's own numbering cannot cross-match", { skip: skip() }, () => {
  assert.equal(byBase(B.wrongBody), undefined,
    'bodies that number independently stay out — number 00003 means three different firms across registers');
});

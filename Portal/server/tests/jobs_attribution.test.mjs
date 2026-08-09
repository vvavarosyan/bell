// Whose vacancy is it? — the rule that decides, and the things it must refuse.
//
// A vacancy attached to the wrong company is exactly the misleading information Val asked Bell to
// prevent, only worse than a stale posting: it carries a real date and lights a hiring signal Bell
// then sells. So these tests are mostly about REFUSALS.
//
// Runs against real Postgres (the Mac's disposable copy) inside a transaction that is always rolled
// back, because the matcher's whole job is a SQL comparison — testing it against a mock would test
// the mock. See auto_merge_rule.test.mjs for why this is Postgres and not PGlite.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { employerKey, employerCore, isSpecificEmployer, matchStatedEmployer, attributeJob,
  LEGAL_TRAIL_TOKENS, SQL_KEY, SQL_CORE, SQL_TIGHT } from '../jobs/attribute.js';

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

// The matcher takes an injectable query, so it can be pointed at this transaction.
const q = (sql, params) => client.query(sql, params);

// Fixtures are prefixed so they cannot collide with the 190k real companies in the copy, and the
// prefix is stripped from what the "source states" — the point is to match on the rest.
const P = 'Zzattr';
const company = async (name, extra = {}) => Number((await client.query(
  `INSERT INTO companies (name, name_normalized, is_active, archived, canonical_id)
   VALUES ($1,$2,$3,$4,$5) RETURNING id`,
  [P + ' ' + name, (P + ' ' + name).toLowerCase(),
   extra.is_active ?? true, extra.archived ?? false, extra.canonical_id ?? null])).rows[0].id);
const clear = () => client.query(`DELETE FROM companies WHERE name LIKE '${P} %'`);
const state = (name) => P + ' ' + name;   // how a job board would write that employer

// ── the key itself ───────────────────────────────────────────────────────────────────────────
test('the key keeps every meaningful word', { skip: false }, () => {
  // ingest/normalize.js's normalizeName strips "holding", "company", "trading", "group" as legal
  // noise. That lossiness already merged two different real firms once; here those words decide.
  assert.equal(employerKey('Al Jaber Holding Company'), 'al jaber holding company');
  assert.notEqual(employerKey('Al Jaber Holding Company'), employerKey('Al Jaber & Partners'));
  assert.equal(employerKey('Al Arab Bakery & Sweets'), 'al arab bakery and sweets');
  assert.equal(employerKey('  MEEZA  QSTP-LLC '), 'meeza qstp llc');
});

test('only a TRAILING legal form is optional', { skip: false }, () => {
  assert.equal(employerCore('Milaha W.L.L.'), 'milaha');
  assert.equal(employerCore('Arctic Cooling Company'), 'arctic cooling');
  // "Company" in the middle is part of the name, not a suffix.
  assert.equal(employerCore('Company Of Bakers'), 'company of bakers');
});

test('a SPACED legal form is stripped too — the punctuation is already gone by then', { skip: false }, () => {
  // employerKey turns "W.L.L." into three separate letters, so a token list of only 'wll' misses
  // it. 2,188 live companies normalize to a name ending this way; before the spaced forms were
  // added, "Encon Corporation" could never find "Encon Corporation W.L.L.".
  assert.equal(employerCore('Encon Corporation W.L.L'), 'encon corporation');
  assert.equal(employerCore('Power Flow Trading W.L.L.'), 'power flow trading');
  assert.equal(employerCore('Qatar Aluminium Co. W . L . L'), 'qatar aluminium');
});

test('a category is not an employer', { skip: false }, () => {
  for (const junk of ['Qatar', 'Doha', 'Trading Company', 'Hotel', 'Confidential', 'various',
                      'Recruitment Agency', 'a', '', null, undefined]) {
    assert.equal(isSpecificEmployer(junk), false, `${JSON.stringify(junk)} should be refused`);
  }
});

test('a one-word brand is allowed — the protection is uniqueness, not word count', { skip: false }, () => {
  // Qatar's biggest employers are one word. Refusing them threw away the best matches this rule
  // has, and word count was never what made a match safe.
  for (const real of ['Ooredoo', 'Baladna', 'QatarEnergy', 'Milaha']) {
    assert.equal(isSpecificEmployer(real), true, `${real} should be allowed to try`);
  }
});

// ── matching against real rows ───────────────────────────────────────────────────────────────
test('a stated employer that names exactly one live company matches it', { skip: skip() }, async () => {
  await clear();
  const id = await company('Arctic Cooling Co');
  const m = await matchStatedEmployer(state('Arctic Cooling Company'), { q });
  assert.ok(m, 'should match');
  assert.equal(m.company_id, id);
  assert.match(m.why, /matches exactly one active company/);
});

test('TWO companies with the same name means NO attribution', { skip: skip() }, async () => {
  await clear();
  await company('Gulf Asia Contracting');
  await company('Gulf Asia Contracting');
  // Ambiguity is not a tie to break. The source has not said which one is hiring, so Bell does not
  // pick — a coin flip here would put a real vacancy on the wrong firm half the time.
  assert.equal(await matchStatedEmployer(state('Gulf Asia Contracting'), { q }), null);
});

test('archived, inactive and merged-away companies are not candidates', { skip: skip() }, async () => {
  await clear();
  const live = await company('Sama Steel');
  await company('Sama Steel', { archived: true });
  await company('Sama Steel', { is_active: false });
  await company('Sama Steel', { canonical_id: live });
  const m = await matchStatedEmployer(state('Sama Steel'), { q });
  assert.ok(m, 'the one live record should still be found');
  assert.equal(m.company_id, live);
});

test('a near-miss is a miss — no fuzzy matching', { skip: skip() }, async () => {
  await clear();
  await company('Qatar Steel');
  // "Qatar Steel" and "Qatar Steel Industrial" are two different companies. Trigram similarity or
  // a LIKE prefix would merge them; equality will not.
  assert.equal(await matchStatedEmployer(state('Qatar Steel Industrial'), { q }), null);
  assert.equal(await matchStatedEmployer(state('Qatar Stee'), { q }), null);
});

test('word breaks may differ — QatarEnergy is Qatar Energy', { skip: skip() }, async () => {
  await clear();
  const id = await company('Qatar Energy');
  const m = await matchStatedEmployer(state('QatarEnergy'), { q });
  assert.ok(m, 'the career portal spells it as one word; the register spells it as two');
  assert.equal(m.company_id, id);
  assert.match(m.why, /ignoring word breaks/);
});

test('word breaks are the SECOND pass only — an exact match always wins', { skip: skip() }, async () => {
  await clear();
  const exact = await company('Al Fardan Exchange');
  await company('AlFardanExchange');
  // Both reduce to the same spaceless key, so the loose pass would be ambiguous. The exact pass
  // resolves it first and never reaches the loose one.
  const m = await matchStatedEmployer(state('Al Fardan Exchange'), { q });
  assert.ok(m);
  assert.equal(m.company_id, exact);
  assert.equal(m.why.includes('ignoring word breaks'), false);
});

test('a name Bell does not hold simply gets no company', { skip: skip() }, async () => {
  await clear();
  assert.equal(await matchStatedEmployer(state('Fornax Global'), { q }), null);
});

// ── the whole decision ───────────────────────────────────────────────────────────────────────
test('a verified board answers when the posting names nobody', { skip: skip() }, async () => {
  await clear();
  const id = await company('Some Employer Ltd');
  const r = await attributeJob({ attribution: 'verified', company_id: id }, { employer_stated: null }, { q });
  assert.equal(r.company_id, id);
  assert.match(r.how, /own domain/);
});

test('a recruitment agency does not become the employer of its clients vacancies', { skip: skip() }, async () => {
  await clear();
  // The case that breaks a board-only rule, and it is common in Qatar: the agency's OWN careers
  // page — a verified board by every test — advertises its clients' roles. The posting names the
  // real employer, and the posting is the more specific statement.
  const agency = await company('Al Fares Manpower Supply');
  const client = await company('Baab Al Rayyan Group');
  const r = await attributeJob(
    { attribution: 'verified', company_id: agency, board_key: 'site:alfares.qa/careers' },
    { employer_stated: state('Baab Al Rayyan Group'), title: 'Storekeeper' }, { q });
  assert.equal(r.company_id, client);
  assert.match(r.how, /posting wins/);
});

test('an UNVERIFIED board attributes nothing on its own', { skip: skip() }, async () => {
  await clear();
  const wrong = await company('Honey Well Trading and Contracting');
  // The live case this guard exists for: a small Qatar trading firm with honeywell.com on record,
  // whose board carries 1,282 vacancies in Chennai. The board must not speak for it.
  const r = await attributeJob(
    { attribution: 'unverified', company_id: wrong, board_key: 'oracle_cloud:x' },
    { employer_stated: null, title: 'Engineer, Bracknell' }, { q });
  assert.equal(r.company_id, null);
});

test('an unverified board CAN still place a job the posting names itself', { skip: skip() }, async () => {
  await clear();
  const wrong = await company('Honey Well Trading and Contracting');
  const real  = await company('Mekdam Holding Group');
  const r = await attributeJob(
    { attribution: 'unverified', company_id: wrong, board_key: 'qatarliving:list' },
    { employer_stated: state('Mekdam Holding Group') }, { q });
  assert.equal(r.company_id, real, 'the POSTING decides, not the board it arrived on');
});

test('an aggregator job whose employer Bell cannot place stays unattached', { skip: skip() }, async () => {
  await clear();
  const r = await attributeJob(
    { attribution: 'unverified', company_id: null, board_key: 'qatarliving:list' },
    { employer_stated: 'Confidential' }, { q });
  assert.equal(r.company_id, null);
  assert.match(r.how, /no company named by the source/);
});

// ── the two sides must not drift ─────────────────────────────────────────────────────────────
// The JS regex and the SQL expression are built from ONE token list, but the INDEX is a separate
// artefact written in a migration file. The planner matches an expression index by exact
// expression, so if the query changes and the index does not, everything still returns correct
// answers — just 2.4 s slower per lookup, with nothing to see. That silence is the whole risk.

test('the shipped index matches the expression the matcher sends', { skip: skip() }, async () => {
  const idx = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE tablename = 'companies' AND indexname LIKE 'companies_employer_%'`);
  const byName = Object.fromEntries(idx.rows.map((r) => [r.indexname, r.indexdef]));
  assert.ok(byName.companies_employer_key_idx, 'the key index exists (migration 112)');
  assert.ok(byName.companies_employer_core_idx, 'the core index exists (migrations 112 + 113)');
  assert.ok(byName.companies_employer_tight_idx, 'the tight index exists (migration 112)');

  // Postgres re-prints an index expression with its own spacing and ::text casts, so compare on
  // the parts that carry meaning rather than character-for-character.
  for (const tok of LEGAL_TRAIL_TOKENS) {
    assert.ok(byName.companies_employer_core_idx.includes(`|${tok}|`) ||
              byName.companies_employer_core_idx.includes(`(${tok}|`) ||
              byName.companies_employer_core_idx.includes(`|${tok})`),
      `LEGAL_TRAIL_TOKENS has "${tok}" but the shipped index does not — add a migration that ` +
      'rebuilds companies_employer_core_idx, or every lookup silently drops to a full scan');
  }
  // And the reverse: an index token nobody uses any more means the JS side was trimmed alone.
  const inIdx = (byName.companies_employer_core_idx.match(/\\m\(([^)]*)\)/) || [])[1];
  if (inIdx) {
    for (const tok of inIdx.split('|')) {
      assert.ok(LEGAL_TRAIL_TOKENS.includes(tok),
        `the shipped index strips "${tok}" but LEGAL_TRAIL_TOKENS does not — the two sides drifted`);
    }
  }
});

test('the planner actually USES those indexes', { skip: skip() }, async () => {
  // The assertion above proves the tokens agree. This proves the whole expression does, which is
  // the only thing the planner cares about.
  const LIVE = 'COALESCE(archived, false) = false AND canonical_id IS NULL AND is_active IS NOT false';
  for (const [label, expr, idxName] of [
    ['key', SQL_KEY, 'companies_employer_key_idx'],
    ['core', SQL_CORE, 'companies_employer_core_idx'],
    ['tight', SQL_TIGHT, 'companies_employer_tight_idx'],
  ]) {
    const e = await client.query(
      `EXPLAIN SELECT id FROM companies WHERE ${LIVE} AND ${expr} = $1 LIMIT 3`, ['zzattr nothing here']);
    const plan = e.rows.map((r) => r['QUERY PLAN']).join('\n');
    assert.ok(plan.includes(idxName),
      `the ${label} lookup no longer uses ${idxName} — the expression drifted from the migration.\n${plan}`);
  }
});

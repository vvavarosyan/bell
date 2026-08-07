// CRM search — correctness, tenant isolation, and the two traps that make a
// "search everything" feature dangerous in this codebase.
//
// Runs against the REAL Postgres schema on a single pinned connection inside
// BEGIN … ROLLBACK. Nothing is written: the two test tenants, their CRM records,
// notes, deals and reveals all vanish when the transaction rolls back. (CLAUDE.md
// names PGlite; it is not installed in this repo, and the real schema — real
// companies, real company_contacts, real company_registrations — is the stronger
// test anyway. The same choice is documented in legacy_contact_sync.test.mjs.)
//
// WHAT IS BEING PROVEN
//
//  1. TENANT ISOLATION. Two tenants hold a CRM record for the SAME company. A
//     search by either one must return only its own record id. Additionally a
//     deliberately planted STRAY note and STRAY deal — rows whose tenant_id is
//     tenant B but whose record_id points at tenant A's record — must be
//     invisible to both. That is the exact shape of the leak the CRM audit found
//     in POST /api/crm/deals (crm_deals.record_id has no compound tenant key in
//     migration 022), so the search's `n.tenant_id = $1` / `d.tenant_id = $1`
//     predicates are load-bearing and this test fails if either is removed.
//
//  2. THE POLYMORPHIC ENTITY_ID TRAP. crm_records.entity_id is a companies.id on
//     a company row and a people.id on a person row. people.id 5 and
//     companies.id 5 both exist in the live database (Georges A. ElKhoury and
//     Baker Hughes). A person record for entity_id 5 must NEVER match Baker
//     Hughes' contact email — without the `r.entity_type = 'company'` guard it
//     would, and the CRM would attribute one company's contact details to an
//     unrelated person.
//
//  3. NO FREE REVEALS. Contact values are what Bell charges credits for. A
//     tenant that has not revealed a company cannot confirm its email/phone by
//     typing it into the search box. Name / website / registration / notes /
//     deals are never gated.
//
//  4. LIKE WILDCARDS ARE LITERAL TEXT. Typing `%` must find records containing a
//     percent sign — not every record in the CRM.
//
//  5. AN EMPTY BOX SEARCHES NOTHING. parseCrmQuery returns null so the caller
//     adds no condition; it must never degrade to "match everything" and never
//     to "match nothing".

import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db.js';
import { parseCrmQuery, buildCrmSearch, likeEscape, CRM_SEARCH_FIELDS } from '../lib/crm.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Real rows in the live database, used as fixtures (read-only).
const CO_BARAKA  = 5781;   // Al Baraka Holding LLC — ir@albaraka.com, CR 30734, BIN-00023779
const CO_SERVICO = 31591;  // servico facilities management &services w l l — +97444555333
const CO_ASMAKH  = 52193;  // AL ASMAKH FACILITIES MANAGEMENT COMPANY
const CO_BAKER   = 5;      // Baker Hughes — corporatesecretary@bakerhughes.com
const PERSON_COLLIDING_WITH_BAKER = 5;   // people.id 5 = Georges A. ElKhoury

// The FROM clause mirrors routes/crm.js (RECORD_COLS / RECORD_FROM). The part
// under test — the WHERE and the match_fields projection — is imported from the
// shipped module, not restated here.
const FROM = `
    FROM crm_records r
    LEFT JOIN companies c ON r.entity_type = 'company' AND c.id = r.entity_id
    LEFT JOIN people    p ON r.entity_type = 'person'  AND p.id = r.entity_id`;

/** Run the real search the way GET /api/crm/records assembles it. */
async function search(client, tenantId, q, { revealBypass = false, entityType = null } = {}) {
  const params = [tenantId];
  const where = ['r.tenant_id = $1', 'r.archived = false'];
  if (entityType) { params.push(entityType); where.push(`r.entity_type = $${params.length}`); }
  const parsed = parseCrmQuery(q);
  const s = buildCrmSearch(parsed, params, { tenantParam: '$1', revealBypass });
  if (s) where.push(s.where);
  const sql = `SELECT r.id, r.entity_type, r.entity_id, c.name AS company_name, p.full_name AS person_name`
    + (s ? s.matchSelect : '')
    + FROM + ` WHERE ${where.join(' AND ')} ORDER BY r.last_activity_at DESC`;
  const res = await client.query(sql, params);
  return res.rows;
}

const ids = (rows) => rows.map((r) => Number(r.id)).sort((a, b) => a - b);

/** Build the two-tenant world inside a transaction and hand it to `fn`. */
async function withWorld(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const mk = async (name, slug) =>
      Number((await client.query(`INSERT INTO tenants (name, slug) VALUES ($1,$2) RETURNING id`, [name, slug])).rows[0].id);
    const A = await mk('Search Test Tenant A', 'search-test-a-' + Date.now());
    const B = await mk('Search Test Tenant B', 'search-test-b-' + Date.now());

    const rec = async (tenant, type, entityId) =>
      Number((await client.query(
        `INSERT INTO crm_records (tenant_id, entity_type, entity_id, source) VALUES ($1,$2,$3,'manual') RETURNING id`,
        [tenant, type, entityId])).rows[0].id);

    const w = { A, B, rec: {} };
    // Both tenants hold the SAME company. Different record ids, same entity.
    w.rec.aBaraka  = await rec(A, 'company', CO_BARAKA);
    w.rec.aServico = await rec(A, 'company', CO_SERVICO);
    w.rec.aPerson  = await rec(A, 'person',  PERSON_COLLIDING_WITH_BAKER);
    w.rec.bBaraka  = await rec(B, 'company', CO_BARAKA);
    w.rec.bAsmakh  = await rec(B, 'company', CO_ASMAKH);

    // Tenant A's own note and deal.
    await client.query(`INSERT INTO crm_notes (tenant_id, record_id, body) VALUES ($1,$2,$3)`,
      [A, w.rec.aServico, 'Procurement asked for the renewal quote — zebrafish']);
    await client.query(`INSERT INTO crm_deals (tenant_id, record_id, title) VALUES ($1,$2,$3)`,
      [A, w.rec.aServico, 'Q3 facilities renewal — zebrafish deal']);

    // THE STRAY ROWS. tenant_id says B, record_id points at A's record. This is
    // exactly what the unscoped POST /api/crm/deals path can create today.
    await client.query(`INSERT INTO crm_notes (tenant_id, record_id, body) VALUES ($1,$2,$3)`,
      [B, w.rec.aBaraka, 'STRAYNOTE tenant B wrote this onto tenant A record']);
    await client.query(`INSERT INTO crm_deals (tenant_id, record_id, title) VALUES ($1,$2,$3)`,
      [B, w.rec.aBaraka, 'STRAYDEAL tenant B deal on tenant A record']);

    // A revealed Al Baraka; B did not.
    await client.query(`INSERT INTO tenant_reveals (tenant_id, entity_type, entity_id) VALUES ($1,'company',$2)`,
      [A, CO_BARAKA]);

    await fn(client, w);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

// ── 5. An empty box searches nothing ────────────────────────────────────────

test('parseCrmQuery: an empty or 1-character box is not a search', () => {
  for (const v of ['', '   ', null, undefined, 'a', ' x ']) {
    assert.equal(parseCrmQuery(v), null, `${JSON.stringify(v)} should not be a search`);
  }
  assert.equal(buildCrmSearch(null, [], { tenantParam: '$1' }), null,
    'a null query must produce NO condition — the caller adds nothing, it does not match all');
  assert.ok(parseCrmQuery('al') !== null, 'two characters is a search');
});

test('parseCrmQuery: only a mostly-numeric string becomes a phone/registration lookup', () => {
  assert.equal(parseCrmQuery('Al Baraka').numeric, null);
  assert.equal(parseCrmQuery('Building 100').numeric, null, '3 digits is too few to be a phone or CR');
  assert.equal(parseCrmQuery('4455 5333').numeric, '44555333');
  assert.equal(parseCrmQuery('+974 4455 5333').numeric, '97444555333');
  assert.equal(parseCrmQuery('30734').numeric, '30734');
});

// ── 4. LIKE wildcards are literal text ──────────────────────────────────────

test('likeEscape neutralises the three LIKE metacharacters', () => {
  assert.equal(likeEscape('100%'), '100\\%');
  assert.equal(likeEscape('a_b'), 'a\\_b');
  assert.equal(likeEscape('c:\\x'), 'c:\\\\x');
  assert.equal(parseCrmQuery('%%').like, '%\\%\\%%');
});

test('a query of pure wildcards returns nothing, not the whole CRM', async () => {
  await withWorld(async (client, w) => {
    const all = await search(client, w.A, null);
    assert.equal(all.length, 3, 'tenant A holds 3 records with no search applied');
    for (const wild of ['%%', '%a%', '__']) {
      const rows = await search(client, w.A, wild);
      assert.equal(rows.length, 0, `"${wild}" must be treated as literal text, not a wildcard`);
    }
  });
});

// ── 1. Tenant isolation ─────────────────────────────────────────────────────

test('two tenants holding the SAME company each see only their own record', async () => {
  await withWorld(async (client, w) => {
    const a = await search(client, w.A, 'al baraka');
    const b = await search(client, w.B, 'al baraka');
    assert.deepEqual(ids(a), [w.rec.aBaraka], 'tenant A sees its own record only');
    assert.deepEqual(ids(b), [w.rec.bBaraka], 'tenant B sees its own record only');
    assert.ok(a[0].match_fields.includes('name'), 'reported as a name match');
    assert.equal(a[0].company_name, 'Al Baraka Holding LLC');
  });
});

test('a note written by another tenant onto this record is invisible to BOTH', async () => {
  await withWorld(async (client, w) => {
    assert.equal((await search(client, w.A, 'STRAYNOTE')).length, 0,
      'tenant A must not see a note row carrying tenant B\'s tenant_id');
    assert.equal((await search(client, w.B, 'STRAYNOTE')).length, 0,
      'tenant B must not reach into tenant A\'s record through record_id');
    assert.equal((await search(client, w.A, 'STRAYDEAL')).length, 0, 'same for deals');
    assert.equal((await search(client, w.B, 'STRAYDEAL')).length, 0, 'same for deals');
  });
});

test('a tenant DOES find its own notes and deals', async () => {
  await withWorld(async (client, w) => {
    const byNote = await search(client, w.A, 'zebrafish');
    assert.deepEqual(ids(byNote), [w.rec.aServico]);
    assert.deepEqual(byNote[0].match_fields.sort(), ['deal', 'note'],
      'the word is in both the note and the deal title, and both are reported');
    assert.equal((await search(client, w.B, 'zebrafish')).length, 0,
      'tenant B never sees tenant A\'s notes or deals');
  });
});

// ── 2. The polymorphic entity_id trap ───────────────────────────────────────

test('a PERSON record never matches the contact details of the company with the same id', async () => {
  await withWorld(async (client, w) => {
    // Sanity: the collision the guard protects against is real in this database.
    const co = await client.query(`SELECT name FROM companies WHERE id=$1`, [CO_BAKER]);
    const pe = await client.query(`SELECT full_name FROM people WHERE id=$1`, [PERSON_COLLIDING_WITH_BAKER]);
    assert.equal(co.rows.length, 1); assert.equal(pe.rows.length, 1);
    assert.equal(co.rows[0].name, 'Baker Hughes');

    // Tenant A's only record with entity_id 5 is a PERSON. Baker Hughes' email
    // must not surface it — with revealBypass on, so the reveal gate cannot be
    // what is doing the work here.
    const rows = await search(client, w.A, 'corporatesecretary@bakerhughes.com', { revealBypass: true });
    assert.equal(rows.length, 0,
      'the company_contacts subquery must be guarded by entity_type = company');

    // The same person record IS findable by the person\'s own name.
    const byName = await search(client, w.A, 'ElKhoury');
    assert.deepEqual(ids(byName), [w.rec.aPerson]);
  });
});

// ── 3. No free reveals ──────────────────────────────────────────────────────

test('contact matching is gated by tenant_reveals; identity fields never are', async () => {
  await withWorld(async (client, w) => {
    // A revealed Al Baraka → its email matches.
    const a = await search(client, w.A, 'ir@albaraka.com');
    assert.deepEqual(ids(a), [w.rec.aBaraka]);
    assert.ok(a[0].match_fields.includes('email'));

    // B holds the same company but never revealed it → no email match.
    assert.equal((await search(client, w.B, 'ir@albaraka.com')).length, 0,
      'an unrevealed contact must not be confirmable through the search box');

    // …yet B can still find that company by every ungated field.
    assert.deepEqual(ids(await search(client, w.B, 'al baraka')), [w.rec.bBaraka], 'name');
    assert.deepEqual(ids(await search(client, w.B, 'albaraka.com')), [w.rec.bBaraka], 'website');
    assert.deepEqual(ids(await search(client, w.B, 'BIN-00023779')), [w.rec.bBaraka], 'BIN');

    // platform_admin / the internal tenant bypass the gate, as everywhere else.
    assert.deepEqual(ids(await search(client, w.B, 'ir@albaraka.com', { revealBypass: true })), [w.rec.bBaraka]);
  });
});

// ── Field coverage on real data ─────────────────────────────────────────────

test('phone search finds a record from digits typed any way', async () => {
  await withWorld(async (client, w) => {
    await client.query(`INSERT INTO tenant_reveals (tenant_id, entity_type, entity_id) VALUES ($1,'company',$2)`,
      [w.A, CO_SERVICO]);
    for (const typed of ['44555333', '4455 5333', '+974 4455 5333', '(974) 4455-5333']) {
      const rows = await search(client, w.A, typed);
      assert.deepEqual(ids(rows), [w.rec.aServico], `"${typed}" should find the record`);
      assert.ok(rows[0].match_fields.includes('phone'), `"${typed}" reported as a phone match`);
    }
  });
});

test('registration search finds a record by its commercial registration number', async () => {
  await withWorld(async (client, w) => {
    // 30734 is Al Baraka's CR in company_registrations (QCCI + company_record).
    const rows = await search(client, w.A, '30734');
    assert.deepEqual(ids(rows), [w.rec.aBaraka]);
    assert.ok(rows[0].match_fields.includes('registration'));
    // The zero-padded form the registry itself publishes must work too.
    assert.deepEqual(ids(await search(client, w.A, '00030734')), [w.rec.aBaraka]);
    // …and Bell's own reference, which is a different string entirely.
    assert.deepEqual(ids(await search(client, w.A, 'BIN-00023779')), [w.rec.aBaraka]);
  });
});

test('a registration number is matched EXACTLY, never as a fragment', async () => {
  await withWorld(async (client, w) => {
    // A CR identifies one company. If "3073" matched CR 30734 the CRM would
    // put a salesperson in front of the wrong business.
    const rows = await search(client, w.A, '3073');
    assert.equal(rows.length, 0, '"3073" must not surface CR 30734');
    assert.deepEqual(parseCrmQuery('3073').regCandidates, ['3073']);
    // The three candidate forms the live table was verified against.
    assert.deepEqual(parseCrmQuery('00030734').regCandidates, ['00030734', '30734']);
    assert.deepEqual(parseCrmQuery('22006/5').regCandidates, ['220065', '22006/5'.toUpperCase()]);
    assert.ok(parseCrmQuery('TR00008').regCandidates.includes('TR00008'),
      'the 10 verbatim TR000NN rows are reachable');
    assert.deepEqual(parseCrmQuery('%a%').regCandidates, [],
      'a wildcard query is never treated as a registration number');
  });
});

test('website search finds a record by domain', async () => {
  await withWorld(async (client, w) => {
    const rows = await search(client, w.A, 'servicoqatar.com');
    assert.deepEqual(ids(rows), [w.rec.aServico]);
    assert.deepEqual(rows[0].match_fields, ['website']);
  });
});

test('match_fields only ever reports keys the UI knows how to label', async () => {
  await withWorld(async (client, w) => {
    const rows = await search(client, w.A, 'a', { revealBypass: true });   // no search: 1 char
    assert.equal(rows.length, 3);
    assert.equal(rows[0].match_fields, undefined, 'no search ran, so no match_fields column');
    const searched = await search(client, w.A, 'al ', { revealBypass: true });
    for (const r of searched) {
      for (const f of r.match_fields) {
        assert.ok(CRM_SEARCH_FIELDS.includes(f), `unknown match field ${f}`);
      }
    }
  });
});

// ── The route really wires it up ────────────────────────────────────────────

test('GET /api/crm/records applies the search condition and the match projection', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'routes', 'crm.js'), 'utf8');
  assert.match(src, /const parsedQ = parseCrmQuery\(req\.query\.q\)/,
    'the route must parse q through the shared parser');
  assert.match(src, /where\.push\(search\.where\)/,
    'the search condition must be ANDed into the record WHERE list');
  assert.match(src, /search \? search\.matchSelect : ''/,
    'match_fields must be projected when a search ran');
  assert.match(src, /revealBypass: bypassesCredits\(req\.user, req\.tenant\)/,
    'the reveal gate must be driven by the real credits helper, not a literal');
  assert.doesNotMatch(src, /lower\(coalesce\(c\.name,''\)\) LIKE \$\$\{params\.length\}/,
    'the old name-only q branch must be gone');
});

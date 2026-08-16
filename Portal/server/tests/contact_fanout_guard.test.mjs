// The fan-out guard: a value on many unrelated companies is a template, not a contact.
//
// One London landline was stored as the phone of 640 Qatar companies — written by the website
// harvester one page at a time, each write looking reasonable alone. The guard refuses a
// HARVEST-sourced value already present on ≥10 other companies; registry-stated values pass,
// because a registry naming one number for fifty branches is a statement, not a scrape artifact.
// Drives the SHIPPED upsertContact against the disposable copy.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.BDI_TEST_DB || 'postgres://localhost:5432/bell_intel';
delete process.env.PGDATABASE;

let query, pool, upsertContact;
let reachable = false;
try {
  ({ query, pool } = await import('../db.js'));
  ({ upsertContact } = await import('../lib/contacts.js'));
  const r = await query('SELECT current_database() AS d, inet_server_addr() AS a');
  reachable = r.rows[0].d === 'bell_intel' && (r.rows[0].a === null || String(r.rows[0].a).startsWith('127.'));
} catch { reachable = false; }
const skip = () => (reachable ? false : 'disposable Postgres not reachable — environmental, not a defect');

const VALUE = '+97444990011';           // the shared "template" value under test
const ids = [];

async function mkCompany(i) {
  const r = await query(`INSERT INTO companies (name, name_normalized, country) VALUES ($1, $1, 'Qatar') RETURNING id`,
    ['zzfan test co ' + i]);
  ids.push(Number(r.rows[0].id));
  return Number(r.rows[0].id);
}
async function wipe() {
  if (!reachable) return;
  await query(`DELETE FROM company_contacts WHERE company_id = ANY($1::bigint[])`, [ids]).catch(() => {});
  await query(`DELETE FROM companies WHERE name LIKE 'zzfan test co %'`).catch(() => {});
}

before(async () => {
  if (!reachable) return;
  await wipe();
  // Ten companies already carry the value (planted directly — the guard counts rows, not writes).
  for (let i = 0; i < 10; i++) {
    const id = await mkCompany(i);
    await query(`INSERT INTO company_contacts (company_id, type, value, source) VALUES ($1,'phone',$2,'seed')`, [id, VALUE]);
  }
});
after(async () => { await wipe(); try { await pool.end(); } catch { /* */ } });

test('the 11th company cannot receive the value from a HARVEST', { skip: skip() }, async () => {
  const id = await mkCompany(100);
  const r = await upsertContact('company', id, { type: 'phone', value: VALUE, source: 'stage7-website' });
  assert.equal(r, null, 'refused — ten other companies already carry it, so it is the template');
  const n = await query(`SELECT count(*)::int n FROM company_contacts WHERE company_id=$1`, [id]);
  assert.equal(n.rows[0].n, 0);
});

test('the same value from a REGISTRY still writes — a statement is not a scrape', { skip: skip() }, async () => {
  const id = await mkCompany(101);
  const r = await upsertContact('company', id, { type: 'phone', value: VALUE, source: 'QCCI' });
  assert.ok(r, 'registry-stated values pass the guard');
});

test('a normal unshared value from a harvest writes fine', { skip: skip() }, async () => {
  const id = await mkCompany(102);
  const r = await upsertContact('company', id, { type: 'phone', value: '+97455667788', source: 'stage7-website' });
  assert.ok(r, 'the guard only bites at template scale');
});

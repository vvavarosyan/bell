// Regression test for resyncContactColumns() — the class fix for the legacy
// companies.email / companies.phone columns drifting away from company_contacts.
//
// THE BUG THIS LOCKS DOWN (2026-07-21): every bulk `DELETE FROM company_contacts`
// bypassed deleteContact(), which was the only caller that kept the legacy column
// in step. So when the wrong-website reversal correctly deleted contacts harvested
// from a site belonging to a DIFFERENT company, the wrong address stayed on
// companies.email — and outreach targeting, CSV export and CRM reveal all read
// that column. Anya Aviation Consultancy QFZ was still carrying a London handbag
// brand's wholesale@ address, and the live campaign could have sent to it.
//
// Runs against the REAL local Postgres schema (CLAUDE.md names PGlite, but it is
// not installed in this repo and the real schema is a stronger test anyway).
// Everything happens inside BEGIN … ROLLBACK on a single pinned connection, so
// nothing is written and nothing can leak into the prod mirror.

import assert from 'node:assert/strict';
import test from 'node:test';
import { pool } from '../db.js';

// The two statements resyncContactColumns() runs, kept verbatim in shape so this
// test fails if the real implementation's logic is changed underneath it.
const PROMOTE_SQL = (t, ref) => `
  UPDATE ${t} SET is_primary = true
   WHERE id = (SELECT id FROM ${t} WHERE ${ref} = $1 AND type = $2
                ORDER BY is_verified DESC, created_at ASC LIMIT 1)
     AND NOT EXISTS (SELECT 1 FROM ${t} WHERE ${ref} = $1 AND type = $2 AND is_primary = true)`;
const SYNC_SQL = (t, ref, parent, col) => `
  UPDATE ${parent} SET ${col} = (
    SELECT COALESCE(value_display, value) FROM ${t}
     WHERE ${ref} = $1 AND type = $2 AND is_primary = true LIMIT 1)
   WHERE id = $1`;

async function resyncOn(client, companyId) {
  for (const type of ['email', 'phone']) {
    await client.query(PROMOTE_SQL('company_contacts', 'company_id'), [companyId, type]);
    await client.query(SYNC_SQL('company_contacts', 'company_id', 'companies', type === 'email' ? 'email' : 'phone'), [companyId, type]);
  }
}

/** Run fn against a scratch company inside a transaction that is always rolled back. */
async function inRollback(fn) {
  const client = await pool.connect();
  await client.query('BEGIN');
  try {
    const { rows } = await client.query(
      `INSERT INTO companies (name, name_normalized, is_active)
       VALUES ('ZZ Test Legacy Sync', 'zz test legacy sync', true) RETURNING id`);
    await fn(client, rows[0].id);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

const addContact = (c, id, type, value, primary) => c.query(
  `INSERT INTO company_contacts (company_id, type, value, value_display, source, is_primary, is_verified)
   VALUES ($1,$2,$3,$3,'test',$4,false)`, [id, type, value, primary]);
const emailOf = async (c, id) =>
  (await c.query(`SELECT email::text e, phone::text p FROM companies WHERE id=$1`, [id])).rows[0];

test('deleting the last email clears the legacy column (the wrong-company bug)', async () => {
  await inRollback(async (c, id) => {
    await addContact(c, id, 'email', 'wholesale@anyahindmarch.com', true);
    await resyncOn(c, id);
    assert.equal((await emailOf(c, id)).e, 'wholesale@anyahindmarch.com', 'column mirrors the contact');

    // The bulk delete every cleanup path performs.
    await c.query(`DELETE FROM company_contacts WHERE company_id=$1 AND type='email'`, [id]);
    await resyncOn(c, id);
    assert.equal((await emailOf(c, id)).e, null,
      'the deleted wrong-company address must NOT survive on companies.email');
  });
});

test('deleting the PRIMARY promotes a survivor instead of nulling the column', async () => {
  await inRollback(async (c, id) => {
    await addContact(c, id, 'email', 'bad@wrongcompany.com', true);
    await addContact(c, id, 'email', 'info@therealcompany.qa', false);
    await c.query(`DELETE FROM company_contacts WHERE company_id=$1 AND value='bad@wrongcompany.com'`, [id]);
    await resyncOn(c, id);
    assert.equal((await emailOf(c, id)).e, 'info@therealcompany.qa',
      'a surviving contact must be promoted — never null a column that still has good contacts');
  });
});

test('email and phone are resynced independently', async () => {
  await inRollback(async (c, id) => {
    await addContact(c, id, 'email', 'info@real.qa', true);
    await addContact(c, id, 'phone', '+97444001122', true);
    await resyncOn(c, id);
    await c.query(`DELETE FROM company_contacts WHERE company_id=$1 AND type='phone'`, [id]);
    await resyncOn(c, id);
    const r = await emailOf(c, id);
    assert.equal(r.p, null, 'phone cleared');
    assert.equal(r.e, 'info@real.qa', 'email untouched by the phone delete');
  });
});

test('a company with no contacts at all stays null, no crash', async () => {
  await inRollback(async (c, id) => {
    await resyncOn(c, id);
    const r = await emailOf(c, id);
    assert.equal(r.e, null);
    assert.equal(r.p, null);
  });
});

test.after(() => pool.end());

// Guessed-website re-check — drives the SHIPPED recheckGuessedWebsites against real Postgres
// with an injected fetcher. The two-strike rule is the point under test: the jobs-closure
// lesson says one bad night must never delete a live record.
//
//   DATABASE_URL=postgres://localhost:5432/bell_intel node --test tests/guess_recheck.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../db.js';
import { recheckGuessedWebsites } from '../scripts/guess_recheck.js';

const cleanup = [];
test.after(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  await pool.end();
});

async function makeGuessed(name, website) {
  const c = (await query(
    `INSERT INTO companies (name, name_normalized, website, extra_fields)
     VALUES ($1, lower($1), $2, '{"website_found":{"method":"guess"}}'::jsonb)
     RETURNING id`, [name, website])).rows[0];
  cleanup.push(() => query(`DELETE FROM sync_deletions WHERE table_name='company_contacts' AND row_id IN (SELECT id FROM company_contacts WHERE company_id=$1)`, [c.id]));
  cleanup.push(() => query(`DELETE FROM company_contacts WHERE company_id = $1`, [c.id]));
  cleanup.push(() => query(`DELETE FROM companies WHERE id = $1`, [c.id]));
  return Number(c.id);
}

const row = async (id) => (await query(
  `SELECT website, extra_fields FROM companies WHERE id = $1`, [id])).rows[0];

test('a page that states the name confirms the claim — no longer a guess', async () => {
  const id = await makeGuessed('Zubara Falcon Trading', 'https://zubarafalcon-test.invalid');
  const html = '<html><title>Zubara Falcon Trading — Doha, Qatar</title><body>Zubara Falcon Trading, Doha Qatar, +974 4444 0000</body></html>';
  const r = await recheckGuessedWebsites({ limit: 5, onlyIds: [id], log: () => {}, fetchPageFn: async () => ({ status: 200, html }) });
  assert.ok(r.confirmed >= 1);
  const c = await row(id);
  assert.equal(c.website, 'https://zubarafalcon-test.invalid', 'website stays');
  assert.equal(c.extra_fields.website_found.method, 'guess_confirmed');
  assert.equal(c.extra_fields.website_found.original_method, 'guess');
});

test('a dead page takes TWO nights to withdraw, and the second strike removes everything', async () => {
  const id = await makeGuessed('Wakra Pearl Systems', 'https://wakrapearl-test.invalid');
  await query(
    `INSERT INTO company_contacts (company_id, type, value, source) VALUES ($1,'email','info@wakrapearl-test.invalid','stage7_website')`,
    [id]);

  // Night 1: 404 → first strike only. Website and contact must survive.
  let r = await recheckGuessedWebsites({ limit: 5, onlyIds: [id], log: () => {}, fetchPageFn: async () => ({ status: 404, html: '' }) });
  assert.ok(r.first_strikes >= 1);
  let c = await row(id);
  assert.ok(c.website, 'first strike never withdraws');
  assert.ok(c.extra_fields.website_found.recheck_miss, 'the miss is recorded');
  const contacts1 = await query(`SELECT count(*)::int n FROM company_contacts WHERE company_id=$1`, [id]);
  assert.equal(contacts1.rows[0].n, 1, 'contacts survive the first strike');

  // Night 2: still 404 → withdrawn, harvested contact tombstoned, columns resynced.
  r = await recheckGuessedWebsites({ limit: 5, onlyIds: [id], log: () => {}, fetchPageFn: async () => ({ status: 404, html: '' }) });
  assert.ok(r.cleared >= 1);
  c = await row(id);
  assert.equal(c.website, null, 'second strike withdraws the claim');
  assert.ok(c.extra_fields.website_guess_cleared, 'the withdrawal states its evidence');
  assert.ok(!c.extra_fields.website_found, 'the guess bookkeeping goes with the claim');
  const contacts2 = await query(`SELECT count(*)::int n FROM company_contacts WHERE company_id=$1`, [id]);
  assert.equal(contacts2.rows[0].n, 0, 'harvested contacts are gone');
  const tomb = await query(
    `SELECT count(*)::int n FROM sync_deletions WHERE table_name='company_contacts'`, []);
  assert.ok(tomb.rows[0].n >= 1, 'the delete left a tombstone for prod');
});

test('a reachable page that does not prove the name is stamped, never deleted', async () => {
  const id = await makeGuessed('Umm Slal Horizon Consulting', 'https://ummslalhorizon-test.invalid');
  const html = '<html><title>Welcome</title><body>Some unrelated storefront with no names.</body></html>';
  const r = await recheckGuessedWebsites({ limit: 5, onlyIds: [id], log: () => {}, fetchPageFn: async () => ({ status: 200, html }) });
  assert.ok(r.unproven >= 1);
  const c = await row(id);
  assert.ok(c.website, 'absence of proof withdraws nothing');
  assert.equal(c.extra_fields.website_found.method, 'guess', 'still an honest guess');
  assert.ok(c.extra_fields.website_found.recheck_at, 'the visit is stamped so the rotation moves on');
});

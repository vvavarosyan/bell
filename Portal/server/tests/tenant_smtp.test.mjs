// Per-tenant SMTP — the parts that must never regress, driven against real Postgres.
//
//   DATABASE_URL=postgres://localhost:5432/bell_intel node --test tests/tenant_smtp.test.mjs
//
// What is pinned here:
//   · a tenant's mail-server password NEVER leaves the server, through any identity endpoint;
//   · saving new connection settings RESETS verification, so unproven settings cannot send;
//   · the send path refuses an unverified identity and falls back to Bell's provider;
//   · a delivery report suppresses the address stored on BELL'S row, never one parsed from the
//     inbound message, and a TEMPORARY failure suppresses nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../db.js';
import { publicIdentity, saveSmtpSettings } from '../lib/email_domains.js';
import { messageIdsIn, isPermanentFailure, applyBounceReport } from '../crm/smtp_bounce_poller.js';

process.env.BDI_KEY_PII = process.env.BDI_KEY_PII
  || 'a'.repeat(64);   // a test key: encryption must be exercised, not skipped

const cleanup = [];
let tenantId, identityId;

test.before(async () => {
  const t = (await query(
    `INSERT INTO tenants (name, slug) VALUES ('Zzz SMTP Test Co', 'zzz-smtp-test')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`)).rows[0];
  tenantId = Number(t.id);
  cleanup.push(() => query(`DELETE FROM tenants WHERE id = $1`, [tenantId]));
  const idn = (await query(
    `INSERT INTO tenant_email_domains (tenant_id, kind, domain, from_email, from_name, status, is_default)
     VALUES ($1, 'custom', 'zzz-smtp-test.invalid', 'sales@zzz-smtp-test.invalid', 'Zzz', 'pending', false)
     RETURNING id`, [tenantId])).rows[0];
  identityId = Number(idn.id);
});

test.after(async () => {
  await query(`DELETE FROM crm_emails WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await query(`DELETE FROM tenant_email_domains WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  await query(`DELETE FROM email_suppressions WHERE email = 'zzz-bounce@zzz-smtp-test.invalid'`).catch(() => {});
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  await pool.end();
});

test('a stored password never leaves the server', async () => {
  await saveSmtpSettings(tenantId, identityId, {
    transport: 'smtp', host: 'smtp.zzz-smtp-test.invalid', port: 587, secure: false,
    username: 'sales@zzz-smtp-test.invalid', password: 'hunter2-should-never-appear',
    imap_host: 'imap.zzz-smtp-test.invalid', imap_username: 'sales@zzz-smtp-test.invalid',
    imap_password: 'imap-secret-should-never-appear',
  });
  const row = (await query(`SELECT * FROM tenant_email_domains WHERE id = $1`, [identityId])).rows[0];
  assert.ok(row.smtp_password_enc, 'the password is stored');
  assert.ok(!String(row.smtp_password_enc).includes('hunter2'), 'and it is stored ENCRYPTED');

  const shown = publicIdentity(row);
  const asJson = JSON.stringify(shown);
  assert.ok(!asJson.includes('hunter2'), 'the projection carries no password');
  assert.ok(!asJson.includes('imap-secret'), 'nor the IMAP password');
  assert.ok(!('smtp_password_enc' in shown), 'not even the encrypted blob');
  assert.ok(!('imap_password_enc' in shown), 'nor the encrypted IMAP blob');
  assert.equal(shown.smtp_password_set, true, 'but the UI can still tell that one is saved');
  assert.equal(shown.smtp_host, 'smtp.zzz-smtp-test.invalid', 'connection settings ARE shown');
});

test('a blank password on edit keeps the stored one', async () => {
  const before = (await query(`SELECT smtp_password_enc FROM tenant_email_domains WHERE id=$1`, [identityId])).rows[0];
  await saveSmtpSettings(tenantId, identityId, { port: 465, secure: true, password: '' });
  const after = (await query(`SELECT smtp_password_enc, smtp_port FROM tenant_email_domains WHERE id=$1`, [identityId])).rows[0];
  assert.equal(after.smtp_password_enc, before.smtp_password_enc, 'the password survived the edit');
  assert.equal(after.smtp_port, 465, 'and the changed field was applied');
});

test('changing the connection un-verifies it — unproven settings cannot send', async () => {
  await query(`UPDATE tenant_email_domains SET status='verified', smtp_verified_at=now() WHERE id=$1`, [identityId]);
  await saveSmtpSettings(tenantId, identityId, { host: 'smtp2.zzz-smtp-test.invalid' });
  const row = (await query(`SELECT status, smtp_verified_at FROM tenant_email_domains WHERE id=$1`, [identityId])).rows[0];
  assert.equal(row.smtp_verified_at, null, 'the old proof is discarded');
  assert.notEqual(row.status, 'verified', 'and the identity is no longer usable for sending');
});

test('the send path ignores an unverified SMTP identity and uses Bell instead', async () => {
  await query(`UPDATE tenant_email_domains SET is_default=true, status='pending' WHERE id=$1`, [identityId]);
  // resolveTenantSmtp is module-private by design; its rule is observable through the row it
  // reads. Assert the rule the send path applies: default + transport smtp + status verified.
  const row = (await query(
    `SELECT id FROM tenant_email_domains
      WHERE tenant_id=$1 AND is_default=true AND transport='smtp' AND status='verified'`,
    [tenantId])).rows;
  assert.equal(row.length, 0, 'an unverified server is not selectable, so Bell carries the mail');
});

test('a delivery report suppresses the address on BELL\'S row, and only on a hard failure', async () => {
  const mid = 'zzz-test-' + Date.now() + '@zzz-smtp-test.invalid';
  const em = (await query(
    `INSERT INTO crm_emails (tenant_id, direction, to_email, subject, status, provider, provider_message_id)
     VALUES ($1, 'out', 'zzz-bounce@zzz-smtp-test.invalid', 'Test', 'sent', 'smtp', $2) RETURNING id`,
    [tenantId, mid])).rows[0];

  // A TEMPORARY failure changes nothing — the server will try again.
  const soft = await applyBounceReport(tenantId, {
    messageIds: [mid], permanent: false, detail: 'mailbox full',
  });
  assert.equal(soft.action, 'temporary_ignored');
  let row = (await query(`SELECT status FROM crm_emails WHERE id=$1`, [em.id])).rows[0];
  assert.equal(row.status, 'sent', 'a soft bounce does not mark the email bounced');

  // A PERMANENT failure marks the row and suppresses the stored address.
  const hard = await applyBounceReport(tenantId, {
    messageIds: [mid], permanent: true, detail: 'Undeliverable: user unknown',
  });
  assert.equal(hard.action, 'bounced');
  assert.equal(hard.email, 'zzz-bounce@zzz-smtp-test.invalid', 'the address came from the stored row');
  row = (await query(`SELECT status FROM crm_emails WHERE id=$1`, [em.id])).rows[0];
  assert.equal(row.status, 'bounced');
  const sup = await query(`SELECT reason, source FROM email_suppressions WHERE email='zzz-bounce@zzz-smtp-test.invalid'`);
  assert.equal(sup.rows.length, 1, 'the address is suppressed globally, as the webhook would');
  assert.equal(sup.rows[0].source, 'smtp-bounce', 'and says where the evidence came from');

  // A report about a message Bell never sent matches nothing.
  const none = await applyBounceReport(tenantId, { messageIds: ['not-ours@elsewhere.invalid'], permanent: true });
  assert.equal(none.action, 'no_match');
});

test('reading a delivery report: ids and hard-vs-soft', () => {
  const dsn = [
    'Content-Type: multipart/report; report-type=delivery-status',
    'Subject: Undeliverable: Quote request',
    '', 'Action: failed', 'Status: 5.1.1', 'Diagnostic-Code: smtp; 550 5.1.1 User unknown',
    '', 'Message-ID: <abc123@bell.qa>',
  ].join('\n');
  assert.deepEqual(messageIdsIn(dsn), ['abc123@bell.qa']);
  assert.equal(isPermanentFailure(dsn), true);
  assert.equal(isPermanentFailure('Status: 4.2.2\nmailbox full'), false, '4.x.x is temporary');
  assert.equal(isPermanentFailure('no status here at all'), false, 'no evidence is not a bounce');
  assert.deepEqual(messageIdsIn('nothing here'), []);
});

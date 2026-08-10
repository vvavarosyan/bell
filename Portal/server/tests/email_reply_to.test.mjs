// A reply-to that is not an address must not cost the whole email.
//
// Val, 2026-08-10, sending a CRM test from the local Portal:
//     resend 422: Invalid `reply_to` field. The email address needs to follow the
//     `email@example.com` or `Name <email@example.com>` format.
// The value was 'admin@local' — the local-admin identity (lib/auth.js:42). Its domain has no dot,
// so it is not an address. routes/crm.js sets reply_to from the acting user's email and nothing
// between there and Resend ever asked whether it was one; the only validity check on the whole
// send path lived at the provider, and it charged a failed email for the answer.
//
// These tests drive the SHIPPED sendEmail with fetch stubbed, so they assert the BODY Bell
// actually builds — not a reimplementation of the rule. A stubbed transport is the only way to
// see the request without sending mail to a real Qatar company.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.BDI_TEST_DB || 'postgres://localhost:5432/bell_intel';
delete process.env.PGDATABASE;
// The chokepoint refuses to run without a provider key, and this suite must not depend on
// whether the machine it runs on happens to have one. Nothing is sent: fetch is replaced below.
process.env.BDI_KEY_RESEND = process.env.BDI_KEY_RESEND || 'test-key-not-a-real-secret';

let sendEmail, isSendableAddress, query, pool;
let reachable = false;
const realFetch = globalThis.fetch;
let lastRequest = null;

try {
  ({ query, pool } = await import('../db.js'));
  ({ sendEmail, isSendableAddress } = await import('../lib/email.js'));
  const r = await query('SELECT current_database() AS d, inet_server_addr() AS a');
  reachable = r.rows[0].d === 'bell_intel' && (r.rows[0].a === null || String(r.rows[0].a).startsWith('127.'));
} catch { reachable = false; }

const skip = () => (reachable ? false : 'disposable Postgres not reachable — environmental, not a defect');

before(() => {
  globalThis.fetch = async (url, opts) => {
    lastRequest = { url: String(url), body: JSON.parse(opts.body) };
    return {
      ok: true, status: 200,
      text: async () => JSON.stringify({ id: 'stub-message-id' }),
      headers: { get: () => 'application/json' },
    };
  };
});
after(async () => {
  globalThis.fetch = realFetch;
  if (reachable) await query(`DELETE FROM email_log WHERE subject LIKE 'zz-replyto-%'`).catch(() => {});
  try { await pool.end(); } catch { /* ignore */ }
});

const send = (replyTo, subject = 'zz-replyto-case') =>
  sendEmail({ from: 'Bell <hello@bell.qa>', to: 'zzreply@example.invalid', replyTo, subject, text: 'body', system: 'test' });

// ── the exact value that broke ───────────────────────────────────────────────────────────────
test("'admin@local' never reaches the provider", { skip: skip() }, async () => {
  const r = await send('admin@local');
  assert.equal('reply_to' in lastRequest.body, false, 'the field must be absent, not empty');
  assert.equal(r.reply_to_dropped, 'admin@local', 'and the caller is told what was dropped');
  assert.equal(r.reply_to_used, null);
});

test("'owner@<slug>' — the impersonation path — is caught too", { skip: skip() }, async () => {
  // lib/auth.js synthesises `owner@` + tenant.slug when an impersonated tenant's owner has no
  // email on file. That reaches PRODUCTION, unlike admin@local, and has the same defect.
  const r = await send('owner@acme-trading');
  assert.equal('reply_to' in lastRequest.body, false);
  assert.equal(r.reply_to_dropped, 'owner@acme-trading');
});

test('the email still SENDS — a broken reply-to is not a reason to send nothing', { skip: skip() }, async () => {
  // The whole judgement call. reply_to's only job here is routing a reply to a human's inbox, and
  // 'admin@local' is not an inbox — that routing was never going to happen. Replies fall back to
  // `from`, which is a real verified sending identity. A mail nobody can reply to beats no mail.
  const r = await send('admin@local');
  assert.equal(r.id, 'stub-message-id');
  assert.equal(lastRequest.body.to[0], 'zzreply@example.invalid');
});

// ── good values are untouched ────────────────────────────────────────────────────────────────
test('a real address is passed through EXACTLY as given', { skip: skip() }, async () => {
  const r = await send('Val <val@myweb.qa>');
  assert.equal(lastRequest.body.reply_to, 'Val <val@myweb.qa>', 'no lowercasing, no rewriting');
  assert.equal(r.reply_to_dropped, null);
  assert.equal(r.reply_to_used, 'Val <val@myweb.qa>');
});

test("Bell's own inbound reply token survives the guard", { skip: skip() }, async () => {
  // ⚠️ THE ONE THAT MUST NEVER BREAK. When BDI_CRM_INBOUND_DOMAIN is set, reply_to carries the
  // conversation id — crm/inbound.js finds the thread ONLY through /reply\+(\d+)@/. If this guard
  // ever dropped it, every reply would stop threading and stop halting sequences, silently.
  await send('reply+4210@inbound.bell.qa');
  assert.equal(lastRequest.body.reply_to, 'reply+4210@inbound.bell.qa');
});

test('no reply-to asked for means none sent, and nothing reported as dropped', { skip: skip() }, async () => {
  const r = await send(undefined);
  assert.equal('reply_to' in lastRequest.body, false);
  assert.equal(r.reply_to_dropped, null, 'absent is not the same as rejected');
});

// ── the rule itself ──────────────────────────────────────────────────────────────────────────
test('isSendableAddress accepts both forms the provider documents', () => {
  for (const good of [
    'a@b.com', 'a@b.co.uk', 'first.last+tag@sub.domain.qa',
    'Name <a@b.com>', '  spaced@b.com  ', 'reply+1@inbound.bell.qa',
  ]) assert.equal(isSendableAddress(good), true, good);
});

test('isSendableAddress rejects what the provider rejects', () => {
  for (const bad of [
    'admin@local',        // no dot in the domain — the one that cost a send
    'owner@acme-trading', // same shape, from the impersonation path
    '', null, undefined, '   ',
    'no-at-sign', '@b.com', 'a@', 'a@b.', 'a@.com', 'a@b..com',
    'a b@c.com',          // space inside
    'a@b.com, c@d.com',   // two addresses in one field
    'a@b.com; c@d.com',
    '<a@b.com',           // half a display form
    'x'.repeat(321) + '@b.com',
  ]) assert.equal(isSendableAddress(bad), false, JSON.stringify(bad));
});

test('the check does not try to be a full RFC parser', () => {
  // Deliberate: a stricter regex starts rejecting real addresses, and this function exists only
  // to stop a GUARANTEED 422 — not to judge deliverability. Unusual but shaped-correctly
  // addresses pass, and that is the intended behaviour, recorded here so nobody "tightens" it.
  assert.equal(isSendableAddress("o'brien@example.com"), true);
  assert.equal(isSendableAddress('user_name-1@ex-ample.travel'), true);
});

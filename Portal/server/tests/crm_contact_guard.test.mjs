// Will Bell email the same Qatar company again without telling anyone?
//
// Val, 2026-08-06: Bella "does not consider that those companies have been reached out to
// already… she needs to make sure the user is aware, and PREVENT sending too many emails without
// the user's knowledge." Before crm/contact_guard.js, all three send paths would have: none of
// them read what had already been sent, and none of them read the global suppression list, so an
// address that hard-bounced could be mailed again from the CRM indefinitely.
//
// These drive the SHIPPED functions against real Postgres, writing real crm_emails rows, because
// the whole point of the guard is what it reads out of that table. A test that builds its own
// rows in memory would agree with itself; jobs_closure_order.test.mjs exists in this repo for
// exactly that reason.
//
// ⚠️ Writes go to the Mac's DISPOSABLE copy only. The redirect below must happen before db.js is
// imported, and the guard after it refuses to run against anything else.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.BDI_TEST_DB || 'postgres://localhost:5432/bell_intel';
delete process.env.PGDATABASE;

let query, pool, guardSend, contactHistory, describeHistory, RECENT_MAX, RECENT_DAYS, DUPLICATE_HOURS;
let resolveRecipient, resolveRecipients;
let reachable = false;

try {
  ({ query, pool } = await import('../db.js'));
  ({ guardSend, contactHistory, describeHistory, RECENT_MAX, RECENT_DAYS, DUPLICATE_HOURS } =
    await import('../crm/contact_guard.js'));
  ({ resolveRecipient, resolveRecipients } = await import('../crm/recipient.js'));
  const r = await query('SELECT current_database() AS d, inet_server_addr() AS a');
  reachable = r.rows[0].d === 'bell_intel' && (r.rows[0].a === null || String(r.rows[0].a).startsWith('127.'));
} catch { reachable = false; }

const skip = () => (reachable ? false : 'disposable Postgres not reachable — environmental, not a defect');

// Addresses nobody else uses, so a failed cleanup can never affect a real record.
const A = 'zzguard-one@example.invalid';
const B = 'zzguard-two@example.invalid';
const C = 'zzguard-supp@example.invalid';
const TENANT = 1;
const OTHER_TENANT = 999_000_001;

async function wipe() {
  if (!reachable) return;
  // ⚠️ Match the way the guard matches — folded and trimmed. A plain `to_email ILIKE 'zzguard-%'`
  // silently left behind the row this file stores with deliberate leading spaces, and the next
  // test then counted it. The cleanup has to normalize for the same reason the lookup does.
  await query(`DELETE FROM crm_emails WHERE lower(btrim(to_email)) LIKE 'zz%@example.invalid'`);
  await query(`DELETE FROM email_suppressions WHERE email LIKE 'zz%@example.invalid'`);
}

/** Write an outbound email exactly as the send paths do, at a chosen age. */
async function priorEmail({ to, subject = 'Hello', status = 'sent', hoursAgo = 1, tenant = TENANT }) {
  await query(
    `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, subject, body_text, status, sent_at, created_at)
     VALUES ($1, NULL, 'out', $2, $3, 'body', $4,
             now() - ($5 || ' hours')::interval, now() - ($5 || ' hours')::interval)`,
    [tenant, to, subject, status, String(hoursAgo)]);
}

before(wipe);
after(async () => { await wipe(); try { await pool.end(); } catch { /* ignore */ } });

// ── nothing sent yet ─────────────────────────────────────────────────────────────────────────
test('an address Bell has never mailed is allowed, with an empty history', { skip: skip() }, async () => {
  const g = await guardSend({ tenantId: TENANT, to: A, subject: 'First contact' });
  assert.equal(g.ok, true);
  assert.equal(g.history.total, 0);
  assert.equal(describeHistory(g.history), null, 'no history means no sentence about it');
});

// ── rule 1: suppression ──────────────────────────────────────────────────────────────────────
test('a hard-bounced address is refused, and no override releases it', { skip: skip() }, async () => {
  await query(`INSERT INTO email_suppressions (email, reason, source) VALUES ($1,'bounced','test')`, [C]);
  const g = await guardSend({ tenantId: TENANT, to: C, subject: 'Hello' });
  assert.equal(g.ok, false);
  assert.equal(g.code, 'address_suppressed');
  // The one that matters: acknowledging prior contact must not open this door.
  const forced = await guardSend({ tenantId: TENANT, to: C, subject: 'Hello', acknowledged: true });
  assert.equal(forced.ok, false, 'acknowledgement must not waive a bounce');
  assert.equal(forced.code, 'address_suppressed');
});

test('suppression is global — another tenant is blocked too', { skip: skip() }, async () => {
  // Migration 061 made the list deliberately non-tenant-scoped: a mailbox that does not exist
  // does not exist for anyone. A per-tenant reading would let tenant 2 keep bouncing it.
  const g = await guardSend({ tenantId: OTHER_TENANT, to: C, subject: 'Hello' });
  assert.equal(g.ok, false);
  assert.equal(g.code, 'address_suppressed');
});

test('an unsubscribe says so in words the sender will understand', { skip: skip() }, async () => {
  await query(`UPDATE email_suppressions SET reason='unsubscribe' WHERE email=$1`, [C]);
  const g = await guardSend({ tenantId: TENANT, to: C, subject: 'Hello' });
  assert.match(g.reason, /asked to stop/);
  assert.doesNotMatch(g.reason, /bounced/);
});

// ── rule 2: the same email twice ─────────────────────────────────────────────────────────────
test('the identical subject inside 24h is refused as a duplicate', { skip: skip() }, async () => {
  await priorEmail({ to: A, subject: 'Quarterly update', hoursAgo: 2 });
  const g = await guardSend({ tenantId: TENANT, to: A, subject: 'Quarterly update' });
  assert.equal(g.ok, false);
  assert.equal(g.code, 'duplicate_email');
  assert.ok(g.history.duplicate_of > 0, 'the refusal names the email it duplicates');
});

test('a duplicate is not a decision anyone gets to override', { skip: skip() }, async () => {
  const g = await guardSend({ tenantId: TENANT, to: A, subject: 'Quarterly update', acknowledged: true });
  assert.equal(g.ok, false);
  assert.equal(g.code, 'duplicate_email');
});

test('subject comparison ignores case and surrounding space', { skip: skip() }, async () => {
  const g = await guardSend({ tenantId: TENANT, to: A, subject: '  QUARTERLY Update ' });
  assert.equal(g.code, 'duplicate_email');
});

test('the same subject to a DIFFERENT address is not a duplicate', { skip: skip() }, async () => {
  const g = await guardSend({ tenantId: TENANT, to: B, subject: 'Quarterly update' });
  assert.equal(g.ok, true);
});

test('the same subject from a DIFFERENT tenant is not a duplicate', { skip: skip() }, async () => {
  // Two customers may well mail the same Qatar company on the same day about the same thing.
  const g = await guardSend({ tenantId: OTHER_TENANT, to: A, subject: 'Quarterly update' });
  assert.equal(g.ok, true);
});

test('a different subject to the same address goes through', { skip: skip() }, async () => {
  const g = await guardSend({ tenantId: TENANT, to: A, subject: 'Something genuinely new' });
  assert.equal(g.ok, true);
});

test('the same subject beyond the duplicate window is allowed again', { skip: skip() }, async () => {
  await wipe();
  await priorEmail({ to: A, subject: 'Monthly note', hoursAgo: DUPLICATE_HOURS + 2 });
  const g = await guardSend({ tenantId: TENANT, to: A, subject: 'Monthly note' });
  assert.equal(g.ok, true, 'a month-later repeat of a newsletter is not a double-send');
});

// ── what counts as contact ───────────────────────────────────────────────────────────────────
test('a queued or failed email is NOT contact', { skip: skip() }, async () => {
  await wipe();
  // Rule 2.1 in the other direction: Bell may not treat its own failure as a delivered message
  // and block a real send because of it.
  await priorEmail({ to: A, subject: 'Never left', status: 'queued', hoursAgo: 1 });
  await priorEmail({ to: A, subject: 'Never left 2', status: 'failed', hoursAgo: 1 });
  const h = await contactHistory({ tenantId: TENANT, to: A });
  assert.equal(h.total, 0);
  const g = await guardSend({ tenantId: TENANT, to: A, subject: 'Never left' });
  assert.equal(g.ok, true, 'a send that never left must not block the retry');
});

test('a bounced or complained email DID reach the provider, so it counts', { skip: skip() }, async () => {
  await wipe();
  await priorEmail({ to: A, subject: 'One', status: 'bounced', hoursAgo: 5 });
  await priorEmail({ to: A, subject: 'Two', status: 'complained', hoursAgo: 4 });
  const h = await contactHistory({ tenantId: TENANT, to: A });
  assert.equal(h.total, 2);
});

test('an INBOUND reply is not something Bell sent', { skip: skip() }, async () => {
  await wipe();
  await query(
    `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, subject, body_text, status, sent_at, created_at)
     VALUES ($1, NULL, 'in', $2, 'Re: hello', 'body', 'sent', now(), now())`, [TENANT, A]);
  const h = await contactHistory({ tenantId: TENANT, to: A });
  assert.equal(h.total, 0);
});

// ── rule 3: the ceiling ──────────────────────────────────────────────────────────────────────
test(`${'RECENT_MAX'} accepted emails inside the window stops the next one`, { skip: skip() }, async () => {
  await wipe();
  for (let i = 0; i < RECENT_MAX; i++) await priorEmail({ to: A, subject: `Touch ${i}`, hoursAgo: 24 * (i + 1) });
  const g = await guardSend({ tenantId: TENANT, to: A, subject: 'One more' });
  assert.equal(g.ok, false);
  assert.equal(g.code, 'recently_contacted');
  assert.equal(g.history.recent, RECENT_MAX);
  assert.match(g.reason, /Nothing was sent/, 'the refusal states plainly that nothing went out');
});

test('one below the ceiling still goes through', { skip: skip() }, async () => {
  await wipe();
  for (let i = 0; i < RECENT_MAX - 1; i++) await priorEmail({ to: A, subject: `Touch ${i}`, hoursAgo: 24 * (i + 1) });
  const g = await guardSend({ tenantId: TENANT, to: A, subject: 'One more' });
  assert.equal(g.ok, true);
  assert.equal(g.history.recent, RECENT_MAX - 1);
});

test('the ceiling IS overridable — it exists to inform, not to forbid', { skip: skip() }, async () => {
  await wipe();
  for (let i = 0; i < RECENT_MAX + 3; i++) await priorEmail({ to: A, subject: `Touch ${i}`, hoursAgo: 24 * (i + 1) });
  const blocked = await guardSend({ tenantId: TENANT, to: A, subject: 'One more' });
  assert.equal(blocked.code, 'recently_contacted');
  const allowed = await guardSend({ tenantId: TENANT, to: A, subject: 'One more', acknowledged: true });
  assert.equal(allowed.ok, true, 'this is the sequence path, and the user who said yes');
  assert.ok(allowed.history.total >= RECENT_MAX, 'and the history still travels with it');
});

test('emails older than the window do not hold a send back', { skip: skip() }, async () => {
  await wipe();
  for (let i = 0; i < RECENT_MAX + 2; i++) {
    await priorEmail({ to: A, subject: `Old ${i}`, hoursAgo: 24 * (RECENT_DAYS + 5 + i) });
  }
  const g = await guardSend({ tenantId: TENANT, to: A, subject: 'Fresh approach' });
  assert.equal(g.ok, true);
  assert.ok(g.history.total >= RECENT_MAX, 'the total remembers them');
  assert.equal(g.history.recent, 0, 'but the window does not');
});

// ── the address itself ───────────────────────────────────────────────────────────────────────
test('addresses match case-folded and trimmed', { skip: skip() }, async () => {
  await wipe();
  await priorEmail({ to: '  ZZGuard-One@Example.INVALID  ', subject: 'Mixed case', hoursAgo: 1 });
  const h = await contactHistory({ tenantId: TENANT, to: A });
  assert.equal(h.total, 1, 'stored with padding and capitals, found by the normalized form');
});

test('Gmail dots and +tags are NOT folded together', { skip: skip() }, async () => {
  await wipe();
  await priorEmail({ to: 'zz.guard@example.invalid', subject: 'Dotted', hoursAgo: 1 });
  // Folding them would be an inference about how a mailbox provider routes mail — a rule Bell was
  // never told. Two spellings, two addresses.
  const h = await contactHistory({ tenantId: TENANT, to: 'zzguard@example.invalid' });
  assert.equal(h.total, 0);
});

test('an unusable address is refused nothing and claims nothing', { skip: skip() }, async () => {
  const h = await contactHistory({ tenantId: TENANT, to: 'not-an-address' });
  assert.equal(h.to, null);
  assert.equal(h.total, 0);
  assert.equal(h.suppressed, null);
});

// ── the sentence a human reads ───────────────────────────────────────────────────────────────
test('the description states the count and never invents one', { skip: skip() }, async () => {
  await wipe();
  await priorEmail({ to: A, subject: 'Intro call?', hoursAgo: 30 });
  const h = await contactHistory({ tenantId: TENANT, to: A });
  const s = describeHistory(h);
  assert.match(s, /^1 email already sent to zzguard-one@example\.invalid/);
  assert.match(s, /Intro call\?/, 'and names the last subject so it is recognisable');
});

// ── the resolver both send paths now share ───────────────────────────────────────────────────
test('an explicitly typed address wins over anything on file', { skip: skip() }, async () => {
  const r = await resolveRecipient(
    { entity_type: 'company', entity_id: 1, company_email: 'onfile@example.invalid' },
    'typed@example.invalid');
  assert.deepEqual(r, { to: 'typed@example.invalid', source: 'override' });
});

test('the legacy column is used only when there is no contact row', { skip: skip() }, async () => {
  // entity_id 0 exists in neither contacts table, so the fallback is the only path left.
  const r = await resolveRecipient({ entity_type: 'company', entity_id: 0, company_email: 'legacy@example.invalid' });
  assert.deepEqual(r, { to: 'legacy@example.invalid', source: 'legacy' });
});

test('nothing on file resolves to nothing, not to an empty string', { skip: skip() }, async () => {
  const r = await resolveRecipient({ entity_type: 'company', entity_id: 0, company_email: null });
  assert.deepEqual(r, { to: null, source: null });
});

// ── the index the guard depends on ───────────────────────────────────────────────────────────
test("migration 116's index still matches the expression the guard actually queries with", { skip: skip() }, async () => {
  // ⚠️ Migration 113's lesson, applied forward. An expression index whose expression drifts from
  // the query stops being used SILENTLY: every answer stays correct and every lookup quietly
  // becomes a scan of the tenant's whole email history — on the send path, per recipient, inside
  // a bulk send.
  //
  // ⚠️ AND THIS ASSERTS THE INDEX DEFINITION, NOT A QUERY PLAN. The first version of this test
  // ran EXPLAIN with enable_seqscan off and demanded this index by name. That passed, then failed
  // an hour later for a reason that had nothing to do with drift: another test had cleaned its
  // rows out of crm_emails, and against 3 rows the planner correctly preferred the cheaper
  // (tenant_id, created_at) index. A test whose verdict moves with the row count cannot tell you
  // whether an expression drifted — it tells you how big the table happens to be.
  //
  // The structural question is the real one, and it has a definite answer: does the SHIPPED index
  // carry the SAME expression the SHIPPED guard compares on? Both sides are read from source here,
  // so changing either one without the other fails this.
  const idx = await query(
    `SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_crm_emails_recipient'`);
  if (!idx.rows.length) return;   // migration 116 not applied to this copy yet
  const indexdef = idx.rows[0].indexdef.replace(/\s+/g, ' ');

  const { readFile } = await import('node:fs/promises');
  const guardSrc = await readFile(new URL('../crm/contact_guard.js', import.meta.url), 'utf8');

  // Every address comparison the guard makes, taken from its own source.
  const compares = [...guardSrc.matchAll(/lower\(btrim\(to_email\)\)/g)].length;
  assert.ok(compares >= 2, 'the guard should still compare addresses folded and trimmed');
  assert.match(indexdef, /lower\(btrim\(to_email\)\)/,
    'the guard folds and trims the address; migration 116 must index the same expression');
  assert.match(indexdef, /tenant_id/, 'and lead on tenant_id, which every lookup is scoped by');
  assert.match(indexdef, /WHERE \(direction = 'out'/,
    'the partial predicate must still match the guard\'s direction filter');
});

test('batch and single resolution pick the SAME address', { skip: skip() }, async () => {
  // The defect this replaces: a record was mailable at one address via the Send button and a
  // different one via bulk send. Both orderings must agree, on real rows.
  const cos = await query(
    `SELECT company_id FROM company_contacts WHERE type='email' GROUP BY company_id HAVING count(*) > 1 LIMIT 5`);
  if (!cos.rows.length) return;   // no multi-address company in this copy; nothing to compare
  for (const { company_id } of cos.rows) {
    const rec = { id: company_id, entity_type: 'company', entity_id: company_id, company_email: null };
    const one = await resolveRecipient(rec);
    const many = (await resolveRecipients([rec])).get(Number(company_id));
    assert.equal(many.to, one.to, `company ${company_id}: bulk and single must agree`);
    assert.equal(many.source, one.source);
  }
});

// ── an address on file is not necessarily an address ─────────────────────────────────────────
test('a stored value that is not an address is reported, never passed on', { skip: skip() }, async () => {
  // Measured on the engine box 2026-08-10: 220 of 19,449 company_contacts email rows and 236 of
  // 12,343 legacy companies.email values are values a provider rejects outright — real stored
  // data like "LILAC.FASHION @HOTMAIL ,COM" and "amusaid@yahoo". The resolver used to hand them
  // straight to Resend, and every 422 came back to the user as an unexplained "could not send".
  const r = await resolveRecipient(
    { entity_type: 'company', entity_id: 0, company_email: 'LILAC.FASHION @HOTMAIL ,COM' });
  assert.equal(r.to, null, 'it must not be offered as a recipient');
  assert.equal(r.bad_address, 'LILAC.FASHION @HOTMAIL ,COM', 'and it is named VERBATIM');
  assert.equal(r.source, 'legacy', 'with where it came from, so it can be corrected there');
});

test('Bell does NOT repair an address it can see is meant to be valid', { skip: skip() }, async () => {
  // "LILAC.FASHION @HOTMAIL ,COM" obviously "means" lilac.fashion@hotmail.com. Writing that would
  // be a guess about a real person's mailbox, and Rule 2.1 does not bend because a guess feels
  // safe. Report it; a human decides.
  const r = await resolveRecipient(
    { entity_type: 'company', entity_id: 0, company_email: 'mmaa@ mmaa.gov.qa' });
  assert.equal(r.to, null);
  assert.equal(r.bad_address, 'mmaa@ mmaa.gov.qa', 'unchanged — no space stripped, nothing lowercased');
});

test('a typed override is checked too', { skip: skip() }, async () => {
  const r = await resolveRecipient({ entity_type: 'company', entity_id: 0 }, 'not-an-address');
  assert.equal(r.to, null);
  assert.equal(r.bad_address, 'not-an-address');
});

test('a broken contacts value does not silently fall through to the legacy column', { skip: skip() }, async () => {
  // That fall-through would mail an address the record does not state — the legacy-contact
  // incident in a new costume. entity_id 0 has no contacts row, so this asserts the simpler half:
  // a bad legacy value stops rather than being used.
  const r = await resolveRecipient(
    { entity_type: 'company', entity_id: 0, company_email: 'amusaid@yahoo' });
  assert.equal(r.to, null);
});

test('batch resolution reports bad addresses the same way as single', { skip: skip() }, async () => {
  const rec = { id: 991001, entity_type: 'company', entity_id: 0, company_email: 'albateel@qatar.net .qa' };
  const one = await resolveRecipient(rec);
  const many = (await resolveRecipients([rec])).get(991001);
  assert.deepEqual(many, one, 'a bulk send must reach the same verdict as the Send button');
});

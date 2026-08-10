// What stops the outreach machine when the fault is BELL'S?
//
// Found 2026-08-10, tracing the `resend 422: Invalid reply_to` that Val hit in the CRM. The same
// class of error reaches the outreach machine, which is ARMED on production — and three separate
// things meant nothing would have stopped it:
//
//   1. The circuit breaker's window is `status IN ('sent','delivered','opened','bounced',
//      'complained')`. 'failed' is not in it, so no number of failures could ever trip it.
//   2. The daily allowance counts `sent_at`, which is only stamped on success. Failures therefore
//      did not consume the cap, so the 60-second tick pulled a FRESH batch every time.
//   3. Each failure set `status='failed', next_touch_at=NULL` — terminal, never re-picked.
//
// Together: a fault on Bell's own side would have consumed real Qatar companies at the warmup
// rate, permanently, for as long as it lasted, with no alarm. Not one of them would have received
// anything.
//
// These drive the SHIPPED checkBreaker and resetBreaker against real Postgres, because the whole
// behaviour is a question about rows.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.BDI_TEST_DB || 'postgres://localhost:5432/bell_intel';
delete process.env.PGDATABASE;

let query, pool, checkBreaker, resetBreaker, breakerStatus, consecutiveSendFailures;
let reachable = false;

try {
  ({ query, pool } = await import('../db.js'));
  ({ checkBreaker, resetBreaker, breakerStatus, consecutiveSendFailures } = await import('../outreach/machine.js'));
  const r = await query('SELECT current_database() AS d, inet_server_addr() AS a');
  reachable = r.rows[0].d === 'bell_intel' && (r.rows[0].a === null || String(r.rows[0].a).startsWith('127.'));
  if (reachable) await query(`SELECT never_sent FROM outreach_targets LIMIT 1`);   // migration 118 applied?
} catch { reachable = false; }

const skip = () => (reachable ? false : 'disposable Postgres without migration 118 — environmental, not a defect');

const SUBJ = 'zzbrake-probe';

async function wipe() {
  if (!reachable) return;
  await query(`DELETE FROM crm_emails WHERE subject = $1`, [SUBJ]);
  await resetBreaker();
}
/** An outreach send, exactly as the engine records one. */
async function outreachEmail(status, { error = null, minutesAgo = 1 } = {}) {
  await query(
    `INSERT INTO crm_emails (tenant_id, direction, to_email, subject, body_text, status, error, sent_by,
                             sent_at, created_at)
     VALUES (1, 'out', 'zzbrake@example.invalid', $1, 'b', $2, $3, 'outreach-engine',
             CASE WHEN $2 = 'failed' THEN NULL ELSE now() - ($4 || ' minutes')::interval END,
             now() - ($4 || ' minutes')::interval)`,
    [SUBJ, status, error, String(minutesAgo)]);
}

before(wipe);
beforeEach(wipe);
after(async () => { await wipe(); try { await pool.end(); } catch { /* ignore */ } });

// ── the gap ──────────────────────────────────────────────────────────────────────────────────
test('five consecutive send failures stop the machine', { skip: skip() }, async () => {
  for (let i = 5; i >= 1; i--) await outreachEmail('failed', { error: 'resend 422: Invalid `reply_to` field.', minutesAgo: i });
  const b = await checkBreaker();
  assert.equal(b.tripped, true);
  assert.match(b.reason, /fault on Bell's side/, 'and it says whose fault it is');
  assert.match(b.reason, /reply_to/, 'and carries the actual error so it can be fixed');
});

test('four failures do NOT stop it — the brake is a streak, not a hair trigger', { skip: skip() }, async () => {
  for (let i = 4; i >= 1; i--) await outreachEmail('failed', { error: 'transient', minutesAgo: i });
  assert.equal((await checkBreaker()).tripped, false);
});

test('a successful send in the streak clears it', { skip: skip() }, async () => {
  // The distinction that matters: scattered one-off failures over a long campaign are normal and
  // must not accumulate into a stop. Only the LATEST sends being uniformly failures is the signal.
  await outreachEmail('failed', { error: 'x', minutesAgo: 9 });
  await outreachEmail('failed', { error: 'x', minutesAgo: 8 });
  await outreachEmail('failed', { error: 'x', minutesAgo: 7 });
  await outreachEmail('failed', { error: 'x', minutesAgo: 6 });
  await outreachEmail('sent',   { minutesAgo: 5 });
  await outreachEmail('failed', { error: 'x', minutesAgo: 4 });
  assert.equal((await checkBreaker()).tripped, false);
  assert.equal((await consecutiveSendFailures()).count, 0);
});

test('ordinary delivery is never mistaken for a fault', { skip: skip() }, async () => {
  for (let i = 6; i >= 1; i--) await outreachEmail('delivered', { minutesAgo: i });
  assert.equal((await checkBreaker()).tripped, false);
});

test('a bounce is a RECIPIENT problem and must not read as a Bell fault', { skip: skip() }, async () => {
  // Bounces have their own rule below (5% over 20+ sends). They arrive as 'bounced', never
  // 'failed', so they can never satisfy the streak — asserted so the two rules stay separate.
  for (let i = 6; i >= 1; i--) await outreachEmail('bounced', { minutesAgo: i });
  assert.equal((await consecutiveSendFailures()).count, 0, 'a bounce is not a send failure');
});

test('the bounce and complaint rules still work', { skip: skip() }, async () => {
  // Regression guard: the new check runs FIRST, and must not shadow what was already there.
  for (let i = 30; i >= 2; i--) await outreachEmail('delivered', { minutesAgo: i });
  await outreachEmail('complained', { minutesAgo: 1 });
  const b = await checkBreaker();
  assert.equal(b.tripped, true);
  assert.match(b.reason, /spam complaint/);
  assert.doesNotMatch(b.reason, /fault on Bell's side/, 'a complaint is not Bell breaking');
});

test('too few sends to judge means no judgement', { skip: skip() }, async () => {
  await outreachEmail('failed', { error: 'x', minutesAgo: 2 });
  await outreachEmail('failed', { error: 'x', minutesAgo: 1 });
  assert.equal((await consecutiveSendFailures()).count, 0, 'two failures is not evidence of a broken machine');
});

// ── giving the targets back ──────────────────────────────────────────────────────────────────
test('resetting the breaker requeues targets that were never actually emailed', { skip: skip() }, async () => {
  const camp = await query(`SELECT id FROM outreach_campaigns ORDER BY id LIMIT 1`);
  if (!camp.rows.length) return;   // no campaign in this copy; nothing to attach a target to
  const cid = camp.rows[0].id;
  const mk = async (neverSent, email) => (await query(
    `INSERT INTO outreach_targets (campaign_id, company_name, email, status, skip_reason, never_sent)
     VALUES ($1, 'zzbrake co', $2, 'failed', 'probe', $3) RETURNING id`, [cid, email, neverSent])).rows[0].id;
  const bells = await mk(true,  'zzbrake-bells@example.invalid');
  const theirs = await mk(false, 'zzbrake-theirs@example.invalid');
  try {
    const out = await resetBreaker();
    assert.ok(out.requeued >= 1);
    const a = await query(`SELECT status, never_sent FROM outreach_targets WHERE id=$1`, [bells]);
    assert.equal(a.rows[0].status, 'pending', 'never emailed → gets its turn back');
    assert.equal(a.rows[0].never_sent, false, 'and the flag is cleared so it is not requeued twice');
    const b = await query(`SELECT status FROM outreach_targets WHERE id=$1`, [theirs]);
    assert.equal(b.rows[0].status, 'failed', 'a suppressed address stays exactly where it was');
  } finally {
    await query(`DELETE FROM outreach_targets WHERE id = ANY($1::bigint[])`, [[bells, theirs]]);
  }
});

test('the breaker really is cleared afterwards', { skip: skip() }, async () => {
  for (let i = 5; i >= 1; i--) await outreachEmail('failed', { error: 'x', minutesAgo: i });
  assert.equal((await checkBreaker()).tripped, true);
  await resetBreaker();
  assert.equal((await breakerStatus()).tripped, false);
});

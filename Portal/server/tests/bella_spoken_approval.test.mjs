// Val, 2026-08-07: while he was SPEAKING INSTRUCTIONS to Bella, she emailed a real customer —
// MyWeb Systems QFZ LLC — and then apologised. "This is very unprofessional and should not happen
// because it might cause critical issues for companies."
//
// The mechanism: a message that is entirely an affirmative executes the single pending action.
// That was a deliberate feature (Val, 2026-07-15: "user can just say approved, not necessary for
// user to click approve") and it is fine for reversible, internal things. It is NOT fine for an
// email to a third party, because the phrases it accepts — "go ahead", "do it", "send it",
// "confirmed" — are exactly the words used while directing someone to do something ELSE.
//
// Voice makes it far likelier: an utterance is cut at a pause, so a trailing "go ahead" arrives as
// a COMPLETE message with no surrounding words to disambiguate it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getTool } from '../bella/tools.js';
import { buildPlanGrant } from '../bella/plan.js';

// The matcher from server/bella/brain.js. Kept in step with it by this test.
const AFFIRM_RX = /^\s*(ok(ay)?\s+)?(approved?|approve\s+it|yes[,\s]*approve(\s+it)?|go\s+ahead|do\s+it|send\s+it|confirm(ed)?|yes[,\s]*(please\s+)?(do\s+it|go\s+ahead|send\s+it))\s*[.!]*\s*$/i;

test('the phrases that fire this are ordinary conversational instructions', () => {
  // Every one of these, said while directing Bella, would have executed a pending email.
  for (const phrase of ['go ahead', 'do it', 'send it', 'confirmed', 'approved', 'ok approve it', 'yes, go ahead']) {
    assert.equal(AFFIRM_RX.test(phrase), true, `"${phrase}" is treated as approval`);
  }
});

test('a sentence that merely CONTAINS a yes is still refused', () => {
  // This part was already right and must stay right.
  for (const phrase of [
    'ok, but change the subject first',
    'go ahead and search for construction companies',
    'do it later',
    'yes I was saying the tender numbers',
    'ok',            // a bare acknowledgement is not an instruction
    'send it to me first',
  ]) {
    assert.equal(AFFIRM_RX.test(phrase), false, `"${phrase}" must NOT count as approval`);
  }
});

test('every tool that reaches OUTSIDE Bell is in the always-approve category', () => {
  // This is the category the fix keys on, so its membership is the safety boundary.
  for (const name of ['send_email', 'send_whatsapp', 'enroll_in_sequence']) {
    const t = getTool(name);
    assert.ok(t, `${name} should exist`);
    assert.equal(t.approval, 'always', `${name} reaches a third party and must be 'always'`);
  }
});

test('deletions are in it too — they are equally irreversible', () => {
  for (const name of ['delete_crm_note', 'delete_crm_task', 'delete_deal']) {
    const t = getTool(name);
    if (!t) continue;
    assert.equal(t.approval, 'always', `${name} destroys data and must be 'always'`);
  }
});

test('reversible internal actions keep spoken approval, which Val asked for', () => {
  // The fix must not take away "just say approved" for everything — only for what cannot be undone.
  const reveal = getTool('reveal_companies');
  assert.equal(reveal.approval, 'spend', 'revealing is reversible and internal — spoken approval stays');
  // NOTE: add_to_outreach used to be listed here as "internal". It is not — it queues COLD EMAIL
  // to real companies, and it was moved to 'always' on 2026-08-07. Genuinely internal writes are
  // things that only touch this tenant's own records.
  const acts = ['add_crm_note', 'add_crm_task', 'set_crm_status', 'update_icp'].map(getTool).filter(Boolean);
  assert.ok(acts.length >= 3, 'expected several internal write tools to exist');
  for (const t of acts) {
    assert.notEqual(t.approval, 'always',
      `${t.definition.name} only touches this tenant's own records — it should not need a click`);
  }
});

test('the spoken-approval branch is gated on the tool category, not on a name list', () => {
  // A name list would rot the moment someone adds a tool. Assert the code keys on `approval`.
  const src = readFileSync(new URL('../bella/brain.js', import.meta.url), 'utf8');
  assert.match(src, /pendingTool\?\.approval === 'always'/,
    'the guard must key on the approval category so a new sending tool is covered automatically');
  assert.match(src, /needs_click/, 'the client must be told the card still needs a click');
});


// ── APPROVING A PLAN IS NOT A BLANK CHEQUE (audit finding, 2026-08-07) ──────────────────────────
// A grant records the tool NAME and a COUNT — not the recipient, subject or record — and nothing
// at send time compares what is being sent against what the card said. So one approved plan
// authorised an email to an address the user was never shown. The code already refused to let a
// plan pre-approve another plan, for exactly this reason; an external send gets the same rule.

const isAlways = (n) => getTool(n)?.approval === 'always';
const PLAN = { title: 'Reach out', steps: [
  { tool: 'search_companies', what: 'find construction firms' },
  { tool: 'reveal_companies', what: 'unlock their contacts' },
  { tool: 'send_email',       what: 'email each one' },
  { tool: 'add_to_outreach',  what: 'queue the rest' },
  { tool: 'schedule_task',    what: 'follow up Monday' },
  { tool: 'update_icp',       what: 'save the profile' },
] };

test('an approved plan never pre-approves an external send', () => {
  const grant = buildPlanGrant(PLAN, (n) => !!getTool(n), isAlways);
  for (const t of ['send_email', 'add_to_outreach', 'schedule_task']) {
    assert.equal(grant[t], undefined, `${t} must raise its own card, naming its own recipient`);
  }
});

test('a plan still covers the reversible work, or the feature is pointless', () => {
  const grant = buildPlanGrant(PLAN, (n) => !!getTool(n), isAlways);
  assert.equal(grant.search_companies, 1);
  assert.equal(grant.reveal_companies, 1);
  assert.equal(grant.update_icp, 1);
});

test('queuing cold email and scheduling unattended work both need the button', () => {
  // add_to_outreach queues COLD EMAIL to up to 25 real Qatar companies per call; a scheduled run
  // executes later with approval checks skipped, while nobody is watching. Both were 'act', which
  // shows NO card at all when approval mode is 'auto'.
  for (const n of ['add_to_outreach', 'schedule_task']) {
    assert.equal(getTool(n)?.approval, 'always', `${n} acts outward or unattended`);
  }
});

test('the email card names the recipient', () => {
  // It read "Send email to record #12" — the address appeared nowhere on the thing being approved.
  const card = getTool('send_email').describe({ record_id: 12, to: 'ceo@myweb.qa', subject: 'Hello', body: 'Hi' });
  assert.match(card, /ceo@myweb\.qa/, 'the user must see WHO it goes to before approving');
});

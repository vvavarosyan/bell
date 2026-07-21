// Address classification + the outreach tier gate.
//
// These two things decide whether Bell cold-emails a natural person, so they get tests.
// Pure functions only — address_rules.js is documented "pure + deterministic" and is called
// per row inside a 16k loop, so it must never touch the database.

import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyAddress, CONSUMER_DOMAINS, ROLE_LOCALPARTS } from '../outreach/address_rules.js';

test('a role word on a consumer domain is NOT a company inbox', () => {
  // info@gmail.com was a live outreach target held against 3 different companies. Nobody's
  // company inbox is info@gmail.com — anyone can register it.
  for (const e of ['info@gmail.com', 'contact@gmail.com', 'mail@mail.com', 'sales@qatar.net.qa']) {
    const r = classifyAddress({ email: e });
    assert.equal(r.outcome, 'unclassified', `${e} must not be sendable`);
    assert.equal(r.basis, 'role_word_on_consumer_domain');
  }
});

test('a role word on a real company domain still is a company inbox', () => {
  for (const e of ['info@almuftahreadymix.com', 'tenders@qp.com.qa', 'sales@electraqatar.com']) {
    assert.equal(classifyAddress({ email: e }).outcome, 'role_mailbox', e);
  }
});

test('a recorded verdict outranks every rule', () => {
  // Val's decision is final — a later heuristic must never quietly overturn it.
  assert.equal(classifyAddress({ email: 'info@realcompany.qa', verdict: 'named_person' }).outcome, 'named_person');
  assert.equal(classifyAddress({ email: 'ahmed.hassan@x.com', verdict: 'role_mailbox' }).outcome, 'role_mailbox');
  assert.equal(classifyAddress({ email: 'anything@x.com', verdict: 'not_a_company_address' }).outcome, 'not_a_company_address');
});

test('a bogus verdict value is ignored, not trusted', () => {
  // Rule 2.1: an unknown option must never be promoted to "safe".
  assert.equal(classifyAddress({ email: 'haris@meddy.co', verdict: 'totally_made_up' }).outcome, 'unclassified');
});

test('a linked person record still beats a role word', () => {
  assert.equal(classifyAddress({ email: 'info@x.qa', hasLinkedPerson: true }).outcome, 'named_person');
});

test('firstname.lastname is a person; a bare word stays unclassified', () => {
  assert.equal(classifyAddress({ email: 'ahmed.hassan@x.qa' }).outcome, 'named_person');
  assert.equal(classifyAddress({ email: 'haris@meddy.co' }).outcome, 'unclassified');
  assert.equal(classifyAddress({ email: 'alwaab@x.qa' }).outcome, 'unclassified');
});

test('the consumer list covers the providers that actually appear in Bell', () => {
  for (const d of ['gmail.com', 'hotmail.com', 'yahoo.com', 'qatar.net.qa', 'windowslive.com']) {
    assert.ok(CONSUMER_DOMAINS.has(d), `${d} must be treated as a consumer domain`);
  }
  assert.ok(!CONSUMER_DOMAINS.has('qp.com.qa'), 'a real Qatar company domain must not be listed');
  assert.ok(ROLE_LOCALPARTS.has('tenders'), 'tenders@ is the highest-value role mailbox for Bell');
});

test('outreach refuses every tier except the two it can defend', async () => {
  const { SENDABLE_TIERS } = await import('../outreach/targeting.js');
  assert.deepEqual([...SENDABLE_TIERS].sort(), ['named_person', 'role_mailbox']);
  assert.ok(!SENDABLE_TIERS.has('unclassified'), 'unclassified must never be mailable');
  assert.ok(!SENDABLE_TIERS.has('all'), '"all" is not an audience');
});

// What the CRM tells a user about an email it sent.
//
// Val, 2026-08-06: a bounced email showed the same grey arrow as a delivered one. The old code
// named three statuses out of seven, so bounced / complained / delivered / queued all collapsed
// into one dim glyph.
//
// The load-bearing test here is the 'sent' case. 'sent' means Bell handed the message to the
// provider and has heard nothing back — that is NOT delivery. Painting it green would be the UI
// claiming something Bell does not know, which is Rule 2.1 applied to pixels. Val approved the
// neutral reading explicitly.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emailOutcome, OUTCOME_COLOR } from '../../ui/lib/email_outcome.js';

const out = (status, direction = 'out') => emailOutcome({ status, direction });

test('a failure is unmistakable — red, and it says so in words', () => {
  for (const s of ['bounced', 'complained', 'failed']) {
    const o = out(s);
    assert.equal(o.tone, 'bad', `${s} must read as a failure`);
    assert.equal(o.color, OUTCOME_COLOR.bad);
    assert.ok(o.label && o.label.length, `${s} must carry a word, not colour alone`);
  }
  assert.equal(out('bounced').label, "Didn't reach");
});

test('confirmed delivery is positive', () => {
  assert.equal(out('delivered').tone, 'good');
  assert.equal(out('opened').tone, 'good');
});

test("'sent' stays NEUTRAL — Bell has no confirmation yet", () => {
  const o = out('sent');
  assert.equal(o.tone, 'neutral', 'green here would claim a delivery Bell cannot see');
  assert.notEqual(o.color, OUTCOME_COLOR.good);
  assert.notEqual(o.color, OUTCOME_COLOR.bad);
  assert.match(o.title, /not confirmed/i);
});

test('queued is visibly not-yet-sent, and not a failure', () => {
  const o = out('queued');
  assert.equal(o.tone, 'waiting');
  assert.notEqual(o.color, OUTCOME_COLOR.bad);
});

test('an inbound reply is its own thing', () => {
  const o = emailOutcome({ direction: 'in', status: 'sent' });
  assert.equal(o.glyph, '↙');
  assert.equal(o.label, 'Reply');
});

test('an UNKNOWN status is never coloured or invented', () => {
  const o = out('some_future_status');
  assert.equal(o.tone, 'neutral', 'never guess a meaning for a status we do not know');
  assert.equal(o.label, 'some_future_status', 'show the raw word rather than inventing one');
  assert.notEqual(o.color, OUTCOME_COLOR.bad);
  assert.notEqual(o.color, OUTCOME_COLOR.good);
});

test('every status in migration 093 is handled', () => {
  // queued|sent|failed|delivered|opened|bounced|complained — the CHECK constraint's full set.
  for (const s of ['queued', 'sent', 'failed', 'delivered', 'opened', 'bounced', 'complained']) {
    const o = out(s);
    assert.ok(o.glyph && o.label && o.color, `${s} must render fully`);
    assert.notEqual(o.label, s === 'sent' ? '' : s === 'queued' ? '' : o.label === s ? s : '',
      `${s} must have a human label, not the raw status`);
  }
});

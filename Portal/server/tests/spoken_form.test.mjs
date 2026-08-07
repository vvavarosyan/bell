// Bella's SPOKEN form — what she says, versus what she writes.
//
// ⚠️ THIS SUITE EXISTS BECAUSE THE FIRST VERSION SHIPPED A LIE. It converted the digits to words
// as well as the currency, and on real financial sentences it produced:
//     "QR 75.8 million"  →  "seventy-five Qatari riyals million"
//     "QR 1.2 billion"   →  "one Qatari riyals billion"     ← a 20% understatement, spoken aloud
// Val caught it in use: "she cannot mislead the users. She cannot say something which is not
// accurate. This is a Qatar based system."
//
// The governing rule is now: **never rewrite a number.** ElevenLabs' normalizer reads digits
// correctly and is deliberately left on. This layer only fixes the CURRENCY — its wording, its
// position, and an abbreviated scale suffix that would otherwise be spoken as a letter.
//
// The most important tests below are the ones asserting that the digits come out UNCHANGED.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spokenForm } from '../bella/spoken.js';

test('THE REGRESSION: a scaled amount keeps its full value', () => {
  // Val's exact report.
  assert.equal(spokenForm('Ooredoo posted a Q1 2026 net profit of QR 75.8 million.'),
    'Ooredoo posted a Q1 2026 net profit of 75.8 million Qatari riyals.');
  // The worst case — the old code said "one … billion" for 1.2 billion.
  assert.equal(spokenForm('Revenue was QR 1.2 billion this year.'),
    'Revenue was 1.2 billion Qatari riyals this year.');
});

test('a number is never RESCALED or rounded — the original ban still holds', () => {
  // POLICY CHANGED 2026-08-07, deliberately and narrowly. Val: "she was not able to say
  // (5,916,565) she lags when it comes to a bit complicated numbers." A comma-grouped integer of
  // 10,000+ is now spoken as WORDS, which is why this test no longer demands the digits survive
  // verbatim. What has NOT changed is the thing the original ban existed for: the spoken value
  // must equal the written value. tests/spoken_numbers.test.mjs proves that by parsing every
  // produced phrase back to a number. Decimals and small numbers are still untouched here.
  for (const n of ['75.8', '1.2', '0.5', '1']) {
    const out = spokenForm(`It was QAR ${n}.`);
    assert.ok(out.includes(n), `${n} must survive verbatim, got: ${out}`);
  }
  // Grouped integers become words — but never a DIFFERENT quantity.
  assert.match(spokenForm('It was QAR 850,000.'), /eight hundred fifty thousand Qatari riyals/);
  assert.match(spokenForm('It was QAR 11,257.'), /eleven thousand two hundred fifty-seven/);
});

test('an abbreviated scale is expanded, not read as a letter', () => {
  assert.equal(spokenForm('QAR 75.8m in Q1.'), '75.8 million Qatari riyals in Q1.');
  assert.equal(spokenForm('QAR 1.2bn total.'), '1.2 billion Qatari riyals total.');
});

test('the currency lands after the amount, whichever side it was written on', () => {
  assert.equal(spokenForm('The award was QAR 402,500,000.'),
    'The award was four hundred two million five hundred thousand Qatari riyals.');
  assert.equal(spokenForm('402,500,000 QAR was the bid.'),
    'four hundred two million five hundred thousand Qatari riyals was the bid.');
  // A decimal with a scale word is still left exactly as written.
  assert.equal(spokenForm('75.8 million QAR was the profit.'),
    '75.8 million Qatari riyals was the profit.');
});

test('"QR"/"QAR" is never spelled out as letters', () => {
  for (const s of ['QAR 5,000', 'QR 12', 'Paid in QR.', 'Budget in QAR.']) {
    assert.doesNotMatch(spokenForm(s), /\bQAR\b|\bQR\b/, `code survived in: ${s}`);
  }
});

test('one riyal is singular', () => {
  assert.equal(spokenForm('Fees are QAR 1.'), 'Fees are 1 Qatari riyal.');
  assert.match(spokenForm('Fees are QAR 2.'), /Qatari riyals/);
});

// ── negative cases: the things that must NOT be touched ──────────────────────
test('a trailing word is not mistaken for a scale', () => {
  // 'b' of "barrels" must not become "billion".
  assert.equal(spokenForm('QAR 75 barrels were shipped.'),
    '75 Qatari riyals barrels were shipped.');
});

test('quarters, years, references and dates are left alone', () => {
  assert.equal(spokenForm('Q1 2026 was strong.'), 'Q1 2026 was strong.');
  assert.equal(spokenForm('Tender 4905/2022 closes 20/06/2023.'),
    'Tender 4905/2022 closes 20/06/2023.');
  // A plain COUNT is a quantity, and as of 2026-08-07 a grouped one is spoken as words — that is
  // the point of the change, and it is why Val heard her stumble on 5,916,565.
  assert.equal(spokenForm('I found 11,257 companies.'),
    'I found eleven thousand two hundred fifty-seven companies.');
  assert.equal(spokenForm('Revenue grew 1.08 times.'), 'Revenue grew 1.08 times.');
});

test('Arabic replies stay Arabic, scale word included', () => {
  const out = spokenForm('صافي الربح 75.8 million QAR.', { arabic: true });
  assert.match(out, /ريال قطري/);
  assert.match(out, /مليون/, 'an English "million" would flip the voice mid-phrase');
  assert.doesNotMatch(out, /million|Qatari/);
  assert.ok(out.includes('75.8'), 'the number itself is still exact');
});

test('empty and odd input never throws', () => {
  assert.equal(spokenForm(''), '');
  assert.equal(spokenForm(null), '');
  assert.equal(spokenForm(undefined), '');
});

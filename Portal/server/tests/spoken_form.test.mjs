// Bella's SPOKEN form — what she says, versus what she writes.
// Guards Val's 2026-08-06 report: "she does not say the numbers correctly... when it comes to QR
// currency she says QR. It's either Qatari riyal or riyal only."
//
// The important half of this suite is the NEGATIVE cases. Spelling numbers out is easy; the risk
// is mangling a tender reference, a date or a year into words, which would make her sound wrong
// in a completely new way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spokenForm, numberToWords } from '../bella/spoken.js';

test('numberToWords covers the conversational range', () => {
  assert.equal(numberToWords(0), 'zero');
  assert.equal(numberToWords(11257), 'eleven thousand two hundred fifty-seven');
  assert.equal(numberToWords(402500000), 'four hundred two million five hundred thousand');
  assert.equal(numberToWords(1), 'one');
  assert.equal(numberToWords(1e13), null, 'absurd magnitudes stay as digits rather than guessing');
});

test('Qatari currency is spoken, never spelled "QR"', () => {
  assert.match(spokenForm('Won at QAR 402,500,000.'),
    /four hundred two million five hundred thousand Qatari riyals/);
  assert.match(spokenForm('402,500,000 QAR was the bid.'), /Qatari riyals/);
  assert.match(spokenForm('Paid in QR.'), /Qatari riyals/);
  assert.equal(spokenForm('Fees are QAR 1.'), 'Fees are one Qatari riyal.', 'singular');
  assert.doesNotMatch(spokenForm('QAR 5,000'), /\bQAR\b|\bQR\b/, 'the code itself must not survive');
});

test('grouped quantities are spoken as words', () => {
  assert.equal(spokenForm('I found 11,257 companies.'),
    'I found eleven thousand two hundred fifty-seven companies.');
});

// ── the negative cases that matter most ──────────────────────────────────────
test('references, dates and bare numbers are left alone', () => {
  const ref = 'Tender 4905/2022 closes on 20/06/2023.';
  assert.equal(spokenForm(ref), ref, 'a tender ref and a date must not become words');
  const yr = 'Bell Score rose to 62 in 2026.';
  assert.equal(spokenForm(yr), yr, 'a bare year is not a quantity');
  const dec = 'Revenue grew 1.08 times.';
  assert.equal(spokenForm(dec), dec, 'a decimal factor is not a quantity');
});

test('Arabic replies keep Arabic — no English number words mid-sentence', () => {
  const out = spokenForm('المناقصة بقيمة 402,500,000 QAR.', { arabic: true });
  assert.match(out, /ريال قطري/, 'currency is said in Arabic');
  assert.doesNotMatch(out, /million|Qatari riyals/,
    'English words inside an Arabic utterance would flip the TTS language mid-sentence');
});

test('empty and odd input never throws', () => {
  assert.equal(spokenForm(''), '');
  assert.equal(spokenForm(null), '');
  assert.equal(spokenForm(undefined), '');
});

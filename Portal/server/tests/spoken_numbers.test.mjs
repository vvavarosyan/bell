// Val, 2026-08-07: "she was not able to say (5,916,565) she lags when it comes to a bit
// complicated numbers."
//
// This re-opens a decision that was made for a good reason. The FIRST attempt at converting
// numbers for speech was banned outright because it was WRONG — it dropped decimals and orphaned
// scale words, so "QR 1.2 billion" was spoken as "one Qatari riyals billion", a 20% understatement
// on a company's financials. Val's response was unambiguous: "she cannot mislead the users. She
// cannot say something which is not accurate."
//
// So the bar for reopening it is not "looks better". It is PROOF. Every number this produces is
// parsed BACK from words and asserted equal to the original — if a phrase cannot be read back to
// the number it came from, it does not ship.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spokenForm, integerToWords } from '../bella/spoken.js';

// An independent reader: words → number. Deliberately NOT sharing code with integerToWords, or it
// would agree with its own mistakes.
function wordsToInteger(phrase) {
  const UNITS = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
    seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  };
  const SCALE = { thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12 };
  let total = 0, current = 0;
  for (const w of String(phrase).toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean)) {
    if (w in UNITS) current += UNITS[w];
    else if (w === 'hundred') current *= 100;
    else if (w in SCALE) { total += current * SCALE[w]; current = 0; }
    else return NaN;                      // an unknown word means the phrase is not a pure number
  }
  return total + current;
}

test('the reader itself is sound, or the round-trip proves nothing', () => {
  assert.equal(wordsToInteger('five million nine hundred sixteen thousand five hundred sixty-five'), 5916565);
  assert.equal(wordsToInteger('one hundred ninety-seven thousand two hundred four'), 197204);
  assert.ok(Number.isNaN(wordsToInteger('five hundred apples')));
});

test("VAL'S NUMBER: 5,916,565 round-trips exactly", () => {
  const words = integerToWords(5916565);
  assert.equal(words, 'five million nine hundred sixteen thousand five hundred sixty-five');
  assert.equal(wordsToInteger(words), 5916565);
});

test('every integer across the range round-trips — no rounding, anywhere', () => {
  const cases = [10000, 10001, 99999, 100000, 197204, 999999, 1000000, 1000001, 5916565,
    30299, 402500000, 105763640, 1234567890, 999999999999, 1000000000000];
  for (const n of cases) {
    const w = integerToWords(n);
    assert.equal(wordsToInteger(w), n, `${n} → "${w}" → ${wordsToInteger(w)}`);
  }
});

test('a thousand random integers round-trip', () => {
  // Deterministic sweep rather than Math.random, so a failure is reproducible.
  for (let i = 0; i < 1000; i++) {
    const n = 10000 + i * 7919;      // a prime stride walks the space unevenly
    assert.equal(wordsToInteger(integerToWords(n)), n, `failed at ${n}`);
  }
});

test('the spoken reply carries the same number the screen shows', () => {
  const said = spokenForm('Bell holds 5,916,565 records.');
  const m = said.match(/holds (.+?) records/);
  assert.ok(m, `expected a spoken number, got: ${said}`);
  assert.equal(wordsToInteger(m[1]), 5916565, 'spoken value must equal the written value');
});

// ── What must NOT be converted ──────────────────────────────────────────────────────────────────

test('identifiers stay as digits — they are not quantities', () => {
  // Converting on digit count alone read "CR 42828" as "forty-two thousand eight hundred
  // twenty-eight". Not inaccurate, but wrong in kind — and a phone number was next.
  const s = spokenForm('CR 42828, phone 97444123456, tender 5797/2025, version 11.13.18.05.');
  assert.equal(s, 'CR 42828, phone 97444123456, tender 5797/2025, version 11.13.18.05.');
});

test('decimals are never touched — that is what the banned version broke', () => {
  assert.match(spokenForm('QR 75.8 million'), /^75\.8 million Qatari riyals$/);
  assert.match(spokenForm('a margin of 12.5%'), /12\.5%/);
});

test('a year is left alone', () => {
  assert.match(spokenForm('Q1 2026 results'), /Q1 2026 results/);
  assert.match(spokenForm('founded in 1998'), /founded in 1998/);
});

test('small grouped numbers stay as digits — they are already fluent', () => {
  assert.match(spokenForm('across 1,569 datasets'), /1,569 datasets/);
});

test('currency still reads correctly, with the number intact', () => {
  const s = spokenForm('The contract was QAR 402,500,000.');
  assert.match(s, /Qatari riyals/);
  const m = s.match(/was (.+?) Qatari riyals/);
  assert.equal(wordsToInteger(m[1]), 402500000);
});

test('Arabic replies keep their digits — half-right Arabic grammar is worse than none', () => {
  const s = spokenForm('لدينا 5,916,565 سجل', { arabic: true });
  assert.match(s, /5,916,565/, 'Arabic number-to-words needs gender and dual forms; not attempted');
});

test('empty and odd input never throws', () => {
  assert.equal(spokenForm(''), '');
  assert.equal(spokenForm(null), '');
  assert.equal(integerToWords(0), 'zero');
  assert.equal(integerToWords(NaN), '');
});

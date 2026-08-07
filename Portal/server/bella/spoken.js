// Spoken form — what Bella SAYS, as opposed to what she writes.
// ----------------------------------------------------------------------------
// Val, 2026-08-06: "It's either 'Qatari riyal' or 'riyal' only… This is a Qatar based system. We
// need to make sure that the basic terms are pronounced correctly."
//
// ⚠️ READ THIS BEFORE ADDING ANYTHING HERE. The first version of this file converted the DIGITS
// to words as well, and it was materially worse than doing nothing:
//     "QR 75.8 million"  →  "seventy-five Qatari riyals million"   (decimal dropped, scale orphaned)
//     "QR 1.2 billion"   →  "one Qatari riyals billion"            (a 20% understatement)
//     "QAR 75.8m"        →  "seventy-five Qatari riyalsm"
// It dropped the fractional part on purpose ("noise on a 105-million contract") and had never
// heard of a scale word. In a product that reports company financials, a spoken number that is
// not the written number is a lie, not a rough edge.
//
// THE RULE THIS FILE NOW FOLLOWS: **never rewrite a number.** ElevenLabs' own text normalizer
// reads "75.8" and "402,500,000" correctly — it is on deliberately (we send
// optimize_streaming_latency=3 rather than 4 precisely to keep it). The only legitimate job here
// is the CURRENCY: say the term in words, put it in the right place, and expand an abbreviated
// scale suffix that would otherwise be read as a letter. Digits pass through untouched.
//
// Applied ONLY on the text-to-speech path, so the on-screen reply keeps "QAR 402,500,000" —
// which is what a business user wants to read and copy.

const SCALES = {
  k: 'thousand', m: 'million', mn: 'million', b: 'billion', bn: 'billion', tr: 'trillion',
  thousand: 'thousand', million: 'million', billion: 'billion', trillion: 'trillion',
};

// An Arabic reply must not carry an English scale word: "75.8 million ريال قطري" makes the voice
// switch language mid-phrase, which is the same defect the Arabic filler line had.
const AR_SCALES = { thousand: 'ألف', million: 'مليون', billion: 'مليار', trillion: 'تريليون' };

const EN_PLURAL = 'Qatari riyals';
const EN_SINGLE = 'Qatari riyal';
const AR_UNIT   = 'ريال قطري';

// A number, optionally grouped and/or decimal, optionally followed by a scale word. The trailing
// \b on the scale group is what stops "QAR 75 barrels" from reading the "b" of barrels as
// "billion" — verified in the test suite.

// ── LONG INTEGERS ARE SPOKEN AS WORDS ───────────────────────────────────────────────────────────
// Val, 2026-08-07: "she was not able to say (5,916,565) she lags when it comes to a bit
// complicated numbers." That is a FLUENCY complaint, not an accuracy one — and it re-opens the
// decision recorded above, so the difference has to be earned rather than asserted.
//
// The earlier attempt was banned because it was WRONG: it dropped decimals and orphaned scale
// words, so the spoken number was not the written number. This conversion is different in the one
// way that matters — it is PROVABLE. The test suite round-trips it: every produced phrase is
// parsed back to a number and asserted equal to the original, across the whole range and on
// 5,916,565 itself. A conversion that cannot be read back is not allowed to ship.
//
// Scope is deliberately narrow, because the earlier damage came from being broad:
//   · integers of 5+ digits ONLY (10,000 and up) — that is where reading digit groups gets long
//     and where Val heard her stumble;
//   · DECIMALS ARE NEVER TOUCHED. "75.8 million" is already short and fluent, and the fractional
//     part is exactly what the old version lost;
//   · years (1900–2099) are left alone — "2026" must not become "two thousand twenty-six" in
//     "Q1 2026";
//   · anything with a scale word attached is left alone — "5.9 million" is already words.
const ONES = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven',
  'twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
const GROUPS = ['', ' thousand', ' million', ' billion', ' trillion'];

/** 0–999 in words. */
function under1000(n) {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const t = TENS[Math.floor(n / 10)];
    return n % 10 ? `${t}-${ONES[n % 10]}` : t;
  }
  const h = `${ONES[Math.floor(n / 100)]} hundred`;
  return n % 100 ? `${h} ${under1000(n % 100)}` : h;
}

/** A non-negative integer in words. Exact — no rounding, ever. */
export function integerToWords(n) {
  n = Math.trunc(Math.abs(Number(n)));
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'zero';
  const parts = [];
  let g = 0;
  while (n > 0 && g < GROUPS.length) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(under1000(chunk) + GROUPS[g]);
    n = Math.floor(n / 1000);
    g++;
  }
  // Beyond a trillion we would be inventing group names, so leave the digits to the normalizer.
  return n > 0 ? '' : parts.join(' ');
}

// ⚠️ COMMA GROUPING IS THE ONLY TRIGGER, and that is the whole safety argument.
// Bell writes QUANTITIES with separators (5,916,565 · 197,204) and IDENTIFIERS without them
// (CR 42828 · phone 97444123456 · tender 5797/2025 · version 11.13.18.05). Converting on digit
// count alone read "CR 42828" aloud as "forty-two thousand eight hundred twenty-eight" — not
// inaccurate, but wrong in KIND, and a phone number would have suffered the same. Requiring a
// comma group separates the two using the formatting the text already carries, rather than a
// keyword list that would rot.
const LONG_INT = /(?<![\d.,\/-])(\d{1,3}(?:,\d{3})+)(?![\d.,\/-])(?!\s*(?:million|billion|thousand|trillion|mn|bn|tr|[kmb])\b)/gi;

/** Speak long integers as words; leave everything else exactly as written. */
function longIntegersToWords(s) {
  return s.replace(LONG_INT, (m) => {
    const digits = m.replace(/,/g, '');
    const n = Number(digits);
    if (!Number.isSafeInteger(n)) return m;
    // Below 10,000 the digits are already short and fluent — "1,569" needs no help, and spelling
    // every small number out would make her wordy for no gain.
    if (n < 10000) return m;
    const words = integerToWords(n);
    return words || m;      // empty means out of range — leave the digits alone
  });
}

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)(?:\s*(million|billion|thousand|trillion|mn|bn|tr|[kmb])\b)?`;
const CODE = String.raw`(?:QAR|QR)`;

const BEFORE = new RegExp(String.raw`\b${CODE}\s*${NUM}`, 'gi');
const AFTER  = new RegExp(String.raw`\b${NUM}\s*${CODE}\b`, 'gi');
const BARE   = new RegExp(String.raw`\b${CODE}\b|ر\.?\s?ق`, 'gi');

/** "75.8" + "m" → "75.8 million Qatari riyals". The digits are never touched. */
function amount(num, scaleRaw, arabic) {
  const scale = scaleRaw ? SCALES[String(scaleRaw).toLowerCase()] : null;
  const unit = arabic ? AR_UNIT
    : (!scale && num.replace(/,/g, '') === '1') ? EN_SINGLE
    : EN_PLURAL;
  if (!scale) return `${num} ${unit}`;
  return `${num} ${arabic ? (AR_SCALES[scale] || scale) : scale} ${unit}`;
}

/**
 * Rewrite a reply for speech. Numbers are preserved EXACTLY as written.
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.arabic] Arabic reply — use the Arabic currency term.
 */
export function spokenForm(text, opts = {}) {
  let s = String(text || '');
  if (!s) return s;
  const ar = !!opts.arabic;
  s = s.replace(BEFORE, (m, num, scale) => amount(num, scale, ar));
  s = s.replace(AFTER,  (m, num, scale) => amount(num, scale, ar));
  s = s.replace(BARE, ar ? AR_UNIT : EN_PLURAL);   // a currency mention with no amount
  // English only. Arabic number-to-words is a different grammar (gender agreement, dual forms) and
  // getting it half-right would be worse than letting the normalizer read the digits.
  if (!ar) s = longIntegersToWords(s);
  return s;
}

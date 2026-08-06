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
  return s;
}

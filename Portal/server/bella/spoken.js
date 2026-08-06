// Spoken form — what Bella SAYS, as opposed to what she writes.
// ----------------------------------------------------------------------------
// Val, 2026-08-06: "She does not say the numbers correctly. If it's eleven thousand two hundred
// fifty seven she might not be able to pronounce the number correctly. And when it comes to QR
// currency she says 'QR'. It's either 'Qatari riyal' or 'riyal' only. That will be much better,
// and the user can understand it much better."
//
// This runs ONLY on the text handed to text-to-speech. The on-screen reply keeps its numerals
// and its "QAR 402,500,000", which is what a business user wants to read and copy — it is only
// the spoken rendering that changes.
//
// TWO DELIBERATE LIMITS, both to avoid making things worse:
//   1. Only numbers written WITH thousands separators are spelled out. "11,257" is unambiguous
//      prose; a bare "2026" is a year, "4905/2022" is a tender reference and "1.08" is a factor,
//      and reading those as words would be wrong. A comma is the author's own signal that the
//      value is a quantity.
//   2. ElevenLabs' own text normalizer stays ON (we send optimize_streaming_latency=3 rather
//      than 4 precisely to keep it). This layer handles what it gets wrong — currency codes and
//      long grouped amounts — and leaves everything else to it.

const UNDER_20 = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES = [[1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];

/** 402500000 → "four hundred two million five hundred thousand". Integers only. */
export function numberToWords(n) {
  n = Math.trunc(Math.abs(Number(n)));
  if (!Number.isFinite(n)) return null;
  if (n === 0) return 'zero';
  if (n >= 1e12) return null;                 // beyond conversational range — leave the digits
  const parts = [];
  for (const [value, name] of SCALES) {
    if (n >= value) {
      parts.push(`${numberToWords(Math.floor(n / value))} ${name}`);
      n %= value;
    }
  }
  if (n >= 100) { parts.push(`${UNDER_20[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? '-' + UNDER_20[n % 10] : '')); n = 0; }
  else if (n > 0) { parts.push(UNDER_20[n]); }
  return parts.join(' ');
}

// "QAR", "QR", "ر.ق" — Qatar's currency, however it was written. \b does not work on the Arabic
// form, so that alternative is matched on its own.
const CURRENCY_RX = /(?:\bQAR\b|\bQR\b|ر\.?\s?ق)/gi;

/**
 * Rewrite a reply for speech.
 * @param {string} text
 * @param {object} [opts]
 * @param {boolean} [opts.arabic]  Arabic reply — leave numerals to the multilingual voice and
 *                                 only fix the currency, since English number words would be wrong.
 */
export function spokenForm(text, opts = {}) {
  let s = String(text || '');
  if (!s) return s;

  // 1) Amounts: "QAR 402,500,000" / "402,500,000 QAR" → spoken words + "Qatari riyals".
  //    Done first so the currency code is consumed here and not by the generic pass below.
  s = s.replace(/(?:\bQAR\b|\bQR\b)\s*([\d][\d,]*)(?:\.(\d{1,2}))?/gi, (m, int, dec) =>
    amountPhrase(int, dec, opts.arabic));
  s = s.replace(/([\d][\d,]*)(?:\.(\d{1,2}))?\s*(?:\bQAR\b|\bQR\b)/gi, (m, int, dec) =>
    amountPhrase(int, dec, opts.arabic));

  // 2) Any remaining currency mention with no number attached.
  s = s.replace(CURRENCY_RX, opts.arabic ? 'ريال قطري' : 'Qatari riyals');

  // 3) Bare grouped quantities — "11,257 companies" → "eleven thousand two hundred fifty-seven".
  //    Arabic replies are skipped: English number words in an Arabic sentence read as gibberish
  //    and would also flip the TTS language mid-utterance.
  if (!opts.arabic) {
    s = s.replace(/\b(\d{1,3}(?:,\d{3})+)\b/g, (m) => {
      const w = numberToWords(m.replace(/,/g, ''));
      return w || m;
    });
  }
  return s;
}

function amountPhrase(intPart, decPart, arabic) {
  const whole = intPart.replace(/,/g, '');
  if (arabic) return `${intPart}${decPart ? '.' + decPart : ''} ريال قطري`;
  const words = numberToWords(whole);
  const unit = whole === '1' && !decPart ? 'Qatari riyal' : 'Qatari riyals';
  if (!words) return `${intPart}${decPart ? '.' + decPart : ''} ${unit}`;
  // Fractions of a riyal are dirhams, but Bell's amounts are contract values where the decimals
  // are noise — ".26" on a 105-million contract is not worth speaking. Whole riyals only.
  return `${words} ${unit}`;
}

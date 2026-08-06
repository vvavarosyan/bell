// Sentence segmentation for streamed speech (Phase 3 — voice latency).
// Bella's reply streams token by token; cutting it at sentence boundaries lets
// the FIRST sentence go to TTS while the rest still generates — she starts
// talking in ~a sentence's worth of time instead of after the whole turn.
// PURE module (no React, no api) so node can unit-test it.

// Sentence enders: western + Arabic question mark + Arabic full stop + ellipsis.
const ENDER = /[.!?…]|[؟۔]/;

const MIN_CHARS = 60;    // don't TTS tiny fragments ("1." or "Yes.")
const MAX_CHARS = 320;   // force a cut on a word boundary if no ender showed up
// The FIRST segment of a reply is allowed to be shorter. Everything the listener experiences as
// "Bella is slow" happens before the first sound, and with a flat 60-char floor a perfectly good
// opening sentence — "Good morning Val." is 18 characters — waited for another 42 characters to
// be generated before anything was spoken. Later segments keep the full floor so delivery does
// not turn choppy. 16 was chosen against real openings, not by feel: "Good morning Val." is 17
// and "I found three tenders." is 22, so both now speak immediately, while one-word
// acknowledgements ("Yes." 4, "Done." 5, "1." 2) stay held exactly as before.
// (Val 2026-08-06: make her as fast as possible without giving up quality.)
const FIRST_MIN_CHARS = 16;

/**
 * Try to cut one speakable segment off the front of `buffer`.
 * Returns { segment, rest } or null when no cut is ready yet.
 * Never cuts into a trailing "[choices: …]" block (UI-only, must not be spoken).
 */
export function cutSpeechSegment(buffer, opts = {}) {
  const min = opts.first ? FIRST_MIN_CHARS : MIN_CHARS;
  let buf = String(buffer || '');
  // Anything from a choices marker onward is UI, not speech — hold it back.
  const choiceAt = buf.search(/\[choices:/i);
  if (choiceAt !== -1) buf = buf.slice(0, choiceAt);
  if (buf.length < min) return null;

  // First sentence ender at/after `min` whose next char is whitespace/EOB —
  // and not a decimal point ("3.5") or a numbered-list dot ("2.").
  for (let i = min - 1; i < buf.length; i++) {
    const ch = buf[i];
    if (!ENDER.test(ch)) continue;
    const next = buf[i + 1];
    if (next !== undefined && !/\s/.test(next)) continue;          // "3.5", "e.g." mid-word
    if (ch === '.' && /\d/.test(buf[i - 1] || '') && /\d/.test(next || '')) continue;
    const segment = buf.slice(0, i + 1).trim();
    const rest = String(buffer).slice(String(buffer).indexOf(buf) + i + 1);
    if (!segment) return null;
    return { segment, rest };
  }

  // No ender yet but the buffer is long — cut at the last word boundary so a
  // rambling sentence still starts playing.
  if (buf.length >= MAX_CHARS) {
    const cutAt = buf.lastIndexOf(' ', MAX_CHARS);
    if (cutAt > min) {
      return { segment: buf.slice(0, cutAt).trim(), rest: String(buffer).slice(cutAt + 1) };
    }
  }
  return null;
}

/** Split a COMPLETE text into speakable segments (for non-streamed speech). */
export function segmentAll(text) {
  const out = [];
  let buf = String(text || '');
  for (;;) {
    const cut = cutSpeechSegment(buf);
    if (!cut) break;
    out.push(cut.segment);
    buf = cut.rest;
  }
  const rest = buf.replace(/\[choices:[^\]]*\]?\s*$/i, '').trim();
  if (rest) out.push(rest);
  return out;
}

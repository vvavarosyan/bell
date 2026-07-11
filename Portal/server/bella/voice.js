// Bella voice (Phase G4) — ElevenLabs helpers: speech-to-text + streaming TTS.
//
// Pipeline (v1, roll-own per the Phase-G plan): the browser segments an
// utterance → POST /api/bella/voice/transcribe (Scribe) → the text runs
// through the NORMAL Bella chat turn (same brain, tools, approvals, budget,
// audit — voice is just another input) → the final reply text → POST
// /api/bella/voice/tts (Flash) → audio plays while the portal edge-glows.
//
// Key: getKey('elevenlabs') → macOS Keychain bdi-elevenlabs locally,
// BDI_KEY_ELEVENLABS env on Railway. Model/voice ids carry env overrides
// (the news-engine lesson: never hardcode a retire-able id without an
// escape hatch) — EL errors are surfaced verbatim in logs.

import { getKey } from '../keychain.js';

const STT_MODEL = process.env.BDI_BELLA_STT_MODEL || 'scribe_v2';
// Turbo over Flash (Val 2026-07-03): Flash degraded into a slow, robotic
// delivery on longer passages; Turbo keeps near-realtime latency with far
// better prosody. Delivery is tuned for a brisk, professional voice.
const TTS_MODEL = process.env.BDI_BELLA_TTS_MODEL || 'eleven_turbo_v2_5';
const VOICE_ID  = process.env.BDI_BELLA_VOICE_ID  || 'hA4zGnmTwX2NQiTRMt7o'; // Val's chosen Bella voice (2026-07-03)
const OUTPUT    = process.env.BDI_BELLA_TTS_FORMAT || 'mp3_44100_128';

// Arabic replies get a dedicated voice when one is configured
// (BDI_BELLA_VOICE_ID_AR); otherwise the multilingual turbo model still renders
// Arabic on the default voice. Language is detected from the reply text itself,
// so bilingual conversations switch voice per turn with no client plumbing.
const VOICE_ID_AR = process.env.BDI_BELLA_VOICE_ID_AR || '';
const ARABIC_RX = /[؀-ۿ]/;
function pickVoice(text) {
  return (VOICE_ID_AR && ARABIC_RX.test(String(text || ''))) ? VOICE_ID_AR : VOICE_ID;
}

// Delivery tuning (all overridable without a deploy):
//   stability ↓ = more expressive · style ↑ = more character · speed ↑ = brisker
const VOICE_SETTINGS = {
  stability:         Number(process.env.BDI_BELLA_TTS_STABILITY ?? 0.5),
  similarity_boost:  Number(process.env.BDI_BELLA_TTS_SIMILARITY ?? 0.8),
  style:             Number(process.env.BDI_BELLA_TTS_STYLE ?? 0.3),
  use_speaker_boost: true,
  speed:             Number(process.env.BDI_BELLA_TTS_SPEED ?? 1.08),
};

let cachedKey = null;
let cachedKeyAt = 0;
async function elevenKey() {
  if (cachedKey && Date.now() - cachedKeyAt < 5 * 60_000) return cachedKey;
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(null), 5000); });
  const got = await Promise.race([getKey('elevenlabs'), timeout]);
  clearTimeout(timer);
  if (got) { cachedKey = got; cachedKeyAt = Date.now(); }
  return got || null;
}

export async function voiceConfigured() {
  return !!(await elevenKey());
}

/**
 * Transcribe one utterance. Returns { text, language_code }.
 * `mimetype` comes from the browser's MediaRecorder (webm/opus or mp4).
 */
export async function transcribe(buffer, mimetype) {
  const key = await elevenKey();
  if (!key) throw new Error('elevenlabs_key_missing');
  const form = new FormData();
  form.append('model_id', STT_MODEL);
  form.append('tag_audio_events', 'false');
  form.append('file', new Blob([buffer], { type: mimetype || 'audio/webm' }), 'utterance.webm');
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': key },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('ElevenLabs STT HTTP ' + res.status + ': ' + body.slice(0, 200));
  }
  const data = await res.json();
  return { text: String(data.text || '').trim(), language_code: data.language_code || null };
}

/**
 * Start a streaming TTS request; returns the fetch Response — the caller
 * pipes response.body straight through to the browser (audio/mpeg).
 */
export async function ttsStream(text, signal) {
  const key = await elevenKey();
  if (!key) throw new Error('elevenlabs_key_missing');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(pickVoice(text))}/stream?output_format=${encodeURIComponent(OUTPUT)}`;
  // Arabic replies: pin the language so the multilingual model never reads
  // Arabic text with foreign phonemes. Detection = the reply text itself
  // (same per-turn rule as pickVoice above).
  const arabic = ARABIC_RX.test(String(text));
  const call = (withExtras) => fetch(url, {
    method: 'POST',
    signal,
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: String(text).slice(0, 1500),
      model_id: TTS_MODEL,
      ...(withExtras ? { voice_settings: VOICE_SETTINGS } : {}),
      ...(withExtras && arabic ? { language_code: 'ar' } : {}),
    }),
  });
  let res = await call(true);
  // Insurance: if a model/plan rejects voice_settings or language_code (400),
  // retry plain rather than failing the whole reply.
  if (res.status === 400) {
    const body = await res.text().catch(() => '');
    console.warn('[bella] TTS 400 with extras, retrying plain:', body.slice(0, 160));
    res = await call(false);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('ElevenLabs TTS HTTP ' + res.status + ': ' + body.slice(0, 200));
  }
  return res;
}

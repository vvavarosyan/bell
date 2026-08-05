// Hear Bella in both voice engines, side by side, before deciding anything.
// ----------------------------------------------------------------------------
// Val asked whether to move Bella to ElevenLabs v3 ("it has emotions and sounds more human").
// The honest answer needs his EARS, not an opinion — so this renders the SAME lines through the
// current engine and through v3, writes them to the Desktop, and times each one.
//
// What the research established (verified against ElevenLabs' own /v1/models on Val's account):
//   · eleven_v3 costs a character_cost_multiplier of 1.0; turbo/flash cost 0.5 → v3 is DOUBLE.
//   · eleven_v3 reports can_use_style = false and can_use_speaker_boost = false, so Bella's
//     tuned style/speaker-boost settings simply stop applying.
//   · eleven_turbo_v2_5 IS listed under "Deprecated" in ElevenLabs' model docs, so staying put
//     is not free of risk either — this is a real decision, not a no-op.
// Latency is the thing that actually matters for Bella: she speaks her FIRST SENTENCE while the
// rest of the answer is still being written. If v3 is materially slower, a prettier voice is a
// WORSE conversation. That is what the timings below measure.
//
// Nothing is deployed and no setting changes. This only writes .mp3 files you can play.

import { getKey } from '../keychain.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const VOICE_ID = process.env.BDI_BELLA_VOICE_ID || 'hA4zGnmTwX2NQiTRMt7o';
const CURRENT  = process.env.BDI_BELLA_TTS_MODEL || 'eleven_turbo_v2_5';
const V3       = 'eleven_v3';

// Deliberately three shapes: a short greeting (the latency-critical first sentence), a factual
// business line (Bella's day job), and Arabic (she replies in Arabic and must still work).
const LINES = [
  { id: '1-greeting', text: "Good morning Val. I've found three new tenders that match your profile." },
  { id: '2-business', text: 'Al Ali Engineering won the Qatar Academy contract at four hundred and two million riyals, beating nine other bidders.' },
  { id: '3-arabic',   text: 'صباح الخير. لديك ثلاث مناقصات جديدة تطابق ملفك اليوم.' },
];

async function render(key, model, text, withSettings) {
  const body = {
    text,
    model_id: model,
    ...(withSettings ? { voice_settings: { stability: 0.5, similarity_boost: 0.8, speed: 1.08 } } : {}),
  };
  const t0 = Date.now();
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  const ms = Date.now() - t0;
  if (!r.ok) return { ok: false, ms, status: r.status, error: (await r.text()).slice(0, 200) };
  return { ok: true, ms, buf: Buffer.from(await r.arrayBuffer()) };
}

const key = await getKey('elevenlabs');
console.log('');
console.log('BELLA VOICE COMPARISON — current engine vs ElevenLabs v3');
console.log('==========================================================\n');
if (!key) {
  console.log('No ElevenLabs key found in your Keychain.');
  console.log('Double-click "Set ElevenLabs API Key.command" first, then run this again.\n');
  process.exit(0);
}

const outDir = path.join(os.homedir(), 'Desktop', 'Bella voice comparison');
fs.mkdirSync(outDir, { recursive: true });

const timing = { [CURRENT]: [], [V3]: [] };
for (const line of LINES) {
  console.log(`▸ ${line.id}: "${line.text.slice(0, 58)}${line.text.length > 58 ? '…' : ''}"`);
  for (const model of [CURRENT, V3]) {
    // v3 ignores style/speaker_boost, so send it only what it accepts.
    const res = await render(key, model, line.text, model !== V3);
    if (!res.ok) {
      console.log(`    ${model.padEnd(20)} FAILED (HTTP ${res.status}) ${res.error}`);
      continue;
    }
    const file = path.join(outDir, `${line.id} — ${model}.mp3`);
    fs.writeFileSync(file, res.buf);
    timing[model].push(res.ms);
    console.log(`    ${model.padEnd(20)} ${String(res.ms).padStart(6)} ms   ${(res.buf.length / 1024).toFixed(0)} KB`);
  }
}

const avg = (a) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null);
const a = avg(timing[CURRENT]), b = avg(timing[V3]);
console.log('\n----------------------------------------------------------');
console.log(`Average time to speak   ${CURRENT}: ${a ?? '—'} ms`);
console.log(`Average time to speak   ${V3}: ${b ?? '—'} ms`);
if (a && b) {
  const slower = b / a;
  console.log(`\nv3 is ${slower.toFixed(2)}× ${slower >= 1 ? 'SLOWER' : 'faster'} than what Bella uses today,`);
  console.log('and it costs exactly DOUBLE per character.');
  if (slower > 1.4) console.log('That delay lands on the pause before Bella starts talking, every single time.');
}
console.log(`\nThe audio files are on your Desktop in:\n  Bella voice comparison\n`);
console.log('Play each pair back to back and tell me which you prefer. Nothing has changed —');
console.log('Bella still uses her current voice until you say otherwise.\n');
process.exit(0);

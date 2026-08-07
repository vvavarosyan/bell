// Bella's microphone gate. Two complaints from Val, pointing in OPPOSITE directions, and the gate
// has to satisfy both at once:
//
//   "listening gets stuck"          — deaf. The old gate took the MAXIMUM RMS of its first 700ms as
//                                     the room's noise floor and never revisited it, so anything
//                                     loud in that window (including simply talking as you open
//                                     voice) pinned the bar above speech for the whole session.
//   "noisy environment distracted"  — the mirror image, caused by the FIRST repair. An absolute
//                                     ceiling on the threshold meant a genuinely loud room cleared
//                                     the bar on every frame, so she heard the room as endless
//                                     speech.
//
// A gate that only fixes one of these is not fixed. Every scenario is a frame sequence at ~60fps,
// the rate requestAnimationFrame delivers. Speech into a laptop mic is ~0.05–0.3 RMS; a quiet room
// is ~0.001–0.01; a noisy office sits between.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoiseGate, percentile } from '../../ui/lib/noise_gate.js';

const FRAME = 1000 / 60;
const frames = (ms, value) => Array.from({ length: Math.round(ms / FRAME) }, () => value);

/**
 * Speech-shaped frames. Real speech is NOT a constant level — it has syllable structure, dipping
 * toward the room between sounds, and that structure is exactly what lets a low percentile find
 * the room underneath a talker. A perfectly flat signal is a HUM (a fan, a compressor), and a gate
 * that treats a steady tone as background is behaving correctly, so tests must not model speech
 * that way.
 */
function speech(ms, peak = 0.15, valley = 0.02) {
  const n = Math.round(ms / FRAME);
  return Array.from({ length: n }, (_, i) => ((i % 12) < 8 ? peak : valley));
}

/** Run a sequence; returns the final reading plus how many utterances would have STARTED. */
function run(gate, values, startAt = 0) {
  let now = startAt;
  let out = gate.read();
  let starts = 0;
  for (const v of values) { out = gate.push(v, now); if (out.startSpeech) starts++; now += FRAME; }
  return { out, now, starts };
}

test('percentile picks a low-end value, not the peak', () => {
  assert.equal(percentile([0.001, 0.002, 0.003, 0.9], 0.25), 0.002);
  assert.equal(percentile([], 0.5), 0);
});

// ── DIRECTION 1: never deaf ─────────────────────────────────────────────────────────────────────

test('quiet room: ordinary speech is heard', () => {
  const g = createNoiseGate();
  const { now } = run(g, frames(800, 0.003));
  const { starts } = run(g, frames(500, 0.12), now);
  assert.equal(starts, 1, 'speech after a quiet calibration must start exactly one utterance');
});

test('THE STUCK BUG: speaking during calibration must not deafen her', () => {
  const g = createNoiseGate();
  // Val opens voice and talks straight through the calibration window — the case that killed it.
  const { now } = run(g, speech(800));
  const { starts, out } = run(g, speech(800), now);
  assert.ok(starts >= 1, `still-talking must be heard, threshold was ${out.listenTh.toFixed(4)}`);
});

test('a steady hum IS the room, and is treated as such', () => {
  // The counterpart to the test above, and the reason it must use speech-shaped input: a flat
  // tone at speech level is a fan, not a person. Raising the bar above it is correct behaviour,
  // not a regression — and a real voice over that hum must still get through.
  const g = createNoiseGate();
  const { now } = run(g, frames(800, 0.12));
  const { starts } = run(g, frames(1000, 0.12), now);
  assert.equal(starts, 0, 'a constant tone must not be transcribed as endless speech');
  const { starts: overHum } = run(g, speech(800, 0.45, 0.12), now);
  assert.ok(overHum >= 1, 'a person talking over the hum must still be heard');
});

test('a door bangs during calibration — the room is still the room', () => {
  const g = createNoiseGate();
  const seq = [...frames(300, 0.004), ...frames(60, 0.4), ...frames(440, 0.004)];
  const { now } = run(g, seq);
  const { starts } = run(g, frames(500, 0.10), now);
  assert.equal(starts, 1, 'one transient must not set the floor');
});

test('a bad read heals once the room goes quiet', () => {
  const g = createNoiseGate();
  const { now: a } = run(g, frames(800, 0.12));
  const { now: b } = run(g, frames(2000, 0.003), a);   // room falls silent
  const { starts } = run(g, frames(500, 0.08), b);     // then someone speaks, softly
  assert.equal(starts, 1, 'sensitivity must return without restarting voice');
});

// ── DIRECTION 2: not fooled by a noisy room ─────────────────────────────────────────────────────

test("THE NOISE BUG: a loud room is not mistaken for someone talking", () => {
  const g = createNoiseGate();
  // A busy office: steady 0.06 with the ordinary jitter of real noise.
  const noise = Array.from({ length: 300 }, (_, i) => 0.06 + (i % 7) * 0.002);
  const { now } = run(g, noise.slice(0, 60));
  const { starts, out } = run(g, noise, now);
  assert.equal(starts, 0,
    `room noise must not start an utterance (threshold ${out.listenTh.toFixed(4)} vs noise ~0.06)`);
  assert.ok(out.listenTh > 0.06, 'the bar must sit ABOVE the room, not at a fixed number');
});

test('and in that same loud room, a person is still heard', () => {
  const g = createNoiseGate();
  const noise = Array.from({ length: 300 }, (_, i) => 0.06 + (i % 7) * 0.002);
  const { now } = run(g, noise.slice(0, 60));
  const { now: n2 } = run(g, noise, now);
  const { starts } = run(g, frames(600, 0.18), n2);   // someone speaks near the mic
  assert.equal(starts, 1, 'speech close to the mic must clear a noisy room');
});

test('a sentence is not chopped into fragments by its own pauses', () => {
  const g = createNoiseGate();
  const { now } = run(g, frames(800, 0.004));
  // Speech with natural inter-word dips that fall below the START bar but above CONTINUE.
  const { out } = run(g, frames(200, 0.12), now);
  assert.ok(out.continueTh < out.listenTh,
    'sustaining must be easier than starting, or every pause restarts the utterance');
  assert.ok(out.continueTh > 0, 'continue threshold must exist');
});

test('a single-frame spike is not speech', () => {
  const g = createNoiseGate();
  const { now } = run(g, frames(800, 0.004));
  const { starts } = run(g, [0.5, 0.004, 0.5, 0.004, 0.5, 0.004], now);
  assert.equal(starts, 0, 'isolated spikes must not open the recorder');
});

test('barge-in stays reachable, and stricter than plain listening', () => {
  const g = createNoiseGate();
  const { out } = run(g, frames(800, 0.004));
  assert.ok(out.bargeTh > out.listenTh, 'interrupting must be harder than being heard');
  assert.ok(out.bargeTh < 0.1, 'but never require shouting');
});

test('thresholds are sane before the room is known, and in dead silence', () => {
  const g = createNoiseGate();
  const first = g.push(0.003, 0);
  assert.equal(first.calibrating, true);
  assert.ok(first.listenTh >= 0.012 && first.bargeTh >= 0.02);
  const { out } = run(createNoiseGate(), frames(3000, 0));
  assert.ok(out.floor > 0, 'a zero floor would make every frame speech');
  assert.ok(out.listenTh >= 0.012);
});

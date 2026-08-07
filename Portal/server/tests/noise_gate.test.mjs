// Bella's microphone gate. Val: "listening gets stuck."
//
// The old gate took the MAXIMUM RMS over its first 700ms as the room's noise floor and never
// revisited it, so anything loud in that window — including the entirely normal case of Val
// speaking the moment he opens voice — pinned the threshold ABOVE speech for the rest of the
// session. The orb said "listening" while being deaf, and talking louder made it worse.
//
// Every scenario below is a frame sequence at ~60fps (16.7ms/frame), the rate requestAnimationFrame
// actually delivers. Speech into a laptop mic is ~0.05–0.3 RMS; a quiet room is ~0.001–0.01.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNoiseGate, percentile } from '../../ui/lib/noise_gate.js';

const FRAME = 1000 / 60;

/** Run a sequence of RMS values through a gate; returns the final reading. */
function run(gate, values, startAt = 0) {
  let now = startAt;
  let out = gate.read();
  for (const v of values) { out = gate.push(v, now); now += FRAME; }
  return { out, now };
}
const frames = (ms, value) => Array.from({ length: Math.round(ms / FRAME) }, () => value);

test('percentile picks a low-end value, not the peak', () => {
  assert.equal(percentile([0.001, 0.002, 0.003, 0.9], 0.25), 0.002);
  assert.equal(percentile([5, 1, 3, 2, 4], 0), 1);
  assert.equal(percentile([], 0.5), 0);
});

test('a quiet room ends up sensitive to ordinary speech', () => {
  const g = createNoiseGate();
  const { out } = run(g, frames(800, 0.003));
  assert.equal(out.calibrating, false);
  assert.ok(out.listenTh <= 0.02, `threshold should stay low in a quiet room, got ${out.listenTh}`);
  assert.ok(0.08 > out.listenTh, 'normal speech must clear it');
});

test('THE BUG: speaking during calibration must not deafen the gate', () => {
  // Val opens voice and immediately says something — 700ms of speech-level frames.
  const g = createNoiseGate();
  const { out } = run(g, frames(800, 0.12));
  // The old rule (max * 1.4 * 2.2) would have produced a threshold near 0.37 — nearly 4x ordinary
  // speech, unreachable forever. The ceiling alone must prevent that.
  assert.ok(out.listenTh <= 0.05,
    `speech during calibration must not raise the bar above speech, got ${out.listenTh}`);
  assert.ok(out.listenTh < 0.12, 'the very speech that caused it must still be audible');
});

test('a single bang during calibration does not define the room', () => {
  const g = createNoiseGate();
  // A quiet room with one loud transient (a door) in the middle of the window.
  const seq = [...frames(300, 0.004), ...frames(60, 0.4), ...frames(440, 0.004)];
  const { out } = run(g, seq);
  assert.ok(out.listenTh <= 0.02,
    `one transient must not set the floor, got ${out.listenTh}`);
});

test('a gate that mis-read the room heals once the room is quiet', () => {
  const g = createNoiseGate();
  // Calibrated during noise…
  const { out: bad, now } = run(g, frames(800, 0.12));
  const badTh = bad.listenTh;
  // …then the room goes quiet for three seconds.
  const { out: healed } = run(g, frames(3000, 0.003), now);
  assert.ok(healed.listenTh < badTh || badTh <= 0.0121,
    `threshold should fall as the room quietens: ${badTh} → ${healed.listenTh}`);
  assert.ok(healed.listenTh <= 0.02, `should return to sensitive, got ${healed.listenTh}`);
});

test('a cough after calibration cannot latch the floor', () => {
  const g = createNoiseGate();
  const { out: base, now } = run(g, frames(800, 0.004));
  const { out: after } = run(g, [...frames(200, 0.5), ...frames(200, 0.004)], now);
  assert.ok(after.listenTh <= base.listenTh * 1.5 + 0.001,
    `a cough must barely move the floor: ${base.listenTh} → ${after.listenTh}`);
});

test('the ceiling holds even in a genuinely loud room', () => {
  const g = createNoiseGate({ listenMax: 0.05 });
  const { out } = run(g, frames(2000, 0.09));
  assert.ok(out.listenTh <= 0.05, `ceiling breached: ${out.listenTh}`);
  // Being deaf is worse than an occasional false trigger: a false trigger costs one short
  // transcription, deafness costs the whole feature.
});

test('barge-in stays possible — she can always be interrupted', () => {
  const g = createNoiseGate();
  const { out } = run(g, frames(2000, 0.09));   // loud room while she speaks
  assert.ok(out.bargeTh <= 0.08,
    `interrupting must never require shouting past ordinary speech, got ${out.bargeTh}`);
  assert.ok(out.bargeTh > out.listenTh, 'barge-in must stay stricter than plain listening');
});

test('thresholds are usable during calibration, not zero', () => {
  const g = createNoiseGate();
  const first = g.push(0.003, 0);
  assert.equal(first.calibrating, true);
  assert.ok(first.listenTh >= 0.012, 'must not be wide open before the room is known');
  assert.ok(first.bargeTh >= 0.02);
});

test('the floor never collapses to zero in dead silence', () => {
  const g = createNoiseGate();
  const { out } = run(g, frames(5000, 0));
  assert.ok(out.floor > 0, 'a zero floor would make every frame speech');
  assert.ok(out.listenTh >= 0.012);
});

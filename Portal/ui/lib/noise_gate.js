// The microphone gate that decides when Bella is being spoken to.
//
// Pure on purpose: inline in the animation loop, the only way to check this was to speak into a
// laptop and hope. Push RMS frames in, read thresholds out, and the scenarios below become tests.
//
// ── TWO FAILURES, IN OPPOSITE DIRECTIONS ────────────────────────────────────────────────────────
// FIRST (Val: "listening gets stuck"): the original gate spent 700ms taking the MAXIMUM RMS it saw
// as the room's noise floor, then used that for the whole session and never revisited it. A
// maximum is the least robust statistic there is — one door, one cough, or simply starting to talk
// as you open voice pinned the floor at SPEECH level, leaving the bar 2.2x above ordinary speech.
// She sat there saying "listening" while structurally deaf, and talking louder made it worse.
//
// SECOND (Val: "noisy environment distracted her"): the first repair added a hard ABSOLUTE ceiling
// on the threshold. That cured deafness and caused the mirror-image fault — in a genuinely loud
// room EVERY frame cleared a capped bar, so she heard the room as continuous speech: utterances
// that never ended, transcriptions of nothing.
//
// The ceiling was the wrong instrument. Deafness was never caused by loud rooms; it was caused by
// the floor being WRONG and never re-examined. So the floor is what is fixed:
//
//   1. CALIBRATE ON A LOW PERCENTILE, not the peak. Even during continuous speech the RMS dips
//      between syllables, so the 10th percentile finds the room rather than the talker.
//   2. KEEP ADAPTING, ASYMMETRICALLY — fall fast toward quiet, rise slowly. A mis-read heals in
//      about a second instead of lasting the session; rising slowly stops one cough latching it.
//   3. CLAMP THE FLOOR TO THE ROOM'S OWN QUIET LEVEL, not to a fixed number. The floor may never
//      sit more than FLOOR_OVER_QUIET x above the quietest level recently observed. In a loud room
//      that quiet level is itself high, so the bar scales up with the room — which is correct. In
//      a quiet room where something banged, it cannot stay high. This does the job the absolute
//      ceiling was trying to do, without being blind to how loud the room actually is.
//   4. HYSTERESIS. Starting an utterance takes a clear rise above the bar for several consecutive
//      frames; SUSTAINING it only takes CONTINUE_RATIO of that. Without the split, a noisy room
//      either triggers on every spike or chops a sentence into fragments at each pause.

const FLOOR_MIN = 0.002;         // a zero floor would make every frame speech
const LISTEN_MIN = 0.012;        // never trigger on near-silence
const CALIBRATE_MS = 700;
const LISTEN_MULT = 2.2;
const BARGE_MULT = 3.5;          // stricter while she talks — absorbs what echo cancellation leaves
const BARGE_MIN = 0.02;
const FLOOR_OVER_QUIET = 6;      // how far above the room's quiet level the floor may sit
const CONTINUE_RATIO = 0.55;     // sustaining an utterance is easier than starting one
const START_FRAMES = 3;          // consecutive frames above the bar before speech is believed
const QUIET_RISE = 1.0004;       // per frame: lets the quiet reference follow a room getting louder

/** Value below which `p` of the samples fall (p in 0..1). */
export function percentile(samples, p) {
  const a = [...samples].sort((x, y) => x - y);
  if (!a.length) return 0;
  const i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[i];
}

export function createNoiseGate(opts = {}) {
  const calibrateMs = opts.calibrateMs ?? CALIBRATE_MS;
  const startFrames = opts.startFrames ?? START_FRAMES;
  let t0 = null;
  let calibrating = true;
  const samples = [];
  let floor = 0.004;
  let quiet = null;      // the room's quietest recent level — the reference the floor is clamped to
  let above = 0;         // consecutive frames over the start bar

  const clampFloor = (f) => {
    const lo = FLOOR_MIN;
    const hi = quiet == null ? Infinity : Math.max(FLOOR_MIN, quiet * FLOOR_OVER_QUIET);
    return Math.min(hi, Math.max(lo, f));
  };
  const thresholds = () => {
    const listenTh = Math.max(LISTEN_MIN, floor * LISTEN_MULT);
    return {
      listenTh,
      continueTh: listenTh * CONTINUE_RATIO,
      bargeTh: Math.max(BARGE_MIN, floor * BARGE_MULT),
    };
  };

  return {
    /**
     * Feed one frame.
     * @returns {{listenTh:number, continueTh:number, bargeTh:number, calibrating:boolean,
     *            floor:number, startSpeech:boolean}}
     *   startSpeech — true on the frame where a NEW utterance should begin.
     */
    push(rms, now) {
      if (t0 === null) t0 = now;

      // The room's quiet reference. Tracked always, including during calibration, and allowed to
      // drift up slowly so a room that genuinely gets louder is followed rather than fought.
      quiet = quiet == null ? rms : Math.min(quiet * QUIET_RISE, rms);
      quiet = Math.max(FLOOR_MIN / 2, quiet);

      if (calibrating) {
        samples.push(rms);
        if (now - t0 < calibrateMs) return { ...thresholds(), calibrating: true, floor, startSpeech: false };
        // Speech and bangs live at the TOP of the distribution; the room lives at the bottom.
        // A low percentile finds the room even when the whole window contains talking, because
        // RMS dips between syllables.
        // NO extra multiplier here. The floor IS the room's level; the margin above it belongs to
        // LISTEN_MULT alone. Stacking 1.4 on top of 2.2 demanded speech 3.08x louder than the
        // room, which in a noisy office is more headroom than a nearby talker actually has —
        // the very complaint this is fixing.
        floor = clampFloor(percentile(samples, 0.10));
        calibrating = false;
        return { ...thresholds(), calibrating: false, floor, startSpeech: false };
      }

      const th = thresholds();
      // Only non-speech frames inform the floor, or it would chase the talker upward.
      if (rms < th.listenTh) {
        const a = rms < floor ? 0.05 : 0.002;   // fall fast, rise slow
        floor = clampFloor(floor * (1 - a) + rms * a);
      } else {
        floor = clampFloor(floor);
      }

      above = rms > th.listenTh ? above + 1 : 0;
      const startSpeech = above === startFrames;
      return { ...thresholds(), calibrating: false, floor, startSpeech };
    },
    read() { return { ...thresholds(), calibrating, floor }; },
  };
}

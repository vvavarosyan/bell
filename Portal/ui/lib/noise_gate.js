// The microphone gate that decides when Bella is being spoken to.
//
// WHY THIS IS ITS OWN MODULE: the old logic lived inline in the animation loop, so the only way to
// test it was to speak into a laptop. It is pure now — you push RMS samples in and read thresholds
// out — which is how the four scenarios below became unit tests instead of guesses.
//
// ── THE BUG THIS REPLACES (Val: "listening gets stuck") ──────────────────────────────────────
// The old gate spent its first 700ms taking the MAXIMUM RMS it saw and used that as the room's
// noise floor, for the rest of the session, never revisited:
//
//     if (now - t0 < 700) { noiseFloor = Math.max(noiseFloor, rms * 1.4); return; }
//     const listenTh = Math.max(0.012, noiseFloor * 2.2);
//
// A maximum is the least robust statistic there is. One loud thing in that 700ms window — a door,
// a chair, a cough, a notification, or the completely normal case of Val starting to talk the
// instant he opens voice — latched the floor at SPEECH level. The threshold then sat 2.2× ABOVE
// ordinary speech and nothing could ever cross it again. The orb sat there saying "listening"
// while being structurally deaf, and no amount of talking louder fixed it, because talking louder
// is what caused it.
//
// THREE CHANGES, each aimed at that:
//   1. Calibrate on a LOW PERCENTILE, not the max. The quietest quarter of the window is the room;
//      anything above it is an event. One bang no longer defines the room.
//   2. KEEP ADAPTING, asymmetrically — fall fast toward quiet, rise slowly. A gate that mis-reads
//      the room recovers within a second or two instead of staying wrong forever. Rising slowly
//      means a cough still cannot latch it.
//   3. A HARD CEILING. The threshold may never exceed a level ordinary speech clears. If the room
//      is genuinely louder than that, a false trigger costs one short transcription; being deaf
//      costs Val the entire feature. That trade is deliberate and it is not symmetric.

// Ordinary speech into a laptop mic sits around 0.05–0.3 RMS; a quiet room is 0.001–0.01.
const FLOOR_MIN = 0.002;
const LISTEN_MIN = 0.012;   // never trigger on near-silence
const LISTEN_MAX = 0.05;    // never demand more than ordinary speech — the anti-deafness ceiling
const CALIBRATE_MS = 700;
const LISTEN_MULT = 2.2;
const BARGE_MULT = 3.5;     // stricter while she talks: absorbs what echo cancellation leaves
const BARGE_MIN = 0.02;

/** Value below which `p` of the samples fall (p in 0..1). Sorts a copy; sample counts are tiny. */
export function percentile(samples, p) {
  const a = [...samples].sort((x, y) => x - y);
  if (!a.length) return 0;
  const i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
  return a[i];
}

/**
 * @param {object} [opts]
 * @param {number} [opts.calibrateMs]  length of the initial listen-to-the-room window
 * @param {number} [opts.listenMax]    ceiling on the speech threshold
 */
export function createNoiseGate(opts = {}) {
  const calibrateMs = opts.calibrateMs ?? CALIBRATE_MS;
  const listenMax = opts.listenMax ?? LISTEN_MAX;
  let t0 = null;
  let calibrating = true;
  const samples = [];
  let floor = 0.004;

  const thresholds = () => {
    const listen = Math.min(listenMax, Math.max(LISTEN_MIN, floor * LISTEN_MULT));
    // The barge threshold gets the same ceiling treatment, scaled — otherwise she could become
    // impossible to interrupt, which is the same deafness bug wearing a different hat.
    const barge = Math.min(listenMax * (BARGE_MULT / LISTEN_MULT),
      Math.max(BARGE_MIN, floor * BARGE_MULT));
    return { listenTh: listen, bargeTh: barge };
  };

  return {
    /**
     * Feed one frame. Returns { listenTh, bargeTh, calibrating, floor }.
     * @param {number} rms  frame RMS
     * @param {number} now  monotonic ms (performance.now())
     */
    push(rms, now) {
      if (t0 === null) t0 = now;
      if (calibrating) {
        samples.push(rms);
        if (now - t0 < calibrateMs) return { ...thresholds(), calibrating: true, floor };
        // The quietest quarter of the window IS the room. Speech or a bang occupies the top of
        // the distribution and is excluded by construction, not by a threshold we had to guess.
        floor = Math.max(FLOOR_MIN, percentile(samples, 0.25) * 1.4);
        calibrating = false;
        return { ...thresholds(), calibrating: false, floor };
      }

      const { listenTh } = thresholds();
      // Only frames that are NOT speech inform the floor, or she would chase her own users upward.
      if (rms < listenTh) {
        // Asymmetric: fall fast, rise slow. Falling fast is what makes a bad calibration heal;
        // rising slowly is what stops one cough from latching it.
        const a = rms < floor ? 0.05 : 0.002;
        floor = Math.max(FLOOR_MIN, floor * (1 - a) + rms * a);
      }
      return { ...thresholds(), calibrating: false, floor };
    },
    /** Current thresholds without feeding a frame. */
    read() { return { ...thresholds(), calibrating, floor }; },
  };
}

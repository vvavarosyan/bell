// A durable record of every scheduled duty — because "it ran" is not the same as "it worked".
// ----------------------------------------------------------------------------
// Three failures this month were invisible for the same reason: the job SUCCEEDED while doing
// nothing, and nothing anywhere said so.
//   · the ROG ran 12 days on stale code — the git pull was skipped nightly, logged to a file
//     nobody opens;
//   · all 9 Google News feeds died 2026-07-10 — the poller kept returning HTTP 200 on an empty
//     feed for 27 days;
//   · Kahramaa returned HTTP 401 for 14 consecutive nights while the tender scan reported OK.
//
// nightly_sweep wraps each duty in its own try/catch that logs a line and continues, and the
// process always exits 0. So any leg could fail every night forever with no trace.
//
// recordJob() writes ONE row per leg to job_runs with its outcome AND its yield. The yield is
// the important half: a leg that succeeds but produces zero is exactly the shape of every
// failure above, so `zero` is recorded as its own status, distinct from ok and error.
//
// Never throws — bookkeeping must not be able to break the night's work.

import { query } from '../db.js';

/**
 * Run `fn`, record what happened, and return its result.
 *
 * @param {string} kind        e.g. 'tender_scan', 'award_reports', 'chain_link'
 * @param {function} fn        the work
 * @param {object}  [opts]
 * @param {function} [opts.yield]  result → number produced. Returning 0 marks the run 'zero'.
 * @param {function} [opts.log]    line logger
 */
export async function recordJob(kind, fn, opts = {}) {
  const started = new Date();
  let result = null, error = null, produced = null;
  try {
    result = await fn();
    if (typeof opts.yield === 'function') {
      try { produced = Number(opts.yield(result)); } catch { produced = null; }
    }
  } catch (err) {
    error = String(err?.message || err).slice(0, 500);
  }

  // 'zero' is NOT an error — the source may genuinely have had nothing new. It is recorded
  // separately so a RUN of zeroes becomes visible, which is what nobody could see before.
  const status = error ? 'error' : (produced === 0 ? 'zero' : 'ok');
  try {
    await query(
      `INSERT INTO job_runs (id, kind, source, status, started_at, completed_at, result, error, triggered_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), $5::jsonb, $6, 'engine')`,
      [kind, opts.source || null, status, started,
       JSON.stringify({ produced, result: summarize(result) }), error],
    );
  } catch { /* never let bookkeeping break the work */ }

  if (opts.log) {
    if (error) opts.log(`✗ ${kind} FAILED: ${error}`);
    else if (produced === 0) opts.log(`⚠ ${kind}: ran fine but produced NOTHING — check the source.`);
  }
  if (error) throw new Error(error);   // caller keeps its own try/catch behaviour
  return result;
}

/** Keep the row small: counts and short strings only, never a whole payload. */
function summarize(r) {
  if (r == null || typeof r !== 'object') return r ?? null;
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 120);
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = {};
      for (const [k2, v2] of Object.entries(v)) if (typeof v2 === 'number') inner[k2] = v2;
      if (Object.keys(inner).length) out[k] = inner;
    }
  }
  return out;
}

/**
 * What every scheduled duty last did — the screen that would have caught all three failures.
 * A duty that has not run in over 36h, or whose last run produced nothing, is flagged.
 */
export async function jobHealth() {
  try {
    const r = await query(`
      SELECT DISTINCT ON (kind) kind, status, completed_at, error, result
        FROM job_runs
       ORDER BY kind, completed_at DESC NULLS LAST`);
    return r.rows.map((j) => {
      const ageH = j.completed_at ? (Date.now() - new Date(j.completed_at).getTime()) / 3.6e6 : null;
      return {
        kind: j.kind,
        status: j.status,
        last_run_at: j.completed_at,
        hours_ago: ageH == null ? null : Math.round(ageH),
        produced: j.result?.produced ?? null,
        error: j.error || null,
        health: j.status === 'error' ? 'failing'
          : ageH == null ? 'never run'
          : ageH > 36 ? 'overdue'
          : j.status === 'zero' ? 'producing nothing'
          : 'ok',
      };
    });
  } catch { return []; }
}

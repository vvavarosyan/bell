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

import os from 'os';
import { query } from '../db.js';

// WHICH MACHINE IS THIS? Bell runs on two against one database — the Mac (control screen) and the
// ROG (engine room) — and they do NOT have the same capabilities. API keys are stored per-machine
// (keychain.js: macOS Keychain on the Mac, environment variables everywhere else), so the same
// duty can genuinely succeed on one and fail on the other.
//
// That produced this, ninety seconds apart, and it read as a flapping bug:
//     10:14:37  duty_alarm  ok
//     10:16:08  duty_alarm  error   email_provider_key_missing
// Both rows were true. Only the host was missing, and without it the only way to tell them apart
// was to reason about timing. Stamped once at module load — it cannot change while the process
// lives, and a hostname lookup must never be on the path of recording a failure.
const HOST = (() => {
  try { return `${os.hostname()} (${process.platform})`; } catch { return null; }
})();

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
      `INSERT INTO job_runs (id, kind, source, status, started_at, completed_at, result, error, triggered_by, host)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, now(), $5::jsonb, $6, 'engine', $7)`,
      [kind, opts.source || null, status, started,
       JSON.stringify({ produced, result: summarize(result) }), error, HOST],
    );
  } catch { /* never let bookkeeping break the work */ }

  if (opts.log) {
    if (error) opts.log(`✗ ${kind} FAILED: ${error}`);
    else if (produced === 0) opts.log(`⚠ ${kind}: ran fine but produced NOTHING — check the source.`);
  }
  if (error) throw new Error(error);   // caller keeps its own try/catch behaviour
  return result;
}

/**
 * Record ONE ROW PER SOURCE for a multi-source job.
 *
 * ⚠️ THIS IS THE FIX FOR THE FAILURE THAT STARTED job_log.js. The tender scan reads four portals
 * and reports ONE aggregate. Kahramaa returned HTTP 401 for fourteen consecutive nights while the
 * job recorded "ok" every time, because the other three sources produced plenty — the total looked
 * healthy and the dead source was invisible inside it. summarize() then dropped the per-source
 * breakdown entirely, so even the stored result could not be interrogated afterwards.
 *
 * An aggregate cannot tell you a source has died. Only a per-source record can. Each gets its own
 * status: 'error' when it threw, 'zero' when it read successfully but produced nothing new (not a
 * failure — a portal may genuinely publish nothing for days, but a RUN of zeroes is a symptom),
 * and 'ok' otherwise.
 *
 * @param {string} kind        e.g. 'tender_scan'
 * @param {object} sources     { kahramaa: {scraped, inserted, updated, error?}, ... }
 * @param {function} [yieldOf] how to read "produced" from one source's result
 */
export async function recordSourceOutcomes(kind, sources, yieldOf = (v) => (v?.inserted ?? 0) + (v?.updated ?? 0)) {
  if (!sources || typeof sources !== 'object') return { recorded: 0 };
  let recorded = 0;
  for (const [source, v] of Object.entries(sources)) {
    const error = v?.error ? String(v.error).slice(0, 500) : null;
    let produced = null;
    if (!error) { try { produced = Number(yieldOf(v)); } catch { produced = null; } }
    const status = error ? 'error' : (produced === 0 ? 'zero' : 'ok');
    try {
      await query(
        `INSERT INTO job_runs (id, kind, source, status, started_at, completed_at, result, error, triggered_by, host)
         VALUES (gen_random_uuid(), $1, $2, $3, now(), now(), $4::jsonb, $5, 'engine', $6)`,
        [kind + ':source', source, status, JSON.stringify({ produced, result: summarize(v) }), error, HOST]);
      recorded++;
    } catch { /* bookkeeping must never break the work */ }
  }
  return { recorded };
}

/**
 * Open a long job's row NOW, and return a function that closes it.
 *
 * recordJob only writes when the work RETURNS. On 2026-08-09 the nightly sweep started at 00:30
 * Qatar, self-updated, and then wrote nothing for sixteen hours — every downstream duty (tender
 * scan, awards, QSE, job boards, registry merge, chain links, weekly check, Bell Score heal) sat
 * in a `finally` block that was never reached. In job_runs that looked like SILENCE, which is
 * exactly what "not scheduled yet" looks like. An open row turns a hang into a visible state.
 */
export async function openJob(kind, meta = {}) {
  let id = null;
  try {
    const r = await query(
      `INSERT INTO job_runs (id, kind, source, status, started_at, result, triggered_by, host)
       VALUES (gen_random_uuid(), $1, $2, 'running', now(), $3::jsonb, 'engine', $4) RETURNING id`,
      [kind, meta.source || null, JSON.stringify(meta), HOST]);
    id = r.rows[0].id;
  } catch { /* bookkeeping must never break the work */ }
  return async (status, result = null, error = null) => {
    if (!id) return;
    try {
      await query(
        `UPDATE job_runs SET status = $2, completed_at = now(), result = $3::jsonb, error = $4
          WHERE id = $1`,
        [id, status, JSON.stringify({ result: summarize(result) }), error ? String(error).slice(0, 500) : null]);
    } catch { /* same */ }
  };
}

/**
 * Sources that have produced NOTHING on every recorded run for a while — the shape that hid
 * Kahramaa. Read by the weekly report so a silently dead portal surfaces without anyone looking.
 */
export async function silentSources({ kind = null, minRuns = 3, days = 7 } = {}) {
  const r = await query(
    `SELECT kind, source,
            count(*)::int                                        AS runs,
            count(*) FILTER (WHERE status = 'ok')::int           AS ok_runs,
            count(*) FILTER (WHERE status = 'error')::int        AS errors,
            max(completed_at)                                    AS last_run
       FROM job_runs
      WHERE source IS NOT NULL
        AND completed_at > now() - ($2 || ' days')::interval
        AND ($1::text IS NULL OR kind = $1)
      GROUP BY kind, source
     HAVING count(*) >= $3 AND count(*) FILTER (WHERE status = 'ok') = 0
      ORDER BY max(completed_at) DESC`,
    [kind, String(days), minRuns]);
  return r.rows;
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

// The duties that are actually SCHEDULED, and are therefore expected to run. job_runs also
// collects ad-hoc kinds written by Portal buttons ('ingest', 'assembly', 'enrichment',
// 'scrape'); those were last used 2026-07-02 and would otherwise show as permanently "overdue",
// which is a false alarm that trains you to ignore the report. An alarm nobody trusts is worse
// than no alarm.
const SCHEDULED_KINDS = new Set([
  'nightly_sweep',
  // The watcher is itself a scheduled duty. Without this it reported as 'ad-hoc' and never raised
  // a flag — so an alarm that cannot send (a missing provider key makes EVERY internal report mute)
  // would stay invisible, which defeats the point of having one.
  'duty_alarm',
  'self_update', 'tender_scan', 'award_reports', 'close_expired_tenders',
  // Added 2026-08-09: these three ride the nightly but were absent from this set, so they could
  // have stopped running without ever being flagged — the same blind spot in a different place.
  'qse_scan', 'job_sweep', 'registry_merge', 'hiring_candidates',
  'chain_auto_link', 'bell_score_heal', 'weekly_data_check',
]);

/**
 * What every scheduled duty last did — the screen that would have caught all three failures.
 * A SCHEDULED duty that has not run in over 36h, or whose last run produced nothing, is flagged.
 * Anything else is reported as 'ad-hoc' and never raises an alarm.
 */
export async function jobHealth() {
  try {
    // The ':source' rows are the per-source breakdown of a parent job, not jobs in their own
    // right. They are excluded here and attached to their parent below, so the dashboard shows
    // "tender_scan — 4 sources, 1 failing" instead of five unrelated-looking rows.
    const r = await query(`
      SELECT DISTINCT ON (kind) kind, status, started_at, completed_at, error, result, host
        FROM job_runs
       WHERE kind NOT LIKE '%:source'
       ORDER BY kind, COALESCE(completed_at, started_at) DESC NULLS LAST`);
    // ⚠️ THE LATEST ROW IS NOT THE WHOLE STORY WHEN TWO MACHINES RUN THE SAME DUTY.
    // The Mac and the ROG both run the hourly duty alarm against this one database, and they do
    // not have the same API keys, so one can succeed while the other fails. Taking only the newest
    // row makes the card flip between green and red depending on which machine wrote last — and
    // hides the fact that a whole machine is broken. This collects the latest outcome PER HOST for
    // any duty where the hosts disagree, so the card can name the machine that is failing.
    const split = await query(`
      SELECT kind, host, status, error, at FROM (
        SELECT DISTINCT ON (kind, host) kind, host, status, error,
               COALESCE(completed_at, started_at) AS at
          FROM job_runs
         WHERE kind NOT LIKE '%:source' AND host IS NOT NULL
           AND COALESCE(completed_at, started_at) > now() - interval '3 days'
         ORDER BY kind, host, COALESCE(completed_at, started_at) DESC NULLS LAST) x
       ORDER BY kind, at DESC`);
    const byHost = new Map();
    for (const x of split.rows) {
      if (!byHost.has(x.kind)) byHost.set(x.kind, []);
      byHost.get(x.kind).push({ host: x.host, status: x.status, error: x.error, last_run_at: x.at });
    }
    // Latest outcome for each (parent kind, source).
    const per = await query(`
      SELECT DISTINCT ON (kind, source) kind, source, status, completed_at, error, result
        FROM job_runs
       WHERE kind LIKE '%:source' AND source IS NOT NULL
         AND completed_at > now() - interval '14 days'
       ORDER BY kind, source, completed_at DESC NULLS LAST`);
    const bySource = new Map();
    for (const x of per.rows) {
      const parent = x.kind.replace(/:source$/, '');
      if (!bySource.has(parent)) bySource.set(parent, []);
      bySource.get(parent).push({
        source: x.source,
        status: x.status,
        last_run_at: x.completed_at,
        produced: x.result?.produced ?? null,
        error: x.error || null,
        health: x.status === 'error' ? 'failing' : x.status === 'zero' ? 'producing nothing' : 'ok',
      });
    }
    return r.rows.map((j) => {
      const sources = bySource.get(j.kind) || null;
      const at = j.completed_at || j.started_at;
      const ageH = at ? (Date.now() - new Date(at).getTime()) / 3.6e6 : null;
      // Only worth showing when the machines actually disagree — two green hosts is noise.
      const hosts = byHost.get(j.kind) || null;
      const hostsDisagree = !!hosts && hosts.length > 1
        && new Set(hosts.map((h) => h.status === 'error')).size > 1;
      const failingHost = hostsDisagree ? hosts.find((h) => h.status === 'error') : null;
      return {
        kind: j.kind,
        status: j.status,
        last_run_at: at,
        hours_ago: ageH == null ? null : Math.round(ageH),
        produced: j.result?.produced ?? null,
        error: j.error || null,
        host: j.host || null,
        hosts: hostsDisagree ? hosts : null,
        // "It works on one machine and not the other" is a different problem from "it is broken",
        // and it needs a different action from Val — configure that machine, not fix the code.
        machine_split: failingHost
          ? `works on ${hosts.find((h) => h.status !== 'error')?.host || 'one machine'}, fails on ${failingHost.host}${failingHost.error ? ' — ' + failingHost.error : ''}`
          : null,
        scheduled: SCHEDULED_KINDS.has(j.kind),
        sources,
        // A parent whose TOTAL looks healthy while one of its sources is dead is exactly the
        // Kahramaa shape — so a failing source drags the parent's health down with it.
        health: !SCHEDULED_KINDS.has(j.kind) ? 'ad-hoc'
          // 'running' rows older than a few hours are ABANDONED, not busy. Without this a hang
          // reads as silence, which is indistinguishable from "not scheduled yet".
          : j.status === 'running' ? (ageH != null && ageH < 8 ? 'running' : 'started but never finished')
          : j.status === 'error' ? 'failing'
          : ageH == null ? 'never run'
          : ageH > 36 ? 'overdue'
          // The alarm's healthy state is "nothing to report", which produces 0 — that is success,
          // not silence, so it is exempt from the zero-yield flag every other duty gets.
          : (j.status === 'zero' && j.kind !== 'duty_alarm') ? 'producing nothing'
          : sources?.some((x) => x.health === 'failing') ? 'a source is failing'
          : 'ok',
      };
    });
  } catch { return []; }
}

/**
 * Tell someone, TODAY, that a scheduled duty has stopped working.
 *
 * The weekly data check already lists broken duties — but it sends on Sundays. A nightly that dies
 * on a Monday would sit dead for six days before anyone was told, which is most of the way back to
 * the fourteen-night Kahramaa silence this whole file exists to end.
 *
 * Called from the always-on engine, which is the one process guaranteed to be running when the
 * nightly is not. Deliberately quiet:
 *   · only SCHEDULED duties, never ad-hoc Portal buttons;
 *   · one mail per (kind, health) per COOLDOWN_H, so a duty that stays broken does not mail hourly;
 *   · 'producing nothing' is excluded — a genuinely quiet day is normal, and that state is what the
 *     weekly report is for. Only FAILING, HUNG, and OVERDUE raise a same-day alarm.
 *   · never throws.
 */
const ALARM_COOLDOWN_H = 20;
const ALARM_STATES = new Set(['failing', 'started but never finished', 'overdue', 'never run']);

export async function alarmOnBrokenDuties({ log = () => {} } = {}) {
  try {
    const jobs = (await jobHealth()).filter((j) => j.scheduled && ALARM_STATES.has(j.health));
    if (!jobs.length) return record({ alarmed: 0, broken: [] });

    const { getState, setState } = await import('../outreach/machine.js');
    const seen = (await getState('duty_alarm_last')) || {};
    const now = Date.now();
    const fresh = jobs.filter((j) => {
      const prev = seen[j.kind];
      return !(prev && prev.health === j.health && now - new Date(prev.at).getTime() < ALARM_COOLDOWN_H * 3.6e6);
    });
    if (!fresh.length) return record({ alarmed: 0, suppressed: jobs.length, broken: jobs.map((j) => j.kind) });

    const { sendEmail } = await import('../lib/email.js');
    const to = process.env.BDI_OPS_EMAIL || 'hello@bell.qa';
    const line = (j) => `${j.kind}: ${j.health}` +
      (j.hours_ago != null ? ` (last seen ${j.hours_ago}h ago)` : '') + (j.error ? ` — ${j.error}` : '');
    const html = `
      <div style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:600px">
        <h2 style="margin:0 0 4px">Bell — a scheduled job has stopped working</h2>
        <p style="color:#555;margin:0 0 16px">Bell watches its own duties now. These need a look.</p>
        <table style="border-collapse:collapse;width:100%">
          ${fresh.map((j) => `<tr>
            <td style="padding:7px 0;border-bottom:1px solid #eee">${j.kind}</td>
            <td style="padding:7px 0;border-bottom:1px solid #eee;text-align:right;color:#dc2626;font-weight:600">${j.health}${j.hours_ago != null ? ` · ${j.hours_ago}h ago` : ''}</td>
          </tr>${j.error ? `<tr><td colspan="2" style="padding:0 0 7px;color:#dc2626;font-size:12px">${String(j.error).slice(0, 200)}</td></tr>` : ''}`).join('')}
        </table>
        <p style="color:#555;font-size:13px;margin:16px 0 0">
          "started but never finished" means the job began and never reported an ending — usually a
          network call that hung. The engine box picks the work up again on its next scheduled run;
          nothing is lost, but if the same job says this two days running, it needs attention.
        </p>
      </div>`;
    await sendEmail({
      to, system: 'duty-alarm',
      subject: `Bell — ${fresh.length} scheduled job(s) need a look`,
      html, text: ['Bell — scheduled jobs needing a look', '', ...fresh.map(line)].join('\n'),
    });
    for (const j of fresh) seen[j.kind] = { health: j.health, at: new Date().toISOString() };
    await setState('duty_alarm_last', seen);
    log(`▸ duty alarm emailed to ${to}: ${fresh.map((j) => j.kind).join(', ')}`);
    return record({ alarmed: fresh.length, to, broken: fresh.map((j) => j.kind) });
  } catch (err) {
    log(`✗ duty alarm failed: ${err.message}`);
    return record({ alarmed: 0, broken: [] }, err.message);
  }
}

/**
 * ⚠️ THE WATCHER MUST BE WATCHABLE. The first version of alarmOnBrokenDuties returned quietly on
 * every path — no alarm needed, alarm suppressed by cooldown, alarm sent, alarm THREW. On the
 * morning of 2026-08-10 a duty was failing and no mail arrived, and there was no way to tell
 * whether the check had never run, decided not to alarm, or crashed on sendEmail. That is exactly
 * the success-by-absence this whole file exists to end, reproduced inside the thing built to end
 * it. Every outcome now leaves a row.
 */
async function record(outcome, error = null) {
  try {
    await query(
      `INSERT INTO job_runs (id, kind, status, started_at, completed_at, result, error, triggered_by, host)
       VALUES (gen_random_uuid(), 'duty_alarm', $1, now(), now(), $2::jsonb, $3, 'engine', $4)`,
      [error ? 'error' : 'ok', JSON.stringify(outcome), error, HOST]);
  } catch { /* bookkeeping must never break the engine's round */ }
  return outcome;
}

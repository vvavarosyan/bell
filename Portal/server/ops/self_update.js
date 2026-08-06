// Engine-box self-update — with a failure surface.
// ----------------------------------------------------------------------------
// The two-machine model (2026-07-23) has the ROG run whatever code sits in its clone, pulling
// from git each night. The first version of this logic failed SILENTLY for 12 days: it skipped
// the pull whenever `git status --porcelain` printed anything, and that command counts UNTRACKED
// files — so the scrapers' own output (cra-ict.json, made-in-qatar.json, qfcra.json, written into
// a directory that .gitignore deliberately un-ignores) froze the engines at the 2026-07-24 commit.
// Every A1/A2/B1 fix shipped in that window was dead on the only machine that runs the engines,
// and nothing told anyone. Proven by the harvester storing 153 already-banned logos on 2026-08-01.
//
// What changed, and why each part matters:
//   • NO PRE-GUARD ON A DIRTY TREE. `git merge --ff-only` already refuses when a real conflict
//     exists, and it SUCCEEDS with untracked files or with modified files outside the incoming
//     diff (both verified against a real git repo). Pre-skipping was strictly worse: it blocked
//     safe updates and never named the file.
//   • THE REAL ERROR IS KEPT. Node's execFile puts git's reason on lines 2+ of err.message and in
//     err.stderr; the old code kept only line 1, which is always the useless
//     "Command failed: git -C ... pull --ff-only".
//   • BEHIND/AHEAD IS MEASURED SEPARATELY. `git rev-list --left-right --count` reports staleness
//     even when the pull itself claims success — a box that is only AHEAD (someone committed on
//     it) prints "Already up to date." while running code nobody else has.
//   • THE RESULT IS RECORDED to job_runs so it can be read from the Portal and the weekly report.
//     A silent failure is the thing that actually hurt; visibility is the fix.
//
// Never throws: stale code that runs beats fresh code that doesn't.

import { execFile } from 'child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'util';
import { query } from '../db.js';

const execFileP = promisify(execFile);

// fileURLToPath, NOT .pathname: on Windows .pathname yields '/C:/bell' and `git -C` fails with
// 'Invalid argument' — the ROG proved that live on 2026-07-23.
export function repoRoot() {
  return fileURLToPath(new URL('../../..', import.meta.url));
}

/** git's real complaint, not execFile's wrapper line. */
function gitError(err) {
  const stderr = String(err?.stderr || '').trim();
  if (stderr) return stderr.split('\n').filter(Boolean).slice(0, 3).join(' | ');
  const msg = String(err?.message || '').trim();
  // Drop the leading "Command failed: git ..." line, keep what git actually said.
  const rest = msg.split('\n').slice(1).filter(Boolean);
  return (rest.length ? rest.slice(0, 3).join(' | ') : msg).slice(0, 500);
}

const git = (repo, args, timeout = 60_000) => execFileP('git', ['-C', repo, ...args], { timeout });

/**
 * Fast-forward the clone to its upstream and REPORT what happened.
 * Returns { ok, state, before, after, behind, ahead, branch, error, dirty }.
 *   state: 'updated' | 'already-current' | 'failed' | 'ahead-only'
 */
export async function selfUpdate({ log = () => {} } = {}) {
  const repo = repoRoot();
  const out = {
    ok: false, state: 'failed', repo, branch: null,
    before: null, after: null, behind: null, ahead: null,
    dirty: null, error: null, at: new Date().toISOString(),
  };
  try {
    out.branch = (await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
    out.before = (await git(repo, ['rev-parse', '--short', 'HEAD'])).stdout.trim();

    // Informational only — a dirty tree no longer blocks anything, but naming the files turns a
    // future mystery into a one-line diagnosis.
    try {
      const st = (await git(repo, ['status', '--porcelain'], 30_000)).stdout.trim();
      out.dirty = st ? st.split('\n').length : 0;
      if (st) log(`▸ self-update: ${out.dirty} local file(s) present (not a blocker): ` +
        st.split('\n').slice(0, 3).map((l) => l.trim()).join(', '));
    } catch { /* status is advisory; never let it stop the update */ }

    await git(repo, ['fetch', '--quiet', 'origin'], 90_000);

    // left-right against the tracked upstream: "<behind>\t<ahead>"
    try {
      const counts = (await git(repo, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD'])).stdout.trim();
      const [behind, ahead] = counts.split(/\s+/).map((n) => Number(n) || 0);
      out.behind = behind; out.ahead = ahead;
    } catch { /* no upstream configured — the merge below will say so */ }

    if (out.behind === 0) {
      out.after = out.before;
      out.ok = true;
      // Ahead-only is NOT healthy: this box runs commits nobody else has.
      out.state = out.ahead > 0 ? 'ahead-only' : 'already-current';
      log(out.ahead > 0
        ? `▸ self-update: ALREADY CURRENT but ${out.ahead} local commit(s) exist only on this machine.`
        : '▸ self-update: already current.');
    } else {
      await git(repo, ['merge', '--ff-only', '@{upstream}'], 120_000);
      out.after = (await git(repo, ['rev-parse', '--short', 'HEAD'])).stdout.trim();
      out.ok = true; out.state = 'updated'; out.behind = 0;
      log(`▸ self-update: UPDATED ${out.before} → ${out.after}.`);
    }
  } catch (err) {
    out.error = gitError(err);
    out.state = 'failed';
    log(`▸ self-update FAILED (${out.before || '?'}, ${out.behind ?? '?'} behind): ${out.error}`);
  }

  // Record it. A row here is what makes the failure visible to the Portal + weekly report.
  try {
    // job_runs.id is a uuid with NO column default — every other writer supplies it
    // (ingest/jobs.js does the same). Omitting it makes the INSERT fail on a NOT NULL
    // violation, which the catch below would have hidden: the exact silent-failure shape
    // this module exists to end. Caught by running it end-to-end before shipping.
    await query(
      `INSERT INTO job_runs (id, kind, source, status, started_at, completed_at, result, error, triggered_by)
       VALUES (gen_random_uuid(), 'self_update', $1, $2, now(), now(), $3::jsonb, $4, 'engine')`,
      [out.branch || 'unknown', out.ok ? 'ok' : 'error', JSON.stringify(out), out.error],
    );
  } catch { /* never let bookkeeping break the night's work */ }

  return out;
}

/** Latest recorded result — for /engine-status and the weekly self-report. */
export async function lastSelfUpdate() {
  try {
    const r = await query(
      `SELECT status, error, result, completed_at FROM job_runs
        WHERE kind='self_update' ORDER BY completed_at DESC NULLS LAST LIMIT 1`);
    if (!r.rows.length) return null;
    const row = r.rows[0];
    const res = row.result || {};
    const staleHours = row.completed_at ? (Date.now() - new Date(row.completed_at).getTime()) / 3.6e6 : null;
    return {
      status: row.status, error: row.error, at: row.completed_at,
      state: res.state || null, commit: res.after || res.before || null,
      behind: res.behind ?? null, ahead: res.ahead ?? null, branch: res.branch || null,
      // The engine box updates nightly; nothing recorded for >48h means the task itself is dead.
      stale: staleHours != null && staleHours > 48,
    };
  } catch { return null; }
}

/**
 * After the clone moves forward, the ALWAYS-ON SWEEP is still executing whatever it imported at
 * launch. That is not a corner case — it is what actually happened twice: the pull worked, the
 * engine kept running yesterday's code for 25 hours, and Engines 3/4/6 processed five companies
 * a day while 14,909 waited.
 *
 * The sweep now checks its own HEAD between rounds, but that cannot bootstrap itself: the process
 * that must notice the change is the OLD one, which has no such check. So the nightly — a fresh
 * process every night, therefore always on current code — ends the stale sweep itself and lets
 * the supervisor bring up a replacement.
 *
 * Deliberately narrow. It only fires when the pull actually MOVED, only kills the pid the engine
 * itself published, and only if that heartbeat is recent — a stale row could name a pid the OS
 * has since reused, and killing a stranger's process would be far worse than a stale engine.
 * Never kills its own process. Failure is reported, never thrown: the night's work continues.
 */
export async function recycleEngineAfterUpdate(update, { log = () => {} } = {}) {
  if (!update || update.state !== 'updated') return { recycled: false, reason: 'code unchanged' };
  let row;
  try {
    row = (await query(
      `SELECT pid, updated_at FROM engine_heartbeat WHERE id = 1`)).rows[0];
  } catch { return { recycled: false, reason: 'no heartbeat table' }; }
  if (!row || !row.pid) return { recycled: false, reason: 'engine not running' };

  const ageMs = row.updated_at ? Date.now() - new Date(row.updated_at).getTime() : Infinity;
  if (ageMs > 5 * 60_000) {
    log(`▸ engine recycle skipped: heartbeat is ${Math.round(ageMs / 60000)} min old, so pid ${row.pid} may no longer be the engine.`);
    return { recycled: false, reason: 'stale heartbeat' };
  }
  if (Number(row.pid) === process.pid) return { recycled: false, reason: 'that pid is me' };

  try {
    process.kill(Number(row.pid));            // default SIGTERM; the supervisor relaunches
    log(`▸ engine recycled: ended pid ${row.pid} so it restarts on ${update.after}.`);
    return { recycled: true, pid: row.pid };
  } catch (err) {
    // EPERM here is the cross-session case on Windows. Say so plainly — a silent failure is how
    // the engine stayed stale in the first place.
    log(`✗ engine recycle FAILED for pid ${row.pid}: ${err.code || err.message}. It is still running ${update.before} — restart it manually or give the nightly task elevated rights.`);
    return { recycled: false, reason: err.code || err.message };
  }
}

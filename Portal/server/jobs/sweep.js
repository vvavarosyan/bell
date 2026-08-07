// Reading a company's vacancy board, and — the hard half — deciding when a vacancy has CLOSED.
//
// Val, 2026-08-07: "if the post is deleted or expired or they already hired somebody, we delete it
// from our portal, so it's not misleading information for our users."
//
// ── WHY CLOSURE IS THE HARD HALF ────────────────────────────────────────────────────────────────
// NO SOURCE EVER STATES THAT A VACANCY WAS FILLED. Some state an expiry date; most state nothing.
// The only general signal is a job DISAPPEARING from its board — and a board that failed to load
// is indistinguishable from a board with nothing on it. A naive implementation closes an
// employer's entire vacancy list the first time their DNS hiccups, which is its own kind of
// misleading information, and a worse one because it looks like data rather than an outage.
//
// So closure rests on three rules, in this order:
//   1. AN EXPIRY THAT HAS PASSED closes the job immediately. The source stated it; no sweep needed.
//      ⚠️ Only an expiry the SOURCE genuinely states. QatarEnergy's pages carry a schema.org
//      validThrough that is FABRICATED when the underlying ATS states none — it is create_date
//      plus exactly 365 days — and trusting it would have deleted 9 of 43 live vacancies. The
//      reader refuses those, so what arrives here is real.
//   2. ABSENCE FROM CONSECUTIVE PROVEN-GOOD SWEEPS closes it as withdrawn. "Proven-good" means a
//      row in job_board_sweeps with ok = true; a failed read records ok = false and counts for
//      nothing. Two consecutive misses, not one: a board can paginate oddly or briefly drop a row.
//   3. A BOARD THAT CANNOT BE READ CLOSES NOTHING, ever. Its jobs keep showing until it recovers
//      or a human retires it. The alternative — deleting real vacancies because a server was
//      down — is precisely the misleading information this exists to prevent.
//
// Nothing is hard-deleted: closed_at + close_reason are set, so history survives and a mistake is
// one UPDATE to undo. `jobs` is mirrored, so the change publishes itself on the next push.

import { query } from '../db.js';
import { packRaw } from '../tenders/raw.js';

const MISSES_BEFORE_CLOSED = 2;

/** Record that a board was read — or that reading it failed. Closure depends on this being honest. */
export async function recordSweep(boardKey, { ok, jobsSeen = 0, error = null }) {
  await query(
    `INSERT INTO job_board_sweeps (board_key, ok, jobs_seen, error) VALUES ($1,$2,$3,$4)`,
    [boardKey, !!ok, Number(jobsSeen) || 0, error ? String(error).slice(0, 500) : null]);
  if (ok) {
    await query(
      `UPDATE job_boards SET last_ok_at = now(), last_error = NULL, consecutive_failures = 0,
              updated_at = now() WHERE board_key = $1`, [boardKey]);
  } else {
    await query(
      `UPDATE job_boards SET last_error = $2, consecutive_failures = consecutive_failures + 1,
              updated_at = now() WHERE board_key = $1`,
      [boardKey, error ? String(error).slice(0, 500) : 'unknown']);
  }
}

/**
 * Store the jobs a board is currently advertising.
 *
 * ⚠️ ATTRIBUTION GATE. company_id is written ONLY when the board is 'verified'. An unverified board
 * — one on a host that is not the company's own — yields jobs with NO company attached. That is
 * the guard against Bell's stored website being wrong: "Honey Well Trading & Contracting", a Qatar
 * trading firm, has honeywell.com on record, and that board carries 1,282 vacancies in Chennai.
 * Filtering to Qatar does not save you: Honeywell has a genuine Doha vacancy that would attach to
 * the wrong company with a real, fresh date and light a buyer-intent signal Bell then sells.
 */
export async function upsertJobs(board, jobs, { log = () => {} } = {}) {
  const companyId = board.attribution === 'verified' ? board.company_id : null;
  let inserted = 0, updated = 0;
  for (const j of jobs) {
    if (!j?.external_id || !j?.title) continue;
    const r = await query(`
      INSERT INTO jobs (company_id, source, board_key, external_id, source_url, title,
                        location_text, employer_stated, posted_at, expires_at,
                        is_active, last_seen_at, raw_payload, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz,true,now(),$11::jsonb,now(),now())
      ON CONFLICT (board_key, external_id) WHERE board_key IS NOT NULL AND external_id IS NOT NULL
      DO UPDATE SET
        title           = EXCLUDED.title,
        location_text   = EXCLUDED.location_text,
        employer_stated = EXCLUDED.employer_stated,
        source_url      = EXCLUDED.source_url,
        -- posted_at is the EMPLOYER's date. Never overwrite a real one with a null, and never
        -- refresh it on re-sighting: a job re-seen today was not posted today, and the hiring
        -- signal windows on this column.
        posted_at       = COALESCE(EXCLUDED.posted_at, jobs.posted_at),
        expires_at      = COALESCE(EXCLUDED.expires_at, jobs.expires_at),
        company_id      = COALESCE(EXCLUDED.company_id, jobs.company_id),
        last_seen_at    = now(),
        -- Re-appearing on the board un-closes it. Without this a job that briefly vanished would
        -- stay closed forever while the employer is still advertising it.
        closed_at       = NULL,
        close_reason    = NULL,
        is_active       = true,
        raw_payload     = EXCLUDED.raw_payload,
        updated_at      = now()
      RETURNING (xmax = 0) AS was_insert`,
      [companyId, board.platform, board.board_key, String(j.external_id), j.url || board.url,
       String(j.title).slice(0, 500), j.location_text || null, j.employer_stated || null,
       j.posted_at || null, j.expires_at || null, packRaw(j.raw || j)]);
    if (r.rows[0]?.was_insert) inserted++; else updated++;
  }
  if (inserted || updated) log(`    ${board.board_key}: ${inserted} new, ${updated} still open`);
  return { inserted, updated };
}

/**
 * Close what is no longer advertised. Runs ONLY after a sweep that succeeded — the caller must not
 * call this when the read failed, and recordSweep is what makes that provable after the fact.
 */
export async function closeVanished(boardKey, seenExternalIds, { log = () => {} } = {}) {
  // An expiry the source stated, now past → closed immediately, no waiting.
  const expired = await query(`
    UPDATE jobs SET closed_at = now(), close_reason = 'expired', is_active = false, updated_at = now()
     WHERE board_key = $1 AND closed_at IS NULL
       AND expires_at IS NOT NULL AND expires_at < now()
    RETURNING id`, [boardKey]);

  // Absent from this good sweep. Counted, not closed on the first miss — a board can paginate
  // oddly or briefly drop a row, and a vacancy wrongly removed is exactly the misleading
  // information this is meant to prevent.
  const ids = seenExternalIds.map(String);
  const misses = await query(`
    SELECT id, external_id,
           (SELECT count(*)::int FROM job_board_sweeps s
             WHERE s.board_key = $1 AND s.ok
               AND s.swept_at > COALESCE(j.last_seen_at, j.created_at)) AS good_sweeps_since_seen
      FROM jobs j
     WHERE j.board_key = $1 AND j.closed_at IS NULL
       AND NOT (j.external_id = ANY($2::text[]))`, [boardKey, ids]);

  const toClose = misses.rows.filter((r) => Number(r.good_sweeps_since_seen) >= MISSES_BEFORE_CLOSED);
  if (toClose.length) {
    await query(`
      UPDATE jobs SET closed_at = now(), close_reason = 'withdrawn', is_active = false, updated_at = now()
       WHERE id = ANY($1::bigint[])`, [toClose.map((r) => r.id)]);
  }
  if (expired.rowCount || toClose.length) {
    log(`    ${boardKey}: closed ${expired.rowCount} expired, ${toClose.length} withdrawn`);
  }
  return { expired: expired.rowCount, withdrawn: toClose.length, pending: misses.rows.length - toClose.length };
}

/** Boards due a read, least-recently-swept first. Rejected boards are never swept. */
export async function boardsDue({ limit = 50, staleHours = 12 } = {}) {
  const r = await query(`
    SELECT id, company_id, board_key, platform, url, kind, attribution, consecutive_failures
      FROM job_boards
     WHERE active AND attribution <> 'rejected'
       AND (last_ok_at IS NULL OR last_ok_at < now() - ($2 || ' hours')::interval)
       -- A board that has failed many times in a row is backed off rather than hammered; it is
       -- still listed for a human, and its jobs are NOT closed (rule 3).
       AND consecutive_failures < 10
     ORDER BY last_ok_at NULLS FIRST
     LIMIT $1`, [limit, String(staleHours)]);
  return r.rows;
}

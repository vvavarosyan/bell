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
import { attributeJob } from './attribute.js';

const MISSES_BEFORE_CLOSED = 2;

/** null | string | string[] → a non-empty text[] or null. */
const asArray = (v) => {
  if (v == null) return null;
  const arr = (Array.isArray(v) ? v : [v]).map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
  return arr.length ? arr : null;
};

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
 * ⚠️ ATTRIBUTION IS DECIDED PER JOB, NOT PER BOARD (changed 2026-08-09 when the aggregator sources
 * were wired in). A verified board — a careers page on the company's own domain — still answers for
 * all of its jobs. Everything else has to be named by the POSTING ITSELF: an aggregator carries
 * dozens of employers on one board, so "which board it came from" answers nothing at all there.
 *
 * The original guard still holds and is why an unverified board attributes nothing on its own:
 * "Honey Well Trading & Contracting", a Qatar trading firm, has honeywell.com on record, and that
 * board carries 1,282 vacancies in Chennai. Filtering to Qatar does not save you — Honeywell has a
 * genuine Doha vacancy that would attach to the wrong company with a real, fresh date and light a
 * buyer-intent signal Bell then sells. See jobs/attribute.js.
 */
export async function upsertJobs(board, jobs, { log = () => {} } = {}) {
  let inserted = 0, updated = 0, attributed = 0;
  for (const j of jobs) {
    if (!j?.external_id || !j?.title) continue;
    // WHOSE vacancy is it? A verified board answers directly; otherwise the POSTING must name its
    // own employer and that name must land on exactly one active company. See jobs/attribute.js —
    // an aggregator carries dozens of employers, so "which board it came from" answers nothing.
    const { company_id } = await attributeJob(board, j);
    if (company_id) attributed++;
    const r = await query(`
      INSERT INTO jobs (company_id, source, board_key, external_id, source_url, title,
                        description, location_text, is_remote, workplace_type, employment_type,
                        seniority_level, job_function, industries,
                        salary_min, salary_max, salary_currency, salary_period, applicant_count,
                        employer_stated, posted_at, expires_at,
                        is_active, last_seen_at, extra_fields, raw_payload, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::text[],$14::text[],$15,$16,$17,$18,$19,$20,
              $21::timestamptz,$22::timestamptz,true,now(),$23::jsonb,$24::jsonb,now(),now())
      ON CONFLICT (board_key, external_id) WHERE board_key IS NOT NULL AND external_id IS NOT NULL
      DO UPDATE SET
        title           = EXCLUDED.title,
        description     = COALESCE(EXCLUDED.description, jobs.description),
        location_text   = EXCLUDED.location_text,
        is_remote       = COALESCE(EXCLUDED.is_remote, jobs.is_remote),
        workplace_type  = COALESCE(EXCLUDED.workplace_type, jobs.workplace_type),
        employment_type = COALESCE(EXCLUDED.employment_type, jobs.employment_type),
        seniority_level = COALESCE(EXCLUDED.seniority_level, jobs.seniority_level),
        job_function    = COALESCE(EXCLUDED.job_function, jobs.job_function),
        industries      = COALESCE(EXCLUDED.industries, jobs.industries),
        salary_min      = COALESCE(EXCLUDED.salary_min, jobs.salary_min),
        salary_max      = COALESCE(EXCLUDED.salary_max, jobs.salary_max),
        salary_currency = COALESCE(EXCLUDED.salary_currency, jobs.salary_currency),
        salary_period   = COALESCE(EXCLUDED.salary_period, jobs.salary_period),
        applicant_count = COALESCE(EXCLUDED.applicant_count, jobs.applicant_count),
        employer_stated = EXCLUDED.employer_stated,
        source_url      = EXCLUDED.source_url,
        -- posted_at is the EMPLOYER's date. Never overwrite a real one with a null, and never
        -- refresh it on re-sighting: a job re-seen today was not posted today, and the hiring
        -- signal windows on this column.
        posted_at       = COALESCE(EXCLUDED.posted_at, jobs.posted_at),
        expires_at      = COALESCE(EXCLUDED.expires_at, jobs.expires_at),
        company_id      = COALESCE(EXCLUDED.company_id, jobs.company_id),
        extra_fields    = COALESCE(EXCLUDED.extra_fields, jobs.extra_fields),
        last_seen_at    = now(),
        -- Re-appearing on the board un-closes it. Without this a job that briefly vanished would
        -- stay closed forever while the employer is still advertising it.
        closed_at       = NULL,
        close_reason    = NULL,
        is_active       = true,
        raw_payload     = EXCLUDED.raw_payload,
        updated_at      = now()
      RETURNING (xmax = 0) AS was_insert`,
      [company_id, j.source || board.platform, board.board_key, String(j.external_id),
       j.source_url || j.url || board.url, String(j.title).slice(0, 500),
       j.description || null, j.location_text || null,
       typeof j.is_remote === 'boolean' ? j.is_remote : null,
       j.workplace_type || null, j.employment_type || null, j.seniority_level || null,
       // jobs.job_function and jobs.industries are text[] columns, but the readers state a single
       // value (Qatar Living publishes one function name per listing) — so a bare string is wrapped
       // rather than passed through, which Postgres would reject outright.
       asArray(j.job_function), asArray(j.industries),
       j.salary_min ?? null, j.salary_max ?? null, j.salary_currency || null, j.salary_period || null,
       j.applicant_count ?? null,
       // The employer as the SOURCE names it, kept verbatim and separate from company_id so the
       // claim and the link never get confused for each other.
       j.employer_stated || j.extra_fields?.employer_name || null,
       j.posted_at || null, j.expires_at || null,
       j.extra_fields ? packRaw(j.extra_fields) : null, packRaw(j.raw_payload || j.raw || j)]);
    if (r.rows[0]?.was_insert) inserted++; else updated++;
  }
  if (inserted || updated) log(`    ${board.board_key}: ${inserted} new, ${updated} still open, ${attributed} tied to a company`);
  return { inserted, updated, attributed };
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

/**
 * Boards due a read, least-recently-swept first. Rejected boards are never swept.
 *
 * ⚠️ ONLY BOARDS BELL CAN ACTUALLY READ. The harvester records every careers page it finds, so the
 * table fills with company pages long before there is a parser for them — 66 of them on the first
 * run. Ordering purely by "least recently swept" put all of those (last_ok_at NULL) ahead of the
 * Oracle tenants, and a limit of 40 meant the readable boards were never reached at all: the first
 * live sweep read ZERO boards while reporting "40 no reader yet". Filtering to platforms with a
 * reader keeps the queue from being clogged by boards nobody can parse yet.
 */
export async function boardsDue({ limit = 50, staleHours = 12, platforms = null } = {}) {
  const r = await query(`
    SELECT id, company_id, board_key, platform, url, kind, attribution, consecutive_failures
      FROM job_boards
     WHERE active AND attribution <> 'rejected'
       AND ($3::text[] IS NULL OR platform = ANY($3::text[]))
       AND (last_ok_at IS NULL OR last_ok_at < now() - ($2 || ' hours')::interval)
       -- A board that has failed many times in a row is backed off rather than hammered; it is
       -- still listed for a human, and its jobs are NOT closed (rule 3).
       AND consecutive_failures < 10
     ORDER BY last_ok_at NULLS FIRST
     LIMIT $1`, [limit, String(staleHours), platforms]);
  return r.rows;
}

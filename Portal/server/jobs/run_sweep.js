// Read every known vacancy board, store what is open, close what is not.
//
// Val, 2026-08-07: cover the ENTIRE active company database, and "if the post is deleted or expired
// or they already hired somebody, we delete it from our portal, so it's not misleading information
// for our users."
//
// This is the runner. The readers (jobs/sources/*) know how to parse each platform; sweep.js knows
// how to store and close. This decides WHAT to read, in what order, and — most importantly — it
// records honestly whether each read actually worked, because closure depends on that being true.

import { query } from '../db.js';
import { boardsDue, recordSweep, upsertJobs, closeVanished } from './sweep.js';
import { fetchOracleJobs } from './sources/oracle_cloud.js';

// One entry per platform Bell can read. A board on a platform with no reader is skipped and left
// for later — never guessed at, and never recorded as an empty board, which would start closing
// its jobs.
const READERS = {
  oracle_cloud: async (board) => {
    const host = board.board_key.split(':')[1];
    if (!host) throw new Error('oracle board_key carries no tenant host');
    return fetchOracleJobs(host, { limit: 200 });
  },
};

/**
 * @param {object} opts
 * @param {number} [opts.limit]        boards per run
 * @param {number} [opts.staleHours]   how old a successful read must be before re-reading
 * @param {boolean} [opts.dryRun]      read and report, write nothing
 */
export async function runJobSweep({ limit = 40, staleHours = 12, dryRun = false, log = () => {} } = {}) {
  // Ask only for platforms there is a reader for — see boardsDue for why this matters.
  const boards = await boardsDue({ limit, staleHours, platforms: Object.keys(READERS) });
  const out = { boards: boards.length, read: 0, skipped: 0, failed: 0, jobs: 0, closed: 0, unattributed: 0 };
  if (!boards.length) { log('  no boards due.'); return out; }

  for (const board of boards) {
    const reader = READERS[board.platform];
    if (!reader) { out.skipped++; continue; }

    let jobs;
    try {
      const res = await reader(board);
      jobs = res?.jobs || [];
      // ⚠️ A READ THAT RETURNS NOTHING IS NOT AUTOMATICALLY AN EMPTY BOARD. Oracle answers HTTP 200
      // with a correct total and NO job list when one query parameter is dropped — the reader
      // throws on that shape rather than reporting zero, which is what keeps a silent API change
      // from closing an employer's entire vacancy list.
      out.read++;
    } catch (err) {
      out.failed++;
      if (!dryRun) await recordSweep(board.board_key, { ok: false, error: err.message });
      log(`  ✗ ${board.board_key}: ${err.message.slice(0, 80)}`);
      continue;   // rule 3: a board that cannot be read closes NOTHING
    }

    if (dryRun) {
      log(`  ${board.board_key}: ${jobs.length} open (dry run, nothing written)`);
      out.jobs += jobs.length;
      continue;
    }

    const { inserted, updated } = await upsertJobs(board, jobs, { log });
    out.jobs += inserted + updated;
    if (board.attribution !== 'verified') out.unattributed += inserted + updated;
    // Record the successful read BEFORE closing, so the closure query can see it.
    await recordSweep(board.board_key, { ok: true, jobsSeen: jobs.length });
    const c = await closeVanished(board.board_key, jobs.map((j) => j.external_id), { log });
    out.closed += c.expired + c.withdrawn;
  }

  log(`  boards ${out.read} read · ${out.failed} unreadable · ${out.skipped} no reader yet`);
  log(`  jobs ${out.jobs} open · ${out.closed} closed` + (out.unattributed ? ` · ${out.unattributed} held with no company (board unverified)` : ''));
  return out;
}

/** Register a board Bell can read but did not discover from a website — e.g. a known ATS tenant. */
export async function registerBoard({ companyId, boardKey, platform, url, attribution = 'unverified', why = null }) {
  const r = await query(`
    INSERT INTO job_boards (company_id, board_key, platform, url, kind, attribution, attribution_why)
    VALUES ($1,$2,$3,$4,'ats',$5,$6)
    ON CONFLICT (board_key) DO UPDATE
       SET url = EXCLUDED.url,
           company_id = COALESCE(job_boards.company_id, EXCLUDED.company_id),
           -- An attribution already decided is never downgraded by a re-register.
           attribution = CASE WHEN job_boards.attribution = 'verified' THEN 'verified' ELSE EXCLUDED.attribution END,
           attribution_why = COALESCE(EXCLUDED.attribution_why, job_boards.attribution_why),
           updated_at = now()
    RETURNING id, board_key, attribution`, [companyId, boardKey, platform, url, attribution, why]);
  return r.rows[0];
}

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
import {
  QE_SOURCE, QE_HOST, QE_BASE_URL, QE_CRAWL_DELAY_MS,
  fetchQatarEnergySitemap, fetchQatarEnergyJob,
} from './sources/qatarenergy.js';
import { QL_SOURCE, QL_BASE, QL_LIST_PATH, fetchQatarLivingJobs } from './sources/qatarliving.js';
import { JSONLD_SOURCE, fetchOwnSiteJobs } from './sources/jsonld.js';

// Reading every QatarEnergy vacancy costs one request per posting at the crawl-delay THE SITE'S OWN
// robots.txt states (5 s). MEASURED 2026-08-09: the sitemap lists 249 job URLs, so a full read is
// about 21 minutes. That is fine for a nightly $0 source — but the cap has to sit ABOVE the real
// list, and a run that hits it must FAIL rather than truncate.
//
// ⚠️ WHY TRUNCATION WOULD BE WORSE THAN FAILING. The first version of this capped at 120. A capped
// read returns 120 of 249 postings, and everything it did not reach looks ABSENT from the board —
// so after two such sweeps closeVanished would withdraw 129 live vacancies as "no longer
// advertised". A partial read is not a small read; it is a wrong one. Caught by counting the
// sitemap before shipping (rule 2.2), not by reasoning about it.
const QE_MAX_JOBS_PER_RUN = Number(process.env.BELL_JOBS_QE_MAX || 400);

// Company careers pages are re-read WEEKLY, not nightly. Measured yield across 95 of them is zero
// (see the own_site reader's note) — nightly fetching of 255 pages for nothing would crowd out the
// boards that actually publish vacancies.
const OWN_SITE_STALE_HOURS = Number(process.env.BELL_JOBS_OWN_SITE_STALE_H || 168);

// One entry per platform Bell can read. A board on a platform with no reader is skipped and left
// for later — never guessed at, and never recorded as an empty board, which would start closing
// its jobs.
const READERS = {
  oracle_cloud: async (board) => {
    const host = board.board_key.split(':')[1];
    if (!host) throw new Error('oracle board_key carries no tenant host');
    const res = await fetchOracleJobs(host, { limit: 200 });
    // ⚠️ THE READER COMPUTES `complete` AND THIS USED TO IGNORE IT. A tenant reporting 250 jobs
    // whose page at offset 200 comes back empty yields 200 with complete=false — and the other 50,
    // still advertised, look absent and get withdrawn. Same rule as the classifieds crawl: an
    // incomplete read closes NOTHING. Throwing records the sweep as failed, which is what protects.
    if (res?.complete === false) {
      throw new Error(`oracle ${host}: read ${res.jobs?.length ?? 0} of ${res.total ?? '?'} requisitions — refusing a partial read`);
    }
    return res;
  },

  // ── One employer, one portal ────────────────────────────────────────────────────────────────
  // The sitemap lists every live posting; each posting is then fetched for its detail. A 404 is
  // this source's clearest closure evidence, but it needs no special handling here: a posting that
  // has gone simply stops appearing, and closeVanished waits for two proven-good sweeps.
  //
  // ⚠️ The expiry these pages carry is FABRICATED when the underlying ATS states none — it is
  // create_date plus exactly 365 days, and trusting it would have closed 9 of 43 live vacancies.
  // The reader refuses those, so anything that reaches expires_at here was genuinely stated.
  [QE_SOURCE]: async () => {
    const entries = await fetchQatarEnergySitemap({});
    if (!entries.length) throw new Error('qatarenergy sitemap listed no jobs');
    // See the cap's comment: reading part of a board and reporting it as the whole board is how
    // real vacancies get closed. Refuse instead, loudly, and let a human raise the ceiling.
    if (entries.length > QE_MAX_JOBS_PER_RUN) {
      throw new Error(`qatarenergy lists ${entries.length} jobs, over the ${QE_MAX_JOBS_PER_RUN} ceiling — refusing a partial read (raise BELL_JOBS_QE_MAX)`);
    }
    const jobs = [];
    const stillListed = [];
    let unreadable = 0;
    for (const e of entries) {
      const r = await fetchQatarEnergyJob(e.id, { url: e.url });
      if (!r.ok) {
        // ⚠️ A PAGE BELL COULD NOT READ IS NOT A VACANCY THAT CLOSED — and the first version of
        // this said so in a comment while doing the opposite. Skipping it dropped its id from the
        // seen list, so closeVanished withdrew a posting QatarEnergy's OWN SITEMAP still lists,
        // on the strength of one HTTP 500 in a 21-minute run. A 404 IS closure evidence (proven
        // live on 5 delisted ids); anything else is an outage, so the sitemap's word stands.
        if (!r.closed) { unreadable++; stillListed.push(String(e.id)); }
        continue;
      }
      jobs.push({ ...r.record, employer_stated: r.record?.extra_fields?.employer_name || null });
    }
    // Half the portal unreadable means the portal changed, not that half its jobs closed. Throwing
    // records the sweep as FAILED, and a failed sweep closes nothing (rule 3).
    if (unreadable > entries.length / 2) {
      throw new Error(`qatarenergy: ${unreadable} of ${entries.length} job pages unreadable — refusing to treat this as a complete read`);
    }
    // keepOpen: ids the sitemap still lists but Bell could not fetch this run. Not stored as jobs
    // (there is nothing to store), but counted as SEEN so nothing withdraws them.
    return { jobs, keepOpen: stillListed };
  },

  // ── Many employers, one board ───────────────────────────────────────────────────────────────
  // A classifieds board is not one company's careers page: each listing names its own employer, so
  // company_id comes from that stated name (jobs/attribute.js) and never from the board.
  //
  // ⚠️ CLOSURE NEEDS A COMPLETE CRAWL. The reader reports `complete` only when every page the site
  // itself advertises was fetched AND its own vacancy tally agrees. An incomplete crawl is thrown,
  // which records the sweep as failed — so a half-read list can never withdraw real vacancies.
  // ── A company's own careers page ────────────────────────────────────────────────────────────
  // 255 of these were recorded by the harvester and read by nobody, because every one is a
  // different hand-built layout. This reads ONLY schema.org JobPosting — structured data the site
  // publishes itself for search engines — and returns an honest zero when a page carries none.
  // Scraping the visible page instead would turn "Life at X" testimonials into vacancies.
  //
  // ⚠️ MEASURED 2026-08-09, AND THE ANSWER IS ZERO. Across 95 of Bell's own careers pages (25 by
  // id, then 70 sampled at random): NOT ONE publishes JobPosting. 32 of the 70 publish some
  // structured data — WebPage, WebSite, BreadcrumbList, Organization, DiscussionForumPosting — so
  // the tooling is there; Qatar employers simply do not mark up their vacancies for Google Jobs.
  //
  // The reader is kept because it is correct and free, and any site that adds the markup is picked
  // up the same week. But it runs on a WEEKLY cadence, not nightly (see OWN_SITE_STALE_HOURS):
  // 255 fetches a night for a measured yield of zero is not diligence, it is noise. Covering every
  // company's own site properly needs a paid actor — the route Val already expected to take — or
  // guessing at page layout, which this file exists to refuse.
  [JSONLD_SOURCE]: async (board) => fetchOwnSiteJobs(board.url),

  [QL_SOURCE]: async () => {
    const crawl = await fetchQatarLivingJobs({});
    if (!crawl.complete) {
      throw new Error(`incomplete crawl (${crawl.pagesFetched} of ${crawl.totalPages ?? '?'} pages` +
        `${crawl.errors?.length ? '; ' + String(crawl.errors[0].error).slice(0, 80) : ''}) — refusing to close anything from a partial list`);
    }
    return {
      jobs: crawl.jobs.map((j) => ({
        ...j,
        employer_stated: j.extra_fields?.employer_name || null,
      })),
    };
  },
};

/**
 * The two national boards Bell reads directly. They are not discovered from a company's website —
 * they exist independently of any one company — so they are registered here rather than by the
 * harvester, and neither is ever 'verified': one of them carries many employers, and the other
 * names its employer on every page, which is better evidence than a board-level guess.
 */
export async function ensureNationalBoards({ log = () => {} } = {}) {
  const boards = [
    { board_key: `${QE_SOURCE}:${QE_HOST}`, platform: QE_SOURCE, url: `${QE_BASE_URL}/`, kind: 'ats',
      why: 'the career portal names its own employer on every posting' },
    { board_key: `${QL_SOURCE}:list`, platform: QL_SOURCE, url: `${QL_BASE}${QL_LIST_PATH}`, kind: 'external',
      why: 'many employers on one board — each listing names its own, so attribution is per job' },
  ];
  let added = 0;
  for (const b of boards) {
    const r = await query(`
      INSERT INTO job_boards (company_id, board_key, platform, url, kind, attribution, attribution_why)
      VALUES (NULL,$1,$2,$3,$4,'unverified',$5)
      ON CONFLICT (board_key) DO UPDATE SET url = EXCLUDED.url, updated_at = now()
      RETURNING (xmax = 0) AS was_insert`,
      [b.board_key, b.platform, b.url, b.kind, b.why]);
    if (r.rows[0]?.was_insert) { added++; log(`  registered board ${b.board_key}`); }
  }
  return { added };
}

/**
 * @param {object} opts
 * @param {number} [opts.limit]        boards per run
 * @param {number} [opts.staleHours]   how old a successful read must be before re-reading
 * @param {boolean} [opts.dryRun]      read and report, write nothing
 */
export async function runJobSweep({ limit = 40, staleHours = 12, ownSiteStaleHours = null, dryRun = false, log = () => {} } = {}) {
  if (!dryRun) await ensureNationalBoards({ log });
  // ⚠️ TWO QUEUES, NOT ONE. boardsDue orders by "least recently read", and 255 never-read company
  // careers pages all sort ahead of every ATS board. That exact shape already broke this once: the
  // first live sweep read ZERO boards while reporting "40 no reader yet". So the handful of
  // high-yield boards — the ATS tenants and the two national ones — are asked for FIRST, and the
  // long tail of own-site pages only fills what is left.
  const PRIORITY = Object.keys(READERS).filter((p) => p !== JSONLD_SOURCE);
  const head = await boardsDue({ limit, staleHours, platforms: PRIORITY });
  // Weekly, not nightly — see the reader's note. An explicit ownSiteStaleHours always wins;
  // otherwise "read everything now" (staleHours 0, what the Read Job Boards Now command passes)
  // still means everything, and any other cadence is stretched to a week.
  const ownStale = ownSiteStaleHours ?? (staleHours === 0 ? 0 : Math.max(staleHours, OWN_SITE_STALE_HOURS));
  const tail = head.length < limit
    ? await boardsDue({ limit: limit - head.length, staleHours: ownStale, platforms: [JSONLD_SOURCE] })
    : [];
  const boards = [...head, ...tail];
  const out = { boards: boards.length, read: 0, skipped: 0, failed: 0, jobs: 0, closed: 0, unattributed: 0 };
  // Per PLATFORM, so one dead reader is visible on its own instead of averaging into the total —
  // the same lesson as the tender scan, where three healthy portals hid Kahramaa for 14 nights.
  const bySource = {};
  const track = (platform, patch) => {
    const b = bySource[platform] || (bySource[platform] = { boards: 0, read: 0, failed: 0, inserted: 0, updated: 0, closed: 0 });
    for (const [k, v] of Object.entries(patch)) b[k] = (b[k] || 0) + v;
  };
  for (const b of boards) track(b.platform, { boards: 1 });
  if (!boards.length) { log('  no boards due.'); return out; }

  for (const board of boards) {
    const reader = READERS[board.platform];
    if (!reader) { out.skipped++; continue; }

    let jobs, keepOpen = [];
    try {
      const res = await reader(board);
      jobs = res?.jobs || [];
      keepOpen = res?.keepOpen || [];
      // ⚠️ A READ THAT RETURNS NOTHING IS NOT AUTOMATICALLY AN EMPTY BOARD. Oracle answers HTTP 200
      // with a correct total and NO job list when one query parameter is dropped — the reader
      // throws on that shape rather than reporting zero, which is what keeps a silent API change
      // from closing an employer's entire vacancy list.
      out.read++;
      track(board.platform, { read: 1 });
    } catch (err) {
      out.failed++;
      track(board.platform, { failed: 1 });
      // Keep the message as a SAMPLE, not as the source's verdict. own_site sweeps ~69 pages a
      // night; one 403 among 42 good reads was overwriting the platform's error field and turned
      // the whole source red for six straight nights (found 2026-08-18). Whether the source
      // actually failed is decided after the loop, from structure — read === 0.
      bySource[board.platform].sample_error = err.message.slice(0, 200);
      if (!dryRun) await recordSweep(board.board_key, { ok: false, error: err.message });
      log(`  ✗ ${board.board_key}: ${err.message.slice(0, 80)}`);
      continue;   // rule 3: a board that cannot be read closes NOTHING
    }

    if (dryRun) {
      log(`  ${board.board_key}: ${jobs.length} open (dry run, nothing written)`);
      out.jobs += jobs.length;
      continue;
    }

    // ⚠️ ORDER MATTERS AND IT IS NOT THE OBVIOUS ONE. The sweep row goes in BEFORE the jobs are
    // written, because upsertJobs stamps last_seen_at = now() and closeVanished counts good sweeps
    // LATER than that. Recording afterwards made every job's count start at 1, so the FIRST missed
    // read closed it — the one-blip-deletes-a-live-vacancy bug the whole module exists to avoid.
    // The read has already succeeded by this point, so 'ok' is honest here.
    await recordSweep(board.board_key, { ok: true, jobsSeen: jobs.length });
    const { inserted, updated, attributed } = await upsertJobs(board, jobs, { log });
    out.jobs += inserted + updated;
    out.unattributed += (inserted + updated) - attributed;
    track(board.platform, { inserted, updated });
    // A reader may report ids it knows are still listed but could not read this run — those count
    // as seen, so an outage never withdraws a posting the source is still publishing.
    const seen = [...jobs.map((j) => j.external_id), ...(keepOpen || [])];
    const c = await closeVanished(board.board_key, seen, { log });
    out.closed += c.expired + c.withdrawn;
    track(board.platform, { closed: c.expired + c.withdrawn });
  }

  log(`  boards ${out.read} read · ${out.failed} unreadable · ${out.skipped} no reader yet`);
  out.sources = bySource;
  // A source FAILED only when it is structurally unreadable — nothing at all could be read.
  // Per-page failures stay visible as counts (failed: N) and a sample message, but 42 good
  // reads with 27 bad pages is a working source with bad pages, not a dead source.
  for (const b of Object.values(bySource)) {
    if (b.sample_error && b.read === 0 && b.boards > 0) b.error = b.sample_error;
  }
  for (const [platform, b] of Object.entries(bySource)) {
    log(`  · ${platform}: ${b.read}/${b.boards} read` + (b.failed ? `, ${b.failed} FAILED` : '') +
        `, ${b.inserted} new, ${b.updated} still open` + (b.closed ? `, ${b.closed} closed` : ''));
  }
  log(`  jobs ${out.jobs} open · ${out.closed} closed` + (out.unattributed ? ` · ${out.unattributed} with no company named by the source` : ''));
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

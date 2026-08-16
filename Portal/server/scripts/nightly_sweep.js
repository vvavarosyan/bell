// Nightly Harvest Sweep — unattended.
// ----------------------------------------------------------------------------
// Run by a macOS LaunchAgent at midnight (see "Install Nightly Harvest.command").
// Loops the local Harvest Sweep in chunks until a time budget is spent or the
// backlog is empty, then exits cleanly. Because each chunk selects the next
// least-complete companies by stage flags, the job naturally resumes where the
// previous night stopped — so the ~72k backlog clears over several nights, then
// settles into maintenance (only new companies).
//
// Everything is local + $0: domain guesses auto-save, search finds queue for
// review, the harvester mines each site. No HTTP server needed — this talks to
// the local Postgres and the local headless browser directly.
//
// Tunables (env):
//   BELL_NIGHTLY_MAX_MS  total time budget   (default 6.5h)
//   BELL_NIGHTLY_CHUNK   companies per round (default 300)

import { runHarvestSweep } from '../enrichment/orchestrator.js';
import { autoLinkRegistryChains } from '../enrichment/chain_link.js';
import { autoMergeExactRegistrations } from '../assembly/auto_merge.js';
import { runTenderScan, closeExpiredTenders } from '../tenders/scrape.js';
import { scanMonaqasatAwards, repairThinAwards } from '../tenders/scan_monaqasat_awards.js';
import { selfUpdate, recycleEngineAfterUpdate } from '../ops/self_update.js';
import { recordJob, recordSourceOutcomes, openJob } from '../ops/job_log.js';
import { recomputeBellScores } from '../assembly/bell_score.js';
import { pool } from '../db.js';
import { fileURLToPath } from 'node:url';

const MAX_MS = Number(process.env.BELL_NIGHTLY_MAX_MS || 6.5 * 3600 * 1000);
const CHUNK  = Number(process.env.BELL_NIGHTLY_CHUNK  || 300);
// Award-list pages to re-read nightly. New awards appear at the front, so a handful covers a
// day's worth; raise it if a backlog ever builds. The archive backfill is a separate command.
const AWARD_PAGES = Number(process.env.BELL_NIGHTLY_AWARD_PAGES || 6);
// ⚠️ A HARVEST ROUND MUST NOT BE ABLE TO EAT THE NIGHT.
// 2026-08-09: the nightly started at 00:30 Qatar, self-updated, and wrote nothing for the next
// sixteen hours. The deadline is only consulted BETWEEN rounds, so a single round that never
// returns means the loop never comes round again and the `finally` block below — which is where
// the tender scan, award reports, QSE, job boards, registry merge, chain links, weekly data check
// and Bell Score heal all live — is never reached. Eight scheduled duties, silently skipped, by
// one stuck network read. A round is now raced against a ceiling; losing the race abandons that
// round and moves on, because a lost round costs one chunk and a lost night costs everything.
const ROUND_MAX_MS = Number(process.env.BELL_NIGHTLY_ROUND_MAX_MS || 90 * 60 * 1000);

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

/** Resolve to a sentinel if `p` has not settled in `ms`. Does NOT cancel `p` — nothing here can —
 *  but the night continues, and process.exit at the end takes the straggler with it. */
function withCeiling(p, ms, label) {
  let t;
  const ceiling = new Promise((resolve) => { t = setTimeout(() => resolve({ __timedOut: true, label }), ms); });
  return Promise.race([p, ceiling]).finally(() => clearTimeout(t));
}

(async () => {
  const deadline = Date.now() + MAX_MS;
  log(`▸▸▸ Nightly Harvest Sweep starting — budget ${(MAX_MS / 3600000).toFixed(1)}h, chunk ${CHUNK}.`);
  // Open the row NOW. recordJob only writes when work RETURNS, so a hang left no trace at all —
  // and silence is indistinguishable from "never scheduled". This row says "started", and the
  // Portal flags it as "started but never finished" if it is still open hours later.
  const closeNight = await openJob('nightly_sweep', { budget_h: MAX_MS / 3600000, chunk: CHUNK });
  let nightErr = null;

  // SELF-UPDATE (two-machine model): the engine box runs whatever code sits in its clone.
  // The logic now lives in ops/self_update.js, which RECORDS the outcome to job_runs instead
  // of swallowing it — the first version skipped silently on any untracked file and left the
  // ROG 4 commits behind for 12 days without a single visible symptom.
  const updated = await selfUpdate({ log });

  // ⚠️ RE-EXEC IF THE PULL MOVED, OR THIS PROCESS RUNS TWO VERSIONS AT ONCE.
  // Node resolves STATIC imports when the process launches — before selfUpdate has pulled — and
  // DYNAMIC imports later, from whatever is on disk by then. So after a pull that moved, every
  // `await import(...)` below loads NEW code against modules already cached from the OLD tree.
  //
  // That is not theoretical. On 2026-08-10 the weekly data check died with
  //   "./job_log.js does not provide an export named 'silentSources'"
  // because ops/gap_report.js is imported dynamically (line ~195) and got the new file, while
  // ops/job_log.js was imported statically at line 24 and was still yesterday's. Both were correct
  // and consistent on disk; only this process disagreed with itself.
  //
  // Re-exec is the only honest fix — you cannot un-cache an ES module. The guard env var stops a
  // pull that somehow never settles from looping forever.
  if (updated?.state === 'updated' && !process.env.BELL_NIGHTLY_REEXECED) {
    log(`▸ code moved to ${updated.after} — restarting this run so one version does the whole night.`);
    const { spawn } = await import('node:child_process');
    spawn(process.execPath, [fileURLToPath(import.meta.url)], {
      stdio: 'inherit', detached: false,
      env: { ...process.env, BELL_NIGHTLY_REEXECED: updated.after },
    }).on('exit', (code) => process.exit(code ?? 0));
    return;   // the child owns the night from here
  }

  // If the pull moved, end the always-on sweep so it comes back on the new code. The sweep cannot
  // do this for itself the first time — the process that would notice is the stale one.
  await recycleEngineAfterUpdate(updated, { log });

  let rounds = 0, totalFound = 0, totalHarvested = 0;
  try {
    while (Date.now() < deadline) {
      rounds++;
      let r;
      try {
        r = await withCeiling(
          runHarvestSweep({ limit: CHUNK, triggeredBy: 'nightly', jobLog: (m) => log('  ' + m) }),
          Math.min(ROUND_MAX_MS, Math.max(60_000, deadline - Date.now())), `round ${rounds}`);
        if (r?.__timedOut) {
          log(`✗ Round ${rounds} exceeded ${(ROUND_MAX_MS / 60000).toFixed(0)} min and was abandoned — moving on to the scheduled duties.`);
          nightErr = `harvest round ${rounds} timed out`;
          break;
        }
      } catch (err) {
        log(`✗ Round ${rounds} failed: ${err.message}`);
        nightErr = err.message;
        break;
      }
      totalFound     += r.found || 0;
      totalHarvested += r.harvested || 0;
      log(`✓ Round ${rounds}: +${r.found || 0} found, +${r.harvested || 0} harvested · remaining find:${r.find_left} harvest:${r.harvest_left}`);

      // Nothing left to do this pass — backlog is clear.
      if ((r.find_attempted || 0) === 0 && (r.harvest_attempted || 0) === 0) {
        log('▸ Backlog empty — nothing more to process.');
        break;
      }
    }
  } finally {
    // Daily tender scan — all four sources. Lived on a Mac LaunchAgent until the
    // two-machine flip unloaded it (2026-07-23); the ROG's schedule had no tender task,
    // which would have silently frozen Bell's tenders. Riding the nightly keeps every
    // scheduled duty in ONE place.
    try {
      const t = await recordJob('tender_scan', () => runTenderScan({}),
        { yield: (r) => (r?.total?.inserted ?? 0) + (r?.total?.updated ?? 0), log });
      log(`✓ Tender scan: ${t.total.scraped} scraped · ${t.total.inserted} new · ${t.total.updated} updated · ${t.total.linked} linked.`);
      // ONE RECORD PER SOURCE. The aggregate above is exactly what hid Kahramaa's HTTP 401 for
      // fourteen nights: three healthy portals made the total look fine while a fourth was dead.
      await recordSourceOutcomes('tender_scan', t.sources);
      for (const [src, r] of Object.entries(t.sources)) {
        if (r.error) log(`  ✗ ${src}: ${r.error}`);
        else log(`  · ${src}: ${r.scraped} scraped, ${r.inserted || 0} new, ${r.updated || 0} updated`);
      }
    } catch (err) { log(`✗ Tender scan failed: ${err.message}`); }
    // Fresh AWARD REPORTS — who won, for how much, and who they beat. New awards land at the
    // FRONT of Monaqasat's awarded list, so a small page walk each night keeps Bell current;
    // the whole ~1,187-page archive is a separate one-off ("Backfill Tender Winners.command").
    // Reports already stored are skipped, so this stays cheap forever.
    try {
      const a = await recordJob('award_reports',
        () => scanMonaqasatAwards({ pages: AWARD_PAGES, jobLog: (m) => log('  ' + m) }),
        { yield: (r) => (r?.updated ?? 0) + (r?.inserted ?? 0), log });
      log(`✓ Award reports: ${a.reports} read · ${a.updated} tender(s) filled · ${a.inserted} added · ${a.linked} winner(s) linked to a company.`);
      const rep = await repairThinAwards({ limit: 500, jobLog: (m) => log('  ' + m) });
      if (rep.fixed) log(`✓ Completed ${rep.fixed} award-feed tender(s) that were missing detail.`);
    } catch (err) { log(`✗ Award-report scan failed: ${err.message}`); }
    // A tender whose stated closing date has passed is not open any more. Only Kahramaa did
    // this at scrape time, leaving 319 expired Monaqasat/Ashghal tenders showing as OPEN.
    try {
      const c = await recordJob('close_expired_tenders', () => closeExpiredTenders(), { log });
      if (c.closed) log(`✓ Closed ${c.closed} tender(s) whose deadline had passed.`);
    } catch (err) { log(`✗ Expired-tender close failed: ${err.message}`); }
    // QSE DISCLOSURES — the ~54 listed companies' own announcements (results, dividends, board
    // changes, AGMs, buybacks). Until now the ONLY way this ran was Val double-clicking
    // "Run QSE Scan.command", so it had not run in 14 days and the 'disclosure' signal generator
    // had nothing dated inside its 336h window — a whole signal type quietly off. Plain fetch, no
    // browser, idempotent on the exchange's own ids, so it is safe beside anything else.
    try {
      const q = await recordJob('qse_scan', async () => {
        const { scrapeQse } = await import('../qse/scrape_qse.js');
        const { ingestQseDisclosures, linkQseCompanies, qseTableReady } = await import('../qse/ingest_qse.js');
        if (!(await qseTableReady())) return { skipped: 'table not ready' };
        const year = new Date().getFullYear();
        const { rows } = await scrapeQse({ years: [year, year - 1] });
        // Scraping nothing is a FAILURE, not an empty day: qe.com.qa was unreachable. Saying so
        // lets recordJob mark it, instead of writing a cheerful zero over a real outage.
        if (!rows.length) throw new Error('qe.com.qa returned no rows');
        const ing = await ingestQseDisclosures(rows);
        const link = await linkQseCompanies();
        return { scraped: rows.length, inserted: ing.inserted, updated: ing.updated, linked: link.linked };
      }, { yield: (r) => (r?.inserted ?? 0) + (r?.updated ?? 0), log });
      if (q?.scraped) log(`✓ QSE disclosures: ${q.scraped} read · ${q.inserted} new · ${q.updated} updated · ${q.linked} linked to a Bell company.`);
    } catch (err) { log(`✗ QSE disclosure scan failed: ${err.message}`); }
    // JOB BOARDS — read every readable vacancy board, store what is open, close what has gone.
    // Twice-daily cadence via staleHours: vacancies move faster than company records, and closure
    // needs consecutive PROVEN-GOOD reads before it will remove anything.
    try {
      const js = await recordJob('job_sweep',
        async () => (await import('../jobs/run_sweep.js')).runJobSweep({ limit: 80, staleHours: 10, log: (m) => log(m) }),
        { yield: (r) => r?.jobs ?? 0, log });
      if (js?.read) log(`✓ Job boards: ${js.read} read · ${js.jobs} vacancies open · ${js.closed} closed · ${js.failed} unreadable.`);
      // One row per PLATFORM. The QatarEnergy portal alone is a 21-minute read at the crawl delay
      // its own robots.txt states, so a night where it silently stops must not hide behind the
      // hundreds of vacancies the other readers bring in.
      await recordSourceOutcomes('job_sweep', js?.sources, (v) => (v?.inserted ?? 0) + (v?.updated ?? 0));
      // QCCI directory re-crawl (Val 2026-08-15: "use ROG… to not use Firecrawl credits").
      // A ~1,000-listing chunk of the stalest entries per night — full 41,951-listing cycle in
      // ~6 weeks, continuously, for free. The runner PROBES first and THROWS if this machine's
      // browser is being challenged by Cloudflare, so a blocked night reads as a red error naming
      // the cause, never as "ran fine, produced nothing". Env override: BDI_QCCI_NIGHTLY_LIMIT
      // (0 disables).
      try {
        const qLimit = Number(process.env.BDI_QCCI_NIGHTLY_LIMIT ?? 1000);
        if (qLimit > 0) {
          const qc = await recordJob('qcci_recrawl',
            async () => (await import('./qatarcid_recrawl.js')).recrawlQatarcid({ limit: qLimit, log: (m) => log(m) }),
            { yield: (r) => r?.parsed ?? 0, log });
          if (qc?.parsed) log(`✓ QCCI directory: ${qc.parsed} listings refreshed (${qc.unreadable} unreadable) — no credits spent.`);
        }
      } catch (err) { log(`✗ QCCI re-crawl failed: ${err.message}`); }
      // The website-candidate gate (task #96 + Operation Data Trust B1): examine search-found
      // candidates against the page's own statement of the company name + Qatar context.
      // Precision-first — measured 1% auto-approve on the first 300; every approval hands the
      // harvester a verified site that yields an email ~2 times in 3.
      try {
        const cg = await recordJob('candidate_gate',
          async () => (await import('./confirm_website_candidates.js')).confirmCandidates({ limit: 600, apply: true, log: (m) => log(m) }),
          { yield: (r) => r?.approved ?? 0, log });
        if (cg?.checked) log(`✓ Website candidates: ${cg.approved} confirmed · ${cg.rejected} parked/dead · ${cg.pending} stay queued.`);
      } catch (err) { log(`✗ candidate gate failed: ${err.message}`); }
      // Free email verification (Val 2026-08-17: "free of charge, we can use the ROG").
      // DNS tier marks dead-domain addresses invalid (conclusive, the resolver's own answer);
      // SMTP tier asks each domain's own mail server — never sending DATA — and stores only
      // what the server states: verified / invalid / catch-all. Port-25 egress is probed first,
      // so a blocked network reads as a red error, never as "checked fine, all unknown".
      try {
        const ev = await recordJob('email_verify',
          async () => (await import('../ops/email_verify.js')).runEmailVerify({ dnsLimit: 3000, smtpLimit: 400, log: (m) => log(m) }),
          { yield: (r) => (r?.dns?.marked ?? 0) + (r?.smtp?.verified ?? 0) + (r?.smtp?.invalid ?? 0), log });
        if (ev?.smtp?.verified != null) log(`✓ Email verify: ${ev.smtp.verified} confirmed by their own servers · ${(ev.dns?.marked ?? 0) + (ev.smtp.invalid ?? 0)} proven invalid · ${ev.smtp.catch_all ?? 0} catch-all.`);
      } catch (err) { log(`✗ email verify failed: ${err.message}`); }
      // A vacancy naming an employer Bell has no company for is not a gap in the job data — it is
      // a Qatar firm, provably trading and provably hiring, that the database is missing. Queue it
      // for review rather than leaving a blank cell. Nothing is created without Val's click.
      const hc = await recordJob('hiring_candidates',
        async () => (await import('../jobs/hiring_candidates.js')).queueHiringCandidates({ log: (m) => log(m) }),
        { yield: (r) => r?.queued ?? 0, log });
      if (hc?.queued) log(`✓ ${hc.queued} hiring company(ies) queued for review.`);
    } catch (err) { log(`✗ Job board sweep failed: ${err.message}`); }
    // REGISTRY MERGE (Val, 2026-07-22: "if CR number is matching let it link automatically").
    // Runs BEFORE chain linking on purpose: merging collapses exact duplicates, so the chain
    // linker then works on one record per firm instead of accidentally parenting a branch to a
    // duplicate that is about to disappear. The rule is same-body + same-number + names agree —
    // never number alone, which across different registers would merge a kindergarten into a
    // petroleum services company (both real, both live).
    try {
      const m = await recordJob('registry_merge',
        () => autoMergeExactRegistrations({ apply: true, log: (x) => log(x) }),
        { yield: (r) => r?.merged ?? 0, log });
      if (m?.merged) log(`✓ Registry merge: ${m.merged} duplicate record(s) merged into ${m.eligible} company(ies).`);
      if (m?.held) log(`  ${m.held} registration group(s) held back — the names disagree, so a human decides.`);
    } catch (err) { log(`✗ Registry merge failed: ${err.message}`); }
    // Registry-stated chain links (Val's standing instruction 2026-07-22: a matching
    // base CR links automatically). New MOCI branch registrations picked up by the
    // sweep join their parent the same night.
    try {
      const c = await recordJob('chain_auto_link', () => autoLinkRegistryChains((m) => log(m)), { log });
      if (c.written) log(`✓ Chain links: ${c.written} branch registration(s) auto-linked across ${c.firms} firm(s).`);
    } catch (err) { log(`✗ Chain auto-link failed: ${err.message}`); }
    // WEEKLY DATA CHECK — moved here from the production outreach tick (2026-08-06). Its
    // headline metric reads website_candidates, which is LOCAL-ONLY, so on production every
    // "data lost" figure silently returned 0 and the mail said nothing was being discarded.
    // It has to run where the canonical data is. ignoreHour: the nightly starts at 00:30.
    try {
      const gr = await recordJob('weekly_data_check',
        async () => (await import('../ops/gap_report.js')).maybeSendWeeklyGapReport({ ignoreHour: true }),
        { log });
      if (gr?.sent) log(`✓ Weekly data check emailed to ${gr.to}.`);
    } catch (err) { log(`✗ Weekly data check failed: ${err.message}`); }
    // Safety net: heal any Bell Scores that drifted (writers that forgot to
    // rescore, bulk backfills). Scoped — only rows whose score actually changed.
    try {
      const healed = await recordJob('bell_score_heal', () => recomputeBellScores((m) => log(m)), { log });
      log(`✓ Bell Score heal: ${healed.companies} companies, ${healed.people} people corrected.`);
    } catch (err) { log(`✗ Bell Score heal failed: ${err.message}`); }
    const reason = Date.now() >= deadline ? 'time budget reached' : 'complete';
    log(`▸▸▸ Nightly Harvest Sweep finished (${reason}) — ${rounds} round(s), ${totalFound} found, ${totalHarvested} harvested total.`);
    await closeNight(nightErr ? 'error' : 'ok',
      { rounds, found: totalFound, harvested: totalHarvested, reason }, nightErr);
    try { await pool.end(); } catch {}
    process.exit(0);
  }
})();

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
import { runTenderScan, closeExpiredTenders } from '../tenders/scrape.js';
import { scanMonaqasatAwards, repairThinAwards } from '../tenders/scan_monaqasat_awards.js';
import { selfUpdate } from '../ops/self_update.js';
import { recordJob } from '../ops/job_log.js';
import { recomputeBellScores } from '../assembly/bell_score.js';
import { pool } from '../db.js';

const MAX_MS = Number(process.env.BELL_NIGHTLY_MAX_MS || 6.5 * 3600 * 1000);
const CHUNK  = Number(process.env.BELL_NIGHTLY_CHUNK  || 300);
// Award-list pages to re-read nightly. New awards appear at the front, so a handful covers a
// day's worth; raise it if a backlog ever builds. The archive backfill is a separate command.
const AWARD_PAGES = Number(process.env.BELL_NIGHTLY_AWARD_PAGES || 6);

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

(async () => {
  const deadline = Date.now() + MAX_MS;
  log(`▸▸▸ Nightly Harvest Sweep starting — budget ${(MAX_MS / 3600000).toFixed(1)}h, chunk ${CHUNK}.`);

  // SELF-UPDATE (two-machine model): the engine box runs whatever code sits in its clone.
  // The logic now lives in ops/self_update.js, which RECORDS the outcome to job_runs instead
  // of swallowing it — the first version skipped silently on any untracked file and left the
  // ROG 4 commits behind for 12 days without a single visible symptom.
  await selfUpdate({ log });

  let rounds = 0, totalFound = 0, totalHarvested = 0;
  try {
    while (Date.now() < deadline) {
      rounds++;
      let r;
      try {
        r = await runHarvestSweep({ limit: CHUNK, triggeredBy: 'nightly', jobLog: (m) => log('  ' + m) });
      } catch (err) {
        log(`✗ Round ${rounds} failed: ${err.message}`);
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
      for (const [src, r] of Object.entries(t.sources)) if (r.error) log(`  ✗ ${src}: ${r.error}`);
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
    // Registry-stated chain links (Val's standing instruction 2026-07-22: a matching
    // base CR links automatically). New MOCI branch registrations picked up by the
    // sweep join their parent the same night.
    try {
      const c = await recordJob('chain_auto_link', () => autoLinkRegistryChains((m) => log(m)), { log });
      if (c.written) log(`✓ Chain links: ${c.written} branch registration(s) auto-linked across ${c.firms} firm(s).`);
    } catch (err) { log(`✗ Chain auto-link failed: ${err.message}`); }
    // Safety net: heal any Bell Scores that drifted (writers that forgot to
    // rescore, bulk backfills). Scoped — only rows whose score actually changed.
    try {
      const healed = await recordJob('bell_score_heal', () => recomputeBellScores((m) => log(m)), { log });
      log(`✓ Bell Score heal: ${healed.companies} companies, ${healed.people} people corrected.`);
    } catch (err) { log(`✗ Bell Score heal failed: ${err.message}`); }
    const reason = Date.now() >= deadline ? 'time budget reached' : 'complete';
    log(`▸▸▸ Nightly Harvest Sweep finished (${reason}) — ${rounds} round(s), ${totalFound} found, ${totalHarvested} harvested total.`);
    try { await pool.end(); } catch {}
    process.exit(0);
  }
})();

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
import { runTenderScan } from '../tenders/scrape.js';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileP = promisify(execFile);
import { recomputeBellScores } from '../assembly/bell_score.js';
import { pool } from '../db.js';

const MAX_MS = Number(process.env.BELL_NIGHTLY_MAX_MS || 6.5 * 3600 * 1000);
const CHUNK  = Number(process.env.BELL_NIGHTLY_CHUNK  || 300);

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

(async () => {
  const deadline = Date.now() + MAX_MS;
  log(`▸▸▸ Nightly Harvest Sweep starting — budget ${(MAX_MS / 3600000).toFixed(1)}h, chunk ${CHUNK}.`);

  // SELF-UPDATE (two-machine model, 2026-07-23): the ROG runs whatever code sits in its
  // clone, and nothing pulled automatically — a fix deployed from the Mac never reached the
  // engines. Fast-forward only, never on a dirty tree, and a pull failure must never stop
  // the night's work: stale code that runs beats fresh code that doesn't.
  try {
    const repo = new URL('../../..', import.meta.url).pathname.replace(/\/$/, '');
    const dirty = (await execFileP('git', ['-C', repo, 'status', '--porcelain'])).stdout.trim();
    if (dirty) log('▸ self-update skipped: working tree has local changes.');
    else {
      const out = (await execFileP('git', ['-C', repo, 'pull', '--ff-only'], { timeout: 60_000 })).stdout.trim();
      log('▸ self-update: ' + (out.split('\n').pop() || 'ok'));
    }
  } catch (err) { log('▸ self-update skipped: ' + String(err.message || '').split('\n')[0]); }

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
      const t = await runTenderScan({});
      log(`✓ Tender scan: ${t.total.scraped} scraped · ${t.total.inserted} new · ${t.total.updated} updated · ${t.total.linked} linked.`);
      for (const [src, r] of Object.entries(t.sources)) if (r.error) log(`  ✗ ${src}: ${r.error}`);
    } catch (err) { log(`✗ Tender scan failed: ${err.message}`); }
    // Registry-stated chain links (Val's standing instruction 2026-07-22: a matching
    // base CR links automatically). New MOCI branch registrations picked up by the
    // sweep join their parent the same night.
    try {
      const c = await autoLinkRegistryChains((m) => log(m));
      if (c.written) log(`✓ Chain links: ${c.written} branch registration(s) auto-linked across ${c.firms} firm(s).`);
    } catch (err) { log(`✗ Chain auto-link failed: ${err.message}`); }
    // Safety net: heal any Bell Scores that drifted (writers that forgot to
    // rescore, bulk backfills). Scoped — only rows whose score actually changed.
    try {
      const healed = await recomputeBellScores((m) => log(m));
      log(`✓ Bell Score heal: ${healed.companies} companies, ${healed.people} people corrected.`);
    } catch (err) { log(`✗ Bell Score heal failed: ${err.message}`); }
    const reason = Date.now() >= deadline ? 'time budget reached' : 'complete';
    log(`▸▸▸ Nightly Harvest Sweep finished (${reason}) — ${rounds} round(s), ${totalFound} found, ${totalHarvested} harvested total.`);
    try { await pool.end(); } catch {}
    process.exit(0);
  }
})();

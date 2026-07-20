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
import { recomputeBellScores } from '../assembly/bell_score.js';
import { pool } from '../db.js';

const MAX_MS = Number(process.env.BELL_NIGHTLY_MAX_MS || 6.5 * 3600 * 1000);
const CHUNK  = Number(process.env.BELL_NIGHTLY_CHUNK  || 300);

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

(async () => {
  const deadline = Date.now() + MAX_MS;
  log(`▸▸▸ Nightly Harvest Sweep starting — budget ${(MAX_MS / 3600000).toFixed(1)}h, chunk ${CHUNK}.`);

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

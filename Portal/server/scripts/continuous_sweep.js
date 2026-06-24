// Continuous Enrichment Engine — ALWAYS-ON, resumable.
// ----------------------------------------------------------------------------
// Unlike the old nightly job (run once at midnight for a time budget then exit),
// this runs FOREVER: it sweeps a chunk of the most-incomplete companies through
// the local engines (Website Finder → Harvester → Network Mapper), writes a
// heartbeat, sleeps briefly, and repeats — 24/7 while the Mac is on. A KeepAlive
// LaunchAgent restarts it if it ever dies, and caffeinate keeps the Mac awake.
//
// Resumable + idempotent: each round picks the next frontier by stage flags, so a
// restart simply continues. When the backlog is clear it idles, then re-checks
// (new uploads/companies get picked up automatically).
//
// Considerate pacing: heavier chunks at night, lighter during the day so it never
// bogs the Mac while you work. Everything is local + $0 (no Apify/Firecrawl).
//
// Tunables (env):
//   BELL_ENGINE_NIGHT_CHUNK   companies/round 22:00–07:00  (default 120)
//   BELL_ENGINE_DAY_CHUNK     companies/round daytime      (default 30)
//   BELL_ENGINE_ROUND_SLEEP_MS  pause between rounds        (default 4000)
//   BELL_ENGINE_IDLE_SLEEP_MS   pause when backlog is clear (default 20 min)

import { runHarvestSweep } from '../enrichment/orchestrator.js';
import { pool, query } from '../db.js';

const NIGHT_CHUNK = Number(process.env.BELL_ENGINE_NIGHT_CHUNK || 120);
const DAY_CHUNK   = Number(process.env.BELL_ENGINE_DAY_CHUNK   || 30);
const ROUND_SLEEP = Number(process.env.BELL_ENGINE_ROUND_SLEEP_MS || 4000);
const IDLE_SLEEP  = Number(process.env.BELL_ENGINE_IDLE_SLEEP_MS  || 20 * 60 * 1000);

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isNight = () => { const h = new Date().getHours(); return h < 7 || h >= 22; };

let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { stopping = true; });

const STARTED_AT = new Date();

async function beat(state, s = {}) {
  try {
    await query(
      `INSERT INTO engine_heartbeat
         (id, started_at, updated_at, state, round_no, found_total, harvested_total, mapped_total, find_left, harvest_left, map_left, pid)
       VALUES (1, $1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         started_at = EXCLUDED.started_at, updated_at = now(), state = EXCLUDED.state, round_no = EXCLUDED.round_no,
         found_total = EXCLUDED.found_total, harvested_total = EXCLUDED.harvested_total, mapped_total = EXCLUDED.mapped_total,
         find_left = EXCLUDED.find_left, harvest_left = EXCLUDED.harvest_left, map_left = EXCLUDED.map_left, pid = EXCLUDED.pid`,
      [STARTED_AT, state, s.round_no || 0, s.found_total || 0, s.harvested_total || 0, s.mapped_total || 0,
       s.find_left ?? null, s.harvest_left ?? null, s.map_left ?? null, process.pid]
    );
  } catch { /* heartbeat is best-effort — never let it stop the engine */ }
}

(async () => {
  log('▸▸▸ Continuous Enrichment Engine started — always-on, resumable.');
  let totals = { round_no: 0, found_total: 0, harvested_total: 0, mapped_total: 0 };
  await beat('starting', totals);

  while (!stopping) {
    totals.round_no++;
    const chunk = isNight() ? NIGHT_CHUNK : DAY_CHUNK;
    let r;
    try {
      r = await runHarvestSweep({ limit: chunk, triggeredBy: 'continuous', jobLog: null });
    } catch (err) {
      log(`✗ Round ${totals.round_no} failed: ${err.message}`);
      await beat('error', totals);
      await sleep(30000);
      continue;
    }
    totals.found_total += r.found || 0;
    totals.harvested_total += r.harvested || 0;
    totals.mapped_total += r.mapped || 0;
    const frontier = { find_left: r.find_left, harvest_left: r.harvest_left, map_left: r.map_left };
    const idle = (r.find_attempted || 0) === 0 && (r.harvest_attempted || 0) === 0 && (r.map_attempted || 0) === 0;

    await beat(idle ? 'idle' : 'sweeping', { ...totals, ...frontier });
    log(`✓ Round ${totals.round_no}: +${r.found || 0} found, +${r.harvested || 0} harvested, +${r.mapped || 0} mapped · left find:${r.find_left} harvest:${r.harvest_left} map:${r.map_left}`);

    if (stopping) break;
    if (idle) { log(`▸ Backlog clear — idling ${Math.round(IDLE_SLEEP / 60000)}m before re-checking for new companies.`); await sleep(IDLE_SLEEP); }
    else { await sleep(ROUND_SLEEP); }
  }

  await beat('stopped', totals);
  log('▸▸▸ Continuous Engine stopping (signal received). Frontier is saved — it resumes on next start.');
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(0);
})();

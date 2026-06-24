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
         (id, started_at, updated_at, state, round_no, found_total, harvested_total, mapped_total, email_total, find_left, harvest_left, map_left, email_left, pid)
       VALUES (1, $1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (id) DO UPDATE SET
         started_at = EXCLUDED.started_at, updated_at = now(), state = EXCLUDED.state, round_no = EXCLUDED.round_no,
         found_total = EXCLUDED.found_total, harvested_total = EXCLUDED.harvested_total, mapped_total = EXCLUDED.mapped_total, email_total = EXCLUDED.email_total,
         find_left = EXCLUDED.find_left, harvest_left = EXCLUDED.harvest_left, map_left = EXCLUDED.map_left, email_left = EXCLUDED.email_left, pid = EXCLUDED.pid`,
      [STARTED_AT, state, s.round_no || 0, s.found_total || 0, s.harvested_total || 0, s.mapped_total || 0, s.email_total || 0,
       s.find_left ?? null, s.harvest_left ?? null, s.map_left ?? null, s.email_left ?? null, process.pid]
    );
  } catch { /* heartbeat is best-effort — never let it stop the engine */ }
}

(async () => {
  log('▸▸▸ Continuous Enrichment Engine started — always-on, resumable.');
  let totals = { round_no: 0, found_total: 0, harvested_total: 0, mapped_total: 0, email_total: 0 };
  await beat('starting', totals);

  while (!stopping) {
    // Respect the Portal's pause/resume + pacing controls (best-effort).
    let control = {};
    try { const c = await query(`SELECT paused, night_chunk, day_chunk FROM engine_control WHERE id = 1`); control = c.rows[0] || {}; } catch { /* table may not exist yet */ }
    if (control.paused) {
      await beat('paused', totals);
      await sleep(15000);
      continue;
    }
    totals.round_no++;
    const nightC = Number(control.night_chunk) || NIGHT_CHUNK;
    const dayC   = Number(control.day_chunk)   || DAY_CHUNK;
    const chunk = isNight() ? nightC : dayC;
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
    totals.email_total += r.emails || 0;
    const frontier = { find_left: r.find_left, harvest_left: r.harvest_left, map_left: r.map_left, email_left: r.email_left };
    const idle = (r.find_attempted || 0) === 0 && (r.harvest_attempted || 0) === 0 && (r.map_attempted || 0) === 0 && (r.email_attempted || 0) === 0;

    await beat(idle ? 'idle' : 'sweeping', { ...totals, ...frontier });
    log(`✓ Round ${totals.round_no}: +${r.found || 0} found, +${r.harvested || 0} harvested, +${r.mapped || 0} mapped, +${r.emails || 0} emailed · left find:${r.find_left} harvest:${r.harvest_left} map:${r.map_left} email:${r.email_left}`);

    if (stopping) break;
    if (idle) {
      // Caught up: wait before re-checking for new companies, but keep beating
      // every minute so the dashboard shows the engine as alive-and-idle (not stopped).
      log(`▸ Backlog clear — idling ~${Math.round(IDLE_SLEEP / 60000)}m (still beating) before re-checking.`);
      const until = Date.now() + IDLE_SLEEP;
      while (!stopping && Date.now() < until) {
        await sleep(60000);
        await beat('idle', { ...totals, ...frontier });
        // If a re-scan or new uploads added work, resume sweeping immediately.
        try {
          const c = await query(`SELECT EXISTS(
            SELECT 1 FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND (
              ((website IS NULL OR btrim(website)='') AND stage8_at IS NULL)
              OR (website IS NOT NULL AND btrim(website)<>'' AND (stage7_at IS NULL OR stage9_at IS NULL OR stage10_at IS NULL))
            ) LIMIT 1) AS work`);
          if (c.rows[0] && c.rows[0].work) break;
        } catch { /* ignore */ }
      }
    } else {
      await sleep(ROUND_SLEEP);
    }
  }

  await beat('stopped', totals);
  log('▸▸▸ Continuous Engine stopping (signal received). Frontier is saved — it resumes on next start.');
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(0);
})();

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

// ── SINGLETON GUARD (2026-07-09) ────────────────────────────────────────────
// Two engines sweeping the same frontier is silently destructive: they double
// the Postgres pool load (the June-2026 "timeout exceeded when trying to
// connect" storm), double the Crawl4AI/Playwright browsers on an 8GB Mac, and
// fight over the single heartbeat row. It happened for real when the foreground
// runner and the LaunchAgent were both up. So: if another instance beat within
// the last 90s AND its pid is still alive on this machine, exit quietly. The
// LaunchAgent's KeepAlive simply retries (ThrottleInterval 20s) and takes over
// the moment the other instance stops.
async function anotherEngineIsRunning() {
  try {
    const r = await query(`SELECT pid, updated_at, state FROM engine_heartbeat WHERE id = 1`);
    const hb = r.rows[0];
    if (!hb || !hb.pid || Number(hb.pid) === process.pid) return false;
    const ageMs = Date.now() - new Date(hb.updated_at).getTime();
    if (ageMs > 90_000) return false;                      // stale → previous engine is gone
    try { process.kill(Number(hb.pid), 0); } catch { return false; }   // pid not alive → take over
    log(`⊘ Another engine is already running (pid ${hb.pid}, beat ${Math.round(ageMs / 1000)}s ago). Exiting.`);
    log('  Close the other one (the foreground Terminal window, or Uninstall the service) to switch.');
    return true;
  } catch { return false; }   // can't tell → proceed rather than block the engine
}

async function beat(state, s = {}) {
  try {
    await query(
      `INSERT INTO engine_heartbeat
         (id, started_at, updated_at, state, round_no, found_total, harvested_total, mapped_total, email_total, facts_total, tech_total, find_left, harvest_left, map_left, email_left, facts_left, tech_left, pid)
       VALUES (1, $1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (id) DO UPDATE SET
         started_at = EXCLUDED.started_at, updated_at = now(), state = EXCLUDED.state, round_no = EXCLUDED.round_no,
         found_total = EXCLUDED.found_total, harvested_total = EXCLUDED.harvested_total, mapped_total = EXCLUDED.mapped_total, email_total = EXCLUDED.email_total, facts_total = EXCLUDED.facts_total, tech_total = EXCLUDED.tech_total,
         find_left = EXCLUDED.find_left, harvest_left = EXCLUDED.harvest_left, map_left = EXCLUDED.map_left, email_left = EXCLUDED.email_left, facts_left = EXCLUDED.facts_left, tech_left = EXCLUDED.tech_left, pid = EXCLUDED.pid`,
      [STARTED_AT, state, s.round_no || 0, s.found_total || 0, s.harvested_total || 0, s.mapped_total || 0, s.email_total || 0, s.facts_total || 0, s.tech_total || 0,
       s.find_left ?? null, s.harvest_left ?? null, s.map_left ?? null, s.email_left ?? null, s.facts_left ?? null, s.tech_left ?? null, process.pid]
    );
  } catch (err) {
    // The heartbeat must never stop the engine — but a SILENT failure is worse:
    // the dashboard then reads "Stopped (no recent heartbeat)" while the engine
    // is actually sweeping. Two guards (added 2026-07-09):
    //   1. Fall back to the pre-076 column set, so a daemon started before the
    //      migration applied still reports in.
    //   2. Log the reason once, so the log explains any dashboard weirdness.
    try {
      await query(
        `INSERT INTO engine_heartbeat
           (id, started_at, updated_at, state, round_no, found_total, harvested_total, mapped_total, email_total, facts_total, find_left, harvest_left, map_left, email_left, facts_left, pid)
         VALUES (1, $1, now(), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO UPDATE SET
           started_at = EXCLUDED.started_at, updated_at = now(), state = EXCLUDED.state, round_no = EXCLUDED.round_no,
           found_total = EXCLUDED.found_total, harvested_total = EXCLUDED.harvested_total, mapped_total = EXCLUDED.mapped_total, email_total = EXCLUDED.email_total, facts_total = EXCLUDED.facts_total,
           find_left = EXCLUDED.find_left, harvest_left = EXCLUDED.harvest_left, map_left = EXCLUDED.map_left, email_left = EXCLUDED.email_left, facts_left = EXCLUDED.facts_left, pid = EXCLUDED.pid`,
        [STARTED_AT, state, s.round_no || 0, s.found_total || 0, s.harvested_total || 0, s.mapped_total || 0, s.email_total || 0, s.facts_total || 0,
         s.find_left ?? null, s.harvest_left ?? null, s.map_left ?? null, s.email_left ?? null, s.facts_left ?? null, process.pid]
      );
      if (!beat._warned) { beat._warned = true; log(`⚠ heartbeat: using pre-076 columns (${err.message}). Restart the local Portal to apply migration 076.`); }
    } catch (err2) {
      if (!beat._warned2) { beat._warned2 = true; log(`⚠ heartbeat write failed: ${err2.message}`); }
    }
  }
}

(async () => {
  log('▸▸▸ Continuous Enrichment Engine started — always-on, resumable.');
  if (await anotherEngineIsRunning()) { try { await pool.end(); } catch { /* ignore */ } process.exit(0); }
  let totals = { round_no: 0, found_total: 0, harvested_total: 0, mapped_total: 0, email_total: 0, facts_total: 0, tech_total: 0 };
  await beat('starting', totals);

  // Keep the heartbeat fresh even during a LONG round. One round now runs all 5
  // engines with network calls and can exceed the dashboard's 3-min "alive"
  // window; without this it would read "Stopped" mid-round even though it's
  // working. A timer re-stamps the last known state every 45s, independent of the
  // round loop.
  let hbState = 'starting';
  let hbStats = { ...totals };
  const hbTimer = setInterval(() => { beat(hbState, hbStats); }, 45000);
  if (hbTimer.unref) hbTimer.unref();

  while (!stopping) {
    // Respect the Portal's pause/resume + pacing controls (best-effort).
    let control = {};
    try { const c = await query(`SELECT paused, night_chunk, day_chunk FROM engine_control WHERE id = 1`); control = c.rows[0] || {}; } catch { /* table may not exist yet */ }
    if (control.paused) {
      hbState = 'paused'; hbStats = { ...totals };
      await beat('paused', totals);
      await sleep(15000);
      continue;
    }
    totals.round_no++;
    const nightC = Number(control.night_chunk) || NIGHT_CHUNK;
    const dayC   = Number(control.day_chunk)   || DAY_CHUNK;
    const chunk = isNight() ? nightC : dayC;
    hbState = 'sweeping'; hbStats = { ...totals };
    let r;
    try {
      r = await runHarvestSweep({ limit: chunk, triggeredBy: 'continuous', jobLog: null });
    } catch (err) {
      log(`✗ Round ${totals.round_no} failed: ${err.message}`);
      hbState = 'error';
      await beat('error', totals);
      await sleep(30000);
      continue;
    }
    totals.found_total += r.found || 0;
    totals.harvested_total += r.harvested || 0;
    totals.mapped_total += r.mapped || 0;
    totals.email_total += r.emails || 0;
    totals.facts_total += r.facts || 0;
    totals.tech_total += r.tech || 0;
    const frontier = { find_left: r.find_left, harvest_left: r.harvest_left, map_left: r.map_left, email_left: r.email_left, facts_left: r.facts_left, tech_left: r.tech_left };
    const idle = (r.find_attempted || 0) === 0 && (r.harvest_attempted || 0) === 0 && (r.map_attempted || 0) === 0 && (r.email_attempted || 0) === 0 && (r.facts_attempted || 0) === 0 && (r.tech_attempted || 0) === 0;

    hbState = idle ? 'idle' : 'sweeping'; hbStats = { ...totals, ...frontier };
    await beat(hbState, hbStats);
    log(`✓ Round ${totals.round_no}: +${r.found || 0} found, +${r.harvested || 0} harvested, +${r.mapped || 0} mapped, +${r.emails || 0} emailed, +${r.facts || 0} facts, +${r.tech || 0} tech · left find:${r.find_left} harvest:${r.harvest_left} map:${r.map_left} email:${r.email_left} facts:${r.facts_left} tech:${r.tech_left}`);

    if (stopping) break;
    if (idle) {
      // Caught up: wait before re-checking for new companies, but keep beating
      // every minute so the dashboard shows the engine as alive-and-idle (not stopped).
      log(`▸ Backlog clear — idling ~${Math.round(IDLE_SLEEP / 60000)}m (still beating) before re-checking.`);
      hbState = 'idle'; hbStats = { ...totals, ...frontier };
      const until = Date.now() + IDLE_SLEEP;
      while (!stopping && Date.now() < until) {
        await sleep(60000);
        await beat('idle', { ...totals, ...frontier });
        // If a re-scan or new uploads added work, resume sweeping immediately.
        try {
          const c = await query(`SELECT EXISTS(
            SELECT 1 FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND (
              ((website IS NULL OR btrim(website)='') AND stage8_at IS NULL)
              OR (website IS NOT NULL AND btrim(website)<>'' AND (stage7_at IS NULL OR stage9_at IS NULL OR stage10_at IS NULL OR stage11_at IS NULL OR stage12_at IS NULL))
            ) LIMIT 1) AS work`);
          if (c.rows[0] && c.rows[0].work) break;
        } catch { /* ignore */ }
      }
    } else {
      await sleep(ROUND_SLEEP);
    }
  }

  clearInterval(hbTimer);
  await beat('stopped', totals);
  log('▸▸▸ Continuous Engine stopping (signal received). Frontier is saved — it resumes on next start.');
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(0);
})();

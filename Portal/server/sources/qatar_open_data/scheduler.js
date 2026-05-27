// Scheduler for Qatar Open Data sync.
//
// Boot behavior:
//   1. On Portal start, run a catalog sync (cheap, ~13 API calls).
//   2. If od_datasets is empty after the catalog sync, automatically kick a
//      background full seed (records sync over every dataset). This is the
//      "background, auto-start" seed Val asked for.
//   3. Daily at 15:00 local: catalog refresh + records sync of all changed.
//   4. Every 6h: catalog-only refresh (lightweight metadata pickup).
//
// Single-flight: only one heavy task runs at a time. The /api endpoints that
// trigger manual syncs go through the same `runIfFree()` wrapper.

import { query } from '../../db.js';
import { syncCatalog } from './catalog_sync.js';
import { syncChangedRecords } from './records_sync.js';

const SIX_HOURS_MS = 6 * 60 * 60_000;
const ONE_MINUTE_MS = 60_000;

// In-flight state — exported so routes can read it for status endpoints.
const state = {
  active:           null,      // {kind, started_at} or null
  last_catalog_run: null,      // {at, result}
  last_records_run: null,      // {at, result}
  next_daily_at:    null,      // ISO string of next 15:00 local
};
export function getSchedulerState() { return { ...state }; }

let bootTimer  = null;
let dailyTimer = null;
let catalogTimer = null;

export async function startScheduler() {
  if (bootTimer) return;     // already started

  console.log('[open_data] Scheduler starting…');

  // 1. Initial catalog sync soon after boot (after a brief delay so server
  //    finishes accepting requests before we start hammering Postgres).
  //    Catalog + seed run sequentially INSIDE ONE lock so we never nest
  //    runIfFree (which throws 'busy' and crashes Node if uncaught).
  bootTimer = setTimeout(() => {
    runIfFree('catalog-boot', async () => {
      // 1a. Catalog refresh
      const catalogResult = await syncCatalog({ trigger: 'auto' });
      state.last_catalog_run = { at: new Date().toISOString(), result: catalogResult };
      console.log(`[open_data] Boot catalog: new=${catalogResult.new_datasets} updated=${catalogResult.updated_datasets}`);

      // 1b. If we've never seeded records, do it now — same lock, sequential.
      // Wrap in its own try so a partial-seed failure doesn't abort the whole
      // boot path (some datasets might 404 on data.gov.qa, etc.).
      const { rows } = await query(`SELECT COUNT(*)::int AS n FROM od_records LIMIT 1`);
      if ((rows[0]?.n || 0) === 0) {
        console.log('[open_data] No records yet — starting background seed.');
        try {
          const r = await syncChangedRecords({ trigger: 'seed' });
          state.last_records_run = { at: new Date().toISOString(), result: r };
          console.log(`[open_data] Seed finished: completed=${r.completed} failed=${r.failed} new=${r.total_new}`);
        } catch (err) {
          console.error('[open_data] Seed failed mid-way:', err.message);
        }
      }
    }).catch(err => console.error('[open_data] Boot catalog sync failed:', err.message));
  }, 4_000);

  // 3. Every-6h catalog refresh
  catalogTimer = setInterval(() => {
    runIfFree('catalog', async () => {
      const result = await syncCatalog({ trigger: 'auto' });
      state.last_catalog_run = { at: new Date().toISOString(), result };
    }).catch(err => console.error('[open_data] Periodic catalog sync failed:', err.message));
  }, SIX_HOURS_MS);

  // 4. Daily 15:00 local — check every minute (cheap, simple, robust to clock
  //    drift / DST without a cron lib). Fires once per day.
  let lastDailyDate = null;
  dailyTimer = setInterval(() => {
    const now = new Date();
    state.next_daily_at = nextDailyAtIso(now);
    if (now.getHours() === 15 && now.getMinutes() === 0) {
      const today = now.toISOString().slice(0, 10);
      if (lastDailyDate === today) return;
      lastDailyDate = today;
      runIfFree('daily-records', async () => {
        // Refresh catalog FIRST so we see any new datasets, then sync records
        const c = await syncCatalog({ trigger: 'auto' });
        state.last_catalog_run = { at: new Date().toISOString(), result: c };
        const r = await syncChangedRecords({ trigger: 'auto' });
        state.last_records_run = { at: new Date().toISOString(), result: r };
        console.log(`[open_data] Daily sync: catalog new=${c.new_datasets} updated=${c.updated_datasets}; records completed=${r.completed} new=${r.total_new}`);
      }).catch(err => console.error('[open_data] Daily sync failed:', err.message));
    }
  }, ONE_MINUTE_MS);

  state.next_daily_at = nextDailyAtIso(new Date());
  console.log(`[open_data] Scheduler online. Next daily sync: ${state.next_daily_at}`);
}

export function stopScheduler() {
  if (bootTimer)   { clearTimeout(bootTimer); bootTimer = null; }
  if (catalogTimer){ clearInterval(catalogTimer); catalogTimer = null; }
  if (dailyTimer)  { clearInterval(dailyTimer); dailyTimer = null; }
}

/**
 * Manual trigger entry point used by the /api/open-data/sync/* routes.
 *   kind: 'catalog' | 'records' | 'one' | 'seed'
 */
export async function manualSync(kind, opts = {}) {
  return runIfFree(`manual-${kind}`, async () => {
    if (kind === 'catalog') {
      const result = await syncCatalog({ trigger: 'manual', triggeredBy: opts.triggeredBy });
      state.last_catalog_run = { at: new Date().toISOString(), result };
      return result;
    }
    if (kind === 'records' || kind === 'one' || kind === 'seed') {
      const result = await syncChangedRecords({
        trigger: kind === 'seed' ? 'seed' : 'manual',
        triggeredBy: opts.triggeredBy,
        datasetIds: opts.datasetIds || null,
      });
      state.last_records_run = { at: new Date().toISOString(), result };
      return result;
    }
    throw new Error('Unknown manual sync kind: ' + kind);
  });
}

// ---------------------------------------------------------------------------
// Single-flight wrapper. Concurrent attempts are rejected so we never run
// two heavy syncs at once.
// ---------------------------------------------------------------------------
async function runIfFree(name, fn) {
  if (state.active) {
    const err = new Error('Sync already running: ' + state.active.kind);
    err.code = 'busy';
    throw err;
  }
  state.active = { kind: name, started_at: new Date().toISOString() };
  try {
    return await fn();
  } finally {
    state.active = null;
  }
}

function nextDailyAtIso(now) {
  const d = new Date(now);
  d.setHours(15, 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}

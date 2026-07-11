// Qatar Market Pulse — compute + cache (Phase 2 C2, "every datum utilized").
// Bell already holds ~4M open-data records (od_datasets/od_records); this
// derives the business-relevant statistics from them: trade flows, real-estate
// transactions, and business-licence dynamics. All arithmetic over values the
// source states — sums, counts, averages — labeled with the source dataset and
// its sync time so freshness is always visible.
//
// Cost model: the heaviest aggregation scans ~1.08M jsonb rows in ~2.2s
// (measured locally 2026-07-12); the whole bundle is a few seconds. Computed
// lazily and cached in-process for 6 hours — these series change weekly at
// most. A DB hiccup returns the stale bundle if one exists, else null fields:
// a stats panel must never take down a page.

import { query } from '../db.js';
import {
  IMPORT_TITLES, EXPORT_TITLES, REALESTATE_TITLES, MOCI_ISSUED_TITLES, MOCI_CANCELED_TITLES,
  TRADE_MONTHLY_SQL, TRADE_TOP_ORIGINS_SQL, TRADE_TOP_DESTINATIONS_SQL,
  REALESTATE_MONTHLY_SQL, MOCI_ISSUED_MONTHLY_SQL, MOCI_CANCELED_MONTHLY_SQL,
  SOURCES_FRESHNESS_SQL,
} from './sql.js';

const TTL_MS = 6 * 60 * 60 * 1000;
let cached = null;
let cachedAt = 0;
let computing = null;   // in-flight promise — concurrent requests share one compute

async function compute() {
  const sinceYear = new Date().getFullYear() - 1;   // "top partners" = current + previous year
  const run = (sql, params) => query(sql, params).then((r) => r.rows).catch(() => null);

  const [
    importsMonthly, exportsMonthly, topOrigins, topDestinations,
    realestateMonthly, issuedMonthly, canceledMonthly, freshness,
  ] = await Promise.all([
    run(TRADE_MONTHLY_SQL, [IMPORT_TITLES]),
    run(TRADE_MONTHLY_SQL, [EXPORT_TITLES]),
    run(TRADE_TOP_ORIGINS_SQL, [IMPORT_TITLES, sinceYear]),
    run(TRADE_TOP_DESTINATIONS_SQL, [EXPORT_TITLES, sinceYear]),
    run(REALESTATE_MONTHLY_SQL, [REALESTATE_TITLES]),
    run(MOCI_ISSUED_MONTHLY_SQL, [MOCI_ISSUED_TITLES]),
    run(MOCI_CANCELED_MONTHLY_SQL, [MOCI_CANCELED_TITLES]),
    run(SOURCES_FRESHNESS_SQL, [[
      ...IMPORT_TITLES, ...EXPORT_TITLES, ...REALESTATE_TITLES,
      ...MOCI_ISSUED_TITLES, ...MOCI_CANCELED_TITLES,
    ]]),
  ]);

  return {
    trade: {
      imports_monthly: importsMonthly,       // [{year, month, value_qr}] newest first
      exports_monthly: exportsMonthly,
      top_import_origins: topOrigins,        // [{country, value_qr}] since last year
      top_export_destinations: topDestinations,
      partners_since_year: sinceYear,
    },
    real_estate: { monthly: realestateMonthly },   // [{month 'YYYY-MM', transactions, total_value_qr, avg_price_sqm}]
    business_licenses: {
      issued_monthly: issuedMonthly,               // [{year, month, licenses}]
      canceled_monthly: canceledMonthly,
    },
    sources: freshness,                            // [{title, our_last_record_sync_at, rows}]
    computed_at: new Date().toISOString(),
  };
}

/** The cached bundle (recomputed at most every 6h; concurrent calls coalesce). */
export async function marketPulse() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  if (!computing) {
    computing = compute()
      .then((bundle) => { cached = bundle; cachedAt = Date.now(); return bundle; })
      .catch((err) => { console.error('[openstats] compute failed:', err.message); return cached; })
      .finally(() => { computing = null; });
  }
  return computing;
}

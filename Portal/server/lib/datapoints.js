// "Data points" = every individual populated value across Bell's data — each
// non-null field on every company/person/job/contact/financial/etc. counts as
// one. (A company's email is 1, its phone is 1, its CR number is 1, …) This is
// a genuine count, not an estimate, so it's a heavy multi-table scan — we
// compute it in the BACKGROUND and cache the result; /api/feed/stats returns the
// cached number instantly and never blocks on it.

import { query } from '../db.js';

// Tables whose populated cells are real "data points".
const TABLES = [
  'companies', 'people', 'jobs',
  'company_contacts', 'person_contacts', 'person_companies',
  'company_financials', 'company_shareholders', 'company_partnerships',
  'company_relationships',
];

// Columns that are plumbing, not data (ids, timestamps, internal flags, blobs).
const SKIP = new Set([
  'id', 'search_blob', 'extra_fields', 'raw', 'raw_payload',
  'canonical_id', 'tenant_id', 'needs_review', 'manual_status_override',
]);
const isDataColumn = (n) => !SKIP.has(n) && !/_at$/.test(n) && !/_status$/.test(n);

const TTL_MS = 10 * 60 * 1000;   // recompute at most every 10 minutes
let cache = { value: 0, at: 0 };
let computing = false;

async function compute() {
  let total = 0;
  for (const t of TABLES) {
    let cols;
    try {
      const r = await query(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`, [t]);
      cols = r.rows.map(x => x.column_name).filter(isDataColumn);
    } catch { continue; }                       // table absent on this DB
    if (!cols.length) continue;
    const expr = cols.map(c => `count("${c}")`).join('+');
    try {
      const r = await query(`SELECT (${expr})::bigint AS dp FROM "${t}"`);
      total += Number(r.rows[0].dp || 0);
    } catch { /* skip a table that fails */ }
  }
  // Big-data (Qatar Open Data) records — each record counts as one.
  try {
    const r = await query(`SELECT count(*)::bigint AS n FROM od_records`);
    total += Number(r.rows[0].n || 0);
  } catch { /* no big-data table here */ }
  return total;
}

/**
 * Return the cached data-point total instantly. If the cache is stale (or empty)
 * it kicks off a background recompute and returns the current value meanwhile
 * (0 on the very first call until the first compute finishes).
 */
export async function getDataPointsCached() {
  const now = Date.now();
  if ((now - cache.at > TTL_MS) && !computing) {
    computing = true;
    compute()
      .then(v => { cache = { value: v, at: Date.now() }; })
      .catch(() => {})
      .finally(() => { computing = false; });
  }
  return cache.value;
}

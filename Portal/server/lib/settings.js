// Read non-secret settings out of the `settings` table from server-side code
// (stage modules, orchestrator, etc). Mirrors the shape of /api/settings:
// values are JSON-encoded in the column, and we decode for the caller.

import { query } from '../db.js';

/**
 * Return the value for a setting key, or the supplied default if missing.
 * Values are stored as JSONB so any JSON-encodable type round-trips.
 */
export async function getSetting(key, fallback = null) {
  const r = await query(`SELECT value FROM settings WHERE key = $1`, [key]);
  if (!r.rows.length) return fallback;
  // settings.value is JSONB; pg-node returns it already-parsed.
  const v = r.rows[0].value;
  return (v === null || v === undefined) ? fallback : v;
}

/** Convenience for string-typed settings. */
export async function getSettingString(key, fallback = '') {
  const v = await getSetting(key, null);
  if (v === null || v === undefined) return fallback;
  return typeof v === 'string' ? v : String(v);
}

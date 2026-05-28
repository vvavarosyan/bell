// Local-engine side of the sync: read assembled canonical rows out of the
// local Postgres and POST them to the production /api/sync/ingest endpoint.
//
// Two modes:
//   incremental (default) — only rows changed since the last successful push
//                           (settings key 'sync:last_sync_at' watermark).
//   full                  — every assembled row, regardless of the watermark.
//
// The watermark is advanced to the push's start time only after ALL tables
// succeed, so a mid-push failure simply re-sends next time (idempotent upserts).

import { query } from '../db.js';
import { getKey } from '../keychain.js';
import {
  COMPANY_COLS, PEOPLE_COLS, JOB_COLS,
  COMPANY_SOURCE_COLS, PERSON_COMPANY_COLS,
  CHUNK_SIZE,
} from './tables.js';

const EPOCH = '1970-01-01T00:00:00Z';
// Underscore-only keys so they're also settable via the /api/settings PATCH
// route (which validates key names as ^[a-z][a-z0-9_]+$).
const SETTINGS_WATERMARK = 'sync_last_sync_at';
const SETTINGS_TARGET_URL = 'sync_target_url';
const DEFAULT_TARGET = 'https://app.bell.qa';

// ---- settings helpers (k/v jsonb table) ----------------------------------
async function getSetting(key) {
  const r = await query(`SELECT value FROM settings WHERE key = $1`, [key]);
  return r.rows.length ? r.rows[0].value : null;
}
async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

async function resolveTarget() {
  const fromSettings = await getSetting(SETTINGS_TARGET_URL);
  const base = (fromSettings || process.env.BDI_SYNC_TARGET_URL || DEFAULT_TARGET)
    .toString().replace(/\/+$/, '');
  return base + '/api/sync/ingest';
}

// ---- row selection queries -----------------------------------------------
// Each returns rows already shaped for the ingest payload.

async function selectCompanies(wm) {
  const r = await query(
    `SELECT ${COMPANY_COLS.join(', ')}
       FROM companies
      WHERE bin IS NOT NULL AND updated_at > $1
      ORDER BY updated_at`,
    [wm]
  );
  return r.rows;
}

async function selectPeople(wm) {
  // Include a person whose own row changed OR whose employment links changed,
  // so person_companies edits ride along with the parent.
  const r = await query(
    `SELECT ${PEOPLE_COLS.join(', ')}
       FROM people p
      WHERE p.pin IS NOT NULL
        AND (p.updated_at > $1
             OR EXISTS (SELECT 1 FROM person_companies pc
                         WHERE pc.person_id = p.id AND pc.updated_at > $1))
      ORDER BY p.updated_at`,
    [wm]
  );
  return r.rows;
}

async function selectJobs(wm) {
  const r = await query(
    `SELECT ${JOB_COLS.join(', ')},
            (SELECT bin FROM companies c WHERE c.id = j.company_id) AS company_bin
       FROM jobs j
      WHERE j.jin IS NOT NULL AND j.updated_at > $1
      ORDER BY j.updated_at`,
    [wm]
  );
  return r.rows;
}

async function selectCompanySources(wm) {
  const r = await query(
    `SELECT (SELECT bin FROM companies c WHERE c.id = cs.company_id) AS company_bin,
            ${COMPANY_SOURCE_COLS.map((c) => `cs.${c}`).join(', ')}
       FROM company_sources cs
      WHERE cs.last_seen_at > $1
        AND EXISTS (SELECT 1 FROM companies c WHERE c.id = cs.company_id AND c.bin IS NOT NULL)
      ORDER BY cs.last_seen_at`,
    [wm]
  );
  return r.rows;
}

async function selectPersonCompanies(wm) {
  const r = await query(
    `SELECT (SELECT pin FROM people  p WHERE p.id = pc.person_id)  AS person_pin,
            (SELECT bin FROM companies c WHERE c.id = pc.company_id) AS company_bin,
            ${PERSON_COMPANY_COLS.map((c) => `pc.${c}`).join(', ')}
       FROM person_companies pc
      WHERE pc.updated_at > $1
        AND EXISTS (SELECT 1 FROM people    p WHERE p.id = pc.person_id  AND p.pin IS NOT NULL)
        AND EXISTS (SELECT 1 FROM companies c WHERE c.id = pc.company_id AND c.bin IS NOT NULL)
      ORDER BY pc.updated_at`,
    [wm]
  );
  return r.rows;
}

// Ordered: parents before children.
const SELECTORS = [
  ['companies',        selectCompanies],
  ['people',           selectPeople],
  ['jobs',             selectJobs],
  ['company_sources',  selectCompanySources],
  ['person_companies', selectPersonCompanies],
];

// ---- HTTP -----------------------------------------------------------------
async function postChunk(ingestUrl, token, table, rows, mode) {
  const res = await fetch(ingestUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ table, mode, rows }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) {
    throw new Error(`ingest ${table} HTTP ${res.status}: ${body.error || body.message || text.slice(0, 200)}`);
  }
  return body;
}

/**
 * Run a push.
 * @param {object} opts
 * @param {boolean} [opts.full=false]  full resync (ignore watermark)
 * @param {function} [opts.onProgress] (table, sent, total) progress callback
 */
export async function runPush({ full = false, onProgress } = {}) {
  const token = await getKey('sync-token');
  if (!token) {
    throw new Error('No sync token configured. Add it in Settings (sync-token) and set BDI_SYNC_TOKEN on Bell.qa to the same value.');
  }
  const ingestUrl = await resolveTarget();
  const mode = full ? 'full' : 'incremental';
  const startedAt = new Date().toISOString();
  const wm = full ? EPOCH : ((await getSetting(SETTINGS_WATERMARK)) || EPOCH);

  const summary = {
    mode,
    target: ingestUrl,
    watermark_from: wm,
    started_at: startedAt,
    tables: {},
    total_upserted: 0,
    total_skipped: 0,
    errors: [],
  };

  for (const [table, selector] of SELECTORS) {
    const rows = await selector(wm);
    let upserted = 0, skipped = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const res = await postChunk(ingestUrl, token, table, chunk, mode);
      upserted += res.upserted || 0;
      skipped  += res.skipped  || 0;
      if (Array.isArray(res.errors) && res.errors.length && summary.errors.length < 50) {
        summary.errors.push(...res.errors.map((e) => ({ table, ...e })));
      }
      if (onProgress) onProgress(table, Math.min(i + CHUNK_SIZE, rows.length), rows.length);
    }
    summary.tables[table] = { selected: rows.length, upserted, skipped };
    summary.total_upserted += upserted;
    summary.total_skipped  += skipped;
  }

  // All tables done — advance the watermark to this push's start time.
  await setSetting(SETTINGS_WATERMARK, startedAt);
  summary.finished_at = new Date().toISOString();
  return summary;
}

/** Read sync status for the UI: last watermark + how many rows are pending. */
export async function getSyncStatus() {
  const wm = (await getSetting(SETTINGS_WATERMARK)) || null;
  const since = wm || EPOCH;
  const counts = await query(
    `SELECT
       (SELECT count(*)::int FROM companies        WHERE bin IS NOT NULL AND updated_at > $1) AS companies,
       (SELECT count(*)::int FROM people           WHERE pin IS NOT NULL AND updated_at > $1) AS people,
       (SELECT count(*)::int FROM jobs             WHERE jin IS NOT NULL AND updated_at > $1) AS jobs,
       (SELECT count(*)::int FROM company_sources  WHERE last_seen_at    > $1) AS company_sources,
       (SELECT count(*)::int FROM person_companies WHERE updated_at      > $1) AS person_companies`,
    [since]
  );
  const target = (await getSetting(SETTINGS_TARGET_URL)) || process.env.BDI_SYNC_TARGET_URL || DEFAULT_TARGET;
  const hasToken = !!(await getKey('sync-token'));
  return {
    last_sync_at: wm,
    target,
    token_configured: hasToken,
    pending: counts.rows[0],
  };
}

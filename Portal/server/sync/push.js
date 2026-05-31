// Local-engine side of the sync: read EVERY row of each mirror table out of the
// local Postgres and POST it to the production /api/sync/ingest endpoint, so
// prod becomes a row-for-row mirror of local.
//
//   incremental (default) — rows whose watermark column changed since the last
//                           successful push (settings 'sync_last_sync_at').
//   full                  — every row, ignoring the watermark.
//
// The watermark advances to the push's start time only after ALL tables
// succeed, so a mid-push failure just re-sends next time (idempotent upserts).

import { query } from '../db.js';
import { getKey } from '../keychain.js';
import { MIRROR_TABLES, CHUNK_SIZE } from './tables.js';
import { runPull } from './pull.js';

const EPOCH = '1970-01-01T00:00:00Z';
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

async function resolveBase() {
  const fromSettings = await getSetting(SETTINGS_TARGET_URL);
  return (fromSettings || process.env.BDI_SYNC_TARGET_URL || DEFAULT_TARGET)
    .toString().replace(/\/+$/, '');
}

async function postReset(base, token) {
  const res = await fetch(base + '/api/sync/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`reset HTTP ${res.status}: ${text.slice(0, 200)}`);
}

// Tell prod to delete a set of ids from one mirror table.
async function postDeletions(base, token, table, ids) {
  const res = await fetch(base + '/api/sync/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ table, ids }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`delete ${table} HTTP ${res.status}: ${body.error || text.slice(0, 200)}`);
  return body;
}

// Drain the local tombstone table: send each table's pending deletions to prod,
// then remove the tombstone rows we successfully processed. Runs every push so
// hard-deletes propagate without a full rebuild.
async function pushDeletions(base, token, summary) {
  const pending = await query(
    `SELECT id, table_name, row_id FROM sync_deletions ORDER BY table_name, id`
  ).catch(() => ({ rows: [] }));   // table may not exist on very old DBs
  if (!pending.rows.length) return;

  const byTable = new Map();
  for (const r of pending.rows) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, { ids: [], tombstones: [] });
    const g = byTable.get(r.table_name);
    g.ids.push(Number(r.row_id));
    g.tombstones.push(r.id);
  }

  for (const [table, g] of byTable) {
    try {
      const res = await postDeletions(base, token, table, g.ids);
      summary.deletions[table] = { requested: g.ids.length, deleted: res.deleted || 0 };
      summary.total_deleted += res.deleted || 0;
      // Clear the tombstones we just applied.
      await query(`DELETE FROM sync_deletions WHERE id = ANY($1::bigint[])`, [g.tombstones]);
    } catch (err) {
      if (summary.errors.length < 50) summary.errors.push({ table, phase: 'delete', error: err.message });
    }
  }
}

// Pull every row whose watermark column is newer than `wm`. SELECT * mirrors all
// columns; table/watermark/selfRef come from the trusted MIRROR_TABLES constant.
// When a self-referential FK exists, order canonical/standalone rows (selfRef IS
// NULL) first so a duplicate never references a not-yet-inserted canonical.
async function selectRows(table, watermarkCol, wm, selfRef) {
  const order = selfRef
    ? `("${selfRef}" IS NOT NULL), "${watermarkCol}"`
    : `"${watermarkCol}"`;
  const r = await query(
    `SELECT * FROM "${table}" WHERE "${watermarkCol}" > $1 ORDER BY ${order}`,
    [wm]
  );
  return r.rows;
}

async function postChunk(ingestUrl, token, table, rows, mode) {
  const res = await fetch(ingestUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
 * @param {boolean} [opts.full=false]  full mirror (ignore watermark)
 */
export async function runPush({ full = false, reset = false } = {}) {
  const token = await getKey('sync-token');
  if (!token) {
    throw new Error('No sync token configured. Add it in the Sync tab and set BDI_SYNC_TOKEN on Bell.qa to the same value.');
  }
  const base = await resolveBase();
  const ingestUrl = base + '/api/sync/ingest';
  const mode = full ? 'full' : 'incremental';
  const startedAt = new Date().toISOString();
  // A reset wipes prod, so everything must be re-sent regardless of watermark.
  const wm = (full || reset) ? EPOCH : ((await getSetting(SETTINGS_WATERMARK)) || EPOCH);

  if (reset) await postReset(base, token);

  const summary = {
    mode, reset, target: ingestUrl, watermark_from: wm, started_at: startedAt,
    tables: {}, total_upserted: 0, total_skipped: 0,
    deletions: {}, total_deleted: 0, pull: null, errors: [],
  };

  // PULL FIRST: absorb research entities that were created/enriched on prod so
  // local holds them before we re-assert local→prod below. Skipped on a reset
  // (rebuild) since the subsequent full push already makes prod exact, and the
  // pulled rows are part of local. Non-fatal — a pull failure doesn't block the
  // push (the data is still safe on prod; we retry the window next time).
  if (!reset) {
    try {
      summary.pull = await runPull();
    } catch (err) {
      summary.pull = { error: err.message };
      if (summary.errors.length < 50) summary.errors.push({ phase: 'pull', error: err.message });
    }
  }

  for (const { name, watermark, selfRef } of MIRROR_TABLES) {
    const rows = await selectRows(name, watermark, wm, selfRef);
    let upserted = 0, skipped = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      const res = await postChunk(ingestUrl, token, name, chunk, mode);
      upserted += res.upserted || 0;
      skipped  += res.skipped  || 0;
      if (Array.isArray(res.errors) && res.errors.length && summary.errors.length < 50) {
        summary.errors.push(...res.errors.map((e) => ({ table: name, ...e })));
      }
    }
    summary.tables[name] = { selected: rows.length, upserted, skipped };
    summary.total_upserted += upserted;
    summary.total_skipped  += skipped;
  }

  // Propagate hard-deletes. A full rebuild already wiped + repopulated prod, so
  // the tombstones are moot then — just clear them. Otherwise apply them.
  if (reset) {
    await query(`DELETE FROM sync_deletions`).catch(() => {});
  } else {
    await pushDeletions(base, token, summary);
  }

  await setSetting(SETTINGS_WATERMARK, startedAt);
  summary.finished_at = new Date().toISOString();
  return summary;
}

/** Read sync status for the UI: watermark, pending row counts, people coverage. */
export async function getSyncStatus() {
  const wm = (await getSetting(SETTINGS_WATERMARK)) || null;
  const since = wm || EPOCH;

  const counts = await query(
    `SELECT
       (SELECT count(*)::int FROM companies        WHERE updated_at  > $1) AS companies,
       (SELECT count(*)::int FROM people           WHERE updated_at  > $1) AS people,
       (SELECT count(*)::int FROM jobs             WHERE updated_at  > $1) AS jobs,
       (SELECT count(*)::int FROM company_sources  WHERE last_seen_at > $1) AS company_sources,
       (SELECT count(*)::int FROM person_companies WHERE updated_at  > $1) AS person_companies`,
    [since]
  );

  // People coverage: how many people have at least one employment link.
  const cov = await query(
    `SELECT
       count(*)::int                        AS total,
       count(*) FILTER (WHERE l.n > 0)::int AS with_links,
       count(*) FILTER (WHERE l.n = 0)::int AS without_links
     FROM people p
     LEFT JOIN LATERAL (
       SELECT count(*) AS n FROM person_companies pc WHERE pc.person_id = p.id
     ) l ON true`
  );

  const target = (await getSetting(SETTINGS_TARGET_URL)) || process.env.BDI_SYNC_TARGET_URL || DEFAULT_TARGET;
  const hasToken = !!(await getKey('sync-token'));

  return {
    last_sync_at: wm,
    target,
    token_configured: hasToken,
    pending: counts.rows[0],
    people_coverage: cov.rows[0],
  };
}

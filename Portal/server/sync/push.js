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
import { MIRROR_TABLES, CHUNK_SIZE, CONTRIB_EXCLUDE } from './tables.js';
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

// Import Phase 2 — sync reconciliation. Belt-and-braces companion to the
// `syncWhere` keep-predicates: proactively tell prod to drop any un-promoted
// user-contributed entity that may have leaked there in an earlier push (before
// this gate existed) or that has since been REJECTED by the admin. Idempotent —
// prod returns deleted:0 when the row isn't present, so it's safe to run every
// push. Child contacts are removed by prod's ON DELETE CASCADE, so we only need
// to send the parent (company/person) ids.
async function reconcileContributedDeletions(base, token, summary) {
  for (const table of ['companies', 'people']) {
    const ids = (await query(
      `SELECT id FROM ${table} WHERE ${CONTRIB_EXCLUDE[table]}`,
    ).catch(() => ({ rows: [] }))).rows.map((r) => Number(r.id));
    if (!ids.length) continue;
    try {
      const res = await postDeletions(base, token, table, ids);
      const d = res.deleted || 0;
      const prev = summary.deletions[table] || { requested: 0, deleted: 0 };
      summary.deletions[table] = {
        requested: prev.requested + ids.length,
        deleted: prev.deleted + d,
      };
      summary.total_deleted += d;
    } catch (err) {
      if (summary.errors.length < 50) summary.errors.push({ table, phase: 'contrib-reconcile', error: err.message });
    }
  }
}

// GENERATED columns must never be transmitted. Postgres refuses an INSERT that supplies a value
// for a GENERATED ALWAYS … STORED column ("cannot insert a non-DEFAULT value into column"), so a
// single generated column silently rejects EVERY row of that table — 195,537 registrations were
// skipped this way on 2026-08-06, the whole table, with the failure buried in a per-row error
// list. The value is not lost by omitting it: prod runs the same migration, so it regenerates the
// column itself from the columns we DO send. That is the correct semantics for a derived value.
// Cached per table — the schema does not change between rows.
const _generatedCols = new Map();
async function generatedColumns(table) {
  if (_generatedCols.has(table)) return _generatedCols.get(table);
  let set = new Set();
  try {
    const r = await query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
          AND (is_generated = 'ALWAYS' OR is_identity = 'YES' AND identity_generation = 'ALWAYS')`,
      [table]);
    set = new Set(r.rows.map((x) => x.column_name));
  } catch { /* if we cannot ask, send everything — the previous behaviour */ }
  _generatedCols.set(table, set);
  return set;
}

// Pull every row whose watermark column is newer than `wm`. SELECT * mirrors all
// columns; table/watermark/selfRef come from the trusted MIRROR_TABLES constant.
// When a self-referential FK exists, order canonical/standalone rows (selfRef IS
// NULL) first so a duplicate never references a not-yet-inserted canonical.
async function selectRows(table, watermarkCol, wm, selfRef, full = false, syncWhere = null) {
  const order = selfRef
    ? `("${selfRef}" IS NOT NULL), "${watermarkCol}"`
    : `"${watermarkCol}"`;
  // `syncWhere` (Import Phase 2) is a KEEP predicate that holds un-promoted
  // user-contributed rows local-only. It must apply in BOTH modes — even a full
  // mirror/rebuild must never carry a contributed-but-unreviewed entity to prod.
  const keep = syncWhere ? ` AND (${syncWhere})` : '';
  // A full/reset push mirrors EVERY row. An incremental push takes rows changed
  // since the watermark — PLUS any row whose watermark is NULL. A plain
  // `watermarkCol > wm` silently DROPS NULL-watermark rows (NULL > x is never
  // true), which is how contacts / employment links inserted without an
  // updated_at went missing on prod after a rebuild.
  const sql = full
    ? `SELECT * FROM "${table}"${syncWhere ? ` WHERE (${syncWhere})` : ''} ORDER BY ${order} NULLS FIRST`
    : `SELECT * FROM "${table}" WHERE ("${watermarkCol}" > $1 OR "${watermarkCol}" IS NULL)${keep} ORDER BY ${order} NULLS FIRST`;
  const r = await query(sql, full ? [] : [wm]);
  const gen = await generatedColumns(table);
  if (!gen.size) return r.rows;
  return r.rows.map((row) => {
    const out = {};
    for (const k of Object.keys(row)) if (!gen.has(k)) out[k] = row[k];
    return out;
  });
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
    // Apply hard-deletes BEFORE the upserts. A locally-deleted duplicate must be
    // gone from prod before we upsert the surviving row onto its now-freed
    // UNIQUE (company_id, type, value) slot — otherwise the survivor collides
    // with the stale dupe and gets skipped. (Deletions used to run last.)
    await pushDeletions(base, token, summary);
    // Hold-back reconciliation: ensure no un-promoted / rejected contributed
    // entity remains on prod (covers pre-gate leaks). Runs before the upserts so
    // a freshly-promoted row in this same push is still re-asserted afterwards.
    await reconcileContributedDeletions(base, token, summary);
  }

  // Per-table isolation: one failing table (e.g. a table prod's code doesn't
  // know yet, mid-deploy) must not sink the other tables' push. The watermark
  // only advances when EVERY table succeeded, so a failed table's rows are
  // simply re-sent by the next push — the idempotent-resend guarantee holds.
  let tableFailures = 0;
  for (const { name, watermark, selfRef, syncWhere } of MIRROR_TABLES) {
    try {
      const rows = await selectRows(name, watermark, wm, selfRef, full || reset, syncWhere);
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
      // A table that offered rows and landed NONE is a total rejection, not a quiet no-op. That is
      // how 195,537 company_registrations were lost on 2026-08-06 — every row refused for the same
      // reason, reported only as a number in a "skipped" field nobody reads. Say it out loud and
      // carry the provider's first reason with it.
      if (rows.length && upserted === 0) {
        const why = (summary.errors.find((e) => e.table === name) || {}).error || 'no reason returned';
        summary.tables[name].total_rejection = why;
        console.error(`[sync] ✗ ${name}: ALL ${rows.length.toLocaleString()} row(s) rejected — ${why}`);
        // AND COUNT IT AS A FAILURE, so the watermark does NOT advance. tableFailures only ever
        // counted THROWN errors, but a wholesale rejection does not throw — prod answers 200 with
        // every row in its error list. So the watermark moved past 195,537 registrations that had
        // landed nowhere, and no later push would ever look at them again: the data was silently
        // unrecoverable without a manual full re-mirror. Holding the watermark makes the next
        // push retry them by itself, which is what "the engine heals" has to mean.
        tableFailures++;
      }
      summary.total_upserted += upserted;
      summary.total_skipped  += skipped;
    } catch (err) {
      tableFailures++;
      summary.tables[name] = { error: err.message };
      if (summary.errors.length < 50) summary.errors.push({ table: name, phase: 'push', error: err.message });
    }
  }

  // On a reset, prod was wiped + repopulated, so any tombstones are moot — just
  // clear them. (Non-reset deletions were already applied before the upserts.)
  if (reset) {
    await query(`DELETE FROM sync_deletions`).catch(() => {});
  }

  if (tableFailures === 0) {
    await setSetting(SETTINGS_WATERMARK, startedAt);
    summary.watermark_advanced = true;
  } else {
    summary.watermark_advanced = false;   // failed or wholly-rejected tables re-send next push
  }
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

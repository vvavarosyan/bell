// Production-side ingest: receive a batch of rows from the local engine and
// upsert them into the production Postgres as an EXACT MIRROR.
//
//   • One table per call. Rows are upserted ON CONFLICT (id) — the same primary
//     key as local, so the mirror is row-for-row identical and foreign keys
//     (company_id, person_id, …) line up without any BIN/PIN resolution.
//   • Columns are discovered from the prod schema (information_schema) and
//     intersected with the keys present in the payload, so the mirror tolerates
//     schema drift (a column local has but prod doesn't is simply skipped).
//   • jsonb columns are JSON-encoded before binding (node-postgres would
//     otherwise serialize a JS array as a PG array literal → invalid json).
//   • Performance: one multi-row INSERT per sub-chunk. If a batch statement
//     errors, we fall back to per-row upserts so one bad row can't sink the
//     whole batch, and the offending rows are reported.

import { query, withTransaction } from '../db.js';
import { MIRROR_TABLE_NAMES } from './tables.js';

const MAX_REPORTED_ERRORS = 25;
const MAX_PARAMS = 60000;            // safety margin under Postgres's 65535 limit

/**
 * Wipe the mirror tables on prod so a full push can repopulate them with the
 * local ids. RESTART IDENTITY resets sequences; CASCADE clears any dependent
 * non-mirror tables (all empty on a mirror deployment). One row order/statement
 * handles the FK graph. Use deliberately — it empties the product data tables
 * until the following full push completes.
 */
export async function applyReset() {
  await query(
    `TRUNCATE person_companies, company_sources, jobs, people, companies
     RESTART IDENTITY CASCADE`
  );
  return { reset: true, truncated: ['companies', 'people', 'jobs', 'company_sources', 'person_companies'] };
}

/**
 * Apply a batch of deletions (one table) on prod. Mirrors hard-deletes that
 * happened on the local engine. Child rows fall away via ON DELETE CASCADE,
 * exactly as they did locally, so the mirror stays row-for-row identical.
 * @param {string} table
 * @param {(number|string)[]} ids
 */
export async function applyDeletions(table, ids) {
  if (!MIRROR_TABLE_NAMES.has(table)) throw new Error(`not a mirror table: ${table}`);
  if (!Array.isArray(ids)) throw new Error('ids must be an array');
  const clean = ids.map(Number).filter(Number.isFinite);
  if (!clean.length) return { table, requested: 0, deleted: 0 };
  const res = await query(`DELETE FROM ${q(table)} WHERE id = ANY($1::bigint[])`, [clean]);
  return { table, requested: clean.length, deleted: res.rowCount };
}

// ---- prod column metadata (cached; schema is stable within a process) -------
const _colCache = new Map();
async function getColumnMeta(table) {
  if (_colCache.has(table)) return _colCache.get(table);
  const r = await query(
    `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  const meta = {};
  for (const row of r.rows) meta[row.column_name] = row;
  _colCache.set(table, meta);
  return meta;
}

const q = (id) => `"${String(id).replace(/"/g, '""')}"`;   // safe identifier quote

function isJsonb(metaRow) {
  return metaRow && (metaRow.data_type === 'jsonb' || metaRow.udt_name === 'jsonb'
                  || metaRow.data_type === 'json'  || metaRow.udt_name === 'json');
}

// Encode jsonb values to JSON text (objects, arrays, scalars). Non-jsonb values
// pass through unchanged so text[] columns stay JS arrays for the driver.
function bindValue(meta, col, value) {
  if (value === null || value === undefined) return null;
  if (isJsonb(meta[col])) return JSON.stringify(value);
  return value;
}

function flatten(cols, meta, rows) {
  const values = [];
  for (const row of rows) for (const c of cols) values.push(bindValue(meta, c, row[c]));
  return values;
}

function buildUpsertSQL(table, cols, rowCount) {
  const colList = cols.map(q).join(', ');
  const tuples = [];
  let p = 1;
  for (let r = 0; r < rowCount; r++) {
    tuples.push(`(${cols.map(() => `$${p++}`).join(', ')})`);
  }
  const setList = cols
    .filter((c) => c !== 'id')
    .map((c) => `${q(c)} = EXCLUDED.${q(c)}`)
    .join(', ');
  return `INSERT INTO ${q(table)} (${colList}) VALUES ${tuples.join(', ')}
          ON CONFLICT (id) DO UPDATE SET ${setList}`;
}

/**
 * Apply one batch (one table) of rows as a mirror upsert.
 * @param {string} table
 * @param {object[]} rows
 */
export async function applyBatch(table, rows) {
  if (!MIRROR_TABLE_NAMES.has(table)) throw new Error(`not a mirror table: ${table}`);
  if (!Array.isArray(rows)) throw new Error('rows must be an array');
  if (!rows.length) return { table, received: 0, upserted: 0, skipped: 0, errors: [] };

  const meta = await getColumnMeta(table);

  // Columns = union of payload keys that actually exist on prod. Must include id.
  const present = new Set();
  for (const row of rows) for (const k of Object.keys(row)) if (meta[k]) present.add(k);
  const cols = [...present];
  if (!cols.includes('id')) throw new Error(`payload for ${table} is missing the id column`);

  // Sub-chunk so (cols × rows) stays under the parameter limit.
  const maxRowsPerStmt = Math.max(1, Math.floor(MAX_PARAMS / cols.length));

  let upserted = 0;
  const errors = [];

  for (let off = 0; off < rows.length; off += maxRowsPerStmt) {
    const slice = rows.slice(off, off + maxRowsPerStmt);

    // 1) Fast path: one multi-row INSERT for the sub-chunk.
    try {
      const sql = buildUpsertSQL(table, cols, slice.length);
      const res = await query(sql, flatten(cols, meta, slice));
      upserted += res.rowCount;
      continue;
    } catch (err) {
      console.warn(`[sync] batch upsert ${table} sub-chunk failed (${err.message}); per-row fallback`);
    }

    // 2) Per-row fallback inside a transaction with savepoints.
    await withTransaction(async (client) => {
      const single = buildUpsertSQL(table, cols, 1);
      for (let i = 0; i < slice.length; i++) {
        try {
          await client.query('SAVEPOINT row_sp');
          await client.query(single, flatten(cols, meta, [slice[i]]));
          await client.query('RELEASE SAVEPOINT row_sp');
          upserted++;
        } catch (err) {
          await client.query('ROLLBACK TO SAVEPOINT row_sp');
          if (errors.length < MAX_REPORTED_ERRORS) {
            errors.push({ id: slice[i]?.id, error: err.message });
          }
        }
      }
    });
  }

  // Keep the prod id sequence ahead of mirrored ids (defensive; prod should
  // never originate rows for mirror tables, but this avoids future collisions).
  try {
    await query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'),
                     GREATEST((SELECT COALESCE(max(id), 1) FROM ${q(table)}), 1))`,
      [table]
    );
  } catch { /* best-effort */ }

  return { table, received: rows.length, upserted, skipped: rows.length - upserted, errors };
}

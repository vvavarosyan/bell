// Production-side ingest: receive a batch of canonical rows from the local
// engine and upsert them into the production Postgres.
//
// One table per call. Rows are upserted on their stable natural key:
//   companies        → ON CONFLICT (bin)
//   people           → ON CONFLICT (pin)            (reveal state never touched)
//   jobs             → ON CONFLICT (jin)            (company resolved from bin)
//   company_sources  → ON CONFLICT (source, source_record_id)  (company from bin)
//   person_companies → ON CONFLICT (expression unique index)    (parents from pin/bin)
//
// Performance: each chunk is applied as ONE multi-row statement (batch path).
// If that statement errors (e.g. one colliding row), we fall back to applying
// the chunk row-by-row inside a transaction, so a single bad row is recorded in
// the errors list and skipped rather than aborting the whole batch.

import { withTransaction } from '../db.js';
import {
  COMPANY_COLS, PEOPLE_COLS, JOB_COLS,
  COMPANY_SOURCE_COLS, PERSON_COMPANY_COLS, JSONB_COLS,
} from './tables.js';

const MAX_REPORTED_ERRORS = 25;

// Return a shallow copy of `row` with this table's jsonb columns JSON-encoded.
// Required so node-postgres sends valid JSON text (not a PG array literal) for
// array-valued jsonb fields. Safe for objects, arrays, and scalars; nulls pass
// through untouched.
function normalizeJsonb(table, row) {
  const cols = JSONB_COLS[table];
  if (!cols || !row) return row;
  const out = { ...row };
  for (const c of cols) {
    // The value is always the parsed JS representation of the jsonb (object,
    // array, or scalar) — encode it back to JSON text for the driver. Null/
    // undefined pass through as SQL NULL.
    if (out[c] !== null && out[c] !== undefined) {
      out[c] = JSON.stringify(out[c]);
    }
  }
  return out;
}

// Build "col = EXCLUDED.col" assignment list, skipping the conflict key(s).
function updateAssignments(cols, skip) {
  return cols
    .filter((c) => !skip.includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .join(', ');
}

function placeholders(n, start = 1) {
  return Array.from({ length: n }, (_, i) => `$${start + i}`).join(', ');
}

// ---------------------------------------------------------------------------
// Per-table upsert handlers. Each returns nothing; throws on a row error so the
// caller can record + continue.
// ---------------------------------------------------------------------------

async function upsertCompany(client, row) {
  const cols = COMPANY_COLS;
  await client.query(
    `INSERT INTO companies (${cols.join(', ')})
     VALUES (${placeholders(cols.length)})
     ON CONFLICT (bin) DO UPDATE SET ${updateAssignments(cols, ['bin'])}`,
    cols.map((c) => row[c] ?? null)
  );
}

async function upsertPerson(client, row) {
  const cols = PEOPLE_COLS;
  await client.query(
    `INSERT INTO people (${cols.join(', ')})
     VALUES (${placeholders(cols.length)})
     ON CONFLICT (pin) DO UPDATE SET ${updateAssignments(cols, ['pin'])}`,
    cols.map((c) => row[c] ?? null)
  );
}

async function upsertJob(client, row) {
  // company_id resolved from company_bin via subselect (nullable).
  const cols = JOB_COLS;
  const vals = cols.map((c) => row[c] ?? null);
  await client.query(
    `INSERT INTO jobs (${cols.join(', ')}, company_id)
     VALUES (${placeholders(cols.length)},
             (SELECT id FROM companies WHERE bin = $${cols.length + 1}))
     ON CONFLICT (jin) DO UPDATE SET ${updateAssignments(cols, ['jin'])},
             company_id = EXCLUDED.company_id`,
    [...vals, row.company_bin ?? null]
  );
}

async function upsertCompanySource(client, row) {
  const cols = COMPANY_SOURCE_COLS;
  const vals = cols.map((c) => row[c] ?? null);
  // company_id resolved from company_bin. If the parent isn't on prod yet, the
  // SELECT yields no row and nothing is inserted (parents are synced first, so
  // this is rare and self-heals on the next push).
  const res = await client.query(
    `INSERT INTO company_sources (company_id, ${cols.join(', ')})
     SELECT c.id, ${placeholders(cols.length, 2)}
       FROM companies c WHERE c.bin = $1
     ON CONFLICT (source, source_record_id) DO UPDATE SET
       company_id   = EXCLUDED.company_id,
       source_url   = EXCLUDED.source_url,
       raw_payload  = EXCLUDED.raw_payload,
       last_seen_at = EXCLUDED.last_seen_at`,
    [row.company_bin ?? null, ...vals]
  );
  if (res.rowCount === 0) {
    throw new Error(`parent company bin=${row.company_bin} not found on prod`);
  }
}

async function upsertPersonCompany(client, row) {
  const cols = PERSON_COMPANY_COLS;
  const vals = cols.map((c) => row[c] ?? null);
  // person_id from pin, company_id from bin — both required.
  const res = await client.query(
    `INSERT INTO person_companies (person_id, company_id, ${cols.join(', ')})
     SELECT p.id, c.id, ${placeholders(cols.length, 3)}
       FROM people p, companies c
      WHERE p.pin = $1 AND c.bin = $2
     ON CONFLICT (person_id, company_id,
                  (COALESCE(start_date, '1970-01-01'::date)),
                  (COALESCE(title, '')))
     DO UPDATE SET
       department      = EXCLUDED.department,
       seniority_level = EXCLUDED.seniority_level,
       org_chart_level = EXCLUDED.org_chart_level,
       end_date        = EXCLUDED.end_date,
       is_current      = EXCLUDED.is_current,
       source_stage    = EXCLUDED.source_stage,
       raw_payload     = EXCLUDED.raw_payload,
       updated_at      = now()`,
    [row.person_pin ?? null, row.company_bin ?? null, ...vals]
  );
  if (res.rowCount === 0) {
    throw new Error(`parent person_pin=${row.person_pin} or company_bin=${row.company_bin} not found on prod`);
  }
}

const HANDLERS = {
  companies:        upsertCompany,
  people:           upsertPerson,
  jobs:             upsertJob,
  company_sources:  upsertCompanySource,
  person_companies: upsertPersonCompany,
};

// ---------------------------------------------------------------------------
// BATCH fast-path. One multi-row statement per chunk instead of N×(savepoint +
// insert) round-trips — turns a full resync from many minutes into seconds.
// If a batch statement errors (e.g. one colliding row), applyBatch falls back
// to the per-row HANDLERS path for that chunk, so correctness never regresses —
// only speed. Returns the number of rows upserted by the batch.
// ---------------------------------------------------------------------------

// companies / people: plain multi-row VALUES upsert on a single conflict key.
function makeMultiRowBatch(tableName, cols, conflictKey) {
  return async (client, rows) => {
    const values = [];
    const tuples = [];
    let p = 1;
    for (const row of rows) {
      tuples.push(`(${cols.map(() => `$${p++}`).join(', ')})`);
      for (const c of cols) values.push(row[c] ?? null);
    }
    const res = await client.query(
      `INSERT INTO ${tableName} (${cols.join(', ')})
       VALUES ${tuples.join(', ')}
       ON CONFLICT (${conflictKey}) DO UPDATE SET ${updateAssignments(cols, [conflictKey])}`,
      values
    );
    return res.rowCount;
  };
}

// company_sources: resolve company_id from bin via unnest()+JOIN. Rows whose
// company_bin has no match on prod are silently dropped by the JOIN (parent not
// synced yet — self-heals next push).
async function batchCompanySources(client, rows) {
  const binArr = [], srcArr = [], sridArr = [], urlArr = [], rawArr = [], firstArr = [], lastArr = [];
  for (const r of rows) {
    binArr.push(r.company_bin ?? null);
    srcArr.push(r.source ?? null);
    sridArr.push(r.source_record_id ?? null);
    urlArr.push(r.source_url ?? null);
    rawArr.push(r.raw_payload ?? null);            // already JSON text (normalizeJsonb)
    firstArr.push(r.first_seen_at ?? null);
    lastArr.push(r.last_seen_at ?? null);
  }
  const res = await client.query(
    `INSERT INTO company_sources (company_id, source, source_record_id, source_url, raw_payload, first_seen_at, last_seen_at)
     SELECT c.id, x.source, x.source_record_id, x.source_url, x.raw_payload, x.first_seen_at, x.last_seen_at
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::jsonb[], $6::timestamptz[], $7::timestamptz[])
            AS x(company_bin, source, source_record_id, source_url, raw_payload, first_seen_at, last_seen_at)
       JOIN companies c ON c.bin = x.company_bin
     ON CONFLICT (source, source_record_id) DO UPDATE SET
       company_id   = EXCLUDED.company_id,
       source_url   = EXCLUDED.source_url,
       raw_payload  = EXCLUDED.raw_payload,
       last_seen_at = EXCLUDED.last_seen_at`,
    [binArr, srcArr, sridArr, urlArr, rawArr, firstArr, lastArr]
  );
  return res.rowCount;
}

const BATCH = {
  companies:       makeMultiRowBatch('companies', COMPANY_COLS, 'bin'),
  people:          makeMultiRowBatch('people', PEOPLE_COLS, 'pin'),
  company_sources: batchCompanySources,
  // jobs + person_companies use the per-row path (small volumes, FK resolution).
};

/**
 * Apply one batch (one table) of rows. Returns a summary.
 * Tries the batch fast-path first; on any batch error, falls back to per-row
 * (which isolates and reports the offending rows).
 * @param {string} table
 * @param {object[]} rawRows
 */
export async function applyBatch(table, rawRows) {
  const handler = HANDLERS[table];
  if (!handler) throw new Error(`unknown sync table: ${table}`);
  if (!Array.isArray(rawRows)) throw new Error('rows must be an array');

  // Normalize jsonb columns once for the whole batch.
  const rows = rawRows.map((r) => normalizeJsonb(table, r));

  // 1) Fast path.
  const batchFn = BATCH[table];
  if (batchFn && rows.length) {
    try {
      const upserted = await withTransaction((client) => batchFn(client, rows));
      return { table, received: rows.length, upserted, skipped: rows.length - upserted, errors: [] };
    } catch (err) {
      console.warn(`[sync] batch upsert for ${table} failed (${err.message}); falling back to per-row`);
    }
  }

  // 2) Per-row fallback (robust + reports offending rows).
  let upserted = 0;
  const errors = [];
  await withTransaction(async (client) => {
    for (let i = 0; i < rows.length; i++) {
      try {
        await client.query('SAVEPOINT row_sp');
        await handler(client, rows[i]);
        await client.query('RELEASE SAVEPOINT row_sp');
        upserted++;
      } catch (err) {
        await client.query('ROLLBACK TO SAVEPOINT row_sp');
        if (errors.length < MAX_REPORTED_ERRORS) {
          errors.push({ index: i, key: rowKey(table, rows[i]), error: err.message });
        }
      }
    }
  });

  return { table, received: rows.length, upserted, skipped: rows.length - upserted, errors };
}

function rowKey(table, row) {
  if (!row) return null;
  switch (table) {
    case 'companies':        return row.bin;
    case 'people':           return row.pin;
    case 'jobs':             return row.jin;
    case 'company_sources':  return `${row.source}:${row.source_record_id}`;
    case 'person_companies': return `${row.person_pin}@${row.company_bin}`;
    default:                 return null;
  }
}

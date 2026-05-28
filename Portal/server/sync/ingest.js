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
// Robustness: rows are applied one-by-one inside a transaction. A single bad
// row (e.g. a unique-constraint collision on linkedin_url) is recorded in the
// errors list and skipped rather than aborting the whole batch.

import { withTransaction } from '../db.js';
import {
  COMPANY_COLS, PEOPLE_COLS, JOB_COLS,
  COMPANY_SOURCE_COLS, PERSON_COMPANY_COLS,
} from './tables.js';

const MAX_REPORTED_ERRORS = 25;

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

/**
 * Apply one batch (one table) of rows. Returns a summary.
 * @param {string} table
 * @param {object[]} rows
 */
export async function applyBatch(table, rows) {
  const handler = HANDLERS[table];
  if (!handler) throw new Error(`unknown sync table: ${table}`);
  if (!Array.isArray(rows)) throw new Error('rows must be an array');

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

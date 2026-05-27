// Aggregates is_active + status_normalized across ALL of a company's source
// records. Rule: if ANY source says active, the company is active.
//
// Called after every source upsert (in ingest/runner.js) and from
// /api/companies/reclassify-statuses.

import { query } from '../db.js';
import {
  normalizeQFCStatus,
  normalizeMOCIStatus,
  normalizeUnspecifiedStatus,
} from './normalize.js';

/**
 * For a given company, look up every (source, raw_payload) row, run the
 * source-specific normalizer, OR is_active together. Update the company.
 */
export async function recomputeCompanyStatus(companyId, client = null) {
  const runner = client ? client : { query: (...a) => query(...a) };
  const r = await runner.query(
    `SELECT source, raw_payload FROM company_sources WHERE company_id = $1`,
    [companyId],
  );
  if (r.rows.length === 0) return null;

  let anyActive = false;
  const perSource = [];
  let lastStatusNormalized = 'unknown';
  let lastStatusRaw = null;

  for (const row of r.rows) {
    const raw = row.raw_payload || {};
    let out;
    let statusRaw = null;
    if (row.source === 'QFC') {
      statusRaw = raw.license_status || raw.licence_status || null;
      out = normalizeQFCStatus(statusRaw);
    } else if (row.source === 'MOCI') {
      statusRaw = raw.cr_status || null;
      out = normalizeMOCIStatus(statusRaw);
    } else {
      out = normalizeUnspecifiedStatus();
    }
    perSource.push({ source: row.source, ...out });
    if (out.is_active) anyActive = true;

    // Track the most informative status_raw we see (active wins, then any non-null)
    if (out.is_active || (lastStatusRaw == null && statusRaw)) {
      lastStatusNormalized = out.status_normalized;
      lastStatusRaw = statusRaw;
    }
  }

  await runner.query(
    `UPDATE companies
     SET is_active         = $2,
         archived          = NOT $2,
         status_normalized = $3,
         status_raw        = $4
     WHERE id = $1`,
    [companyId, anyActive, lastStatusNormalized, lastStatusRaw],
  );

  return { company_id: companyId, is_active: anyActive, per_source: perSource };
}

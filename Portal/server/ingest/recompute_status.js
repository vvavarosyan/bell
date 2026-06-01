// Aggregates is_active + status_normalized across a company's source records,
// and derives the `archived` lifecycle state — DECOUPLED from is_active so admin
// decisions stick (v0018, 2026-05-31).
//
// Active rule (current links only):
//   • A source link counts toward "active" if it is CURRENT (present in the
//     latest ingest of its source) OR it is a NON-QFZ link. Rationale:
//       - QFZ has no status; a company stays active only while it's LISTED. If a
//         QFZ listing disappears, that link stops counting → the company can fall
//         to archived (reason 'qfz_disappeared') unless another source keeps it
//         active.
//       - Non-QFZ links that merely DISAPPEARED keep counting (status quo) until
//         an admin reviews them — disappearance there is handled by the review
//         queue, not auto-archival.
//   • If ANY counting link normalizes to active → company is active.
//
// archived = NOT is_active  (derived) — EXCEPT when manual_status_override is set,
// in which case we leave the admin's is_active/archived/status untouched entirely.
//
// Called after every source upsert (ingest/runner.js) and from
// /api/companies/reclassify-statuses.

import { query } from '../db.js';
import {
  normalizeQFCStatus,
  normalizeMOCIStatus,
  normalizeUnspecifiedStatus,
} from './normalize.js';

export async function recomputeCompanyStatus(companyId, client = null) {
  const runner = client ? client : { query: (...a) => query(...a) };

  // Respect a deliberate admin decision — never revert it automatically.
  const comp = await runner.query(
    `SELECT manual_status_override FROM companies WHERE id = $1`,
    [companyId],
  );
  if (!comp.rows.length) return null;
  if (comp.rows[0].manual_status_override) {
    return { company_id: companyId, skipped: 'manual_override' };
  }

  const r = await runner.query(
    `SELECT source, raw_payload, is_current FROM company_sources WHERE company_id = $1`,
    [companyId],
  );
  if (r.rows.length === 0) return null;

  let anyActive = false;
  let lastStatusNormalized = 'unknown';
  let lastStatusRaw = null;
  let qfzDisappeared = false;

  for (const row of r.rows) {
    const raw = row.raw_payload || {};

    // QFZ listings only count while present; everything else always counts.
    const counts = row.is_current || row.source !== 'QFZ';
    if (row.source === 'QFZ' && !row.is_current) qfzDisappeared = true;
    if (!counts) continue;

    let out, statusRaw = null;
    if (row.source === 'QFC') {
      statusRaw = raw.license_status || raw.licence_status || null;
      out = normalizeQFCStatus(statusRaw);
    } else if (row.source === 'MOCI') {
      statusRaw = raw.cr_status || null;
      out = normalizeMOCIStatus(statusRaw);
    } else {
      out = normalizeUnspecifiedStatus();
    }
    if (out.is_active) anyActive = true;

    // Track the most informative status_raw (active wins, then any non-null).
    if (out.is_active || (lastStatusRaw == null && statusRaw)) {
      lastStatusNormalized = out.status_normalized;
      lastStatusRaw = statusRaw;
    }
  }

  const archived = !anyActive;
  // Reason only meaningful when archived. QFZ-disappearance that left the company
  // with no active source is labelled distinctly from a plain status expiry.
  const archiveReason = archived ? (qfzDisappeared ? 'qfz_disappeared' : 'inactive') : null;

  await runner.query(
    `UPDATE companies
        SET is_active         = $2,
            archived          = $3,
            status_normalized = $4,
            status_raw        = $5,
            archive_reason    = CASE WHEN $3 THEN $6 ELSE NULL END,
            archived_at       = CASE WHEN $3 AND archived_at IS NULL THEN now()
                                     WHEN NOT $3 THEN NULL
                                     ELSE archived_at END
      WHERE id = $1`,
    [companyId, anyActive, archived, lastStatusNormalized, lastStatusRaw, archiveReason],
  );

  return { company_id: companyId, is_active: anyActive, archived, archive_reason: archiveReason };
}

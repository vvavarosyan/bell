// Local-only enrichment reject log — what an engine FOUND or GENERATED but did
// NOT save, and why. Surfaced in the company "Sources & Activity" tab so the
// operator can see exactly what was discarded (and trust nothing unverified
// entered Bell). Best-effort: logging must NEVER break or slow an engine.

import { query } from '../../db.js';

/** Record one rejected value (deduped per company+engine+kind+value). */
export async function recordReject(companyId, engine, kind, value, reason) {
  if (!companyId || value == null || value === '') return;
  try {
    await query(
      `INSERT INTO enrichment_rejects (company_id, engine, kind, value, reason)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (company_id, engine, kind, value)
         DO UPDATE SET reason = EXCLUDED.reason, created_at = now()`,
      [companyId, String(engine).slice(0, 40), String(kind).slice(0, 40),
       String(value).slice(0, 300), String(reason).slice(0, 200)],
    );
  } catch { /* best-effort — never let logging break the engine */ }
}

/** Recent rejected values for a company (newest first). */
export async function listRejects(companyId, limit = 100) {
  try {
    const r = await query(
      `SELECT id, engine, kind, value, reason, created_at
         FROM enrichment_rejects
        WHERE company_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [companyId, limit],
    );
    return r.rows;
  } catch { return []; }
}

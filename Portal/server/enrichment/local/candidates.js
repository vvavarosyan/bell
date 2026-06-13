// Website candidate review queue — list / decide / count.
// ----------------------------------------------------------------------------
// Search-found websites land here as 'pending'. The admin approves (sets the
// company's website so the harvester picks it up) or rejects (records the host
// in rejection memory so the Finder never re-proposes it).

import { query, withTransaction } from '../../db.js';
import { hostOf } from './http.js';
import { recomputeBellScoreForCompany } from '../../assembly/bell_score.js';

/** Pending candidates with their company, newest first. */
export async function listCandidates(status = 'pending', limit = 200) {
  const r = await query(`
    SELECT wc.id, wc.company_id, wc.candidate_url, wc.reason, wc.status,
           wc.created_at, wc.decided_at, wc.decided_by,
           c.name AS company_name, c.bin AS company_bin
    FROM website_candidates wc
    JOIN companies c ON c.id = wc.company_id
    WHERE ($1 = 'all' OR wc.status = $1)
    ORDER BY wc.created_at DESC, wc.id DESC
    LIMIT $2
  `, [status, limit]);
  return r.rows;
}

export async function countPending() {
  const r = await query(`SELECT count(*)::int AS n FROM website_candidates WHERE status = 'pending'`);
  return r.rows[0]?.n || 0;
}

/**
 * Decide a candidate.
 *   approve → set companies.website (only if still empty), reset stage7 so the
 *             harvester re-runs, mark approved.
 *   reject  → mark rejected + add the host to extra_fields.website_rejected so
 *             the Finder won't re-propose it.
 */
export async function decideCandidate(id, action, decidedBy = 'admin') {
  if (action !== 'approve' && action !== 'reject') throw new Error('action must be approve or reject');

  const row = (await query(`SELECT * FROM website_candidates WHERE id = $1`, [id])).rows[0];
  if (!row) throw new Error('candidate not found');
  if (row.status !== 'pending') return { id, status: row.status, noop: true };

  if (action === 'approve') {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE companies
            SET website = $2, stage7_status = NULL, stage7_at = NULL
          WHERE id = $1 AND (website IS NULL OR btrim(website) = '')`,
        [row.company_id, row.candidate_url]);
      await client.query(
        `UPDATE website_candidates SET status = 'approved', decided_at = now(), decided_by = $2 WHERE id = $1`,
        [id, decidedBy]);
    });
    await recomputeBellScoreForCompany(row.company_id);
    return { id, status: 'approved', company_id: row.company_id, website: row.candidate_url };
  }

  // reject
  const host = (hostOf(row.candidate_url) || '').toLowerCase();
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE website_candidates SET status = 'rejected', decided_at = now(), decided_by = $2 WHERE id = $1`,
      [id, decidedBy]);
    if (host) {
      await client.query(
        `UPDATE companies
            SET extra_fields = jsonb_set(
              extra_fields, '{website_rejected}',
              coalesce(extra_fields->'website_rejected','[]'::jsonb) || to_jsonb($2::text), true)
          WHERE id = $1`,
        [row.company_id, host]);
    }
  });
  return { id, status: 'rejected', company_id: row.company_id };
}

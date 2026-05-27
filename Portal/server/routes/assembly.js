// /api/assembly — Phase 5 (dedup + identifier assignment) HTTP layer.
//
// Endpoints:
//   POST /api/assembly/run                 — run full assembly job
//   GET  /api/assembly/stats               — counts of canonical / merged /
//                                            standalone + pending review queue
//   GET  /api/assembly/dedup-queue?limit=  — pending pairs awaiting decision
//   POST /api/assembly/dedup/:id/decide    — admin merge/keep-separate

import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { jobs } from '../ingest/jobs.js';
import { runDedup, mergeCompanies } from '../assembly/dedup.js';
import { assignAllIdentifiers } from '../assembly/assign_ids.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/assembly/run — kicks off dedup + identifier assignment in the
// background. Returns a job id for live polling via /api/enrichment/jobs/:id
// (same job channel pattern as enrichment).
// ---------------------------------------------------------------------------
router.post('/run', async (req, res, next) => {
  try {
    const job = jobs.start({ kind: 'assembly', source: 'assembly-full-run' });
    res.json({ job_id: job.id, status: job.status });

    (async () => {
      try {
        jobs.log(job.id, `▸▸▸ Bell Assembly initiated`);
        const dedupResult  = await runDedup({ jobLog: (m) => jobs.log(job.id, m) });
        const idResult     = await assignAllIdentifiers((m) => jobs.log(job.id, m));
        jobs.log(job.id, `▸▸▸ Assembly complete.`);
        jobs.complete(job.id, { dedup: dedupResult, identifiers: idResult });
      } catch (err) {
        jobs.fail(job.id, err);
      }
    })();
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/assembly/stats
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT
        (SELECT count(*)::int FROM companies WHERE merge_status = 'merged_into')     AS merged_companies,
        (SELECT count(*)::int FROM companies WHERE merge_status = 'canonical')        AS canonical_companies,
        (SELECT count(*)::int FROM companies WHERE merge_status = 'standalone')       AS standalone_companies,
        (SELECT count(*)::int FROM companies WHERE bin IS NOT NULL)                   AS companies_with_bin,
        (SELECT count(*)::int FROM people    WHERE pin IS NOT NULL)                   AS people_with_pin,
        (SELECT count(*)::int FROM jobs      WHERE jin IS NOT NULL)                   AS jobs_with_jin,
        (SELECT count(*)::int FROM dedup_candidates WHERE decision = 'pending')       AS pending_review,
        (SELECT count(*)::int FROM dedup_candidates WHERE decision = 'auto_merged')   AS auto_merged_count,
        (SELECT count(*)::int FROM dedup_candidates WHERE decision = 'kept_separate') AS kept_separate_count
    `);
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/assembly/dedup-queue?limit=&order=
// Returns pending candidate pairs with both companies' summary fields so the
// UI can render side-by-side comparisons without follow-up fetches.
// ---------------------------------------------------------------------------
router.get('/dedup-queue', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const r = await query(`
      SELECT
        dc.id, dc.similarity_score, dc.similarity_reasons, dc.created_at,
        json_build_object(
          'id', a.id, 'bin', a.bin, 'name', a.name, 'legal_name', a.legal_name,
          'website', a.website, 'linkedin_url', a.linkedin_url,
          'primary_registration_no', a.primary_registration_no,
          'industry', a.industry, 'city', a.city,
          'employee_count', a.employee_count,
          'sources', (SELECT array_agg(DISTINCT cs.source ORDER BY cs.source)
                      FROM company_sources cs WHERE cs.company_id = a.id)
        ) AS company_a,
        json_build_object(
          'id', b.id, 'bin', b.bin, 'name', b.name, 'legal_name', b.legal_name,
          'website', b.website, 'linkedin_url', b.linkedin_url,
          'primary_registration_no', b.primary_registration_no,
          'industry', b.industry, 'city', b.city,
          'employee_count', b.employee_count,
          'sources', (SELECT array_agg(DISTINCT cs.source ORDER BY cs.source)
                      FROM company_sources cs WHERE cs.company_id = b.id)
        ) AS company_b
      FROM dedup_candidates dc
      JOIN companies a ON a.id = dc.company_a_id
      JOIN companies b ON b.id = dc.company_b_id
      WHERE dc.decision = 'pending'
      ORDER BY dc.similarity_score DESC, dc.id
      LIMIT $1
    `, [limit]);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/assembly/dedup/:id/decide
// body: { action: 'merge_a_to_b' | 'merge_b_to_a' | 'keep_separate',
//         admin_email?: string }
// ---------------------------------------------------------------------------
router.post('/dedup/:id/decide', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { action, admin_email } = req.body || {};
    if (!['merge_a_to_b', 'merge_b_to_a', 'keep_separate'].includes(action)) {
      return res.status(400).json({ error: 'invalid_action' });
    }
    const r = await query(`SELECT * FROM dedup_candidates WHERE id = $1`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    const cand = r.rows[0];
    if (cand.decision !== 'pending') {
      return res.status(409).json({ error: 'already_decided', decision: cand.decision });
    }

    if (action === 'keep_separate') {
      await query(`
        UPDATE dedup_candidates
        SET decision = 'kept_separate', decided_at = now(), decided_by = $2
        WHERE id = $1
      `, [id, admin_email || 'unknown']);
      return res.json({ ok: true, decision: 'kept_separate' });
    }

    // Merge — A→B means B is canonical, A is duplicate
    const canonical = action === 'merge_a_to_b' ? cand.company_b_id : cand.company_a_id;
    const duplicate = action === 'merge_a_to_b' ? cand.company_a_id : cand.company_b_id;
    await mergeCompanies(canonical, duplicate);
    await query(`
      UPDATE dedup_candidates
      SET decision = $2, decided_at = now(), decided_by = $3
      WHERE id = $1
    `, [id, action, admin_email || 'unknown']);

    res.json({ ok: true, canonical, duplicate, decision: action });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/assembly/assign-ids — manual: just run the identifier assignment
// without dedup. Useful after a manual data import.
// ---------------------------------------------------------------------------
router.post('/assign-ids', async (req, res, next) => {
  try {
    const result = await assignAllIdentifiers();
    res.json(result);
  } catch (err) { next(err); }
});

export default router;

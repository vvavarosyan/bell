// /api/similar-companies — the "similar companies" review queue.
//
// Each row in similar_company_queue is something Stage 2 discovered as
// related to one of our companies. Admin reviews, decides to either:
//   - add to scope (creates a new companies row with the LinkedIn URL set
//     and stage1_status='done' so Stages 2-5 can run on it)
//   - skip (mark and never show again)

import { Router } from 'express';
import { query, withTransaction } from '../db.js';

const router = Router();

// GET /api/similar-companies?decision=pending|added_to_scope|skipped&limit=&offset=
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const decision = req.query.decision || 'pending';

    const r = await query(`
      SELECT q.id, q.source_company_id, q.similar_linkedin_url, q.similar_name,
             q.similar_industry, q.similar_size,
             q.decision, q.decided_at, q.decided_by, q.discovered_at,
             c.bin AS source_bin, c.name AS source_name
      FROM similar_company_queue q
      JOIN companies c ON c.id = q.source_company_id
      WHERE q.decision = $1
      ORDER BY q.discovered_at DESC
      LIMIT $2 OFFSET $3
    `, [decision, limit, offset]);

    const count = await query(
      `SELECT count(*)::int AS total FROM similar_company_queue WHERE decision = $1`,
      [decision],
    );

    res.json({
      total: count.rows[0].total,
      limit, offset,
      rows: r.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/similar-companies/by-source/:companyId — list for one source company
router.get('/by-source/:companyId', async (req, res, next) => {
  try {
    const id = Number(req.params.companyId);
    const r = await query(`
      SELECT id, similar_linkedin_url, similar_name, similar_industry, similar_size,
             decision, decided_at, decided_by, discovered_at
      FROM similar_company_queue
      WHERE source_company_id = $1
      ORDER BY discovered_at DESC
    `, [id]);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// POST /api/similar-companies/:id { decision, admin_email }
// decision: 'added_to_scope' creates a new companies row; 'skipped' just marks it.
router.post('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const decision = String(req.body?.decision || '');
    if (!['added_to_scope', 'skipped'].includes(decision)) {
      return res.status(400).json({ error: 'invalid_decision' });
    }
    const adminEmail = req.body?.admin_email || (await query(`SELECT value FROM settings WHERE key='admin_email'`)).rows[0]?.value || 'admin@local';

    const result = await withTransaction(async (client) => {
      const q = await client.query(
        `SELECT id, source_company_id, similar_linkedin_url, similar_name, similar_industry, similar_size,
                decision
         FROM similar_company_queue WHERE id = $1`,
        [id],
      );
      if (!q.rows.length) return { error: 'not_found' };
      const row = q.rows[0];

      if (row.decision !== 'pending') {
        return { error: 'already_decided', current: row.decision };
      }

      let new_company_id = null;
      if (decision === 'added_to_scope') {
        // Check if a company with this LinkedIn URL already exists
        const existing = await client.query(
          `SELECT id, name FROM companies WHERE linkedin_url = $1 LIMIT 1`,
          [row.similar_linkedin_url],
        );
        if (existing.rows.length) {
          new_company_id = existing.rows[0].id;
        } else {
          // Create a new company row pre-seeded with this LinkedIn URL.
          // Name is a placeholder until Stage 2 re-runs and fills it in.
          const insName = row.similar_name || ('LinkedIn ' + row.similar_linkedin_url.split('/company/').pop());
          const ins = await client.query(`
            INSERT INTO companies
              (name, name_normalized, linkedin_url, is_active, archived,
               status_normalized, country, industry,
               stage1_status, stage1_at,
               extra_fields)
            VALUES ($1, lower($1), $2, true, false, 'active', 'Qatar', $3,
                    'done', now(),
                    $4::jsonb)
            RETURNING id
          `, [
            insName,
            row.similar_linkedin_url,
            row.similar_industry,
            JSON.stringify({
              created_via:                 'similar_company_queue',
              source_company_id:           row.source_company_id,
              similar_company_queue_id:    row.id,
              linkedin_size_hint:          row.similar_size,
            }),
          ]);
          new_company_id = ins.rows[0].id;
        }
      }

      await client.query(`
        UPDATE similar_company_queue
        SET decision = $2, decided_at = now(), decided_by = $3
        WHERE id = $1
      `, [id, decision, adminEmail]);

      return { ok: true, decision, new_company_id };
    });

    if (result?.error) return res.status(400).json(result);
    res.json(result);
  } catch (err) { next(err); }
});

export default router;

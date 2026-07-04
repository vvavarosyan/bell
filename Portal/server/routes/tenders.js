// /api/tenders — Qatar public tenders + awards (Signals v2 follow-up).
//
// GET  /            list recent tenders (optional ?status=&limit=)
// GET  /stats       counts by status (for a header/legend)
// POST /ingest      admin/local: feed scraped or manual tender rows → upsert +
//                   fuzzy-link to companies (server/tenders/ingest.js). The
//                   signals engine then turns awarded, linked tenders into
//                   'tender' signals that drive the in-market score.

import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../lib/auth.js';
import { ingestTenders } from '../tenders/ingest.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const params = [];
    let where = '';
    if (req.query.status) { params.push(String(req.query.status)); where = `WHERE status = $${params.length}`; }
    params.push(limit);
    const r = await query(
      `SELECT id, source, title, buyer, category, status, award_company_name, award_company_id,
              value_amount, currency, url, published_at, deadline_at, awarded_at
         FROM tenders ${where}
        ORDER BY COALESCE(awarded_at, published_at, created_at) DESC
        LIMIT $${params.length}`,
      params,
    );
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

router.get('/stats', async (_req, res, next) => {
  try {
    const r = await query(`
      SELECT status, count(*)::int AS n,
             count(*) FILTER (WHERE award_company_id IS NOT NULL)::int AS linked
        FROM tenders GROUP BY status`);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// Feed rows in: [{ source, source_ref, title, buyer, category, status,
// award_company_name, value_amount, currency, url, published_at, ... }]
router.post('/ingest', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.tenders) ? req.body.tenders : [];
    if (!rows.length) return res.status(400).json({ error: 'bad_request', reason: 'tenders[] required' });
    const out = await ingestTenders(rows);
    res.json(out);
  } catch (err) { next(err); }
});

export default router;

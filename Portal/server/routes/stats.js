// /api/stats — top-of-page dashboard counters.

import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    // Migration 009 auto-applies on every Portal boot before /api/stats can
    // be hit, so the od_* tables are guaranteed to exist by request-time.
    const sql = `
      SELECT
        (SELECT count(*) FROM companies)                         AS companies_total,
        (SELECT count(*) FROM companies WHERE is_active = true)  AS companies_active,
        (SELECT count(*) FROM companies WHERE archived = true)   AS companies_archived,
        (SELECT count(*) FROM companies WHERE bin IS NULL)       AS companies_unassembled,
        (SELECT count(*) FROM people)                            AS people_total,
        (SELECT count(*) FROM people WHERE is_revealed = true)   AS people_revealed,
        (SELECT count(*) FROM jobs)                              AS jobs_total,
        (SELECT count(*) FROM jobs WHERE is_active = true)       AS jobs_active,
        (SELECT count(*) FROM enrichment_runs)                   AS enrichment_runs_total,
        (SELECT coalesce(sum(credits_used), 0) FROM enrichment_credits) AS credits_total,
        (SELECT coalesce(sum(usd_used), 0) FROM enrichment_credits)     AS usd_total,
        (SELECT count(*) FROM od_datasets WHERE NOT archived)    AS deep_data_total,
        (SELECT count(*) FROM od_records)                        AS deep_data_records_total
    `;
    const r = await query(sql);
    // pg returns counts as strings; coerce to numbers for the UI.
    const row = r.rows[0];
    for (const k of Object.keys(row)) row[k] = Number(row[k]);
    res.json(row);
  } catch (err) { next(err); }
});

// GET /api/stats/stage-progress — companies per stage status
router.get('/stage-progress', async (req, res, next) => {
  try {
    const sql = `
      SELECT
        stage,
        status,
        count(*)::int AS count
      FROM (
        SELECT 1 AS stage, stage1_status AS status FROM companies UNION ALL
        SELECT 2,           stage2_status FROM companies UNION ALL
        SELECT 3,           stage3_status FROM companies UNION ALL
        SELECT 4,           stage4_status FROM companies UNION ALL
        SELECT 5,           stage5_status FROM companies
      ) s
      GROUP BY stage, status
      ORDER BY stage, status;
    `;
    const r = await query(sql);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

export default router;

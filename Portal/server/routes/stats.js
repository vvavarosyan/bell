// /api/stats — top-of-page dashboard counters.

import { Router } from 'express';
import { query } from '../db.js';
import { getDataPointsCached } from '../lib/datapoints.js';

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

// GET /api/stats/overview — rich database overview for admin (totals, contact
// completeness, who's missing email/phone, source + industry breakdown,
// freshness, data points). platform_admin only.
router.get('/overview', async (req, res, next) => {
  try {
    if (req.user?.role !== 'platform_admin') return res.status(403).json({ error: 'admin_only' });

    const [co, pj, cc, pc, src, ind, dataPoints] = await Promise.all([
      query(`
        SELECT
          count(*)::int                                                                            AS total,
          count(*) FILTER (WHERE is_active)::int                                                   AS active,
          count(*) FILTER (WHERE archived)::int                                                    AS archived,
          count(*) FILTER (WHERE website IS NOT NULL AND btrim(website::text) <> '')::int           AS with_website,
          count(*) FILTER (WHERE linkedin_url IS NOT NULL)::int                                     AS with_linkedin,
          count(*) FILTER (WHERE (industries IS NOT NULL AND array_length(industries,1) > 0)
                              OR (industry IS NOT NULL AND btrim(industry) <> ''))::int             AS with_industry,
          count(*) FILTER (WHERE updated_at > now() - interval '7 days')::int                       AS updated_7d,
          count(*) FILTER (WHERE updated_at > now() - interval '30 days')::int                      AS updated_30d
        FROM companies`),
      query(`
        SELECT
          (SELECT count(*) FROM people)::int                                                     AS people_total,
          (SELECT count(*) FROM people WHERE updated_at > now() - interval '7 days')::int        AS people_7d,
          (SELECT count(DISTINCT person_id) FROM person_companies)::int                          AS people_with_employment,
          (SELECT count(*) FROM jobs)::int                                                       AS jobs_total,
          (SELECT count(*) FROM jobs WHERE is_active)::int                                       AS jobs_active`),
      query(`SELECT type, count(DISTINCT company_id)::int AS companies_with, count(*)::int AS total
               FROM company_contacts WHERE type IN ('email','phone','social') GROUP BY type`),
      query(`SELECT type, count(DISTINCT person_id)::int AS people_with, count(*)::int AS total
               FROM person_contacts WHERE type IN ('email','phone') GROUP BY type`),
      query(`SELECT source, count(DISTINCT company_id)::int AS companies
               FROM company_sources GROUP BY source ORDER BY companies DESC`),
      query(`SELECT ind AS industry, count(*)::int AS n FROM (
                 SELECT unnest(coalesce(NULLIF(industries, '{}'), ARRAY[industry])) AS ind
                   FROM companies WHERE archived = false) t
               WHERE ind IS NOT NULL AND ind <> '' GROUP BY ind ORDER BY n DESC LIMIT 14`),
      getDataPointsCached().catch(() => null),
    ]);

    const ccByType = Object.fromEntries(cc.rows.map((r) => [r.type, r]));
    const pcByType = Object.fromEntries(pc.rows.map((r) => [r.type, r]));
    const C = co.rows[0];

    res.json({
      companies: C,
      people: { total: pj.rows[0].people_total, with_employment: pj.rows[0].people_with_employment, updated_7d: pj.rows[0].people_7d },
      jobs: { total: pj.rows[0].jobs_total, active: pj.rows[0].jobs_active },
      company_contacts: {
        with_email: ccByType.email?.companies_with || 0, emails_total: ccByType.email?.total || 0,
        with_phone: ccByType.phone?.companies_with || 0, phones_total: ccByType.phone?.total || 0,
        socials_total: ccByType.social?.total || 0,
        without_email: C.total - (ccByType.email?.companies_with || 0),
        without_phone: C.total - (ccByType.phone?.companies_with || 0),
      },
      person_contacts: {
        with_email: pcByType.email?.people_with || 0, emails_total: pcByType.email?.total || 0,
        with_phone: pcByType.phone?.people_with || 0, phones_total: pcByType.phone?.total || 0,
      },
      sources: src.rows,
      industries: ind.rows,
      data_points: dataPoints?.total ?? dataPoints ?? null,
    });
  } catch (err) { next(err); }
});

export default router;

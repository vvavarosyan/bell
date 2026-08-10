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
    // Internal enrichment cost (credits/USD we spend) is platform-admin only.
    if (req.user?.role !== 'platform_admin') { delete row.credits_total; delete row.usd_total; }
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

// GET /api/stats/overview — database overview for admin. ACTIVE companies only
// (archived rows are excluded everywhere). platform_admin only.
router.get('/overview', async (req, res, next) => {
  try {
    if (req.user?.role !== 'platform_admin') return res.status(403).json({ error: 'admin_only' });

    const [co, pj, cc, pc, src, ind, dataPoints] = await Promise.all([
      query(`
        SELECT
          count(*)::int                                                                            AS total,
          count(*) FILTER (WHERE bin IS NOT NULL)::int                                              AS assembled,
          count(*) FILTER (WHERE website IS NOT NULL AND btrim(website::text) <> '')::int           AS with_website,
          count(*) FILTER (WHERE linkedin_url IS NOT NULL)::int                                     AS with_linkedin,
          count(*) FILTER (WHERE (industries IS NOT NULL AND array_length(industries,1) > 0)
                              OR (industry IS NOT NULL AND btrim(industry) <> ''))::int             AS with_industry,
          count(*) FILTER (WHERE updated_at > now() - interval '7 days')::int                       AS updated_7d,
          count(*) FILTER (WHERE updated_at > now() - interval '30 days')::int                      AS updated_30d
        FROM companies WHERE archived = false`),
      query(`
        SELECT
          (SELECT count(*) FROM people WHERE archived = false)::int                                                   AS people_total,
          (SELECT count(*) FROM people WHERE archived = false AND updated_at > now() - interval '7 days')::int        AS people_7d,
          (SELECT count(*) FROM people p WHERE p.archived = false
              AND EXISTS (SELECT 1 FROM person_companies pc WHERE pc.person_id = p.id))::int                          AS people_with_employment,
          (SELECT count(*) FROM people WHERE archived = false AND is_revealed)::int                                   AS people_revealed,
          (SELECT count(DISTINCT pc.company_id) FROM person_companies pc JOIN companies c ON c.id = pc.company_id
              WHERE c.archived = false)::int                                                                          AS companies_with_people,
          (SELECT count(*) FROM jobs j JOIN companies c ON c.id = j.company_id WHERE c.archived = false)::int         AS jobs_total,
          (SELECT count(*) FROM jobs j JOIN companies c ON c.id = j.company_id WHERE c.archived = false AND j.is_active)::int AS jobs_active`),
      query(`SELECT cc.type, count(DISTINCT cc.company_id)::int AS companies_with, count(*)::int AS total
               FROM company_contacts cc JOIN companies c ON c.id = cc.company_id
              WHERE c.archived = false AND cc.type IN ('email','phone','social') GROUP BY cc.type`),
      query(`SELECT pcc.type, count(DISTINCT pcc.person_id)::int AS people_with, count(*)::int AS total
               FROM person_contacts pcc JOIN people p ON p.id = pcc.person_id
              WHERE p.archived = false AND pcc.type IN ('email','phone') GROUP BY pcc.type`),
      query(`SELECT cs.source, count(DISTINCT cs.company_id)::int AS companies
               FROM company_sources cs JOIN companies c ON c.id = cs.company_id
              WHERE c.archived = false GROUP BY cs.source ORDER BY companies DESC`),
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
      companies: { ...C, with_people: pj.rows[0].companies_with_people },
      people: { total: pj.rows[0].people_total, with_employment: pj.rows[0].people_with_employment, revealed: pj.rows[0].people_revealed, updated_7d: pj.rows[0].people_7d },
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

/**
 * GET /api/stats/storage — what this deployment's database actually costs, in bytes.
 *
 * ⚠️ WHY THIS EXISTS. Val, on Railway: "the postgres uses almost 7gb ram continuously on
 * production and over 5GB on staging… are you able to investigate this and see the actual usage
 * with actual numbers?" Bell had no way to answer for anything but the engine box, so a cost
 * conversation had to be conducted from an estimate — and the estimate was WRONG in a way that
 * mattered: it treated od_records (2,479 MB, 4.0M rows) as engine-box-only because it is not in
 * MIRROR_TABLES. It is not COPIED to Railway; every deployment BUILT ITS OWN, because the Qatar
 * Open Data scheduler ran with no gate (server.js). Not mirrored is not the same as not there.
 *
 * Runs against whichever database the caller is talking to, so opening this on admin.bell.qa
 * finally answers "how big is production" with production's own numbers rather than a guess from
 * the Mac. Platform-admin only — it is an operational readout, not customer data.
 */
router.get('/storage', async (req, res, next) => {
  try {
    if (req.user?.role !== 'platform_admin' && process.env.BDI_MODE !== 'local-admin') {
      return res.status(403).json({ error: 'admin_only' });
    }
    const db = await query(
      `SELECT current_database() AS name,
              pg_database_size(current_database())            AS bytes,
              pg_size_pretty(pg_database_size(current_database())) AS pretty`);
    // Heap and indexes separately: yesterday's saving came entirely from an index nothing used,
    // and a single "total" would have hidden where the weight actually sits.
    const tables = await query(
      `SELECT c.relname                                        AS table,
              pg_total_relation_size(c.oid)                    AS total_bytes,
              pg_size_pretty(pg_total_relation_size(c.oid))    AS total,
              pg_size_pretty(pg_relation_size(c.oid))          AS heap,
              pg_size_pretty(pg_indexes_size(c.oid))           AS indexes,
              c.reltuples::bigint                              AS approx_rows
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY pg_total_relation_size(c.oid) DESC
        LIMIT 25`);
    // An index nobody has scanned since the last stats reset is a candidate for removal — the
    // shape that found idx_companies_extra_fields_gin (114 MB, 0 scans in three weeks).
    const idleIndexes = await query(
      `SELECT indexrelname AS index, relname AS table, idx_scan AS scans,
              pg_size_pretty(pg_relation_size(indexrelid)) AS size
         FROM pg_stat_user_indexes
        WHERE idx_scan < 10 AND pg_relation_size(indexrelid) > 20 * 1024 * 1024
        ORDER BY pg_relation_size(indexrelid) DESC LIMIT 15`);
    res.json({
      mode: process.env.BDI_MODE || 'unknown',
      database: db.rows[0],
      tables: tables.rows,
      // ⚠️ Reported, never acted on. idx_companies_search_blob_trgm shows up here with 9 scans and
      // 205 MB, and dropping it would make Railway's memory WORSE, not better — a phrase search
      // without it pulls 1,729 MB of pages through shared_buffers instead of 117 MB (measured
      // 2026-08-10). Low scan count is a reason to LOOK, not a reason to drop.
      rarely_scanned_indexes: idleIndexes.rows,
    });
  } catch (err) { next(err); }
});

export default router;

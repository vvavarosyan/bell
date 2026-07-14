// /api/tenders — Qatar public tenders + awards (Signals v2 follow-up).
//
// GET  /            list tenders with filters + total (status, source, buyer, q, year, limit, offset)
// GET  /stats       counts by status (for a header/legend)
// GET  /facets      distinct sources / top buyers / years / statuses — drives the filter UI
// GET  /sync-status LOCAL engine: local count vs live (app.bell.qa) count → "are they synced?"
// GET  /:id         one tender with full detail (raw activities, contact, contract…)
// POST /ingest      admin/local: feed scraped or manual tender rows → upsert +
//                   fuzzy-link to companies (server/tenders/ingest.js). The
//                   signals engine then turns awarded, linked tenders into
//                   'tender' signals that drive the in-market score.
// POST /scan        LOCAL engine: render + parse the live sources and ingest.

import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../lib/auth.js';
import { getKey } from '../keychain.js';
import { ingestTenders } from '../tenders/ingest.js';
import { runTenderScan } from '../tenders/scrape.js';

const router = Router();

// Shared SELECT for list rows. `has_detail` tells the UI whether a tender has
// been through detail enrichment yet (activities present) — used to show a
// "detail pending" hint during a background backfill.
const LIST_COLS = `
  id, source, source_ref, title, buyer, category, status,
  award_company_name, award_company_id, value_amount, currency, url,
  published_at, deadline_at, awarded_at,
  industries, primary_industry,
  (source <> 'monaqasat' OR jsonb_exists(raw, 'activities')) AS has_detail,
  -- Ashghal publishes the bid bond only as a source string ("180,000 Q.R.") in raw,
  -- never in value_amount. Extract the digits so the card can show it. Monaqasat/awards
  -- carry value_amount directly, so this stays a fallback (never overrides value_amount).
  nullif(regexp_replace(coalesce(raw->>'tender_bond',''), '[^0-9]', '', 'g'), '')::bigint AS bond_amount`;

// The tenant's ICP target industries, or [] when the profile is unset.
async function icpIndustries(req) {
  if (!req.tenant?.id) return [];
  const r = await query(`SELECT target_industries FROM tenant_profile WHERE tenant_id = $1`, [req.tenant.id])
    .catch(() => ({ rows: [] }));
  return (r.rows[0]?.target_industries || []).filter(Boolean);
}

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const conds = [];

    // "For you" — only tenders whose line(s) of business overlap this tenant's
    // ICP industries. Array overlap on the indexed industries[] column, so it's
    // the same vocabulary the ICP picker writes (canonical industry tags).
    if (req.query.icp === '1') {
      const icp = await icpIndustries(req);
      if (!icp.length) return res.json({ rows: [], total: 0, limit, offset, icp_missing: true });
      params.push(icp); conds.push(`industries && $${params.length}::text[]`);
    }
    if (req.query.industry) {
      params.push([String(req.query.industry)]); conds.push(`industries && $${params.length}::text[]`);
    }
    if (req.query.status) { params.push(String(req.query.status).toLowerCase()); conds.push(`status = $${params.length}`); }
    if (req.query.source) { params.push(String(req.query.source).toLowerCase()); conds.push(`source = $${params.length}`); }
    if (req.query.buyer)  { params.push(String(req.query.buyer)); conds.push(`buyer = $${params.length}`); }
    if (req.query.q) {
      // "Find any detail" (Val 2026-07-12: searching "5797/2025" found nothing).
      // Match the fast indexed columns AND the full published payload — raw::text
      // covers the buyer's own ref, the Monaqasat/Kahramaa cross-reference number,
      // department, the description and every "As published" field value. The
      // tenders table is small (~27k rows) so the seq scan is well under 100ms.
      params.push('%' + String(req.query.q).replace(/[%_\\]/g, '') + '%');
      conds.push(`(title ILIKE $${params.length} OR buyer ILIKE $${params.length}
        OR source_ref ILIKE $${params.length} OR category ILIKE $${params.length}
        OR award_company_name ILIKE $${params.length} OR raw::text ILIKE $${params.length})`);
    }
    if (req.query.year && /^20\d{2}$/.test(String(req.query.year))) {
      params.push(Number(req.query.year));
      conds.push(`EXTRACT(YEAR FROM COALESCE(awarded_at, published_at, created_at)) = $${params.length}`);
    }
    if (req.query.linked === '1') conds.push('award_company_id IS NOT NULL');
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const totalR = await query(`SELECT count(*)::int AS n FROM tenders ${where}`, params);
    params.push(limit); const lim = params.length;
    params.push(offset); const off = params.length;
    const rowsR = await query(
      `SELECT ${LIST_COLS}
         FROM tenders ${where}
        ORDER BY COALESCE(awarded_at, published_at, created_at) DESC NULLS LAST, id DESC
        LIMIT $${lim} OFFSET $${off}`,
      params,
    );
    res.json({ rows: rowsR.rows, total: totalR.rows[0].n, limit, offset });
  } catch (err) { next(err); }
});

// GET /api/tenders/buyers — "Who's buying": procuring entities ranked by ICP fit,
// urgency (soonest deadline) and open-tender count. This is the buyer-intent wedge —
// it reframes tenders from a bid list into "who is actively buying in YOUR line of
// business, and act on it." Pure aggregation over the indexed buyer + industries[]
// columns (no fragile buyer→company resolution; most Qatar tender buyers are public
// agencies not in the commercial registry anyway).
router.get('/buyers', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    let icp = [];
    if (req.query.icp === '1') {
      icp = await icpIndustries(req);
      if (!icp.length) return res.json({ rows: [], total: 0, icp: [], icp_missing: true });
    }
    const r = await query(
      `WITH open_t AS (
         SELECT id, buyer, deadline_at, published_at, source, industries
           FROM tenders
          WHERE status = 'open' AND buyer IS NOT NULL AND btrim(buyer) <> ''
       ),
       agg AS (
         SELECT o.buyer,
                count(DISTINCT o.id)::int AS open_count,
                min(o.deadline_at) FILTER (WHERE o.deadline_at > now()) AS soonest_deadline,
                max(o.published_at) AS latest_published,
                array_remove(array_agg(DISTINCT ind), NULL) AS industries,
                array_remove(array_agg(DISTINCT o.source), NULL) AS sources
           FROM open_t o
           LEFT JOIN LATERAL unnest(coalesce(o.industries, '{}'::text[])) AS ind ON true
          GROUP BY o.buyer
       )
       SELECT buyer, open_count, soonest_deadline, latest_published, industries, sources,
              (industries && $1::text[]) AS icp_match,
              count(*) OVER ()::int AS total
         FROM agg
        WHERE ($1::text[] = '{}'::text[] OR industries && $1::text[])
        ORDER BY (industries && $1::text[]) DESC, soonest_deadline ASC NULLS LAST, open_count DESC
        LIMIT $2 OFFSET $3`,
      [icp, limit, offset]);
    const icpSet = new Set(icp.map((x) => String(x).toLowerCase()));
    const rows = r.rows.map(({ total, ...b }) => ({
      ...b,
      // which of the buyer's lines of business match the tenant's ICP (for the label)
      matched_industries: icpSet.size ? (b.industries || []).filter((i) => icpSet.has(String(i).toLowerCase())) : [],
    }));
    res.json({ rows, total: r.rows[0]?.total || 0, icp, limit, offset });
  } catch (err) { next(err); }
});

// GET /api/tenders/awards — "Who won what": recent contract awards with the winning
// company, value, ICV score and (Ashghal) the full bidder table — competitive award
// intelligence rivals charge for and don't link to a company graph. Only sources that
// publish a real winner (Monaqasat hides the winner and its "value" is a bid bond).
router.get('/awards', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const conds = [`status = 'awarded'`, `source IN ('ashghal','qatarenergy','kahramaa')`,
      `award_company_name IS NOT NULL`, `btrim(award_company_name) <> ''`];
    if (req.query.icp === '1') {
      const icp = await icpIndustries(req);
      if (!icp.length) return res.json({ rows: [], total: 0, icp_missing: true });
      params.push(icp); conds.push(`industries && $${params.length}::text[]`);
    }
    if (req.query.source) { params.push(String(req.query.source).toLowerCase()); conds.push(`source = $${params.length}`); }
    const where = 'WHERE ' + conds.join(' AND ');
    const totalR = await query(`SELECT count(*)::int n FROM tenders ${where}`, params);
    params.push(limit); const lim = params.length;
    params.push(offset); const off = params.length;
    const rowsR = await query(
      `SELECT id, source, title, buyer, award_company_name, award_company_id, value_amount, awarded_at,
              industries, primary_industry,
              nullif(raw->>'bidder_count', '')::int AS bidder_count,
              (raw->'bidders'->0->>'icv')          AS winner_icv
         FROM tenders ${where}
        ORDER BY awarded_at DESC NULLS LAST, value_amount DESC NULLS LAST, id DESC
        LIMIT $${lim} OFFSET $${off}`,
      params);
    res.json({ rows: rowsR.rows, total: totalR.rows[0].n, limit, offset });
  } catch (err) { next(err); }
});

router.get('/stats', async (_req, res, next) => {
  try {
    const r = await query(`
      SELECT status, count(*)::int AS n,
             count(*) FILTER (WHERE award_company_id IS NOT NULL)::int AS linked,
             count(*) FILTER (WHERE jsonb_exists(raw, 'activities'))::int AS detailed
        FROM tenders GROUP BY status`);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// Distinct values for the filter dropdowns. Buyers capped to the busiest 40.
router.get('/facets', async (_req, res, next) => {
  try {
    const [sources, buyers, years, statuses, industries] = await Promise.all([
      query(`SELECT source, count(*)::int AS n FROM tenders GROUP BY source ORDER BY n DESC`),
      query(`SELECT buyer, count(*)::int AS n FROM tenders WHERE buyer IS NOT NULL AND buyer <> '' GROUP BY buyer ORDER BY n DESC LIMIT 40`),
      query(`SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(awarded_at, published_at, created_at))::int AS y FROM tenders ORDER BY y DESC`),
      query(`SELECT status, count(*)::int AS n FROM tenders GROUP BY status ORDER BY n DESC`),
      // Industry facet (migration 078) — unnest so a tender counts under each of
      // its lines of business. Fails soft before the migration applies.
      query(`SELECT i AS industry, count(*)::int AS n
               FROM tenders, unnest(industries) AS i
              GROUP BY i ORDER BY n DESC LIMIT 30`).catch(() => ({ rows: [] })),
    ]);
    res.json({
      sources: sources.rows,
      buyers: buyers.rows,
      years: years.rows.map((r) => r.y).filter(Boolean),
      statuses: statuses.rows,
      industries: industries.rows,
    });
  } catch (err) { next(err); }
});

// LOCAL engine only: compare the local tender count with the live site's, so
// the operator can confirm the last scan actually reached production. Uses the
// same sync token + target the push uses. Off the local engine, prod is null.
router.get('/sync-status', async (_req, res, next) => {
  try {
    const localR = await query(`SELECT count(*)::int AS n, max(updated_at) AS m FROM tenders`);
    const local = localR.rows[0].n;
    const local_updated = localR.rows[0].m;
    let prod = null, target = null, error = null;
    const isLocal = (process.env.BDI_MODE || 'local-admin').toLowerCase() === 'local-admin';
    if (isLocal) {
      try {
        const s = await query(`SELECT value FROM settings WHERE key = 'sync_target_url'`).catch(() => ({ rows: [] }));
        target = String((s.rows[0] && s.rows[0].value) || process.env.BDI_SYNC_TARGET_URL || 'https://app.bell.qa').replace(/\/+$/, '');
        const token = await getKey('sync-token');
        if (!token) { error = 'no_sync_token'; }
        else {
          const r = await fetch(target + '/api/sync/count?table=tenders', { headers: { Authorization: 'Bearer ' + token } });
          if (r.ok) { const b = await r.json(); prod = Number(b.count); }
          else { error = 'prod_http_' + r.status; }
        }
      } catch (e) { error = String(e.message || e).slice(0, 80); }
    }
    res.json({ local, local_updated, prod, synced: (prod != null ? prod >= local : null), target, error });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_request', reason: 'bad_id' });
    const r = await query(
      `SELECT id, source, source_ref, title, buyer, category, status,
              award_company_name, award_company_id, value_amount, currency, url,
              published_at, deadline_at, awarded_at, raw, created_at, updated_at
         FROM tenders WHERE id = $1`,
      [id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ tender: r.rows[0] });
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

// POST /api/tenders/scan — LOCAL engine only: render + parse the live tender
// sources (Monaqasat…) and ingest. Needs the local browser renderer, so on
// prod it simply returns 0 scraped. Triggered by "Run Tender Scan.command".
router.post('/scan', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const sources = Array.isArray(req.body?.sources) ? req.body.sources : undefined;
    const pages = req.body?.pages != null ? Math.min(Math.max(Number(req.body.pages) || 1, 1), 60) : undefined;
    const out = await runTenderScan({ sources, pages });
    res.json(out);
  } catch (err) { next(err); }
});

export default router;

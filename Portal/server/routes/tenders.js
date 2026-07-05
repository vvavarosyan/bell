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
  jsonb_exists(raw, 'activities') AS has_detail`;

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const conds = [];
    if (req.query.status) { params.push(String(req.query.status).toLowerCase()); conds.push(`status = $${params.length}`); }
    if (req.query.source) { params.push(String(req.query.source).toLowerCase()); conds.push(`source = $${params.length}`); }
    if (req.query.buyer)  { params.push(String(req.query.buyer)); conds.push(`buyer = $${params.length}`); }
    if (req.query.q) {
      params.push('%' + String(req.query.q).replace(/[%_\\]/g, '') + '%');
      conds.push(`(title ILIKE $${params.length} OR buyer ILIKE $${params.length} OR source_ref ILIKE $${params.length})`);
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
    const [sources, buyers, years, statuses] = await Promise.all([
      query(`SELECT source, count(*)::int AS n FROM tenders GROUP BY source ORDER BY n DESC`),
      query(`SELECT buyer, count(*)::int AS n FROM tenders WHERE buyer IS NOT NULL AND buyer <> '' GROUP BY buyer ORDER BY n DESC LIMIT 40`),
      query(`SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(awarded_at, published_at, created_at))::int AS y FROM tenders ORDER BY y DESC`),
      query(`SELECT status, count(*)::int AS n FROM tenders GROUP BY status ORDER BY n DESC`),
    ]);
    res.json({
      sources: sources.rows,
      buyers: buyers.rows,
      years: years.rows.map((r) => r.y).filter(Boolean),
      statuses: statuses.rows,
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

// /api/signals — the Signals section's data (Phase C). Mounted under the
// `feature` gate (auth + subscription). Signals are GLOBAL derived events;
// the `scope=icp` view scores them against THIS tenant's ICP profile
// (tenant_profile) server-side and returns only matches, with reasons.

import { Router } from 'express';
import { query } from '../db.js';
import { scoreSignalForIcp, computeInMarketScore } from '../news/signals.js';

const router = Router();

const KINDS = new Set(['hiring', 'newly_licensed', 'partnership', 'leadership', 'news_event', 'expansion', 'tender', 'disclosure']);
const WINDOWS = { '24h': '24 hours', '3d': '3 days', '7d': '7 days', '14d': '14 days' };

// GET /api/signals?window=7d&kind=&scope=global|icp&limit=30&offset=0
// Offset/total pagination (Val 2026-07-12) — "All types" pages through EVERY
// signal in the window instead of silently capping at 120. `total` is the true
// windowed count so the UI can show an honest "page N of M".
router.get('/', async (req, res, next) => {
  try {
    const windowSql = WINDOWS[String(req.query.window || '7d')] || WINDOWS['7d'];
    const limit  = Math.min(Math.max(Number(req.query.limit) || 30, 1), 300);
    const offset = Math.max(0, Number(req.query.offset) || 0);

    const kindParams = [];
    let kindSql = '';
    if (req.query.kind && KINDS.has(String(req.query.kind))) {
      kindParams.push(String(req.query.kind));
      kindSql = `AND kind = $${kindParams.length}`;
    }

    const selectCols = `id, kind, subkind, company_id, company_name, title, body, source_kind,
              ref_table, ref_id, industry, industries, employee_count, importance, occurred_at`;

    if (String(req.query.scope) === 'icp') {
      // ICP view: score the whole window in memory, then slice — so match_score
      // ordering is correct across pages. Bounded fetch keeps it cheap.
      const icpR = await query(
        `SELECT target_industries, target_keywords, target_sizes FROM tenant_profile WHERE tenant_id = $1`,
        [req.tenant.id],
      );
      const icp = icpR.rows[0] || {};
      const hasIcp = (icp.target_industries || []).length || (icp.target_keywords || []).length || (icp.target_sizes || []).length;
      if (!hasIcp) return res.json({ rows: [], total: 0, icp_missing: true });
      const all = await query(
        `SELECT ${selectCols}
           FROM signals
          WHERE occurred_at > now() - interval '${windowSql}' ${kindSql}
          ORDER BY occurred_at DESC
          LIMIT 3000`,
        kindParams,
      );
      const matched = all.rows
        .map((s) => { const m = scoreSignalForIcp(s, icp); return { ...s, match_score: m.score, match_reasons: m.reasons }; })
        .filter((s) => s.match_score > 0)
        .sort((a, b) => b.match_score - a.match_score || new Date(b.occurred_at) - new Date(a.occurred_at));
      return res.json({ rows: matched.slice(offset, offset + limit), total: matched.length });
    }

    const countR = await query(
      `SELECT count(*)::int AS total FROM signals WHERE occurred_at > now() - interval '${windowSql}' ${kindSql}`,
      kindParams,
    );
    const dataParams = [...kindParams, limit, offset];
    const r = await query(
      `SELECT ${selectCols}
         FROM signals
        WHERE occurred_at > now() - interval '${windowSql}' ${kindSql}
        ORDER BY occurred_at DESC
        LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams,
    );
    res.json({ rows: r.rows, total: countR.rows[0].total });
  } catch (err) { next(err); }
});

// GET /api/signals/map — recent signals WITH coordinates for the Map's signal
// layer (Phase D). Distinct pins from company dots; joined via the company.
router.get('/map', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT s.id, s.kind, s.title, s.company_id, s.company_name, s.occurred_at,
             c.latitude, c.longitude
        FROM signals s
        JOIN companies c ON c.id = s.company_id
       WHERE s.occurred_at > now() - interval '7 days'
         AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
       ORDER BY s.occurred_at DESC
       LIMIT 500`);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// GET /api/signals/in-market — companies showing the strongest BUYING INTENT
// right now (Signals v2). Aggregates each company's last-14-days signals into a
// 0–100 in-market score, ICP-weighted for this tenant. The signal→outreach
// entry point: Bella (or the user) reveals + drafts from these.
router.get('/in-market', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const sigR = await query(
      `SELECT id, kind, subkind, company_id, company_name, title, body, industry, industries, employee_count, importance, occurred_at
         FROM signals
        WHERE occurred_at > now() - interval '14 days' AND company_id IS NOT NULL
        ORDER BY occurred_at DESC
        LIMIT 2000`);
    const icpR = await query(
      `SELECT target_industries, target_keywords, target_sizes FROM tenant_profile WHERE tenant_id = $1`,
      [req.tenant.id]);
    const icp = icpR.rows[0] || {};
    const icpApplied = !!((icp.target_industries || []).length || (icp.target_keywords || []).length || (icp.target_sizes || []).length);

    const byCo = new Map();
    for (const s of sigR.rows) {
      if (!byCo.has(s.company_id)) byCo.set(s.company_id, []);
      byCo.get(s.company_id).push(s);
    }
    const scored = [];
    for (const [cid, sigs] of byCo) {
      const m = computeInMarketScore(sigs, icp);
      if (m.score <= 0) continue;
      scored.push({
        company_id: cid,
        company_name: sigs[0].company_name,
        industry: sigs[0].industry,
        in_market_score: m.score,
        reasons: m.reasons,
        signal_count: sigs.length,
        latest_signal: sigs[0].title,
        latest_at: sigs[0].occurred_at,
      });
    }
    scored.sort((a, b) => b.in_market_score - a.in_market_score || new Date(b.latest_at) - new Date(a.latest_at));
    res.json({ companies: scored.slice(0, limit), icp_applied: icpApplied });
  } catch (err) { next(err); }
});

// GET /api/signals/stats — per-kind counts for the radar legend (24h + 7d).
router.get('/stats', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT kind,
             count(*) FILTER (WHERE occurred_at > now() - interval '24 hours')::int AS c24,
             count(*) FILTER (WHERE occurred_at > now() - interval '7 days')::int  AS c7d
        FROM signals
       WHERE occurred_at > now() - interval '7 days'
       GROUP BY kind`);
    res.json({ kinds: r.rows });
  } catch (err) { next(err); }
});

export default router;

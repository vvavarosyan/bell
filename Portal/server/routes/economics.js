// /api/economics — Phase 6, "Bell as a business": the self-economics dashboard.
// Revenue from actual tenant plans, burn from recorded operating costs (+ the API
// spend Bell meters), and unit economics. Platform-admin only. Every number is a
// real sum — plan prices Bell charges, costs the operator recorded, spend Bell
// tracked. Nothing invented (Rule 2.1).

import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../lib/auth.js';
import { PLANS } from '../config/plans.js';
import { toQar, FX_NOTE } from '../lib/fx.js';

const router = Router();
router.use(requireRole('platform_admin'));

const PLAN_PRICE = Object.fromEntries(PLANS.map((p) => [p.id, Number(p.price_qar) || 0]));

router.get('/', async (req, res, next) => {
  try {
    // --- Revenue: active tenants by plan × the plan's QAR price = MRR ---------
    const tenantsByPlan = (await query(`
      SELECT plan, count(*)::int AS n
        FROM tenants
       WHERE subscription_status IN ('active', 'trialing', 'past_due')
       GROUP BY plan`)).rows;
    let mrr_qar = 0;
    const revenue_by_plan = tenantsByPlan.map((t) => {
      const price = PLAN_PRICE[t.plan] || 0;
      const amount = price * t.n;
      mrr_qar += amount;
      return { plan: t.plan || '—', tenants: t.n, price_qar: price, mrr_qar: amount };
    });
    const totalTenants = (await query(`SELECT count(*)::int AS n FROM tenants`)).rows[0].n;
    const payingTenants = revenue_by_plan.reduce((s, r) => s + (r.price_qar > 0 ? r.tenants : 0), 0);

    // --- Operating costs (recorded by the operator), normalised to QAR --------
    const costRows = (await query(`SELECT id, service, category, monthly_amount, currency, note, active
                                     FROM operating_costs ORDER BY monthly_amount DESC, service`)).rows;
    let opex_qar = 0;
    const cost_by_category = {};
    for (const c of costRows) {
      if (!c.active) continue;
      const q = toQar(Number(c.monthly_amount) || 0, c.currency) ?? (Number(c.monthly_amount) || 0);
      opex_qar += q;
      cost_by_category[c.category || 'other'] = (cost_by_category[c.category || 'other'] || 0) + q;
    }

    // --- Metered spend Bell actually tracks (research crawls in USD) ----------
    const research = (await query(`
      SELECT coalesce(sum(usd_spent), 0)::numeric AS all_time,
             coalesce(sum(usd_spent) FILTER (WHERE created_at > now() - interval '30 days'), 0)::numeric AS last_30d
        FROM research_jobs`).catch(() => ({ rows: [{ all_time: 0, last_30d: 0 }] }))).rows[0];
    const research_spend_qar_30d = (toQar(Number(research.last_30d), 'USD') || 0);

    // --- Scale / usage (what the spend produces) ------------------------------
    const scale = (await query(`
      SELECT (SELECT count(*)::int FROM companies WHERE is_active = true) AS active_companies,
             (SELECT count(*)::int FROM companies) AS total_companies,
             (SELECT count(*)::int FROM people) AS people,
             (SELECT count(*)::int FROM jobs WHERE is_active = true) AS jobs,
             (SELECT count(*)::int FROM research_jobs) AS research_jobs`)).rows[0];

    const totalBurnQar = opex_qar + research_spend_qar_30d;
    const round = (n) => Math.round(Number(n) || 0);
    return res.json({
      currency: 'QAR',
      revenue: {
        mrr_qar: round(mrr_qar), arr_qar: round(mrr_qar * 12),
        paying_tenants: payingTenants, total_tenants: totalTenants,
        by_plan: revenue_by_plan,
        arpa_qar: payingTenants ? round(mrr_qar / payingTenants) : 0,   // avg revenue per paying account
      },
      costs: {
        opex_monthly_qar: round(opex_qar),
        research_spend_qar_30d: round(research_spend_qar_30d),
        total_burn_monthly_qar: round(totalBurnQar),
        by_category: Object.entries(cost_by_category).map(([category, qar]) => ({ category, monthly_qar: round(qar) })).sort((a, b) => b.monthly_qar - a.monthly_qar),
        recorded_services: costRows.length,
        research_usd_all_time: Number(research.all_time),
      },
      margin: {
        gross_profit_monthly_qar: round(mrr_qar - totalBurnQar),
        gross_margin_pct: mrr_qar > 0 ? Math.round(((mrr_qar - totalBurnQar) / mrr_qar) * 1000) / 10 : null,
        break_even_paying_tenants: null,   // filled below
      },
      unit_economics: {
        // Monthly burn spread across the whole active dataset — the cost of
        // keeping the intelligence fresh, per company.
        cost_per_active_company_qar: scale.active_companies ? Math.round((totalBurnQar / scale.active_companies) * 100) / 100 : null,
      },
      scale,
      fx_note: FX_NOTE,
    });
  } catch (err) { next(err); }
});

// ---- Operating-cost CRUD (operator records the fixed monthly service bills) --
router.get('/costs', async (req, res, next) => {
  try {
    const r = await query(`SELECT id, service, category, monthly_amount, currency, note, active, updated_at
                             FROM operating_costs ORDER BY active DESC, monthly_amount DESC, service`);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

router.post('/costs', async (req, res, next) => {
  try {
    const { id, service, category, monthly_amount, currency, note, active } = req.body || {};
    if (id) {
      const r = await query(
        `UPDATE operating_costs SET service = coalesce($2, service), category = $3,
           monthly_amount = coalesce($4, monthly_amount), currency = coalesce($5, currency),
           note = $6, active = coalesce($7, active), updated_at = now()
         WHERE id = $1 RETURNING *`,
        [Number(id), service ?? null, category ?? null, monthly_amount ?? null, currency ?? null, note ?? null, active ?? null]);
      return res.json({ row: r.rows[0] });
    }
    if (!service) return res.status(400).json({ error: 'service required' });
    const r = await query(
      `INSERT INTO operating_costs (service, category, monthly_amount, currency, note)
       VALUES ($1,$2,coalesce($3,0),coalesce($4,'USD'),$5) RETURNING *`,
      [service, category ?? null, monthly_amount ?? null, currency ?? null, note ?? null]);
    res.json({ row: r.rows[0] });
  } catch (err) { next(err); }
});

router.delete('/costs/:id(\\d+)', async (req, res, next) => {
  try {
    await query(`DELETE FROM operating_costs WHERE id = $1`, [Number(req.params.id)]);
    res.json({ deleted: Number(req.params.id) });
  } catch (err) { next(err); }
});

export default router;

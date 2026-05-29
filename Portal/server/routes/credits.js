// /api/credits — tenant credit balance + admin adjustments.
//
//   GET  /api/credits            → current tenant's balance + plan allotment
//   GET  /api/credits/ledger     → recent ledger entries (current tenant)
//   POST /api/credits/adjust     → platform_admin: add/deduct a tenant's credits
//
// Mounted with requireAuth in server.js. /adjust additionally requires
// platform_admin (admin.bell.qa / local engine).

import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../lib/auth.js';
import { getBalance, adminAdjust, bypassesCredits } from '../lib/credits.js';
import { planById } from '../config/plans.js';

const router = Router();

// GET /api/credits — balance for the signed-in user's tenant.
router.get('/', async (req, res, next) => {
  try {
    const tenant = req.tenant;
    const plan = planById(tenant?.plan);
    // Bypass tenants (platform_admin / internal) report unlimited.
    if (bypassesCredits(req.user, tenant)) {
      return res.json({ unlimited: true, balance: null, plan: tenant?.plan || null, monthly_allotment: null });
    }
    const balance = await getBalance(tenant.id);
    res.json({
      unlimited: false,
      balance,
      plan: tenant.plan,
      monthly_allotment: plan?.credits ?? 0,
    });
  } catch (err) { next(err); }
});

// GET /api/credits/ledger — recent credit activity for the current tenant.
router.get('/ledger', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const r = await query(
      `SELECT delta, reason, balance_after, ref_type, ref_id, actor, created_at
         FROM credit_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.tenant.id, limit]
    );
    res.json({ entries: r.rows });
  } catch (err) { next(err); }
});

// POST /api/credits/adjust — platform_admin add/deduct on any tenant.
// Body: { tenant_id, delta, note }
router.post('/adjust', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const tenantId = Number(req.body?.tenant_id);
    const delta = Number(req.body?.delta);
    const note = (req.body?.note || '').toString().slice(0, 200);
    if (!Number.isFinite(tenantId) || !Number.isFinite(delta) || delta === 0) {
      return res.status(400).json({ error: 'bad_request', reason: 'tenant_id and non-zero delta required' });
    }
    const balance = await adminAdjust(tenantId, delta, req.user?.email || 'admin', note);
    res.json({ tenant_id: tenantId, balance });
  } catch (err) {
    if (err.message === 'tenant_not_found') return res.status(404).json({ error: 'tenant_not_found' });
    next(err);
  }
});

export default router;

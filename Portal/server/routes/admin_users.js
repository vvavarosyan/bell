// Admin user/account management (platform_admin only). Lists customer tenants +
// their users, shows plan / status / credits / billing-from-our-records, and lets
// an admin adjust credits, suspend/reactivate, change plan, and message a user.
// Every action is written to admin_audit_log. Runs on admin.bell.qa (prod data).

import { Router } from 'express';
import { query } from '../db.js';
import { adminAdjust } from '../lib/credits.js';
import { notifyTenant } from '../lib/notifications.js';
import { PLANS, planById } from '../config/plans.js';

const router = Router();

const PLAN_OPTIONS = [{ id: 'free', name: 'Free', credits: 0 },
  ...PLANS.map((p) => ({ id: p.id, name: p.name || p.id, credits: p.credits || 0, price_qar: p.price_qar || 0 }))];

const actorEmail = (req) => req.user?.email || 'admin';
const actorId = (req) => (req.user?.id && req.user.id !== 0 ? req.user.id : null);

async function audit(req, tenantId, action, detail = {}) {
  await query(
    `INSERT INTO admin_audit_log (actor_user_id, actor_email, target_tenant_id, action, detail)
     VALUES ($1,$2,$3,$4,$5::jsonb)`,
    [actorId(req), actorEmail(req), tenantId, action, JSON.stringify(detail)]
  ).catch((e) => console.warn('[admin] audit failed:', e.message));
}

// GET /api/admin/users — list customer tenants with a summary row.
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const params = [];
    let where = 'WHERE t.id <> 1';   // exclude the internal Bell tenant
    if (q) {
      params.push('%' + q + '%');
      where += ` AND (lower(t.name) LIKE $${params.length} OR EXISTS (SELECT 1 FROM users u WHERE u.tenant_id = t.id AND lower(u.email) LIKE $${params.length}))`;
    }
    const r = await query(`
      SELECT t.id, t.name, t.slug, t.plan, t.subscription_status, t.credit_balance, t.is_active, t.created_at,
             (SELECT count(*) FROM users u WHERE u.tenant_id = t.id)::int AS user_count,
             (SELECT u.email     FROM users u WHERE u.tenant_id = t.id ORDER BY (u.role = 'owner') DESC, u.created_at ASC LIMIT 1) AS primary_email,
             (SELECT u.full_name FROM users u WHERE u.tenant_id = t.id ORDER BY (u.role = 'owner') DESC, u.created_at ASC LIMIT 1) AS primary_name
        FROM tenants t
        ${where}
       ORDER BY t.created_at DESC
       LIMIT 500`, params);
    res.json({ rows: r.rows, plans: PLAN_OPTIONS });
  } catch (err) { next(err); }
});

// GET /api/admin/users/:id — one tenant's full account view.
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const [t, users, ledger, reveals, aud] = await Promise.all([
      query(`SELECT id, name, slug, plan, stripe_customer_id, subscription_status,
                    plan_renewed_at, plan_expires_at, credit_balance, is_active, created_at
               FROM tenants WHERE id = $1`, [id]),
      query(`SELECT id, email, full_name, role, is_active, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at ASC`, [id]),
      query(`SELECT delta, reason, balance_after, actor, created_at FROM credit_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 40`, [id]),
      query(`SELECT count(*)::int AS n FROM tenant_reveals WHERE tenant_id = $1`, [id]).catch(() => ({ rows: [{ n: 0 }] })),
      query(`SELECT actor_email, action, detail, created_at FROM admin_audit_log WHERE target_tenant_id = $1 ORDER BY created_at DESC LIMIT 30`, [id]).catch(() => ({ rows: [] })),
    ]);
    if (!t.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ tenant: t.rows[0], users: users.rows, ledger: ledger.rows, reveals: reveals.rows[0].n, audit: aud.rows, plans: PLAN_OPTIONS });
  } catch (err) { next(err); }
});

// POST /api/admin/users/:id/credits  { delta, note }
router.post('/:id/credits', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const delta = Math.trunc(Number(req.body?.delta));
    if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'bad_delta' });
    const note = String(req.body?.note || '').slice(0, 200);
    const balance = await adminAdjust(id, delta, actorEmail(req), note);
    await audit(req, id, 'credits_adjust', { delta, note, balance_after: balance });
    notifyTenant(id, {
      category: 'account', type: 'credits_adjust',
      title: delta > 0 ? `${delta.toLocaleString()} credits added` : `${Math.abs(delta).toLocaleString()} credits adjusted`,
      body: note || (delta > 0 ? 'Bell added credits to your account.' : 'Bell adjusted the credits on your account.'),
      link: '/billing', icon: 'megaphone',
    }).catch(() => {});
    res.json({ ok: true, balance });
  } catch (err) { next(err); }
});

// POST /api/admin/users/:id/suspend  { suspend: bool }
router.post('/:id/suspend', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === 1) return res.status(400).json({ error: 'cannot_suspend_internal' });
    const suspend = req.body?.suspend === true;
    await query(`UPDATE tenants SET is_active = $2, subscription_status = $3, updated_at = now() WHERE id = $1`,
      [id, !suspend, suspend ? 'suspended' : 'active']);
    await query(`UPDATE users SET is_active = $2, updated_at = now() WHERE tenant_id = $1`, [id, !suspend]);
    await audit(req, id, suspend ? 'suspend' : 'reactivate', {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/admin/users/:id/plan  { plan }
router.post('/:id/plan', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const plan = String(req.body?.plan || '').trim();
    if (plan !== 'free' && !planById(plan)) return res.status(400).json({ error: 'invalid_plan' });
    await query(`UPDATE tenants SET plan = $2, updated_at = now() WHERE id = $1`, [id, plan]);
    await audit(req, id, 'plan_change', { plan });
    notifyTenant(id, {
      category: 'account', type: 'plan_change',
      title: `Your plan is now ${PLAN_OPTIONS.find((p) => p.id === plan)?.name || plan}`,
      body: 'Bell updated your subscription plan.', link: '/billing', icon: 'megaphone',
    }).catch(() => {});
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/admin/users/:id/notify  { title, body, email? }
router.post('/:id/notify', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title_required' });
    const body = String(req.body?.body || '').slice(0, 2000);
    const email = req.body?.email === true;
    const sent = await notifyTenant(id, { category: 'account', type: 'admin_message', title, body, icon: 'megaphone', email });
    await audit(req, id, 'notify', { title, recipients: sent, email });
    res.json({ ok: true, sent });
  } catch (err) { next(err); }
});

export default router;

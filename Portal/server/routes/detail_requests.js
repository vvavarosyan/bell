// /api/detail-requests — "Request more details" flow.
//   • User (on a company they've REVEALED) creates a request.
//   • Admin (platform_admin / internal) sees a queue, approves/rejects,
//     enriches, then marks fulfilled.
//   • Requester sees the status in the company drawer.

import { Router } from 'express';
import { query } from '../db.js';
import { bypassesCredits, getRevealedSet } from '../lib/credits.js';

const router = Router();
const isAdmin = (req) => bypassesCredits(req.user, req.tenant);

// POST /api/detail-requests  { company_id, note }  — user creates a request.
router.post('/', async (req, res, next) => {
  try {
    const companyId = Number(req.body?.company_id);
    const note = String(req.body?.note || '').trim();
    if (!Number.isFinite(companyId)) return res.status(400).json({ error: 'company_id_required' });

    // Must have revealed the company first (admins bypass).
    if (!isAdmin(req)) {
      const revealed = await getRevealedSet(req.tenant.id, 'company', [companyId]);
      if (!revealed.has(Number(companyId))) return res.status(403).json({ error: 'reveal_required' });
    }
    // One open request per (tenant, company): return the existing one if any.
    const existing = await query(
      `SELECT id, status, note, admin_note, created_at FROM detail_requests
        WHERE tenant_id = $1 AND company_id = $2 AND status IN ('pending','approved')
        ORDER BY id DESC LIMIT 1`, [req.tenant.id, companyId]);
    if (existing.rows.length) return res.json({ ok: true, request: existing.rows[0], already: true });

    const r = await query(
      `INSERT INTO detail_requests (tenant_id, company_id, requested_by, note)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenant.id, companyId, req.user?.email || null, note || null]);
    res.json({ ok: true, request: r.rows[0] });
  } catch (err) { next(err); }
});

// GET /api/detail-requests/mine?company_id=  — the tenant's latest request for a company.
router.get('/mine', async (req, res, next) => {
  try {
    const companyId = Number(req.query.company_id);
    if (!Number.isFinite(companyId)) return res.json({ request: null });
    const r = await query(
      `SELECT id, status, note, admin_note, created_at, decided_at, fulfilled_at
         FROM detail_requests WHERE tenant_id = $1 AND company_id = $2
        ORDER BY id DESC LIMIT 1`, [req.tenant.id, companyId]);
    res.json({ request: r.rows[0] || null });
  } catch (err) { next(err); }
});

// GET /api/detail-requests/count  — pending count for the admin sidebar badge.
router.get('/count', async (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.json({ pending: 0 });
    const r = await query(`SELECT count(*)::int AS pending FROM detail_requests WHERE status = 'pending'`);
    res.json({ pending: r.rows[0].pending });
  } catch (err) { next(err); }
});

// GET /api/detail-requests?status=pending  — admin queue.
router.get('/', async (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    const status = String(req.query.status || 'pending').trim();
    const r = await query(`
      SELECT dr.*, c.name AS company_name, c.bin AS company_bin
        FROM detail_requests dr JOIN companies c ON c.id = dr.company_id
       WHERE ($1 = 'all' OR dr.status = $1)
       ORDER BY (dr.status = 'pending') DESC, dr.created_at DESC
       LIMIT 300`, [status]);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// POST /api/detail-requests/:id/decide  { action: approve|reject|fulfill, admin_note }
router.post('/:id/decide', async (req, res, next) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ error: 'forbidden' });
    const id = Number(req.params.id);
    const { action, admin_note } = req.body || {};
    if (!['approve', 'reject', 'fulfill'].includes(action)) return res.status(400).json({ error: 'invalid_action' });
    const status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'fulfilled';
    const r = await query(`
      UPDATE detail_requests
         SET status = $2,
             admin_note = COALESCE($3, admin_note),
             decided_by = $4, decided_at = now(),
             fulfilled_at = ${action === 'fulfill' ? 'now()' : 'fulfilled_at'},
             updated_at = now()
       WHERE id = $1 RETURNING *`,
      [id, status, (admin_note || '').trim() || null, req.user?.email || 'admin']);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, request: r.rows[0] });
  } catch (err) { next(err); }
});

export default router;

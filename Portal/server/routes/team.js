// /api/team — teammates + invitations (Phase 5). Membership is users.tenant_id +
// role (no Clerk Organizations). Any signed-in member can list teammates;
// only owners/admins can invite, change roles, or remove members. An invited
// person joins THIS tenant when they sign up with the invited email (see the
// provisioning hook in routes/auth.js + lib/auth.js).

import { Router } from 'express';
import crypto from 'node:crypto';
import { query } from '../db.js';
import { sendEmail, getFromAddress } from '../lib/email.js';
import { INVITABLE_ROLES, isInvitableRole, canManageTeam } from '../lib/team.js';

const router = Router();
const APP_URL = (process.env.BELL_APP_URL || 'https://app.bell.qa').replace(/\/$/, '');
const EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Only owners/admins manage the team.
function requireManager(req, res, next) {
  if (!canManageTeam(req.user?.role)) {
    return res.status(403).json({ error: 'forbidden', reason: 'Only owners and admins can manage the team.' });
  }
  next();
}

// GET /api/team/members — the tenant's users. Any member may see teammates.
router.get('/members', async (req, res, next) => {
  try {
    const r = await query(
      `SELECT id, email, full_name, role, is_active, joined_at, (id = $2) AS is_you
         FROM users WHERE tenant_id = $1 AND is_active = true
        ORDER BY (role = 'owner') DESC, created_at ASC`,
      [req.tenant?.id, req.user?.id || 0]);
    res.json({ members: r.rows, can_manage: canManageTeam(req.user?.role), your_role: req.user?.role, invitable_roles: INVITABLE_ROLES });
  } catch (err) { next(err); }
});

// GET /api/team/invites — outstanding invitations (managers only).
router.get('/invites', requireManager, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT i.id, i.email, i.role, i.status, i.created_at, i.expires_at,
              u.full_name AS invited_by_name
         FROM tenant_invites i
         LEFT JOIN users u ON u.id = i.invited_by_user_id
        WHERE i.tenant_id = $1 AND i.status = 'pending'
        ORDER BY i.created_at DESC`, [req.tenant?.id]);
    res.json({ invites: r.rows });
  } catch (err) { next(err); }
});

// POST /api/team/invites { email, role } — invite a teammate (managers only).
router.post('/invites', requireManager, async (req, res, next) => {
  try {
    const t = req.tenant?.id;
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = String(req.body?.role || 'member');
    if (!EMAIL_RX.test(email)) return res.status(400).json({ error: 'bad_email', reason: 'Enter a valid email address.' });
    if (!isInvitableRole(role)) return res.status(400).json({ error: 'bad_role', valid: INVITABLE_ROLES });
    const existing = await query(`SELECT 1 FROM users WHERE tenant_id = $1 AND email = $2 AND is_active = true`, [t, email]);
    if (existing.rows.length) return res.status(409).json({ error: 'already_member', reason: 'That person is already on your team.' });

    const token = crypto.randomBytes(24).toString('hex');
    // One outstanding invite per email per tenant (partial unique index) — a
    // re-invite refreshes the role, token and expiry.
    const r = await query(
      `INSERT INTO tenant_invites (tenant_id, email, role, token, invited_by_user_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, email) WHERE status = 'pending'
       DO UPDATE SET role = EXCLUDED.role, token = EXCLUDED.token,
                     invited_by_user_id = EXCLUDED.invited_by_user_id,
                     created_at = now(), expires_at = now() + interval '14 days'
       RETURNING id, email, role, status, created_at, expires_at`,
      [t, email, role, token, req.user?.id || null]);

    // Best-effort invite email — never fail the invite if sending is down.
    sendInviteEmail(req, email, token).catch((e) => console.warn('[team] invite email failed:', e.message));
    res.json({ ok: true, invite: r.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/team/invites/:id/revoke — cancel a pending invite (managers only).
router.post('/invites/:id/revoke', requireManager, async (req, res, next) => {
  try {
    await query(`UPDATE tenant_invites SET status = 'revoked' WHERE id = $1 AND tenant_id = $2 AND status = 'pending'`,
      [Number(req.params.id), req.tenant?.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /api/team/members/:id { role } — change a teammate's role (managers only).
router.patch('/members/:id', requireManager, async (req, res, next) => {
  try {
    const t = req.tenant?.id;
    const uid = Number(req.params.id);
    const role = String(req.body?.role || '');
    if (!isInvitableRole(role)) return res.status(400).json({ error: 'bad_role', valid: INVITABLE_ROLES });
    const tgt = await query(`SELECT role FROM users WHERE id = $1 AND tenant_id = $2`, [uid, t]);
    if (!tgt.rows.length) return res.status(404).json({ error: 'not_found' });
    if (tgt.rows[0].role === 'owner') return res.status(400).json({ error: 'cannot_change_owner', reason: 'The owner’s role can’t be changed here.' });
    if (uid === req.user?.id) return res.status(400).json({ error: 'cannot_change_self' });
    await query(`UPDATE users SET role = $3, updated_at = now() WHERE id = $1 AND tenant_id = $2`, [uid, t, role]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/team/members/:id — remove a teammate (deactivate). Managers only.
router.delete('/members/:id', requireManager, async (req, res, next) => {
  try {
    const t = req.tenant?.id;
    const uid = Number(req.params.id);
    const tgt = await query(`SELECT role FROM users WHERE id = $1 AND tenant_id = $2`, [uid, t]);
    if (!tgt.rows.length) return res.status(404).json({ error: 'not_found' });
    if (tgt.rows[0].role === 'owner') return res.status(400).json({ error: 'cannot_remove_owner' });
    if (uid === req.user?.id) return res.status(400).json({ error: 'cannot_remove_self' });
    await query(`UPDATE users SET is_active = false, updated_at = now() WHERE id = $1 AND tenant_id = $2`, [uid, t]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

async function sendInviteEmail(req, email, token) {
  const inviter = req.user?.full_name || req.user?.email || 'A teammate';
  const tenantName = req.tenant?.name || 'their team';
  const link = APP_URL + '/sign-up?invite=' + encodeURIComponent(token);
  const subject = `${inviter} invited you to join ${tenantName} on Bell`;
  const text = `${inviter} invited you to join ${tenantName} on Bell — Qatar's business-intelligence platform.\n\n`
    + `To accept, sign up with this email address (${email}):\n${link}\n\nBell Data Intelligence · bell.qa`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1a1a1a">`
    + `<div style="font-size:18px;font-weight:700;margin-bottom:10px">You're invited to Bell</div>`
    + `<p style="font-size:15px;line-height:1.6"><b>${escapeHtml(inviter)}</b> has invited you to join <b>${escapeHtml(tenantName)}</b> on Bell — Qatar's business-intelligence platform.</p>`
    + `<p style="font-size:15px;line-height:1.6">To accept, sign up with this email address (<b>${escapeHtml(email)}</b>):</p>`
    + `<p style="margin:18px 0"><a href="${link}" style="display:inline-block;background:#5b8cff;color:#fff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600">Join ${escapeHtml(tenantName)}</a></p>`
    + `<p style="font-size:12px;color:#888">If you didn't expect this, you can ignore it. This invite expires in 14 days.</p>`
    + `<p style="font-size:12px;color:#888">Bell Data Intelligence · bell.qa</p></div>`;
  const from = await getFromAddress();
  await sendEmail({ from, to: email, subject, html, text, system: 'invite' });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default router;

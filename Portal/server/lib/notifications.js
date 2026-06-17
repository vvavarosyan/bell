// Notification service — create, list, mark read, and broadcast in-app
// notifications. The email channel layers on top of this later (each important
// notification can also be emailed via the branded template in lib/email/).
//
// Categories: data | account | engagement | announcement | system
//   data         — new matching companies/people, saved-search hits, big updates
//   account      — credits low, billing, plan/trial, team membership/roles
//   engagement   — CRM tasks/deals/replies, research ready, market-feed items
//   announcement — admin broadcasts to users
//   system       — sync/maintenance/system messages

import { query } from '../db.js';
import { sendEmail, emailProviderConfigured } from './email.js';
import { renderAnnouncementEmail } from './email/template.js';

const APP_URL = (process.env.BELL_APP_URL || 'https://app.bell.qa').replace(/\/$/, '');

// Send a notification as a branded email. Returns false (never throws) if the
// provider isn't configured or the send fails — so it's safe to fire-and-forget.
export async function notifyEmail({ to, title, body, link }) {
  if (!to) return false;
  try {
    if (!(await emailProviderConfigured())) return false;
    const ctaUrl = link
      ? (/^https?:\/\//i.test(link) ? link : APP_URL + (link.startsWith('/') ? link : '/' + link))
      : APP_URL;
    const { subject, html } = await renderAnnouncementEmail({ title, body: body || '', ctaText: 'Open Bell', ctaUrl });
    await sendEmail({ to, subject: subject || title, html });
    return true;
  } catch (err) {
    console.error('[notifications] email send failed:', err.message);
    return false;
  }
}

/** Create one notification for one recipient. Returns the new id. */
export async function createNotification({
  tenantId, userId, category = 'system', type = null,
  title, body = null, link = null, icon = null, data = null, announcementId = null,
  email = false, recipientEmail = null,
}) {
  if (!userId || !title) throw new Error('createNotification: userId and title required');
  const r = await query(
    `INSERT INTO notifications (tenant_id, user_id, category, type, title, body, link, icon, data, announcement_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
     RETURNING id`,
    [tenantId, userId, category, type, title, body, link, icon, data ? JSON.stringify(data) : null, announcementId],
  );
  // Optional email channel — fire-and-forget so it never blocks/fails the in-app notif.
  if (email && recipientEmail) notifyEmail({ to: recipientEmail, title, body, link }).catch(() => {});
  return r.rows[0].id;
}

/** Notify one user by id (looks up their email for the optional email channel). */
export async function notifyUserById(userId, opts = {}) {
  const u = await query(`SELECT id, tenant_id, email FROM users WHERE id = $1 AND is_active = true`, [userId]);
  if (!u.rows.length) return null;
  const row = u.rows[0];
  return createNotification({ tenantId: row.tenant_id, userId: row.id, recipientEmail: row.email, ...opts });
}

/** One-time welcome (in-app + branded email). Idempotent + best-effort. */
export async function ensureWelcome(user) {
  if (!user?.id) return false;
  const seen = await query(`SELECT 1 FROM notifications WHERE user_id = $1 AND type = 'welcome' LIMIT 1`, [user.id]);
  if (seen.rows.length) return false;
  // Make sure we have an email even if the caller passed a partial user object.
  let email = user.email;
  if (!email) {
    const r = await query(`SELECT email FROM users WHERE id = $1`, [user.id]);
    email = r.rows[0]?.email || null;
  }
  const first = String(user.full_name || '').trim().split(/\s+/)[0] || 'there';
  const title = `Welcome to Bell, ${first}!`;
  const body = 'Your account is ready — explore Qatar companies, reveal verified contacts, and track live market intelligence, all in one place.';
  await createNotification({
    tenantId: user.tenant_id, userId: user.id, category: 'account', type: 'welcome',
    title, body, link: '/market-feed', icon: 'megaphone',
  });
  // Send + log the welcome email explicitly so its outcome is visible in logs.
  if (email) {
    const ok = await notifyEmail({ to: email, title, body, link: '/market-feed' });
    console.log(`[notifications] welcome email → ${email}: ${ok ? 'sent' : 'NOT sent (Resend key on this service? provider configured?)'}`);
  } else {
    console.log(`[notifications] welcome: no email on file for user ${user.id}`);
  }
  return true;
}

/** Recent notifications for a user (newest first). */
export async function listForUser(userId, { limit = 30, offset = 0 } = {}) {
  const r = await query(
    `SELECT id, category, type, title, body, link, icon, data, read_at, created_at
       FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, Math.min(Number(limit) || 30, 100), Math.max(Number(offset) || 0, 0)],
  );
  return r.rows;
}

export async function unreadCount(userId) {
  const r = await query(
    `SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return r.rows[0].n;
}

export async function markRead(userId, id) {
  await query(
    `UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [id, userId],
  );
}

export async function markAllRead(userId) {
  const r = await query(
    `UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return r.rowCount;
}

/**
 * Broadcast one announcement to every active user — all tenants (tenantId=null)
 * or a single tenant. Used by admin announcements. Returns the number sent.
 */
export async function broadcast({ tenantId = null, title, body = null, link = null, category = 'announcement', type = 'announcement', icon = 'megaphone', announcementId = null, email = false }) {
  if (!title) throw new Error('broadcast: title required');
  const where  = tenantId ? `WHERE is_active = true AND tenant_id = $1` : `WHERE is_active = true`;
  const params = tenantId ? [tenantId] : [];
  const users = await query(`SELECT id, tenant_id, email FROM users ${where}`, params);
  let n = 0;
  for (const u of users.rows) {
    await createNotification({ tenantId: u.tenant_id, userId: u.id, category, type, title, body, link, icon, announcementId, email, recipientEmail: u.email });
    n++;
  }
  return n;
}

// --- Announcements (tracked broadcasts; recallable) ------------------------

export async function createAnnouncement({ scope = 'tenant', tenantId = null, title, body = null, link = null, createdBy = null }) {
  const r = await query(
    `INSERT INTO announcements (scope, tenant_id, title, body, link, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [scope, tenantId, title, body, link, createdBy],
  );
  return r.rows[0].id;
}

export async function setAnnouncementSent(id, count) {
  await query(`UPDATE announcements SET sent_count = $2 WHERE id = $1`, [id, count]);
}

export async function listAnnouncements({ limit = 50 } = {}) {
  const r = await query(
    `SELECT id, scope, tenant_id, title, body, link, sent_count, created_by, created_at, recalled_at
       FROM announcements ORDER BY created_at DESC LIMIT $1`,
    [Math.min(Number(limit) || 50, 200)],
  );
  return r.rows;
}

// Recall: remove every notification this announcement created + mark it recalled.
export async function recallAnnouncement(id) {
  const del = await query(`DELETE FROM notifications WHERE announcement_id = $1`, [id]);
  await query(`UPDATE announcements SET recalled_at = now() WHERE id = $1`, [id]);
  return del.rowCount;
}

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

/** Create one notification for one recipient. Returns the new id. */
export async function createNotification({
  tenantId, userId, category = 'system', type = null,
  title, body = null, link = null, icon = null, data = null,
}) {
  if (!userId || !title) throw new Error('createNotification: userId and title required');
  const r = await query(
    `INSERT INTO notifications (tenant_id, user_id, category, type, title, body, link, icon, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     RETURNING id`,
    [tenantId, userId, category, type, title, body, link, icon, data ? JSON.stringify(data) : null],
  );
  return r.rows[0].id;
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
export async function broadcast({ tenantId = null, title, body = null, link = null, category = 'announcement', type = 'announcement', icon = 'megaphone' }) {
  if (!title) throw new Error('broadcast: title required');
  const where  = tenantId ? `WHERE is_active = true AND tenant_id = $1` : `WHERE is_active = true`;
  const params = tenantId ? [tenantId] : [];
  const users = await query(`SELECT id, tenant_id FROM users ${where}`, params);
  let n = 0;
  for (const u of users.rows) {
    await createNotification({ tenantId: u.tenant_id, userId: u.id, category, type, title, body, link, icon });
    n++;
  }
  return n;
}

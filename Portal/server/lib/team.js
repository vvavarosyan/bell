// Team membership helpers (Phase 5). An owner/admin invites a teammate by email
// (tenant_invites); when that email signs up, provisioning attaches them to the
// inviting tenant as the invited role instead of creating a new personal
// workspace. Membership is just users.tenant_id + role — no Clerk Organizations.

import { query } from '../db.js';

// Roles a teammate can be invited/set as. NOT 'owner' (one owner per tenant) and
// NOT 'platform_admin' (Bell staff only).
export const INVITABLE_ROLES = ['admin', 'lead', 'member', 'viewer'];
export const isInvitableRole = (r) => INVITABLE_ROLES.includes(String(r || ''));

// Roles allowed to MANAGE the team (invite / change roles / remove members).
export const TEAM_MANAGER_ROLES = ['platform_admin', 'owner', 'admin'];
export const canManageTeam = (role) => TEAM_MANAGER_ROLES.includes(String(role || ''));

/**
 * A pending, unexpired invite for this email (newest wins), or null.
 * `q` is a query function — pass a transaction client's bound query when inside
 * one, so the lookup + accept share the transaction.
 */
export async function findPendingInvite(email, q = query) {
  if (!email) return null;
  const r = await q(
    `SELECT id, tenant_id, role FROM tenant_invites
      WHERE email = $1 AND status = 'pending' AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`, [String(email)]).catch(() => ({ rows: [] }));
  return r.rows[0] || null;
}

/** Mark an invite consumed once the user row exists. Best-effort. */
export async function acceptInvite(inviteId, userId, q = query) {
  await q(
    `UPDATE tenant_invites SET status = 'accepted', accepted_user_id = $2, accepted_at = now()
      WHERE id = $1 AND status = 'pending'`, [inviteId, userId]).catch(() => {});
}

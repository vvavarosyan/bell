// Authentication + authorization for the Bell Portal.
//
// Three deployment modes (driven by BDI_MODE env var):
//
//   local-admin  → No auth. Single user (Val). All requests treated as
//                  platform_admin acting on tenant_id=1. macOS Mac only.
//
//   user         → Full Clerk auth required. Every request must carry a
//                  valid Clerk session JWT in `Authorization: Bearer ...`.
//                  User + tenant looked up from the local users/tenants tables.
//
//   admin        → Same as 'user' but role MUST be 'platform_admin'.
//                  Used by admin.bell.qa deployment.
//
// Exports:
//   requireAuth(req, res, next)    — verifies Clerk JWT, attaches req.user + req.tenant
//   requireRole(...roles)          — middleware factory; rejects if user role not in list
//   getModeInfo()                  — read mode + identity for /api/me responses

import { verifyToken } from '@clerk/backend';
import { query } from '../db.js';

const MODE = (process.env.BDI_MODE || 'local-admin').toLowerCase();
const CLERK_SECRET = process.env.CLERK_SECRET_KEY || null;
const CLERK_PUBLISHABLE = process.env.CLERK_PUBLISHABLE_KEY || null;

// Local-admin mode synthesizes a fake user so downstream handlers don't have
// to special-case the no-auth path. This row should NOT exist in the DB —
// it's just a runtime convenience.
const LOCAL_ADMIN_USER = Object.freeze({
  id:             0,
  tenant_id:      1,
  clerk_user_id:  'local-admin',
  email:          'admin@local',
  full_name:      'Local Admin',
  role:           'platform_admin',
  function_team:  null,
  is_active:      true,
  _synthetic:     true,
});
const INTERNAL_TENANT = Object.freeze({
  id:     1,
  name:   'Bell.qa Internal',
  slug:   'bell-qa-internal',
  plan:   'internal',
});

export function getModeInfo() {
  return {
    mode: MODE,
    auth_required: MODE !== 'local-admin',
    clerk_configured: !!CLERK_SECRET,
    publishable_key: CLERK_PUBLISHABLE,
  };
}

/**
 * Middleware: verify the request is authenticated.
 * In local-admin mode, attaches a synthetic user and passes through.
 * In user/admin mode, requires a Clerk session token and loads the user row.
 *
 * On success: req.user + req.tenant populated.
 * On failure: 401 with { error: 'unauthorized', reason }.
 */
export async function requireAuth(req, res, next) {
  // Local-admin: no auth, everything is "Val acting as platform_admin"
  if (MODE === 'local-admin') {
    req.user   = LOCAL_ADMIN_USER;
    req.tenant = INTERNAL_TENANT;
    return next();
  }

  // user/admin mode — require Clerk JWT
  if (!CLERK_SECRET) {
    return res.status(500).json({
      error: 'server_misconfigured',
      reason: 'CLERK_SECRET_KEY not set on this deployment.',
    });
  }

  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    return res.status(401).json({ error: 'unauthorized', reason: 'missing_bearer_token' });
  }

  let claims;
  try {
    claims = await verifyToken(m[1], { secretKey: CLERK_SECRET });
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized', reason: 'invalid_token', detail: err.message });
  }

  // Claims include `sub` = Clerk user id. Look up our DB row.
  const clerkUserId = claims.sub;
  if (!clerkUserId) {
    return res.status(401).json({ error: 'unauthorized', reason: 'no_subject_claim' });
  }

  const r = await query(`
    SELECT u.*, t.id AS t_id, t.name AS t_name, t.slug AS t_slug, t.plan AS t_plan,
           t.is_active AS t_is_active
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
     WHERE u.clerk_user_id = $1 AND u.is_active = true
     LIMIT 1
  `, [clerkUserId]);

  if (!r.rows.length) {
    // User authenticated via Clerk but our DB doesn't know them. This can
    // happen briefly between sign-up and webhook delivery. Tell the client
    // to retry; do NOT auto-create here (that's the webhook's job — keeps
    // identity creation atomic).
    return res.status(401).json({
      error: 'unauthorized',
      reason: 'user_not_provisioned',
      hint: 'Sign-up webhook may not have completed yet. Try again in a moment.',
    });
  }

  const row = r.rows[0];

  // admin mode: extra gate — only platform_admin role allowed
  if (MODE === 'admin' && row.role !== 'platform_admin') {
    return res.status(403).json({
      error: 'forbidden',
      reason: 'admin_deployment_requires_platform_admin_role',
    });
  }

  // Bump last_signed_in_at lazily (best-effort, don't block on it)
  query(`UPDATE users SET last_signed_in_at = now() WHERE id = $1`, [row.id])
    .catch(() => { /* ignore */ });

  req.user = {
    id:             Number(row.id),
    tenant_id:      Number(row.tenant_id),
    clerk_user_id:  row.clerk_user_id,
    email:          row.email,
    full_name:      row.full_name,
    role:           row.role,
    function_team:  row.function_team,
    is_active:      row.is_active,
  };
  req.tenant = {
    id:        Number(row.t_id),
    name:      row.t_name,
    slug:      row.t_slug,
    plan:      row.t_plan,
    is_active: row.t_is_active,
  };
  next();
}

/**
 * Middleware factory: gate a route to one or more roles.
 *
 *   router.get('/admin-only',  requireAuth, requireRole('platform_admin'), handler);
 *   router.get('/lead-or-up',  requireAuth, requireRole('owner','admin','lead'), handler);
 *
 * Note: requireRole assumes requireAuth ran first. In local-admin mode that
 * means req.user.role is always 'platform_admin' — so admin-only routes work
 * transparently on the local Mac.
 */
export function requireRole(...allowedRoles) {
  const allowed = new Set(allowedRoles);
  return (req, res, next) => {
    if (!req.user) {
      return res.status(500).json({ error: 'server_error', reason: 'requireRole_called_without_requireAuth' });
    }
    if (!allowed.has(req.user.role)) {
      return res.status(403).json({
        error: 'forbidden',
        reason: 'insufficient_role',
        required: [...allowed],
        actual: req.user.role,
      });
    }
    next();
  };
}

/**
 * Convenience: same as requireRole but allows ANY non-viewer role.
 * Use for "any signed-in user with write permission".
 */
export const requireWriter = requireRole('platform_admin', 'owner', 'admin', 'lead', 'member');

/**
 * Middleware: require the tenant to have an active subscription.
 *
 * platform_admin users (Bell.qa staff) and the internal tenant_id=1 bypass
 * this check — they don't need to subscribe to use their own product.
 *
 * Apply to product feature routes (companies, people, research, etc.).
 * Don't apply to /api/auth/* or /api/billing/* — users must be able to
 * sign in and reach the billing UI even without an active sub.
 *
 * On failure: 402 (Payment Required) with reason.
 */
export async function requireActiveSubscription(req, res, next) {
  if (!req.user) {
    return res.status(500).json({ error: 'server_error', reason: 'requireActiveSubscription_called_without_requireAuth' });
  }
  // Bell.qa staff bypass
  if (req.user.role === 'platform_admin') return next();
  // The internal tenant bypasses too (used in local-admin mode)
  if (req.tenant?.id === 1) return next();

  // Look up live subscription status from DB
  const r = await query(`
    SELECT subscription_status, plan_expires_at FROM tenants WHERE id = $1
  `, [req.tenant.id]);
  const t = r.rows[0];
  const isActive = t && ['active', 'trialing'].includes(t.subscription_status);

  if (!isActive) {
    return res.status(402).json({
      error: 'subscription_required',
      reason: t?.subscription_status || 'no_subscription',
      hint: 'Subscribe at /subscribe to access this resource.',
    });
  }
  next();
}

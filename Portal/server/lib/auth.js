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

import { verifyToken, createClerkClient } from '@clerk/backend';
import { query, withTransaction } from '../db.js';
import { capabilitiesForMode } from './capabilities.js';
import { findPendingInvite, acceptInvite } from './team.js';

const MODE = (process.env.BDI_MODE || 'local-admin').toLowerCase();
const CLERK_SECRET = process.env.CLERK_SECRET_KEY || null;
const CLERK_PUBLISHABLE = process.env.CLERK_PUBLISHABLE_KEY || null;
// Optional: the PEM public key for OFFLINE JWT verification. When set,
// verifyToken skips the network JWKS fetch (which can hang on hosted
// deployments where the JWKS endpoint at https://clerk.<your-domain>/
// .well-known/jwks.json is unreachable or slow).
// Get this from Clerk Dashboard → API Keys → "Show JWT public key" / PEM.
const CLERK_JWT_KEY = process.env.CLERK_JWT_KEY || null;

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
    // Browser-safe Stripe publishable key — needed for Stripe.js
    stripe_publishable_key: process.env.STRIPE_PUBLISHABLE_KEY || null,
    // What this deployment is allowed to do — drives UI hiding so a local-only
    // operation never appears on app/admin. Single source of truth: capabilities.js
    capabilities: capabilitiesForMode(),
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
    // Use offline verification (jwtKey) when CLERK_JWT_KEY env var is set.
    // Otherwise fall back to network JWKS fetch via secretKey, but with an
    // explicit 8-second timeout so we fail fast instead of hanging.
    const verifyOpts = CLERK_JWT_KEY
      ? { jwtKey: CLERK_JWT_KEY }
      : { secretKey: CLERK_SECRET };
    claims = await Promise.race([
      verifyToken(m[1], verifyOpts),
      new Promise((_, rej) => setTimeout(() => rej(new Error('verifyToken_timeout_8s')), 8000)),
    ]);
  } catch (err) {
    console.error('[auth] verifyToken FAILED:', err.message, '— token starts:', m[1].slice(0, 40), '— offline?', !!CLERK_JWT_KEY);
    return res.status(401).json({ error: 'unauthorized', reason: 'invalid_token', detail: err.message });
  }

  // Claims include `sub` = Clerk user id. Look up our DB row.
  const clerkUserId = claims.sub;
  if (!clerkUserId) {
    return res.status(401).json({ error: 'unauthorized', reason: 'no_subject_claim' });
  }

  let r = await query(`
    SELECT u.*, t.id AS t_id, t.name AS t_name, t.slug AS t_slug, t.plan AS t_plan,
           t.is_active AS t_is_active
      FROM users u
      JOIN tenants t ON t.id = u.tenant_id
     WHERE u.clerk_user_id = $1 AND u.is_active = true
     LIMIT 1
  `, [clerkUserId]);

  // LAZY PROVISIONING: if the user authenticated via Clerk but we have no
  // row, fetch their profile from Clerk and create the row + personal tenant
  // right here. This makes the webhook a nice-to-have (for updates/deletes)
  // rather than a strict requirement. No more "user_not_provisioned" races
  // even if the webhook is misconfigured.
  if (!r.rows.length) {
    try {
      await lazyProvisionUser(clerkUserId);
      // Re-query after provisioning
      r = await query(`
        SELECT u.*, t.id AS t_id, t.name AS t_name, t.slug AS t_slug, t.plan AS t_plan,
               t.is_active AS t_is_active
          FROM users u
          JOIN tenants t ON t.id = u.tenant_id
         WHERE u.clerk_user_id = $1 AND u.is_active = true
         LIMIT 1
      `, [clerkUserId]);
    } catch (err) {
      console.error('[auth] lazy provision failed for', clerkUserId, '—', err.message);
      return res.status(500).json({
        error: 'provisioning_failed',
        reason: 'could_not_create_user_record',
        detail: err.message,
      });
    }
  }
  if (!r.rows.length) {
    // A row may exist but be INACTIVE — removed from a team (Phase 5) or on a
    // suspended tenant. Answer with a clean 403 instead of a 500.
    const inactive = await query(
      `SELECT 1 FROM users WHERE clerk_user_id = $1 AND is_active = false LIMIT 1`, [clerkUserId],
    ).catch(() => ({ rows: [] }));
    if (inactive.rows.length) {
      return res.status(403).json({ error: 'account_inactive', reason: 'Your access has been removed — contact your team’s admin.' });
    }
    // Still no row after attempt — something is genuinely broken
    return res.status(500).json({
      error: 'provisioning_failed',
      reason: 'user_row_missing_after_provision',
    });
  }

  const row = r.rows[0];

  // Auto-promote to platform_admin if this user's email is in
  // BDI_PLATFORM_ADMIN_EMAILS. Handles the case where the env var was set
  // AFTER the user signed up (their role would still be 'owner' otherwise).
  // We only promote up — we never auto-demote. To remove platform_admin,
  // update the DB row manually.
  const platformAdmins = (process.env.BDI_PLATFORM_ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  if (platformAdmins.includes(String(row.email || '').toLowerCase()) && row.role !== 'platform_admin') {
    try {
      await query(`UPDATE users SET role = 'platform_admin', updated_at = now() WHERE id = $1`, [row.id]);
      row.role = 'platform_admin';
      console.log(`[auth] auto-promoted ${row.email} to platform_admin (matched BDI_PLATFORM_ADMIN_EMAILS)`);
    } catch (err) {
      console.error('[auth] platform_admin auto-promote failed:', err.message);
    }
  }

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

  // ----- Clerk Organizations -------------------------------------------------
  // If the session has an ACTIVE organization, that org is the workspace for
  // this request: resolve it to our tenant + use the org role. Fully
  // backward-compatible — no org claim (or any error) → keep the home tenant.
  // platform_admin staff always keep their cross-tenant identity.
  let actTenant = null, actRole = null;
  const orgId = claims.org_id || claims.o?.id || null;
  const orgRole = claims.org_role || claims.o?.rol || null;
  if (orgId && row.role !== 'platform_admin') {
    try {
      const t = await resolveOrgTenant(orgId);
      if (t && t.is_active !== false) { actTenant = t; actRole = orgRoleToBell(orgRole); }
    } catch (err) {
      console.error('[auth] org resolve failed — using home tenant:', err.message);
    }
  }

  req.user = {
    id:             Number(row.id),
    tenant_id:      actTenant ? Number(actTenant.id) : Number(row.tenant_id),
    clerk_user_id:  row.clerk_user_id,
    email:          row.email,
    full_name:      row.full_name,
    role:           actRole || row.role,
    function_team:  row.function_team,
    is_active:      row.is_active,
  };
  req.tenant = actTenant ? {
    id:        Number(actTenant.id),
    name:      actTenant.name,
    slug:      actTenant.slug,
    plan:      actTenant.plan,
    is_active: actTenant.is_active,
  } : {
    id:        Number(row.t_id),
    name:      row.t_name,
    slug:      row.t_slug,
    plan:      row.t_plan,
    is_active: row.t_is_active,
  };

  // Impersonation: a real platform_admin acting as a customer tenant (set via the
  // X-Impersonate-Tenant header by the admin UI). Honored ONLY when the resolved
  // identity is platform_admin — the header alone grants nothing. Swaps in the
  // customer's tenant + a NON-admin identity so the app behaves exactly as they
  // see it (real credit limits etc.); the admin's email is kept in impersonatedBy.
  const impId = Number(req.headers['x-impersonate-tenant']);
  if (Number.isFinite(impId) && impId > 0 && req.user.role === 'platform_admin' && impId !== req.user.tenant_id) {
    try {
      const imp = await query(
        `SELECT t.id, t.name, t.slug, t.plan, t.is_active,
                u.id AS u_id, u.email AS u_email, u.full_name AS u_name, u.role AS u_role
           FROM tenants t
           LEFT JOIN LATERAL (SELECT id, email, full_name, role FROM users
                               WHERE tenant_id = t.id ORDER BY (role = 'owner') DESC, created_at ASC LIMIT 1) u ON true
          WHERE t.id = $1`, [impId]);
      if (imp.rows.length) {
        const it = imp.rows[0];
        const byEmail = req.user.email;
        req.impersonating = { by: byEmail, tenant_id: Number(it.id), tenant_name: it.name };
        req.user = {
          id: it.u_id ? Number(it.u_id) : 0, tenant_id: Number(it.id),
          email: it.u_email || ('owner@' + it.slug), full_name: it.u_name || it.name,
          role: (it.u_role && it.u_role !== 'platform_admin') ? it.u_role : 'owner',
          is_active: true, impersonatedBy: byEmail,
        };
        req.tenant = { id: Number(it.id), name: it.name, slug: it.slug, plan: it.plan, is_active: it.is_active };
      }
    } catch (e) { console.error('[auth] impersonation resolve failed:', e.message); }
  }
  next();
}

// Map a Clerk org role (e.g. "org:admin", "org:owner") to a Bell role.
// Unknown roles fall back to the least-privileged 'member'.
export function orgRoleToBell(orgRole) {
  if (!orgRole) return null;
  const r = String(orgRole).replace(/^org:/, '').toLowerCase();
  const map = { owner: 'owner', admin: 'admin', lead: 'lead', member: 'member', viewer: 'viewer' };
  return map[r] || 'member';
}

// Resolve a Clerk org id to our tenant row. Lazy-creates the tenant from Clerk
// if the webhook hasn't synced it yet, so org workspaces work immediately.
export async function resolveOrgTenant(orgId) {
  const ex = await query(
    `SELECT id, name, slug, plan, is_active FROM tenants WHERE clerk_org_id = $1 LIMIT 1`,
    [orgId],
  );
  if (ex.rows.length) return ex.rows[0];
  // Not synced yet — fetch from Clerk and create.
  const org = await clerkClient().organizations.getOrganization({ organizationId: orgId });
  if (!org) return null;
  const base = (org.slug || ('org-' + String(orgId).slice(-8))).toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  const slug = base.slice(0, 40) + '-' + String(orgId).slice(-4).toLowerCase();
  try {
    const ins = await query(
      `INSERT INTO tenants (name, slug, plan, clerk_org_id) VALUES ($1, $2, 'free', $3)
       RETURNING id, name, slug, plan, is_active`,
      [org.name || slug, slug, orgId],
    );
    return ins.rows[0];
  } catch {
    const again = await query(
      `SELECT id, name, slug, plan, is_active FROM tenants WHERE clerk_org_id = $1 LIMIT 1`,
      [orgId],
    );
    return again.rows[0] || null;
  }
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
/**
 * Block canonical-data mutations anywhere EXCEPT the local engine.
 *
 * companies/people/jobs are Bell-owned reference data and PROD is an exact
 * mirror of local — so a write on app.bell.qa (customers) OR admin.bell.qa
 * (staff) would be clobbered by the next mirror push. All edits/archives/
 * re-enrichment therefore happen on the local engine (source of truth) and
 * flow up. Callers carve out GET + reveal before invoking this.
 *
 * (Formerly denyOnUserPortal, which only blocked the user portal; tightened
 * 2026-05-31 so admin.bell.qa is also read-only for canonical data.)
 */
export function denyUnlessLocalEngine(req, res, next) {
  if (MODE !== 'local-admin') {
    return res.status(403).json({ error: 'forbidden', reason: 'canonical_mutation_local_engine_only' });
  }
  next();
}

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

// ---------------------------------------------------------------------------
// Lazy provisioning — same logic as the Clerk webhook, runs synchronously
// on first authenticated request when the user row doesn't exist yet.
// ---------------------------------------------------------------------------
let _clerkClient = null;
function clerkClient() {
  if (_clerkClient) return _clerkClient;
  _clerkClient = createClerkClient({ secretKey: CLERK_SECRET });
  return _clerkClient;
}

async function lazyProvisionUser(clerkUserId) {
  // 1. Fetch the user profile from Clerk
  const clerkUser = await clerkClient().users.getUser(clerkUserId);
  if (!clerkUser) throw new Error('Clerk getUser returned null');

  const primaryEmailObj = (clerkUser.emailAddresses || []).find(
    e => e.id === clerkUser.primaryEmailAddressId
  ) || clerkUser.emailAddresses?.[0];
  const primaryEmail = primaryEmailObj?.emailAddress;
  if (!primaryEmail) throw new Error('Clerk user has no primary email');

  const firstName = clerkUser.firstName || '';
  const lastName  = clerkUser.lastName  || '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ').trim()
                  || primaryEmail.split('@')[0];

  // 2. Are they a platform admin (Bell.qa staff)?
  const platformAdmins = (process.env.BDI_PLATFORM_ADMIN_EMAILS || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const isPlatformAdmin = platformAdmins.includes(primaryEmail.toLowerCase());
  const role = isPlatformAdmin ? 'platform_admin' : 'owner';

  // 3. Provision atomically. Three possible cases:
  //    (a) Already exists with this clerk_user_id → webhook beat us, do nothing
  //    (b) Already exists with this email but different clerk_user_id →
  //        RELINK that row to the new Clerk account (keeps their tenant +
  //        credits). Common when users delete & re-create their Clerk account.
  //    (c) Brand new → create tenant + user row
  await withTransaction(async (client) => {
    // (a) Same clerk_user_id?
    const byClerk = await client.query(
      `SELECT id FROM users WHERE clerk_user_id = $1 LIMIT 1`,
      [clerkUserId]
    );
    if (byClerk.rows.length) return;

    // (b) Same email, different clerk_user_id? Relink.
    const byEmail = await client.query(
      `SELECT id, tenant_id, clerk_user_id FROM users WHERE email = $1 LIMIT 1`,
      [primaryEmail.toLowerCase()]
    );
    if (byEmail.rows.length) {
      const oldClerkId = byEmail.rows[0].clerk_user_id;
      await client.query(`
        UPDATE users
           SET clerk_user_id = $2,
               full_name     = COALESCE(NULLIF($3, ''), full_name),
               first_name    = $4,
               last_name     = $5,
               avatar_url    = COALESCE($6, avatar_url),
               is_active     = true,
               updated_at    = now()
         WHERE id = $1
      `, [
        byEmail.rows[0].id, clerkUserId,
        fullName, firstName || null, lastName || null,
        clerkUser.imageUrl || null,
      ]);
      console.log(`[auth] LAZY-relinked ${primaryEmail} from clerk:${oldClerkId} → clerk:${clerkUserId} (existing tenant_id=${byEmail.rows[0].tenant_id})`);
      return;
    }

    // (c) Brand new user. TEAM INVITE (Phase 5): if this email was invited,
    //     join that tenant as the invited role; otherwise create a personal
    //     tenant + owner. Staff (platform_admin) are never auto-joined.
    const q = (s, p) => client.query(s, p);
    const invite = isPlatformAdmin ? null : await findPendingInvite(primaryEmail, q);
    let tenantId, effRole, tenantName;
    if (invite) {
      tenantId = Number(invite.tenant_id);
      effRole = invite.role;
      const t = await q(`SELECT name FROM tenants WHERE id = $1`, [tenantId]);
      tenantName = t.rows[0]?.name || 'team';
    } else {
      const slugBase = slugify(fullName) || slugify(primaryEmail.split('@')[0]) || 'workspace';
      let slug = slugBase, i = 0;
      while (true) {
        const s = await q(`SELECT 1 FROM tenants WHERE slug = $1 LIMIT 1`, [slug]);
        if (!s.rows.length) break;
        i++; slug = `${slugBase}-${i}`;
      }
      tenantName = `${firstName || slugBase}'s Workspace`.replace(/^'s/, 'Personal');
      const tR = await q(`INSERT INTO tenants (name, slug, plan) VALUES ($1, $2, 'free') RETURNING id`, [tenantName, slug]);
      tenantId = Number(tR.rows[0].id);
      effRole = role;
    }

    const uR = await q(`
      INSERT INTO users (
        tenant_id, clerk_user_id, email, full_name, first_name, last_name,
        avatar_url, role, joined_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
      RETURNING id
    `, [
      tenantId, clerkUserId, primaryEmail.toLowerCase(),
      fullName, firstName || null, lastName || null,
      clerkUser.imageUrl || null,
      effRole,
    ]);
    if (invite) await acceptInvite(invite.id, Number(uR.rows[0].id), q);
    console.log(`[auth] LAZY-provisioned ${primaryEmail} as ${effRole} of tenant '${tenantName}' (id=${tenantId})${invite ? ' [invited]' : ''}`);
  });
}

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

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
    SELECT subscription_status, plan_expires_at, past_due_at FROM tenants WHERE id = $1
  `, [req.tenant.id]);
  const t = r.rows[0];
  const status = t?.subscription_status;
  if (['active', 'trialing'].includes(status)) return next();

  // Grace window: after a failed payment (past_due) access stays open for 24h
  // so the user can fix their card before the account freezes.
  if (status === 'past_due' && t.past_due_at) {
    const GRACE_MS = 24 * 60 * 60 * 1000;
    if (Date.now() - new Date(t.past_due_at).getTime() < GRACE_MS) return next();
  }

  return res.status(402).json({
    error: 'subscription_required',
    reason: status || 'no_subscription',
    hint: 'Subscribe at /subscribe to access this resource.',
  });
}

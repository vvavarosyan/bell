// /api/auth — Clerk webhook handler + /me endpoint + utility routes.
//
// Webhook flow:
//   1. User signs up in Clerk
//   2. Clerk POSTs to /api/auth/clerk-webhook with event 'user.created'
//   3. We verify the Svix signature (Clerk uses Svix under the hood)
//   4. We auto-create a personal tenant for the new user + the user row
//   5. Subsequent user.updated events sync profile changes
//   6. user.deleted events soft-deactivate (we keep history for billing/audit)

import { Router } from 'express';
import { Webhook } from 'svix';
import { query, withTransaction } from '../db.js';
import { requireAuth, getModeInfo } from '../lib/auth.js';

const router = Router();

// GET /api/auth/mode  — public, used by the UI to know if auth is required
router.get('/mode', (req, res) => {
  res.json(getModeInfo());
});

// GET /api/auth/me  — authenticated; returns the current user + tenant
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user, tenant: req.tenant });
});

// ----- Clerk webhook handler ------------------------------------------------
// Receives user.created / user.updated / user.deleted from Clerk.
// IMPORTANT: this route is mounted with a raw-body parser so Svix can verify
// the signature against the exact bytes Clerk sent.
router.post('/clerk-webhook', async (req, res) => {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[auth] CLERK_WEBHOOK_SECRET not set — webhook ignored');
    return res.status(500).json({ error: 'webhook_secret_not_set' });
  }

  // Body must be raw bytes for Svix verification
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : JSON.stringify(req.body);
  const headers = {
    'svix-id':        req.header('svix-id'),
    'svix-timestamp': req.header('svix-timestamp'),
    'svix-signature': req.header('svix-signature'),
  };

  let evt;
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(rawBody, headers);
  } catch (err) {
    console.error('[auth] webhook signature invalid:', err.message);
    return res.status(400).json({ error: 'invalid_signature' });
  }

  try {
    if (evt.type === 'user.created')      await handleUserCreated(evt.data);
    else if (evt.type === 'user.updated') await handleUserUpdated(evt.data);
    else if (evt.type === 'user.deleted') await handleUserDeleted(evt.data);
    // Other event types — ignore quietly.
    res.json({ received: true, type: evt.type });
  } catch (err) {
    console.error(`[auth] webhook handler error for ${evt.type}:`, err.stack || err.message);
    // Return 200 anyway so Clerk doesn't keep retrying a permanent failure;
    // we logged the error and can replay manually if needed.
    res.json({ received: true, type: evt.type, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Webhook handlers
// ---------------------------------------------------------------------------
async function handleUserCreated(clerkUser) {
  const clerkUserId = clerkUser.id;
  const primaryEmail = pickPrimaryEmail(clerkUser);
  if (!primaryEmail) {
    console.warn(`[auth] user.created without primary email — skipping (clerk_id=${clerkUserId})`);
    return;
  }
  const firstName = clerkUser.first_name || '';
  const lastName  = clerkUser.last_name  || '';
  const fullName  = [firstName, lastName].filter(Boolean).join(' ').trim() || primaryEmail.split('@')[0];

  await withTransaction(async (client) => {
    // 1. Auto-create a personal tenant for the new user.
    //    Name defaults to "<First>'s Workspace" or the email local-part.
    const slugBase = slugify(fullName) || slugify(primaryEmail.split('@')[0]) || 'workspace';
    const slug = await uniqueSlug(client, slugBase);
    const tenantName = `${firstName || slugBase}'s Workspace`.replace(/^'s/, 'Personal');

    const tenantR = await client.query(`
      INSERT INTO tenants (name, slug, plan)
      VALUES ($1, $2, 'free')
      RETURNING id
    `, [tenantName, slug]);
    const tenantId = Number(tenantR.rows[0].id);

    // 2. Decide the user's role. Bell.qa staff (emails in
    //    BDI_PLATFORM_ADMIN_EMAILS) become platform_admin; everyone else
    //    becomes the owner of their auto-created tenant.
    const platformAdmins = (process.env.BDI_PLATFORM_ADMIN_EMAILS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const isPlatformAdmin = platformAdmins.includes(primaryEmail.toLowerCase());
    const role = isPlatformAdmin ? 'platform_admin' : 'owner';

    // 3. Insert the user row
    await client.query(`
      INSERT INTO users (
        tenant_id, clerk_user_id, email, full_name, first_name, last_name,
        avatar_url, role, joined_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
      ON CONFLICT (clerk_user_id) DO UPDATE
        SET email      = EXCLUDED.email,
            full_name  = EXCLUDED.full_name,
            first_name = EXCLUDED.first_name,
            last_name  = EXCLUDED.last_name,
            avatar_url = EXCLUDED.avatar_url,
            updated_at = now()
    `, [
      tenantId, clerkUserId, primaryEmail.toLowerCase(),
      fullName, firstName || null, lastName || null,
      clerkUser.image_url || clerkUser.profile_image_url || null,
      role,
    ]);

    console.log(`[auth] provisioned user ${primaryEmail} as ${role} of tenant '${tenantName}' (id=${tenantId})`);
  });
}

async function handleUserUpdated(clerkUser) {
  const primaryEmail = pickPrimaryEmail(clerkUser);
  const firstName    = clerkUser.first_name || '';
  const lastName     = clerkUser.last_name  || '';
  const fullName     = [firstName, lastName].filter(Boolean).join(' ').trim();

  await query(`
    UPDATE users
       SET email      = COALESCE($2, email),
           full_name  = COALESCE(NULLIF($3, ''), full_name),
           first_name = $4,
           last_name  = $5,
           avatar_url = COALESCE($6, avatar_url),
           updated_at = now()
     WHERE clerk_user_id = $1
  `, [
    clerkUser.id,
    primaryEmail ? primaryEmail.toLowerCase() : null,
    fullName,
    firstName || null,
    lastName || null,
    clerkUser.image_url || clerkUser.profile_image_url || null,
  ]);
}

async function handleUserDeleted(clerkUser) {
  // Soft-delete: keep the row for audit/billing history; just mark inactive.
  await query(`UPDATE users SET is_active = false, updated_at = now() WHERE clerk_user_id = $1`, [clerkUser.id]);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
function pickPrimaryEmail(clerkUser) {
  const addrs = Array.isArray(clerkUser.email_addresses) ? clerkUser.email_addresses : [];
  const primaryId = clerkUser.primary_email_address_id;
  const primary = addrs.find(a => a.id === primaryId) || addrs[0];
  return primary?.email_address || null;
}

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function uniqueSlug(client, base) {
  let candidate = base;
  let i = 0;
  while (true) {
    const r = await client.query(`SELECT 1 FROM tenants WHERE slug = $1 LIMIT 1`, [candidate]);
    if (r.rows.length === 0) return candidate;
    i++;
    candidate = `${base}-${i}`;
  }
}

export default router;

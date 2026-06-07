-- 027_org_support.sql
-- Clerk Organizations support. Maps each Clerk Organization to a Bell tenant
-- (workspace). Backward-compatible: existing one-tenant-per-user accounts keep
-- working; org-backed workspaces layer on via clerk_org_id + the session's org
-- claims (resolved in auth.js).

BEGIN;

-- Link a tenant to its Clerk Organization.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS clerk_org_id text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_clerk_org
  ON tenants (clerk_org_id) WHERE clerk_org_id IS NOT NULL;

-- Clerk now owns membership + roles for org workspaces, where multiple admins
-- are normal and "owner" comes from a Clerk role — so the old strict
-- one-owner-per-tenant constraint is too rigid. Relax it.
DROP INDEX IF EXISTS idx_users_one_owner_per_tenant;

INSERT INTO schema_migrations (version) VALUES ('0027') ON CONFLICT DO NOTHING;

COMMIT;

-- 082_team_invites.sql
-- Phase 5 (Teams): in-app email invitations. An owner/admin invites a teammate
-- by email; the invitee signs up with that email and joins the SAME tenant as
-- the invited role (instead of getting a new personal workspace). Multi-user
-- per tenant is already schema-legal since 027 dropped the one-owner index.
-- We do NOT use Clerk Organizations — membership lives in users.tenant_id+role.

CREATE TABLE IF NOT EXISTS tenant_invites (
  id                 bigserial PRIMARY KEY,
  tenant_id          bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email              citext NOT NULL,
  role               text NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'lead', 'member', 'viewer')),
  token              text NOT NULL UNIQUE,
  invited_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_user_id   bigint REFERENCES users(id) ON DELETE SET NULL,
  accepted_at        timestamptz
);

-- Fast pending-invite lookup by email (case-insensitive via citext), used at
-- signup to decide "join a team" vs "new personal workspace".
CREATE INDEX IF NOT EXISTS idx_tenant_invites_email_pending ON tenant_invites (email) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_tenant_invites_tenant ON tenant_invites (tenant_id);
-- At most one OUTSTANDING invite per email per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_invites_unique_pending ON tenant_invites (tenant_id, email) WHERE status = 'pending';

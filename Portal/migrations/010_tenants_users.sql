-- =============================================================================
-- Bell Data Intelligence — Tenants + Users (v0010) — Milestone B1
-- =============================================================================
-- Foundation for multi-tenant SaaS:
--   • tenants  — one row per workspace (each customer's account)
--   • users    — one row per signed-in person; linked to a tenant + Clerk
--
-- Per the bell_architecture_doctrine memory:
--   • Each user belongs to ONE tenant (multi-workspace via team_memberships
--     comes later if a use case appears)
--   • 5 tenant-scoped roles (owner / admin / lead / member / viewer)
--     plus a separate platform_admin role for Bell.qa internal staff
--   • All new per-tenant tables get tenant_id from day one
--   • RLS policies get layered on when SaaS goes multi-tenant for real (B2)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- tenants — one row per workspace
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
    id                        bigserial PRIMARY KEY,

    -- Human-readable name + URL-safe slug
    name                      text NOT NULL,
    slug                      text UNIQUE NOT NULL,

    -- Billing — set by Stripe webhook in B3
    plan                      text NOT NULL DEFAULT 'free',
    stripe_customer_id        text UNIQUE,
    stripe_subscription_id    text UNIQUE,
    subscription_status       text,                    -- 'active' | 'trialing' | 'past_due' | 'canceled' | NULL
    plan_renewed_at           timestamptz,
    plan_expires_at           timestamptz,

    -- Limits / quotas (filled per plan via plan-config map in code)
    credit_balance            integer NOT NULL DEFAULT 0,

    -- Bookkeeping
    is_active                 boolean NOT NULL DEFAULT true,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),

    extra_fields              jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tenants_slug              ON tenants (slug);
CREATE INDEX IF NOT EXISTS idx_tenants_plan              ON tenants (plan);
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer   ON tenants (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_active            ON tenants (is_active);

-- Seed the internal Bell.qa tenant. Always tenant_id=1, used by local-admin
-- mode and platform_admin staff. SaaS customers get id >= 2.
INSERT INTO tenants (id, name, slug, plan, created_at)
VALUES (1, 'Bell.qa Internal', 'bell-qa-internal', 'internal', now())
ON CONFLICT (id) DO NOTHING;

-- Make sure subsequent bigserial values come after the seeded row.
SELECT setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX(id) FROM tenants), 1));

-- ---------------------------------------------------------------------------
-- users — signed-in people, one row per Clerk user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                        bigserial PRIMARY KEY,

    -- Tenant scoping. Required (no orphan users). One tenant per user for now;
    -- future team_memberships table will let users join multiple workspaces.
    tenant_id                 bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

    -- Clerk linkage. clerk_user_id is the source of truth for identity.
    -- We never store passwords — Clerk handles all of that.
    clerk_user_id             text UNIQUE NOT NULL,

    -- Profile (synced from Clerk on user.created / user.updated webhooks)
    email                     citext UNIQUE NOT NULL,
    full_name                 text,
    first_name                text,
    last_name                 text,
    avatar_url                text,

    -- Role within their tenant.
    --   platform_admin: Bell.qa staff with cross-tenant access (admin.bell.qa)
    --   owner:          workspace owner (one per tenant)
    --   admin:          workspace admin (cross-function)
    --   lead:           function-team lead
    --   member:         regular team member
    --   viewer:         read-only (external advisors, auditors)
    role                      text NOT NULL DEFAULT 'member'
                                CHECK (role IN ('platform_admin','owner','admin','lead','member','viewer')),

    -- Function team (sales/bd/marketing/research/gtm). NULL = cross-function.
    function_team             text
                                CHECK (function_team IS NULL OR function_team IN ('sales','bd','marketing','research','gtm')),

    -- Optional metadata
    title                     text,
    phone                     text,
    linkedin_url              text,
    location                  text,

    -- Bookkeeping
    joined_at                 timestamptz NOT NULL DEFAULT now(),
    last_signed_in_at         timestamptz,
    is_active                 boolean NOT NULL DEFAULT true,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),

    extra_fields              jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_users_tenant          ON users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_clerk           ON users (clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email           ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role            ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_function_team   ON users (function_team) WHERE function_team IS NOT NULL;

-- Each tenant has exactly one owner. Enforced via partial unique index.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_one_owner_per_tenant
    ON users (tenant_id)
    WHERE role = 'owner';

-- Updated-at trigger (matches the existing pattern from migration 001)
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenants_touch ON tenants;
CREATE TRIGGER trg_tenants_touch BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_users_touch ON users;
CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO schema_migrations (version) VALUES ('0010') ON CONFLICT DO NOTHING;

COMMIT;

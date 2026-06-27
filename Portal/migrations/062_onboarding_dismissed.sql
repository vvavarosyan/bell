-- =============================================================================
-- Onboarding dismissal flag (v0062)
-- =============================================================================
-- A per-tenant boolean so a new user can permanently dismiss the "Getting
-- Started" checklist. Lives on tenant_profile (one row per tenant, created lazily
-- by /api/icp or /api/onboarding/dismiss). Additive + nullable-safe.
-- =============================================================================

BEGIN;

ALTER TABLE tenant_profile
  ADD COLUMN IF NOT EXISTS onboarding_dismissed boolean NOT NULL DEFAULT false;

COMMIT;

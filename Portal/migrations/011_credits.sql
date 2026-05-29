-- =============================================================================
-- Bell Data Intelligence — Credit system (v0011)
-- =============================================================================
-- Per-tenant credits for revealing sensitive contact details (email / phone).
--   • tenants.credit_balance already exists (010). Add monthly-grant tracking.
--   • credit_ledger  — full audit of every grant / debit / admin adjustment.
--   • tenant_reveals — which entities a tenant has unlocked (charged once each).
--
-- These tables are PROD-side customer state. They are NOT in the local→prod
-- mirror (MIRROR_TABLES) — reveals and credits happen on the live product and
-- must never be overwritten by a sync.
-- =============================================================================

BEGIN;

-- Monthly grant bookkeeping (credit_balance itself already exists on tenants).
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS credits_period_start timestamptz,
  ADD COLUMN IF NOT EXISTS credits_period_plan  text;

-- Audit ledger: one row per balance change. balance_after is the running total.
CREATE TABLE IF NOT EXISTS credit_ledger (
  id            bigserial PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  delta         integer NOT NULL,           -- +grant / -debit / +/- admin adjust
  reason        text    NOT NULL,           -- monthly_grant | reveal_person | reveal_company | bulk_reveal | admin_adjust
  balance_after integer NOT NULL,
  ref_type      text,                       -- 'person' | 'company' | NULL
  ref_id        bigint,
  actor         text,                       -- user email or 'system'
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_tenant ON credit_ledger (tenant_id, created_at DESC);

-- Per-tenant reveals: a tenant pays 1 credit to unlock an entity's contacts.
-- UNIQUE guarantees a tenant is charged at most once per entity; re-viewing is free.
CREATE TABLE IF NOT EXISTS tenant_reveals (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type  text   NOT NULL CHECK (entity_type IN ('company','person')),
  entity_id    bigint NOT NULL,
  revealed_at  timestamptz NOT NULL DEFAULT now(),
  revealed_by  text,
  UNIQUE (tenant_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_reveals_lookup ON tenant_reveals (tenant_id, entity_type, entity_id);

INSERT INTO schema_migrations (version) VALUES ('0011') ON CONFLICT DO NOTHING;

COMMIT;

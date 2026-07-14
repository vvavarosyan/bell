-- Saved lists (switching-costs foundation, Val 2026-07-14 — from the moat analysis).
-- A curated, hand-picked list of companies/people a tenant builds while browsing —
-- FREE (no reveal/credit), unlike the reveal→CRM path. This is the lock-in the moat
-- review flagged as missing: customer-authored workspace data they can't easily leave.
-- Tenant-scoped, prod-owned, NOT part of the local→prod mirror (like all crm_* tables).

CREATE TABLE IF NOT EXISTS crm_lists (
  id                 bigserial PRIMARY KEY,
  tenant_id          bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               text NOT NULL,
  color              text,                                    -- optional accent (hex)
  created_by_user_id bigint,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_lists_tenant_idx ON crm_lists (tenant_id, name);

CREATE TABLE IF NOT EXISTS crm_list_members (
  id                 bigserial PRIMARY KEY,
  list_id            bigint NOT NULL REFERENCES crm_lists(id) ON DELETE CASCADE,
  tenant_id          bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type        text NOT NULL DEFAULT 'company',         -- company | person
  entity_id          bigint NOT NULL,
  added_by_user_id   bigint,
  added_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (list_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS crm_list_members_list_idx   ON crm_list_members (list_id);
CREATE INDEX IF NOT EXISTS crm_list_members_entity_idx ON crm_list_members (tenant_id, entity_type, entity_id);

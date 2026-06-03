-- =============================================================================
-- CRM saved segments (v0025)
-- =============================================================================
-- A segment is a named, saved filter over a tenant's CRM records (entity_type,
-- status, source, search). Per-tenant, prod-owned, NOT mirrored.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS crm_segments (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  filters     jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { entity_type, status, source, q }
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_segments_tenant ON crm_segments (tenant_id, name);

INSERT INTO schema_migrations (version) VALUES ('0025') ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- Research ownership / tenant scoping (v0014)
-- =============================================================================
-- research_jobs predates multi-tenancy and had no owner, so every tenant's
-- research was visible to everyone. Add tenant_id so each tenant sees only its
-- own research (platform_admin sees all). Existing rows → the internal tenant.
-- =============================================================================

BEGIN;

ALTER TABLE research_jobs
  ADD COLUMN IF NOT EXISTS tenant_id bigint REFERENCES tenants(id) ON DELETE CASCADE;

UPDATE research_jobs SET tenant_id = 1 WHERE tenant_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_research_jobs_tenant ON research_jobs (tenant_id);

INSERT INTO schema_migrations (version) VALUES ('0014') ON CONFLICT DO NOTHING;

COMMIT;

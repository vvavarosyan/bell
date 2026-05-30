-- =============================================================================
-- Research — admin-visible error detail (v0015)
-- =============================================================================
-- error_message is the sanitized, customer-safe text. error_detail holds the
-- real technical cause (provider error, schema/quota issue) and is returned
-- ONLY to platform_admin so the team can diagnose failures without log access.
-- =============================================================================

BEGIN;

ALTER TABLE research_jobs
  ADD COLUMN IF NOT EXISTS error_detail text;

INSERT INTO schema_migrations (version) VALUES ('0015') ON CONFLICT DO NOTHING;

COMMIT;

-- 038_website_finder.sql
-- Stage 8 — Local Website Finder. Per-company stage tracking columns, matching
-- the stage1..7 convention. Provenance of a found site is stored in
-- companies.extra_fields.website_found (method + timestamp) — no schema change.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage8_status text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage8_at     timestamptz;

-- Lets the sweep find companies that still have no website / were never checked.
CREATE INDEX IF NOT EXISTS idx_companies_stage8_at ON companies (stage8_at NULLS FIRST);

INSERT INTO schema_migrations (version) VALUES ('0038') ON CONFLICT DO NOTHING;

COMMIT;

-- 037_local_harvester.sql
-- Stage 7 — Local Website Harvester. Adds the per-company stage tracking
-- columns the harvester writes (status + last-run timestamp), matching the
-- stage1..6 convention. Logo, description and partner candidates are stored in
-- companies.extra_fields (website_logo_url / website_description /
-- harvested_partners) and need no schema change.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage7_status text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage7_at     timestamptz;

-- Helps the future "harvest stale companies" sweep find the least-recently
-- harvested rows quickly.
CREATE INDEX IF NOT EXISTS idx_companies_stage7_at ON companies (stage7_at NULLS FIRST);

INSERT INTO schema_migrations (version) VALUES ('0037') ON CONFLICT DO NOTHING;

COMMIT;

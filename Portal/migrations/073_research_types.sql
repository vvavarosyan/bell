-- =============================================================================
-- Research types: retire theme/region/regulation, allow 'other' (v0073)
-- =============================================================================
-- Val 2026-07-04: the research menu is Company / Person / Sector / Other.
-- The original CHECK (migration 008) only allowed
--   company / person / sector / theme / region / regulation
-- so creating an "Other" job failed research_jobs_type_check. Swap the
-- constraint to the current four types.
--
-- ORDER MATTERS: drop the old constraint FIRST, otherwise reclassifying legacy
-- theme/region/regulation rows to 'other' would violate the still-active old
-- constraint and fail the migration (which fails Portal boot).
--
-- Auto-applied on Portal boot (server/migrate.js), tracked by filename — runs
-- once on the local engine and once on the shared prod DB (app + admin).
-- =============================================================================

BEGIN;

ALTER TABLE research_jobs DROP CONSTRAINT IF EXISTS research_jobs_type_check;

UPDATE research_jobs
   SET type = 'other'
 WHERE type IN ('theme', 'region', 'regulation');

ALTER TABLE research_jobs
  ADD CONSTRAINT research_jobs_type_check
  CHECK (type IN ('company', 'person', 'sector', 'other'));

COMMIT;

-- =============================================================================
-- Bell Data Intelligence — ensure dedup_candidates unique constraints exist (v0006)
-- =============================================================================
-- Migration 005 declared `UNIQUE (company_a_id, company_b_id)` as a table-level
-- constraint inside CREATE TABLE IF NOT EXISTS. In some environments that left
-- us without a unique index Postgres could match against `ON CONFLICT
-- (company_a_id, company_b_id)`, producing the error
-- "there is no unique or exclusion constraint matching the ON CONFLICT
--  specification" during cluster auto-merge on 2026-05-23.
--
-- This migration is idempotent and safe: it creates explicit named UNIQUE
-- INDEXes if they're missing, so ON CONFLICT (cols) is guaranteed to match.
-- =============================================================================

BEGIN;

-- Companies dedup queue
CREATE UNIQUE INDEX IF NOT EXISTS uq_dedup_candidates_pair
  ON dedup_candidates (company_a_id, company_b_id);

-- People dedup queue
CREATE UNIQUE INDEX IF NOT EXISTS uq_person_dedup_pair
  ON person_dedup_candidates (person_a_id, person_b_id);

COMMIT;

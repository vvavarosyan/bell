-- =============================================================================
-- Bell Data Intelligence — robustly relax the enrichment_runs.stage CHECK (v0004)
-- =============================================================================
-- Migration 003 tried to drop `enrichment_runs_stage_check` by name and re-add
-- it as BETWEEN 1 AND 99. Postgres named the inline CHECK something else (the
-- exact name depends on creation order), so the DROP IF EXISTS no-op'd, the
-- ADD failed silently (CHECK constraints can't be ADDed if an equivalent exists
-- under another name), and Stage 6 still gets rejected by the original
-- (stage BETWEEN 1 AND 5) check.
--
-- This migration walks pg_constraint, finds ANY CHECK on enrichment_runs that
-- references the `stage` column and contains BETWEEN, and drops them all.
-- Then it adds the wider 1..99 constraint under a stable name.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'enrichment_runs'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%stage%between%'
  LOOP
    EXECUTE 'ALTER TABLE enrichment_runs DROP CONSTRAINT ' || quote_ident(c.conname);
  END LOOP;
END$$;

-- Re-add under a stable, explicit name. IF NOT EXISTS isn't supported for ADD
-- CONSTRAINT, so we wrap in another DO block that checks first.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'enrichment_runs'::regclass
      AND conname  = 'enrichment_runs_stage_range'
  ) THEN
    ALTER TABLE enrichment_runs
      ADD CONSTRAINT enrichment_runs_stage_range CHECK (stage BETWEEN 1 AND 99);
  END IF;
END$$;

COMMIT;

-- =============================================================================
-- Bell Data Intelligence — Stage 6 (Website Contact Discovery) status (v0003)
-- =============================================================================
-- Adds stage6_status + stage6_at columns to companies, following the same
-- pattern as stages 1-5. The actual contact records land in company_contacts
-- (created in migration 002).
-- =============================================================================

BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS stage6_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stage6_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_companies_stage6_status ON companies (stage6_status);

-- Relax the enrichment_runs CHECK so stage 6 (and any future stages) can be
-- recorded in the audit log.
ALTER TABLE enrichment_runs
  DROP CONSTRAINT IF EXISTS enrichment_runs_stage_check;
ALTER TABLE enrichment_runs
  ADD CONSTRAINT enrichment_runs_stage_check CHECK (stage BETWEEN 1 AND 99);

COMMIT;

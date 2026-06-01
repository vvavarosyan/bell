-- =============================================================================
-- Source reconciliation + lifecycle decoupling (v0018)
-- =============================================================================
-- Goal: an always-true local DB where the Active set is genuinely all-active and
-- the Archived set is genuinely archived, with admin decisions that stick.
--
-- Key change: `archived` is DECOUPLED from `is_active`. Previously recompute set
-- archived = NOT is_active on every ingest, which clobbered deliberate admin
-- decisions and conflated "currently inactive" with "removed/disappeared".
--
-- New columns:
--   companies.manual_status_override  — admin made a deliberate archive/status
--                                       decision; recompute must NOT revert it.
--   companies.archive_reason          — why archived: 'inactive' | 'qfz_disappeared'
--                                       | 'admin' | NULL.
--   companies.archived_at             — when it was archived (audit).
--   companies.needs_review            — disappeared from a NON-QFZ source; admin
--                                       must decide (keep / archive / remove).
--   companies.review_reason           — e.g. 'disappeared_from_MOCI'.
--   company_sources.is_current        — was this source link present in the LATEST
--                                       ingest of its source? Missing links no
--                                       longer keep a company active (QFZ rule).
-- =============================================================================

BEGIN;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS manual_status_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archive_reason         text,
  ADD COLUMN IF NOT EXISTS archived_at            timestamptz,
  ADD COLUMN IF NOT EXISTS needs_review           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason          text;

ALTER TABLE company_sources
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

-- Existing rows: treat every current link as present (nothing has "disappeared"
-- until the next ingest run reconciles), and stamp a reason on already-archived
-- rows so the audit isn't blank.
UPDATE companies SET archive_reason = 'legacy'
 WHERE archived = true AND archive_reason IS NULL;

CREATE INDEX IF NOT EXISTS idx_companies_needs_review
  ON companies (needs_review) WHERE needs_review = true;
CREATE INDEX IF NOT EXISTS idx_company_sources_current
  ON company_sources (source, is_current);

INSERT INTO schema_migrations (version) VALUES ('0018') ON CONFLICT DO NOTHING;

COMMIT;

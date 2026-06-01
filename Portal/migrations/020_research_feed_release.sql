-- =============================================================================
-- Research → Market Feed release (v0020)
-- =============================================================================
-- A finished research report is exclusive to the tenant that commissioned it,
-- then RELEASES into the public Market Feed (anonymized — the commissioning
-- tenant is never shown) as a feed_events row of kind='research', exposing the
-- FULL report. The exclusivity delay is a setting (research_feed_exclusivity_days,
-- default 0 = release immediately; raise to 3–7 days before real users launch).
--
--   feed_optout      — tenant chose to keep this research private (never feed).
--                      Today a free toggle; becomes the paid lever once research
--                      consumes credits.
--   feed_released_at — when it was released to the feed (guards against re-release).
-- =============================================================================

BEGIN;

ALTER TABLE research_jobs
  ADD COLUMN IF NOT EXISTS feed_optout      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS feed_released_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_research_jobs_feed_pending
  ON research_jobs (status)
  WHERE status = 'ready' AND feed_released_at IS NULL AND feed_optout = false;

INSERT INTO schema_migrations (version) VALUES ('0020') ON CONFLICT DO NOTHING;

COMMIT;

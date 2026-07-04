-- =============================================================================
-- News: full Bell-rewritten article body (v0074)
-- =============================================================================
-- Val 2026-07-04: news pages should show title + summary + a FULL article
-- rewritten in Bell's own original words (not the source copied). The news
-- enricher (news/enrich.js) now produces `body` alongside the summary.
-- Auto-applied on Portal boot (server/migrate.js), tracked by filename.
-- =============================================================================

BEGIN;

ALTER TABLE news_items ADD COLUMN IF NOT EXISTS body text;

COMMIT;

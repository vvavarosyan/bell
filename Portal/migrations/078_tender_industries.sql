-- 078 — tenders.industries[] — every tender carries its line(s) of business.
--
-- Val 2026-07-09: "in none of the tender cards i see the industry… make sure
-- 100% of open tenders are categorized", and Tenders needs the same "For you"
-- (ICP) toggle the other Signals tabs have.
--
-- Persisting the match (rather than recomputing per request) makes it
-- SQL-filterable: industry chips on every card, `industries && icp_industries`
-- for the For-you view, and industry facets — all indexed. Computed by
-- server/tenders/match.js: activity codes → ISIC division/class → canonical
-- industry tags, with category/sector and (last resort) the title.
--
-- Written by: ingest.js (seed), enrich.js (refresh once activities land), and
-- "Backfill Tender Industries.command" (authoritative recompute over all rows).
-- tenders IS mirrored to prod, and the mirror discovers columns generically,
-- so these sync automatically once prod has this migration.

ALTER TABLE tenders ADD COLUMN IF NOT EXISTS industries       text[];
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS primary_industry text;

CREATE INDEX IF NOT EXISTS idx_tenders_industries ON tenders USING GIN (industries);
CREATE INDEX IF NOT EXISTS idx_tenders_primary_industry ON tenders (primary_industry);

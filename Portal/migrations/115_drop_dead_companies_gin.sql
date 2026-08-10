-- 115 — Drop a 114 MB index that has never once been used.
--
-- Val, 2026-08-10, on the Railway bill: "the postgres uses almost 7gb ram continuously on
-- production ... are we able to drop this dramatically?"
--
-- MEASURED on the engine box (production mirrors it):
--     companies                 792 MB, of which 464 MB is INDEXES
--     idx_companies_extra_fields_gin    114 MB   used 0 times
--     idx_companies_name_trgm            27 MB   used 20,554 times   ← the one doing the work
--
-- Zero is not "we have not looked yet". The only queries shaped for a jsonb GIN on this column are
-- `extra_fields ? 'key'` in the registry ingest scripts (people_moph, people_qfcra,
-- people_madeinqatar) and the gap audit — all of which RAN in that window (MoPH last ingested
-- 2026-08-02) and the planner still preferred a sequential scan every time. On PRODUCTION nothing
-- queries that shape at all.
--
-- Dropping it costs those rare engine-box ingests a scan they were already doing, and takes 114 MB
-- out of both databases.
--
-- ⚠️ DELIBERATELY NOT DROPPED: idx_companies_search_blob_trgm (205 MB, used 9 times). It backs the
-- phrase/advanced company search — rarely exercised but genuinely user-facing, and removing it
-- would turn an occasional search into a full scan of 197k rows. That is Val's call, not a
-- migration's.

BEGIN;

DROP INDEX IF EXISTS idx_companies_extra_fields_gin;

COMMIT;

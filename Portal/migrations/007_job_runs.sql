-- =============================================================================
-- Bell Data Intelligence — persistent job_runs table (v0007)
-- =============================================================================
-- Until now, every Run Assembly / Run Enrichment / Run Ingest job lived ONLY
-- in the Portal server's in-memory job tracker (Portal/server/ingest/jobs.js).
-- That meant:
--   • Closing the live JobLogPanel = log gone from the UI
--   • Restarting the Portal = entire history wiped
--   • After 200 newer jobs, the oldest was evicted from memory
--
-- This migration adds `job_runs`, a Postgres-backed audit log for every
-- completed (or failed) background job. The Portal writes a row when a job
-- finishes; the UI's new "Recent Jobs" view reads from here.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS job_runs (
    id              uuid PRIMARY KEY,                          -- same id as the in-memory job

    kind            text NOT NULL,                             -- ingest | scrape | enrichment | assembly
    source          text,                                      -- 'full' | 'stage3' | 'QFC' | 'assembly-full-run' | ...
    status          text NOT NULL,                             -- running | completed | failed (terminal states only — running is rare)

    started_at      timestamptz NOT NULL,
    completed_at    timestamptz,

    -- Full log preserved. Each entry: { ts, message, idx }.
    -- Capped at ~50k rows in-memory before persistence; the same cap applies
    -- to what we write here, so even a huge assembly run is < 5 MB.
    messages        jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_messages  integer NOT NULL DEFAULT 0,                -- monotonic next_index value at write time

    result          jsonb,                                     -- structured outcome (counts, costs, ids)
    error           text,                                      -- if status = 'failed'

    triggered_by    text                                       -- admin email if known
);

CREATE INDEX IF NOT EXISTS idx_job_runs_started_desc   ON job_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_runs_kind           ON job_runs (kind);
CREATE INDEX IF NOT EXISTS idx_job_runs_status         ON job_runs (status);

COMMIT;

-- =============================================================================
-- Sync deletions tombstone (v0016)
-- =============================================================================
-- The local→Railway mirror sync is upsert-only: it never removes prod rows. So
-- when an admin PERMANENTLY deletes a bad record on the local engine (wrong /
-- non-Qatar / expired company), the deletion would not propagate and prod would
-- keep the stale row — breaking the "prod = exact mirror of local" doctrine.
--
-- This table records each hard-deleted mirror row. The next push reads the
-- pending tombstones, tells prod to delete those ids, then clears the rows it
-- processed. Lives on the local engine; harmless (and empty) on prod.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS sync_deletions (
  id          bigserial PRIMARY KEY,
  table_name  text        NOT NULL,
  row_id      bigint      NOT NULL,
  deleted_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_deletions_pending ON sync_deletions (table_name, row_id);

INSERT INTO schema_migrations (version) VALUES ('0016') ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- High-band id sequence for prod-originated research entities (v0017)
-- =============================================================================
-- Research runs on whichever deployment the job was started on. Jobs started on
-- bell.qa execute on Railway (prod) and create new companies/people directly in
-- the prod DB. The local→prod mirror is one-way and keys rows by `id`, so if a
-- prod-created research row reused the normal (low) id space, it would collide
-- with the next id the LOCAL engine hands out — silently overwriting data when
-- local pushes.
--
-- Fix: prod-originated research entities draw their id from a dedicated high
-- band (>= 2,000,000,000). Local ids (~10^5 today) will never reach it, so the
-- two id spaces are disjoint:
--   • low  ids  → local-originated (the source of truth)
--   • high ids  → prod-originated research entities, pulled back to local
--
-- This sequence is a standalone object (NOT owned by a table column), so a
-- mirror "Rebuild" (TRUNCATE … RESTART IDENTITY) does NOT reset it — high ids
-- stay monotonic across rebuilds and never get reissued.
-- =============================================================================

BEGIN;

CREATE SEQUENCE IF NOT EXISTS research_entity_id_seq
  AS bigint
  START WITH 2000000000
  MINVALUE 2000000000
  INCREMENT BY 1;

INSERT INTO schema_migrations (version) VALUES ('0017') ON CONFLICT DO NOTHING;

COMMIT;

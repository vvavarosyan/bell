-- 109 — A job that did not come from LinkedIn must be storable.
--
-- `jobs.linkedin_job_url` is NOT NULL. The table was built when LinkedIn was the only source, and
-- its 87 rows all came from one paid Apify run in May. Migration 108 added the generic source
-- columns but left this constraint standing, so EVERY job from QatarEnergy, Oracle Recruiting
-- Cloud or Qatar Living would have been rejected at insert time — the whole feature, blocked by
-- one column, and it would have surfaced as an empty jobs table with no obvious cause.
--
-- Caught by the closure tests before any sweep ran:
--     null value in column "linkedin_job_url" of relation "jobs" violates not-null constraint
--
-- The column is KEPT, not dropped: those 87 rows carry real LinkedIn URLs and `jobs` is mirrored
-- to production, so dropping a column there is a schema change on both sides for no benefit. It
-- simply becomes what it always should have been — a field that only LinkedIn-sourced rows fill.

BEGIN;

ALTER TABLE jobs ALTER COLUMN linkedin_job_url DROP NOT NULL;

-- Integrity does not disappear, it moves to the right place: a row must be identifiable by SOME
-- source. Either the LinkedIn url (the legacy shape) or a board + external id (the new one).
-- NOT VALID on purpose — it applies to every future write without a full-table rewrite, and the
-- existing 87 rows already satisfy it anyway.
ALTER TABLE jobs ADD CONSTRAINT jobs_identifiable_source CHECK (
  linkedin_job_url IS NOT NULL
  OR (board_key IS NOT NULL AND external_id IS NOT NULL)
) NOT VALID;

COMMIT;

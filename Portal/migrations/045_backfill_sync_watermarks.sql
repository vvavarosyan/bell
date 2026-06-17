-- 045_backfill_sync_watermarks.sql
-- Give every mirror-table row a non-NULL watermark. A NULL watermark
-- (updated_at / last_seen_at) was being silently dropped by the incremental
-- sync push (`WHERE watermark > wm` is never true for NULL), which left prod
-- missing contacts / employment links / etc. after a rebuild. The push logic is
-- also fixed (push.js) to include NULL-watermark rows, but backfilling means
-- those rows carry a real timestamp and won't re-push on every incremental.

UPDATE companies            SET updated_at   = now() WHERE updated_at   IS NULL;
UPDATE people               SET updated_at   = now() WHERE updated_at   IS NULL;
UPDATE jobs                 SET updated_at   = now() WHERE updated_at   IS NULL;
UPDATE company_sources      SET last_seen_at = now() WHERE last_seen_at IS NULL;
UPDATE person_companies     SET updated_at   = now() WHERE updated_at   IS NULL;
UPDATE company_contacts     SET updated_at   = now() WHERE updated_at   IS NULL;
UPDATE person_contacts      SET updated_at   = now() WHERE updated_at   IS NULL;
UPDATE company_financials   SET updated_at   = now() WHERE updated_at   IS NULL;
UPDATE company_shareholders SET updated_at   = now() WHERE updated_at   IS NULL;
UPDATE company_partnerships SET updated_at   = now() WHERE updated_at   IS NULL;

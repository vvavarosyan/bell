-- 032_people_allow_non_linkedin.sql
-- Until now every person REQUIRED a LinkedIn URL (people.linkedin_url was NOT
-- NULL UNIQUE) because people only ever came from LinkedIn enrichment. The MoPH
-- DHP source introduces people with NO LinkedIn — licensed healthcare
-- practitioners, keyed by their license number instead. So:
--   1. Make linkedin_url nullable (UNIQUE already allows multiple NULLs in PG).
--   2. Add a license-based unique key so practitioner upserts are idempotent.

BEGIN;

ALTER TABLE people ALTER COLUMN linkedin_url DROP NOT NULL;

-- One person per MoPH license number (partial: only rows that carry one).
CREATE UNIQUE INDEX IF NOT EXISTS uq_people_moph_license
  ON people ((extra_fields->>'moph_license_no'))
  WHERE (extra_fields ? 'moph_license_no');

INSERT INTO schema_migrations (version) VALUES ('0032') ON CONFLICT DO NOTHING;

COMMIT;

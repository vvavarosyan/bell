-- 035_bell_score.sql
-- Bell Score (0–100): how complete a record is across its valuable datapoints.
-- Stored on the row so we can sort by it cheaply. Recomputed by the assembly
-- run (server/assembly/bell_score.js); this migration adds the columns/indexes
-- and backfills once so it's populated immediately.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS bell_score smallint NOT NULL DEFAULT 0;
ALTER TABLE people    ADD COLUMN IF NOT EXISTS bell_score smallint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_companies_bell_score ON companies (bell_score DESC);
CREATE INDEX IF NOT EXISTS idx_people_bell_score    ON people    (bell_score DESC);

-- Companies — weights sum to 100.
UPDATE companies SET bell_score = LEAST(100, (
    (CASE WHEN name IS NOT NULL AND btrim(name) <> '' THEN 10 ELSE 0 END)
  + (CASE WHEN website IS NOT NULL THEN 10 ELSE 0 END)
  + (CASE WHEN email IS NOT NULL OR EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = companies.id AND cc.type='email') THEN 8 ELSE 0 END)
  + (CASE WHEN phone IS NOT NULL OR EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = companies.id AND cc.type='phone') THEN 8 ELSE 0 END)
  + (CASE WHEN industry IS NOT NULL OR sector IS NOT NULL THEN 8 ELSE 0 END)
  + (CASE WHEN employee_count IS NOT NULL OR employee_count_range IS NOT NULL THEN 8 ELSE 0 END)
  + (CASE WHEN city IS NOT NULL OR address IS NOT NULL THEN 8 ELSE 0 END)
  + (CASE WHEN primary_registration_no IS NOT NULL THEN 10 ELSE 0 END)
  + (CASE WHEN linkedin_url IS NOT NULL THEN 8 ELSE 0 END)
  + (CASE WHEN linkedin_description IS NOT NULL THEN 6 ELSE 0 END)
  + (CASE WHEN linkedin_logo_url IS NOT NULL THEN 4 ELSE 0 END)
  + (CASE WHEN founded_year IS NOT NULL OR incorporation_date IS NOT NULL THEN 4 ELSE 0 END)
  + (CASE WHEN (SELECT count(DISTINCT source) FROM company_sources cs WHERE cs.company_id = companies.id) >= 2 THEN 8 ELSE 0 END)
));

-- People — weights sum to 100.
UPDATE people SET bell_score = LEAST(100, (
    (CASE WHEN full_name IS NOT NULL AND btrim(full_name) <> '' THEN 15 ELSE 0 END)
  + (CASE WHEN headline IS NOT NULL THEN 15 ELSE 0 END)
  + (CASE WHEN linkedin_url IS NOT NULL THEN 15 ELSE 0 END)
  + (CASE WHEN email IS NOT NULL OR EXISTS (SELECT 1 FROM person_contacts pc WHERE pc.person_id = people.id AND pc.type='email') THEN 15 ELSE 0 END)
  + (CASE WHEN phone IS NOT NULL OR EXISTS (SELECT 1 FROM person_contacts pc WHERE pc.person_id = people.id AND pc.type='phone') THEN 10 ELSE 0 END)
  + (CASE WHEN location_text IS NOT NULL OR city IS NOT NULL THEN 10 ELSE 0 END)
  + (CASE WHEN EXISTS (SELECT 1 FROM person_companies pcx WHERE pcx.person_id = people.id) THEN 15 ELSE 0 END)
  + (CASE WHEN profile_picture_url IS NOT NULL THEN 5 ELSE 0 END)
));

INSERT INTO schema_migrations (version) VALUES ('0035') ON CONFLICT DO NOTHING;

COMMIT;

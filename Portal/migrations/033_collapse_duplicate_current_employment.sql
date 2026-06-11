-- 033_collapse_duplicate_current_employment.sql
-- A person should have ONE current employment link per company. Merging two
-- source-people (e.g. a MoPH practitioner + a LinkedIn profile) who both worked
-- at the same employer left TWO current links to that company with different
-- titles (the merge only de-duplicated EXACT-title matches). Collapse them:
-- per (person, company, is_current) keep the single most-useful link and drop
-- the rest. "Most useful" title = a real designation (non-blank AND not just the
-- company name) first, then the longest, then the oldest row.

BEGIN;

WITH ranked AS (
  SELECT pc.id,
         row_number() OVER (
           PARTITION BY pc.person_id, pc.company_id, pc.is_current
           ORDER BY (CASE WHEN pc.title IS NULL OR btrim(pc.title) = '' THEN 0
                          WHEN lower(btrim(pc.title)) = lower(btrim(c.name)) THEN 0
                          ELSE 1 END) DESC,
                    (CASE WHEN pc.source_stage = 0 AND coalesce(btrim(pc.title),'') <> '' THEN 1 ELSE 0 END) DESC,
                    length(coalesce(pc.title, '')) DESC,
                    pc.id ASC
         ) AS rn
    FROM person_companies pc
    JOIN companies c ON c.id = pc.company_id
)
DELETE FROM person_companies WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

INSERT INTO schema_migrations (version) VALUES ('0033') ON CONFLICT DO NOTHING;

COMMIT;

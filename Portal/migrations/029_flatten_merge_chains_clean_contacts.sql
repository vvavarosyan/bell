-- 029_flatten_merge_chains_clean_contacts.sql
-- Two fixes:
--  1. Flatten merge chains. A transitive merge (A→B then B→C) leaves A pointing
--     at B even though B is no longer a top-level canonical. The mirror sync
--     sends canonicals before duplicates, so a chain causes a forward-reference
--     FK error (companies_canonical_id_fkey). Re-point every merged row directly
--     at the FINAL canonical (a row whose own canonical_id IS NULL).
--  2. Delete junk "0" phone contacts (no real digit) created from bad source
--     data, so the UI doesn't show a phone icon for a number that isn't there.

BEGIN;

-- 1. Flatten chains for companies (iterate until nothing collapses; capped).
DO $$
DECLARE n int; i int := 0;
BEGIN
  LOOP
    UPDATE companies c SET canonical_id = p.canonical_id
      FROM companies p
     WHERE c.canonical_id = p.id AND p.canonical_id IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    i := i + 1;
    EXIT WHEN n = 0 OR i > 100;
  END LOOP;
END $$;

-- …and for people.
DO $$
DECLARE n int; i int := 0;
BEGIN
  LOOP
    UPDATE people c SET canonical_id = p.canonical_id
      FROM people p
     WHERE c.canonical_id = p.id AND p.canonical_id IS NOT NULL;
    GET DIAGNOSTICS n = ROW_COUNT;
    i := i + 1;
    EXIT WHEN n = 0 OR i > 100;
  END LOOP;
END $$;

-- 2. Remove junk "0" phone contacts (no digit 1-9).
DELETE FROM company_contacts WHERE type = 'phone' AND value !~ '[1-9]';
DELETE FROM person_contacts  WHERE type = 'phone' AND value !~ '[1-9]';

-- 3. Belt-and-suspenders: make the self-referential canonical FK deferrable so
--    the mirror sync is never blocked by row ordering. Defensive — ignore if a
--    constraint name differs across environments.
DO $$
BEGIN
  BEGIN
    ALTER TABLE companies ALTER CONSTRAINT companies_canonical_id_fkey DEFERRABLE INITIALLY DEFERRED;
  EXCEPTION WHEN others THEN NULL; END;
  BEGIN
    ALTER TABLE people ALTER CONSTRAINT people_canonical_id_fkey DEFERRABLE INITIALLY DEFERRED;
  EXCEPTION WHEN others THEN NULL; END;
END $$;

INSERT INTO schema_migrations (version) VALUES ('0029') ON CONFLICT DO NOTHING;

COMMIT;

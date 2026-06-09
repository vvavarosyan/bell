-- 030_clean_junk_contact_columns.sql
-- The company row's contact icons (ContactIcons) read the companies.phone /
-- companies.email COLUMNS directly. ~17k QCCI listings have phone = '0' (the
-- directory had no number, stored as a literal "0"). "0" is a truthy string, so
-- the phone icon lights up and the tooltip shows "0". Migration 029 only cleaned
-- the company_contacts TABLE, never these columns — so the icon kept showing.
-- Null out any phone with no real digit (1-9) and any email with no '@'.

BEGIN;

UPDATE companies SET phone = NULL
 WHERE phone IS NOT NULL AND phone !~ '[1-9]';

UPDATE companies SET email = NULL
 WHERE email IS NOT NULL AND email::text !~ '@';

-- Same hygiene for people, whose rows render the identical ContactIcons.
UPDATE people SET phone = NULL
 WHERE phone IS NOT NULL AND phone !~ '[1-9]';

UPDATE people SET email = NULL
 WHERE email IS NOT NULL AND email::text !~ '@';

INSERT INTO schema_migrations (version) VALUES ('0030') ON CONFLICT DO NOTHING;

COMMIT;

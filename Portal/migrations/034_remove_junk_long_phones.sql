-- 034_remove_junk_long_phones.sql
-- Some phone fields got 14-digit garbage (millisecond-timestamp-style IDs, e.g.
-- "17730826900593") that are not real phone numbers. Real numbers — including
-- Qatar's "00974"-prefixed form — are at most 13 digits. Drop anything longer
-- from the contact tables and the phone columns. Ingest now rejects them too
-- (normalizePhone caps at 13 digits).

BEGIN;

DELETE FROM company_contacts
 WHERE type = 'phone' AND length(regexp_replace(value, '[^0-9]', '', 'g')) > 13;

DELETE FROM person_contacts
 WHERE type = 'phone' AND length(regexp_replace(value, '[^0-9]', '', 'g')) > 13;

UPDATE companies SET phone = NULL
 WHERE phone IS NOT NULL AND length(regexp_replace(phone, '[^0-9]', '', 'g')) > 13;

UPDATE people SET phone = NULL
 WHERE phone IS NOT NULL AND length(regexp_replace(phone, '[^0-9]', '', 'g')) > 13;

INSERT INTO schema_migrations (version) VALUES ('0034') ON CONFLICT DO NOTHING;

COMMIT;

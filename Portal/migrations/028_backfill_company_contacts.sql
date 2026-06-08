-- 028_backfill_company_contacts.sql
-- Ingest historically populated only the companies.phone / companies.email
-- COLUMNS, never the company_contacts table — but the company detail drawer's
-- Contacts panel (and dedup merges) read company_contacts. So directly-ingested
-- numbers/emails were invisible in the drawer and could be dropped on merge.
-- This backfills company_contacts from the existing columns. Idempotent.

BEGIN;

-- Phones: digits + leading '+', skip anything with fewer than 6 digits.
INSERT INTO company_contacts (company_id, type, value, value_display, source)
SELECT id,
       'phone',
       regexp_replace(phone, '[^0-9+]', '', 'g'),
       phone,
       'backfill'
  FROM companies
 WHERE phone IS NOT NULL
   AND length(regexp_replace(phone, '[^0-9]', '', 'g')) >= 6
ON CONFLICT (company_id, type, value) DO NOTHING;

-- Emails: lower-cased, must contain an '@'.
INSERT INTO company_contacts (company_id, type, value, value_display, source)
SELECT id,
       'email',
       lower(trim(email::text)),
       email::text,
       'backfill'
  FROM companies
 WHERE email IS NOT NULL
   AND position('@' IN email::text) > 1
ON CONFLICT (company_id, type, value) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('0028') ON CONFLICT DO NOTHING;

COMMIT;

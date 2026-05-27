-- =============================================================================
-- Bell Data Intelligence — multi-contact storage (v0002)
-- =============================================================================
-- A company or person can have many emails and phone numbers from many
-- different sources (LinkedIn profile scrape, Google Maps listing, website
-- footer crawl, manual admin entry, etc). This migration introduces normalized
-- contact tables so we can:
--   - Store every email/phone we ever discover
--   - Track which source (and which page) found each one
--   - Mark one as "primary" for backward-compat display
--   - Verify or invalidate a contact without losing the audit trail
--
-- The existing companies.email / phone / people.email / phone columns are
-- preserved for backward compatibility — they're auto-synced from the
-- is_primary contact in the API layer.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- company_contacts — one row per (company, type, value)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS company_contacts (
    id              bigserial PRIMARY KEY,
    company_id      bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    type            text NOT NULL CHECK (type IN ('email','phone','social')),
    value           text NOT NULL,                  -- normalized: lower-cased emails, digits-only phones (kept with leading +)
    value_display   text,                           -- pretty version: 'Sales: +974 4444 5555' or original casing

    -- Provenance — what enrichment stage or source found it
    source          text NOT NULL,                  -- e.g. 'stage2-linkedin', 'stage5-gmaps', 'stage6-website',
                                                    --      'qfc-ingest', 'manual'
    source_url      text,                           -- specific page where it was found (homepage, contact page, …)
    source_label    text,                           -- e.g. 'Footer', 'Contact form', 'Press release'

    is_primary      boolean NOT NULL DEFAULT false,
    is_verified     boolean NOT NULL DEFAULT false, -- true once we've confirmed (e.g. round-trip email, manual mark)
    verified_at     timestamptz,

    extra_fields    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    -- One row per (company, type, value). Re-discovering the same value just
    -- updates the existing row.
    UNIQUE (company_id, type, value)
);

CREATE INDEX IF NOT EXISTS idx_company_contacts_company ON company_contacts(company_id);
CREATE INDEX IF NOT EXISTS idx_company_contacts_value   ON company_contacts(value);
-- Only one primary per (company, type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_contacts_primary
  ON company_contacts(company_id, type) WHERE is_primary = true;


-- -----------------------------------------------------------------------------
-- person_contacts — same shape, scoped to a person
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS person_contacts (
    id              bigserial PRIMARY KEY,
    person_id       bigint NOT NULL REFERENCES people(id) ON DELETE CASCADE,

    type            text NOT NULL CHECK (type IN ('email','phone','social')),
    value           text NOT NULL,
    value_display   text,

    source          text NOT NULL,                  -- e.g. 'stage3.5-harvestapi', 'stage6-website', 'manual'
    source_url      text,
    source_label    text,

    is_primary      boolean NOT NULL DEFAULT false,
    is_verified     boolean NOT NULL DEFAULT false,
    verified_at     timestamptz,

    extra_fields    jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),

    UNIQUE (person_id, type, value)
);

CREATE INDEX IF NOT EXISTS idx_person_contacts_person ON person_contacts(person_id);
CREATE INDEX IF NOT EXISTS idx_person_contacts_value  ON person_contacts(value);
CREATE UNIQUE INDEX IF NOT EXISTS idx_person_contacts_primary
  ON person_contacts(person_id, type) WHERE is_primary = true;


-- -----------------------------------------------------------------------------
-- Backfill — promote existing single email/phone columns into contact rows
-- -----------------------------------------------------------------------------

-- Companies → company_contacts
INSERT INTO company_contacts (company_id, type, value, value_display, source, is_primary)
SELECT id, 'email', lower(trim(email::text)), trim(email::text),
       COALESCE(extra_fields->>'email_source', 'backfill'), true
FROM companies
WHERE email IS NOT NULL AND trim(email::text) <> ''
ON CONFLICT (company_id, type, value) DO NOTHING;

INSERT INTO company_contacts (company_id, type, value, value_display, source, is_primary)
SELECT id, 'phone', regexp_replace(phone, '[^0-9+]', '', 'g'), phone,
       COALESCE(extra_fields->>'phone_source', 'backfill'), true
FROM companies
WHERE phone IS NOT NULL AND trim(phone) <> ''
ON CONFLICT (company_id, type, value) DO NOTHING;

-- People → person_contacts
INSERT INTO person_contacts (person_id, type, value, value_display, source, is_primary)
SELECT id, 'email', lower(trim(email::text)), trim(email::text),
       'backfill', true
FROM people
WHERE email IS NOT NULL AND trim(email::text) <> ''
ON CONFLICT (person_id, type, value) DO NOTHING;

INSERT INTO person_contacts (person_id, type, value, value_display, source, is_primary)
SELECT id, 'phone', regexp_replace(phone, '[^0-9+]', '', 'g'), phone,
       'backfill', true
FROM people
WHERE phone IS NOT NULL AND trim(phone) <> ''
ON CONFLICT (person_id, type, value) DO NOTHING;


-- -----------------------------------------------------------------------------
-- updated_at auto-touch trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_touch_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS touch_company_contacts ON company_contacts;
CREATE TRIGGER touch_company_contacts BEFORE UPDATE ON company_contacts
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

DROP TRIGGER IF EXISTS touch_person_contacts ON person_contacts;
CREATE TRIGGER touch_person_contacts BEFORE UPDATE ON person_contacts
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

COMMIT;

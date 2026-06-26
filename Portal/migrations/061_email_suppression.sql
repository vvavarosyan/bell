-- =============================================================================
-- Email suppression + per-contact email health (v0061)
-- =============================================================================
-- WS4 accuracy loop. Two parts:
--   1. A GLOBAL suppression list of addresses we must never send to again
--      (hard bounce / spam complaint / manual). A hard bounce is global truth —
--      the mailbox does not exist — so this is deliberately NOT tenant-scoped:
--      it also protects the canonical data quality for everyone.
--   2. email_status + last_verified_at on the contact tables, so an address
--      carries its latest deliverability verdict (verified | bounced |
--      complained | invalid | catch_all | unknown) and a freshness timestamp we
--      can use to re-verify stale data. is_verified / verified_at already exist;
--      these add granularity + freshness without disturbing them.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS email_suppressions (
  email       text PRIMARY KEY,          -- normalized, lowercase
  reason      text NOT NULL,             -- bounced | complained | manual
  detail      text,
  source      text,                      -- resend-webhook | manual | ...
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE person_contacts  ADD COLUMN IF NOT EXISTS email_status     text;
ALTER TABLE person_contacts  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;
ALTER TABLE company_contacts ADD COLUMN IF NOT EXISTS email_status     text;
ALTER TABLE company_contacts ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

-- Backfill existing verified emails so the new column isn't blank for them.
UPDATE person_contacts
   SET email_status = 'verified',
       last_verified_at = COALESCE(last_verified_at, verified_at)
 WHERE type = 'email' AND is_verified = true AND email_status IS NULL;

UPDATE company_contacts
   SET email_status = 'verified',
       last_verified_at = COALESCE(last_verified_at, verified_at)
 WHERE type = 'email' AND is_verified = true AND email_status IS NULL;

CREATE INDEX IF NOT EXISTS idx_person_contacts_email_status
  ON person_contacts (email_status) WHERE type = 'email';
CREATE INDEX IF NOT EXISTS idx_company_contacts_email_status
  ON company_contacts (email_status) WHERE type = 'email';

COMMIT;

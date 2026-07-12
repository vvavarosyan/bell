-- 081_user_id_verification.sql
-- Phase 4 (Val 2026-07-12): collect a registrant's national ID at signup FOR
-- VERIFICATION — Qatar QID, or a Passport number for a company/person expanding
-- INTO Qatar. The number itself is stored ENCRYPTED at rest (AES-256-GCM, see
-- server/lib/pii.js); only a masked last-4 + the type are kept in the clear for
-- display. Access to the decrypted value is admin-only and logged.
-- Consent + purpose language lives in the Terms of Use (per Val). Collection is
-- gated OFF by default (env BDI_COLLECT_ID) until the lawful basis is confirmed.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS id_type         text,           -- 'qid' | 'passport'
  ADD COLUMN IF NOT EXISTS id_value_enc    text,           -- AES-256-GCM blob (base64) — never plaintext
  ADD COLUMN IF NOT EXISTS id_last4        text,           -- masked display only
  ADD COLUMN IF NOT EXISTS id_collected_at timestamptz;    -- when the registrant provided it

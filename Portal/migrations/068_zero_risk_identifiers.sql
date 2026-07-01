-- 068 — 0 Risk: legal-identifier fields required before the agreement.
--
-- These are collected during onboarding, gate the agreement (the user can't see
-- it until they're provided), and are AUTO-FILLED into the agreement the company
-- receives to sign & stamp. Stored on tenant_profile (reused ICP/profile table).

ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS cr_number      text;   -- Commercial Registration number
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS cc_number      text;   -- Computer Card number
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS qid_number     text;   -- Authorised signatory QID number
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS contact_number text;   -- primary contact phone
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS contact_email  text;   -- primary contact email

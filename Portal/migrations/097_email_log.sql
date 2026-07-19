-- The universal email ledger (Val: "Bell must know all email counts and everything").
--
-- EVERY outbound email from EVERY Bell system passes through lib/email.js sendEmail() — this
-- table is written there, so nothing can send without leaving a row: outreach, follow-ups,
-- digests, opt-in welcomes, reply-forwards, CRM sends, sequences, team invites, notifications,
-- template tests. The Resend webhook upgrades statuses (delivered/opened/bounced/complained)
-- by provider_message_id. crm_emails remains the CRM's own record (with bodies); this ledger
-- is the platform-wide counting truth from 2026-07-19 onward.

BEGIN;

CREATE TABLE IF NOT EXISTS email_log (
  id                  bigserial PRIMARY KEY,
  system              text NOT NULL,               -- outreach-engine | outreach-test | outreach-forward |
                                                   -- digest | optin-welcome | sequence | crm | crm-forward |
                                                   -- invite | notification | template-test | transactional
  channel             text NOT NULL DEFAULT 'transactional'   -- which Resend account: outreach | transactional
                        CHECK (channel IN ('outreach','transactional')),
  tenant_id           bigint,
  from_email          text,
  to_email            text NOT NULL,
  subject             text,
  status              text NOT NULL DEFAULT 'sent'
                        CHECK (status IN ('sent','failed','delivered','opened','bounced','complained')),
  provider_message_id text,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_log_created_idx  ON email_log (created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_system_idx   ON email_log (system, created_at DESC);
CREATE INDEX IF NOT EXISTS email_log_provider_idx ON email_log (provider_message_id);

INSERT INTO schema_migrations (version) VALUES ('0097') ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- CRM email — outreach + history (v0023)
-- =============================================================================
-- Phase 2 of the CRM: sending email (via Resend, from the bell.qa domain) to a
-- CRM record, with full history threaded into the activity timeline. Per-tenant,
-- prod-owned, NOT mirrored (like the rest of the CRM).
--
-- For now only platform_admin may SEND (one verified domain). Later, tenants add
-- their own sending domains via DNS and send as themselves.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS crm_emails (
  id                  bigserial PRIMARY KEY,
  tenant_id           bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id           bigint REFERENCES crm_records(id) ON DELETE CASCADE,
  direction           text NOT NULL DEFAULT 'out' CHECK (direction IN ('out','in')),
  from_email          text,
  to_email            text NOT NULL,
  cc_email            text,
  reply_to            text,
  subject             text,
  body_html           text,
  body_text           text,
  status              text NOT NULL DEFAULT 'queued'  -- queued | sent | failed | delivered | opened
                        CHECK (status IN ('queued','sent','failed','delivered','opened')),
  provider            text DEFAULT 'resend',
  provider_message_id text,
  error               text,
  sent_by             text,                           -- user email who sent it
  created_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz
);
CREATE INDEX IF NOT EXISTS idx_crm_emails_record ON crm_emails (record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_emails_tenant ON crm_emails (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_email_templates (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  subject     text,
  body        text,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_email_templates_tenant ON crm_email_templates (tenant_id, name);

INSERT INTO schema_migrations (version) VALUES ('0023') ON CONFLICT DO NOTHING;

COMMIT;

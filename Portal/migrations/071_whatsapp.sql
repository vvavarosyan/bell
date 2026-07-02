-- 071 — WhatsApp in the CRM (Phase F1, Val-approved 2026-07-02).
-- Official Meta WhatsApp Business Cloud API, per tenant. A tenant connects its
-- own WhatsApp Business number; messages thread onto CRM records; the whole
-- team (any CRM-access member) shares one inbox per record.
--
-- Runtime/customer state — NOT part of the local→prod mirror (like crm_emails,
-- notifications). Lives on prod where the CRM + Resend already live.

BEGIN;

-- Per-tenant connection. The access_token is a secret Bell stores to send on
-- the tenant's behalf; it is NEVER returned by the API (only `connected` + the
-- display number are exposed).
CREATE TABLE IF NOT EXISTS whatsapp_config (
  tenant_id           bigint PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  phone_number_id     text,          -- Meta: the WABA phone number id (sends go through this)
  business_account_id text,          -- Meta: WABA id
  access_token        text,          -- Meta: long-lived / system-user token (secret)
  verify_token        text,          -- our webhook verify token (tenant picks it)
  display_number      text,          -- human-readable, e.g. +974 5555 5555
  active              boolean NOT NULL DEFAULT true,
  connected_by        text,
  connected_at        timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
-- Fast inbound routing: which tenant owns an incoming phone_number_id.
CREATE INDEX IF NOT EXISTS idx_whatsapp_config_phone ON whatsapp_config (phone_number_id) WHERE phone_number_id IS NOT NULL;

-- One row per message, threaded to a CRM record. Mirrors crm_emails.
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id            bigserial PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id     bigint REFERENCES crm_records(id) ON DELETE SET NULL,
  direction     text NOT NULL DEFAULT 'out' CHECK (direction IN ('out','in')),
  wa_from       text,
  wa_to         text,
  wa_message_id text,                -- Meta's message id (for status callbacks + dedupe)
  body          text,
  status        text NOT NULL DEFAULT 'queued'   -- queued | sent | delivered | read | failed | received
                  CHECK (status IN ('queued','sent','delivered','read','failed','received')),
  error         text,
  sent_by       text,                -- user email who sent (NULL for inbound)
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_whatsapp_msgs_record ON whatsapp_messages (record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_msgs_tenant ON whatsapp_messages (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_msgs_waid ON whatsapp_messages (wa_message_id) WHERE wa_message_id IS NOT NULL;

COMMIT;

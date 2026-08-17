-- Per-tenant SMTP: a customer's CRM mail leaves through their OWN mail server.
--
-- Bell already lets a tenant send from their own DOMAIN (tenant_email_domains, migration 048)
-- through Bell's Resend account. This adds the other half a customer asks for: send through
-- their own server, with their own credentials, so the mail sits in their Sent folder, their
-- IT keeps control, and no DNS delegation to Bell is required.
--
-- ⚠️ THE HARD PART IS NOT SENDING, IT IS KNOWING WHAT HAPPENED NEXT. Resend tells Bell about
-- deliveries, opens, bounces and complaints through a webhook. A customer's own SMTP server
-- tells Bell nothing: a bounce comes back as a delivery-status report into THEIR mailbox, and
-- an open is invisible to everyone. So this migration also carries what the two replacement
-- signals need:
--   · imap_* — Bell polls the tenant's own mailbox (the same imapflow machinery the outreach
--     reply poller already uses) and reads the bounce reports the mail server delivered there.
--   · open tracking — a per-message token behind a 1x1 image, so an open is recorded from
--     Bell's own server rather than from a provider that is no longer in the path.
--
-- The password and the IMAP password are encrypted at rest with the SAME AES-256-GCM helper
-- that protects QID/passport (lib/pii.js). ⚠️ No route may ever return these columns; the
-- code path that reads them is the transport, and nothing else.

ALTER TABLE tenant_email_domains
  ADD COLUMN IF NOT EXISTS transport             text NOT NULL DEFAULT 'resend',
  ADD COLUMN IF NOT EXISTS smtp_host             text,
  ADD COLUMN IF NOT EXISTS smtp_port             integer,
  ADD COLUMN IF NOT EXISTS smtp_secure           boolean,      -- true = implicit TLS (465), false = STARTTLS (587)
  ADD COLUMN IF NOT EXISTS smtp_username         text,
  ADD COLUMN IF NOT EXISTS smtp_password_enc     text,
  ADD COLUMN IF NOT EXISTS smtp_verified_at      timestamptz,
  ADD COLUMN IF NOT EXISTS smtp_last_error       text,
  -- Bounce feedback: the tenant's own mailbox, read-only, polled for delivery reports.
  ADD COLUMN IF NOT EXISTS imap_host             text,
  ADD COLUMN IF NOT EXISTS imap_port             integer,
  ADD COLUMN IF NOT EXISTS imap_secure           boolean,
  ADD COLUMN IF NOT EXISTS imap_username         text,
  ADD COLUMN IF NOT EXISTS imap_password_enc     text,
  ADD COLUMN IF NOT EXISTS imap_last_uid         bigint,       -- resume point, so a poll never re-reads
  ADD COLUMN IF NOT EXISTS imap_last_polled_at   timestamptz,
  ADD COLUMN IF NOT EXISTS imap_last_error       text;

-- Only two transports exist. An unknown value must fail loudly rather than fall through to a
-- default (Rule 2.1): a typo here would silently send a tenant's mail from Bell's account.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tenant_email_domains_transport_chk') THEN
    ALTER TABLE tenant_email_domains
      ADD CONSTRAINT tenant_email_domains_transport_chk CHECK (transport IN ('resend','smtp'));
  END IF;
END $$;

-- Open tracking, transport-independent. `open_token` is minted per sent email; the pixel route
-- looks the row up by it. Nullable because every email sent before today has none — an absent
-- token means "not tracked", never "not opened".
ALTER TABLE crm_emails
  ADD COLUMN IF NOT EXISTS open_token   text,
  ADD COLUMN IF NOT EXISTS opened_at    timestamptz,
  ADD COLUMN IF NOT EXISTS open_count   integer NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_emails_open_token
  ON crm_emails (open_token) WHERE open_token IS NOT NULL;

-- A bounce report names the message it is about by its Message-ID. Matching that back to the
-- stored row is the whole join, so it must not be a scan of every email Bell ever sent.
CREATE INDEX IF NOT EXISTS idx_crm_emails_provider_message_id
  ON crm_emails (provider_message_id) WHERE provider_message_id IS NOT NULL;

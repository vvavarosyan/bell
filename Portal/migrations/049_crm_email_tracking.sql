-- Email open / click tracking (Phase 1 outreach metrics).
-- Populated by the Resend events webhook (POST /api/resend-webhook).
ALTER TABLE crm_emails ADD COLUMN IF NOT EXISTS opened_at  timestamptz;
ALTER TABLE crm_emails ADD COLUMN IF NOT EXISTS clicked_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_crm_emails_msgid ON crm_emails(provider_message_id);

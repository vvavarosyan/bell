-- Make a bounce/complaint a first-class, QUERYABLE email status.
--
-- Deliverability defect (Phase 1, Val's self-marketing prep): the Resend webhook wrote a
-- hard bounce and a spam complaint as status='failed' with the real reason buried in the
-- error text (023_crm_email.sql capped status at queued/sent/failed/delivered/opened). So
-- bounce rate and complaint rate — the two numbers that decide whether a sending domain
-- survives (Resend terminates at 4% bounce / 0.08% complaint) — could not be computed from
-- the data. Add 'bounced' and 'complained' to the allowed set so they are countable.
--
-- The webhook (routes/resend_webhook.js) is updated in the same change to write these.
-- Existing 'failed'/'email.bounced' rows are backfilled to the new status.

ALTER TABLE crm_emails DROP CONSTRAINT IF EXISTS crm_emails_status_check;
ALTER TABLE crm_emails
  ADD CONSTRAINT crm_emails_status_check
  CHECK (status IN ('queued','sent','failed','delivered','opened','bounced','complained'));

-- Backfill: rows the webhook previously marked failed for a bounce/complaint.
UPDATE crm_emails SET status = 'complained' WHERE status = 'failed' AND error = 'email.complained';
UPDATE crm_emails SET status = 'bounced'    WHERE status = 'failed' AND error = 'email.bounced';

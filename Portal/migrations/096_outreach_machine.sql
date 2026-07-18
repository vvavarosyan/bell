-- Outreach machine v2: follow-up sequences, circuit breaker, reply intelligence,
-- conversion attribution, Qatar holidays.
--
-- The autonomous layer on top of migration 095. Every addition here is a safety or
-- growth feature:
--   touches        — polite follow-ups (max_touches per campaign, stop on reply/unsub/bounce)
--   breaker        — outreach_state holds a global circuit breaker: if bounces/complaints
--                    spike, the machine pauses ITSELF and says why
--   reply_class    — what the reply meant (interested / not_interested / auto_reply /
--                    remove_me), so hot leads surface and "remove me" is honoured as an opt-out
--   converted      — the snowball proof: an outreach target whose company signed up
--   qatar_holidays — days the machine must stay silent (movable feasts added by admin;
--                    fixed civic days computed in code)

BEGIN;

-- Follow-up cadence per campaign.
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS max_touches   int NOT NULL DEFAULT 3;
ALTER TABLE outreach_campaigns ADD COLUMN IF NOT EXISTS touch_gap_days int NOT NULL DEFAULT 4;

-- 'sending' = the atomic in-flight claim (compare-and-set before the provider call), so two
-- concurrent dispatchers can never double-send the same target. A crash mid-send leaves the row
-- in 'sending'; the tick sweeps stale ones to 'failed' (surfaced, never silently retried —
-- retrying could double-send if the crash was after the provider accepted).
ALTER TABLE outreach_targets DROP CONSTRAINT IF EXISTS outreach_targets_status_check;
ALTER TABLE outreach_targets ADD CONSTRAINT outreach_targets_status_check
  CHECK (status IN ('pending','sending','drafted','skipped','sent','replied','bounced','unsubscribed','failed'));

-- Per-target machine state.
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS touch_count        int NOT NULL DEFAULT 0;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS next_touch_at      timestamptz;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS reply_class        text
  CHECK (reply_class IS NULL OR reply_class IN ('interested','not_interested','auto_reply','remove_me','unclassified'));
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS reply_text         text;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS converted_at       timestamptz;
ALTER TABLE outreach_targets ADD COLUMN IF NOT EXISTS converted_tenant_id bigint;
CREATE INDEX IF NOT EXISTS outreach_targets_followup_idx
  ON outreach_targets (campaign_id, status, next_touch_at) WHERE status = 'sent';

-- Global machine state (circuit breaker, pre-flight results). Key/value, tiny.
CREATE TABLE IF NOT EXISTS outreach_state (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Days the machine must not send (Qatar public holidays — movable ones like the Eids are
-- announced yearly and added by the admin; fixed civic days are computed in code).
CREATE TABLE IF NOT EXISTS qatar_holidays (
  day  date PRIMARY KEY,
  name text NOT NULL
);

INSERT INTO schema_migrations (version) VALUES ('0096') ON CONFLICT DO NOTHING;

COMMIT;

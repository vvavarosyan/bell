-- A target whose email never left Bell has not been contacted, and must not be spent as if it had.
--
-- outreach/engine.js marked EVERY send failure terminal: status='failed' with next_touch_at
-- cleared, which is a state the picker never selects again. That is correct when the RECIPIENT is
-- the reason — a suppressed address will still be suppressed tomorrow. It is wrong when BELL is
-- the reason. A missing provider key, a malformed field, a provider outage: none of those say
-- anything about the company. They burned a real Qatar prospect, permanently and silently, for a
-- fault on Bell's own side.
--
-- Found 2026-08-10 while tracing why Val's CRM test returned `resend 422: Invalid reply_to`. The
-- same class of error reaches the outreach machine, which is ARMED on production — and the
-- circuit breaker could not see it, because the breaker's window is
-- `status IN ('sent','delivered','opened','bounced','complained')` and 'failed' is not in it.
-- Nor did failures consume the daily allowance (that counts `sent_at`, only stamped on success),
-- so the 60-second tick kept pulling a FRESH batch and burning it. A brake now stops the machine
-- after five consecutive failures (outreach/machine.js), which bounds the damage — and this
-- column is how the targets caught in that burst get their turn back once Val fixes the cause.
--
-- outreach_targets is NOT in MIRROR_TABLES: the machine runs on production and owns these rows,
-- so this column is added wherever the migration runs and nothing syncs.

ALTER TABLE outreach_targets
  ADD COLUMN IF NOT EXISTS never_sent boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN outreach_targets.never_sent IS
  'This target failed for a reason on Bell''s side and no email reached the recipient. Reset to '
  'pending when the cause is fixed (resetBreaker does this). NOT set for recipient-fault failures '
  'such as a suppressed address, which are correctly terminal.';

-- Existing rows keep false. Backfilling would be a guess: the failures already recorded cannot be
-- classified after the fact, because the distinction being made here was not stored at the time.
CREATE INDEX IF NOT EXISTS idx_outreach_targets_never_sent
  ON outreach_targets (campaign_id) WHERE never_sent = true;

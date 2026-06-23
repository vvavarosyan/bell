-- 052: extra-credit top-up purchases + payment grace tracking.
--   • credit_purchases — one row per paid top-up, keyed by the Stripe invoice id,
--     so the webhook grants the credits exactly once (idempotent across retries).
--   • tenants.past_due_at — when a subscription payment first failed, so we can
--     give a 24h grace window before freezing access.
-- Per-tenant customer state — NOT part of the local→prod mirror.

CREATE TABLE IF NOT EXISTS credit_purchases (
  stripe_invoice_id text PRIMARY KEY,
  tenant_id  bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credits    integer NOT NULL,
  amount     integer,                 -- smallest currency unit (halalas)
  currency   text DEFAULT 'qar',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_tenant ON credit_purchases (tenant_id, created_at DESC);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS past_due_at timestamptz;

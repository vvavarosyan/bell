-- 059 — Stage 11 (Local Engine 5 · Company Facts Finder) tracking flags +
-- heartbeat counters for facts. Mirrors the stage8/9/10 pattern. Idempotent.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage11_status text NOT NULL DEFAULT 'pending';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage11_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_companies_stage11_pending
  ON companies (id) WHERE stage11_at IS NULL;

ALTER TABLE engine_heartbeat ADD COLUMN IF NOT EXISTS facts_total integer NOT NULL DEFAULT 0;
ALTER TABLE engine_heartbeat ADD COLUMN IF NOT EXISTS facts_left  integer;

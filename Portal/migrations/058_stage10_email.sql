-- 058 — Stage 10 (Local Engine 4 · Email Finder) tracking flags + heartbeat
-- counters for emails. Mirrors the stage7/8/9 pattern. Idempotent.

-- Per-company stage-10 frontier flags (decision-maker email finding).
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage10_status text NOT NULL DEFAULT 'pending';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage10_at     timestamptz;

-- Partial index so the frontier query (stage10_at IS NULL) stays fast.
CREATE INDEX IF NOT EXISTS idx_companies_stage10_pending
  ON companies (id) WHERE stage10_at IS NULL;

-- Heartbeat: let the always-on engine report emails found this run + remaining.
ALTER TABLE engine_heartbeat ADD COLUMN IF NOT EXISTS email_total integer NOT NULL DEFAULT 0;
ALTER TABLE engine_heartbeat ADD COLUMN IF NOT EXISTS email_left  integer;

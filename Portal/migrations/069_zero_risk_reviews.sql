-- 069 — 0 Risk admin review decisions (approve / reject / request-resubmission)
-- with one-or-many reasons + a free-text note, kept as history.
--
-- tenants.zero_risk_status (plain text, no CHECK) gains two values used from
-- this migration on:
--   'resubmission_required' — yellow: admin asked for fixes; the portal form
--                             UNLOCKS so the company can correct + resubmit.
--   'rejected'              — red: terminal decision; form stays locked.

BEGIN;

CREATE TABLE IF NOT EXISTS zero_risk_reviews (
  id         bigserial PRIMARY KEY,
  tenant_id  bigint NOT NULL,
  decision   text   NOT NULL,              -- 'approved' | 'rejected' | 'resubmission_required'
  reasons    text[] NOT NULL DEFAULT '{}', -- preset reasons ticked by the admin
  note       text,                         -- free-text comment shown to the user
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zr_reviews_tenant ON zero_risk_reviews (tenant_id, id DESC);

COMMIT;

-- 036_detail_requests.sql
-- "Request more details" flow: a user (on a company they've already revealed)
-- asks for specific missing details; the request lands in an admin queue to
-- approve/reject; once approved the admin enriches (auto or manual) and marks it
-- fulfilled; the requester sees the status update in the company drawer.

BEGIN;

CREATE TABLE IF NOT EXISTS detail_requests (
  id            bigserial PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by  text,                                   -- requesting user's email
  note          text,                                   -- what they want
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','approved','rejected','fulfilled')),
  admin_note    text,                                   -- admin's reply / reason
  decided_by    text,
  decided_at    timestamptz,
  fulfilled_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_detail_requests_status  ON detail_requests (status);
CREATE INDEX IF NOT EXISTS idx_detail_requests_company ON detail_requests (company_id);
CREATE INDEX IF NOT EXISTS idx_detail_requests_tenant  ON detail_requests (tenant_id);

INSERT INTO schema_migrations (version) VALUES ('0036') ON CONFLICT DO NOTHING;

COMMIT;

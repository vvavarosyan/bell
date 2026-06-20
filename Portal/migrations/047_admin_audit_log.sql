-- 047_admin_audit_log.sql
-- Audit trail for platform-admin actions on customer accounts (credit adjusts,
-- suspends, plan changes, notifications, impersonation). Operational data — it
-- lives wherever the admin acts (admin.bell.qa = prod), is NOT a mirror table.

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id               bigserial PRIMARY KEY,
  actor_user_id    bigint REFERENCES users(id)   ON DELETE SET NULL,
  actor_email      text,
  target_tenant_id bigint REFERENCES tenants(id) ON DELETE CASCADE,
  action           text NOT NULL,             -- credits_adjust | suspend | reactivate | plan_change | notify | impersonate
  detail           jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_tenant ON admin_audit_log (target_tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_recent ON admin_audit_log (created_at DESC);

-- 042_notifications.sql
-- In-app notification system. Per-user (recipient), per-tenant. Created on the
-- production app by events + admin announcements; NOT part of the local→prod
-- mirror (notifications are runtime, not canonical data). tenant_id is present
-- from day one per the multi-tenant architecture doctrine.

CREATE TABLE IF NOT EXISTS notifications (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL,
  user_id     bigint NOT NULL,                          -- recipient (users.id)
  category    text   NOT NULL DEFAULT 'system',         -- data | account | engagement | announcement | system
  type        text,                                     -- finer event key (e.g. 'credits_low', 'report_ready')
  title       text   NOT NULL,
  body        text,
  link        text,                                     -- in-app route to open on click (e.g. '/companies?id=123')
  icon        text,                                     -- icon key for the UI
  data        jsonb,                                    -- extra structured payload
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON notifications (user_id, read_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant  ON notifications (tenant_id, created_at DESC);

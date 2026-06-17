-- 043_announcements.sql
-- Track admin announcements so they can be listed and RECALLED (which removes
-- the notifications they created from every recipient). notifications gain an
-- announcement_id link so a recall can target exactly one announcement.

CREATE TABLE IF NOT EXISTS announcements (
  id          bigserial PRIMARY KEY,
  scope       text NOT NULL DEFAULT 'tenant',   -- 'platform' (all users) | 'tenant'
  tenant_id   bigint,                            -- null for platform-wide
  title       text NOT NULL,
  body        text,
  link        text,
  sent_count  integer NOT NULL DEFAULT 0,
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  recalled_at timestamptz
);

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS announcement_id bigint;
CREATE INDEX IF NOT EXISTS idx_notifications_announcement ON notifications (announcement_id);

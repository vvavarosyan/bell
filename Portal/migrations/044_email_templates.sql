-- 044_email_templates.sql
-- Admin-editable email templates. Each row overrides the built-in default for a
-- template `key` (e.g. 'base' — the shared branded shell used by every email).
-- The renderer uses the DB row when present, else the code default, so admins
-- can edit the HTML/subject (style + content) without a deploy. "Reset" deletes
-- the row to fall back to the default.

CREATE TABLE IF NOT EXISTS email_templates (
  key         text PRIMARY KEY,            -- 'base', and future per-type keys
  name        text NOT NULL,
  subject     text,                         -- subject line (supports {{placeholders}})
  html        text NOT NULL,                -- full HTML (supports {{placeholders}})
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

-- 072: Bella (Phase G1) — conversations, messages, action audit, scheduled
-- tasks, and per-day usage budgets.
--
-- Design notes:
--   * All tables are tenant-scoped from day one (bell_architecture_doctrine).
--   * PROD-RUNTIME tables (like feed_events / whatsapp_*): NOT part of the
--     local→prod mirror. Each environment owns its own rows.
--   * user_id is a plain bigint (no FK): the local engine's synthetic
--     platform_admin has user id 0 which never exists in users.
--   * bella_messages.content_json holds the exact Anthropic content blocks so
--     a conversation can be replayed to the model verbatim; `content` is the
--     human-readable text for the UI; `meta` carries UI extras (tool chips).

CREATE TABLE IF NOT EXISTS bella_conversations (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    BIGINT NOT NULL,
  user_id      BIGINT NOT NULL,
  title        TEXT,
  status       TEXT NOT NULL DEFAULT 'active',      -- active | archived
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bella_conversations_owner_idx
  ON bella_conversations (tenant_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS bella_messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES bella_conversations(id) ON DELETE CASCADE,
  tenant_id       BIGINT NOT NULL,
  user_id         BIGINT NOT NULL,
  role            TEXT NOT NULL,                    -- user | assistant
  content         TEXT NOT NULL DEFAULT '',         -- display text (may be '' for pure tool-result turns)
  content_json    JSONB,                            -- Anthropic content blocks for model replay
  meta            JSONB,                            -- UI extras: { tools: [{name, summary}], navigate: 'crm' }
  usage           JSONB,                            -- assistant turns: {input_tokens, output_tokens}
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bella_messages_conv_idx
  ON bella_messages (conversation_id, id);

-- Every tool call Bella makes, with actor = the user she acted for.
CREATE TABLE IF NOT EXISTS bella_actions (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  user_id         BIGINT NOT NULL,
  conversation_id BIGINT,
  tool            TEXT NOT NULL,
  args            JSONB NOT NULL DEFAULT '{}'::jsonb,
  status          TEXT NOT NULL DEFAULT 'done',     -- done | error | proposed | approved | denied
  result_summary  TEXT,
  credits_cost    INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bella_actions_owner_idx
  ON bella_actions (tenant_id, user_id, created_at DESC);

-- G2: scheduled / overnight work ("have this ready by morning").
-- Created now so Phase G ships on a single migration.
CREATE TABLE IF NOT EXISTS bella_tasks (
  id              BIGSERIAL PRIMARY KEY,
  tenant_id       BIGINT NOT NULL,
  user_id         BIGINT NOT NULL,
  conversation_id BIGINT,
  instruction     TEXT NOT NULL,
  run_at          TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued',   -- queued | running | done | failed | cancelled
  result          JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bella_tasks_due_idx ON bella_tasks (status, run_at);

-- Per-user per-day budget row (Val's defaults 2026-07-03: 300 turns,
-- 500 Bella-spent credits; per-plan limits come later with Billing).
CREATE TABLE IF NOT EXISTS bella_usage (
  tenant_id     BIGINT NOT NULL,
  user_id       BIGINT NOT NULL,
  day           DATE   NOT NULL,
  turns         INT    NOT NULL DEFAULT 0,
  input_tokens  BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  credits_spent INT    NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, user_id, day)
);

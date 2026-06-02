-- =============================================================================
-- CRM — per-tenant action layer (v0022)
-- =============================================================================
-- The CRM is where a tenant ACTS on Bell's shared company/people data: their
-- own lists, notes, activity history, tasks, deals, and (later) email.
--
-- PROD-OWNED, PER-TENANT customer state — exactly like tenant_reveals /
-- credit_ledger. These tables are NOT in the local→prod mirror; a sync push
-- must never touch them. Every table carries tenant_id (FK, ON DELETE CASCADE).
-- They reference the canonical companies/people by id (polymorphic via
-- entity_type + entity_id), but never modify them.
-- =============================================================================

BEGIN;

-- One row per company/person a tenant has in its CRM. Auto-created on reveal
-- (source='reveal') or added manually. The Companies/People tabs filter on
-- entity_type; the "Revealed" view filters on source='reveal'.
CREATE TABLE IF NOT EXISTS crm_records (
  id               bigserial PRIMARY KEY,
  tenant_id        bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type      text NOT NULL CHECK (entity_type IN ('company','person')),
  entity_id        bigint NOT NULL,                 -- companies.id OR people.id
  source           text NOT NULL DEFAULT 'manual'   -- reveal | manual | import
                     CHECK (source IN ('reveal','manual','import')),
  status           text NOT NULL DEFAULT 'new',     -- new | contacted | engaged | won | lost (free-form, light pipeline)
  owner_user_id    bigint REFERENCES users(id) ON DELETE SET NULL,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  archived         boolean NOT NULL DEFAULT false,
  added_by         text,                            -- user email
  added_at         timestamptz NOT NULL DEFAULT now(),
  extra_fields     jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (tenant_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_records_tenant       ON crm_records (tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_crm_records_tenant_status ON crm_records (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_records_entity       ON crm_records (entity_type, entity_id);

-- Free-text notes per record. Team-visible (any tenant member can read).
CREATE TABLE IF NOT EXISTS crm_notes (
  id             bigserial PRIMARY KEY,
  tenant_id      bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id      bigint NOT NULL REFERENCES crm_records(id) ON DELETE CASCADE,
  author_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  author_email   text,
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_notes_record ON crm_notes (record_id, created_at DESC);

-- Unified activity timeline — the communication/interaction history.
CREATE TABLE IF NOT EXISTS crm_activities (
  id             bigserial PRIMARY KEY,
  tenant_id      bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id      bigint NOT NULL REFERENCES crm_records(id) ON DELETE CASCADE,
  type           text NOT NULL,            -- added | reveal | note | task | task_done | status_change | owner_change | email_out | email_in | call | deal
  actor_user_id  bigint REFERENCES users(id) ON DELETE SET NULL,
  actor_email    text,
  summary        text,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_activities_record ON crm_activities (record_id, occurred_at DESC);

-- Tasks / follow-ups (also feed the future Gantt view).
CREATE TABLE IF NOT EXISTS crm_tasks (
  id               bigserial PRIMARY KEY,
  tenant_id        bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id        bigint REFERENCES crm_records(id) ON DELETE CASCADE,
  title            text NOT NULL,
  description      text,
  due_at           timestamptz,
  assignee_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  created_by       text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_tenant ON crm_tasks (tenant_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_record ON crm_tasks (record_id);

-- ---------------------------------------------------------------------------
-- Deal pipeline (schema laid now; Kanban UI follows the foundation phase)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_pipelines (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_pipelines_tenant ON crm_pipelines (tenant_id);

CREATE TABLE IF NOT EXISTS crm_stages (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  pipeline_id  bigint NOT NULL REFERENCES crm_pipelines(id) ON DELETE CASCADE,
  name         text NOT NULL,
  position     integer NOT NULL DEFAULT 0,
  is_won       boolean NOT NULL DEFAULT false,
  is_lost      boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_crm_stages_pipeline ON crm_stages (pipeline_id, position);

CREATE TABLE IF NOT EXISTS crm_deals (
  id              bigserial PRIMARY KEY,
  tenant_id       bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  record_id       bigint REFERENCES crm_records(id) ON DELETE SET NULL,
  pipeline_id     bigint REFERENCES crm_pipelines(id) ON DELETE SET NULL,
  stage_id        bigint REFERENCES crm_stages(id) ON DELETE SET NULL,
  title           text NOT NULL,
  value_num       numeric,
  currency        text DEFAULT 'QAR',
  owner_user_id   bigint REFERENCES users(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
  expected_close  date,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_deals_tenant ON crm_deals (tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage  ON crm_deals (stage_id);

INSERT INTO schema_migrations (version) VALUES ('0022') ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- CRM sequences — automated multi-step email follow-ups (v0024)
-- =============================================================================
-- A sequence is an ordered set of email steps with per-step delays. Enrolling a
-- CRM record starts it; a background scheduler (BDI_CRM_SCHEDULER=1, one prod
-- service) sends each step when due and advances the enrollment. Per-tenant,
-- prod-owned, NOT mirrored.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS crm_sequences (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','paused')),
  created_by  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_sequences_tenant ON crm_sequences (tenant_id, status);

CREATE TABLE IF NOT EXISTS crm_sequence_steps (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_id  bigint NOT NULL REFERENCES crm_sequences(id) ON DELETE CASCADE,
  step_no      integer NOT NULL,             -- 1-based order
  delay_days   integer NOT NULL DEFAULT 0,   -- wait before sending THIS step (step 1 usually 0)
  subject      text,
  body         text,
  UNIQUE (sequence_id, step_no)
);
CREATE INDEX IF NOT EXISTS idx_crm_sequence_steps_seq ON crm_sequence_steps (sequence_id, step_no);

CREATE TABLE IF NOT EXISTS crm_sequence_enrollments (
  id            bigserial PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_id   bigint NOT NULL REFERENCES crm_sequences(id) ON DELETE CASCADE,
  record_id     bigint NOT NULL REFERENCES crm_records(id) ON DELETE CASCADE,
  current_step  integer NOT NULL DEFAULT 1,  -- next step to send
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','stopped','errored')),
  enrolled_by   text,
  enrolled_at   timestamptz NOT NULL DEFAULT now(),
  next_run_at   timestamptz,                 -- when the next step is due
  last_sent_at  timestamptz,
  completed_at  timestamptz,
  error         text,
  UNIQUE (tenant_id, sequence_id, record_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_enroll_due ON crm_sequence_enrollments (status, next_run_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_crm_enroll_record ON crm_sequence_enrollments (record_id);

INSERT INTO schema_migrations (version) VALUES ('0024') ON CONFLICT DO NOTHING;

COMMIT;

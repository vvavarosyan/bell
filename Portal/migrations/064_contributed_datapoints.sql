-- 064 — Contributed datapoints (Import Phase 2, Layer 1).
--
-- Val's model (2026-06-28): users can add UNLIMITED datapoints to ANY record in
-- their CRM (extra phones/emails/addresses/websites/socials/corrections/custom
-- fields/notes), on companies AND people. EVERYTHING they add is captured here —
-- it is BOTH the user's own private overlay (they always see their own rows) AND
-- the admin-only review pool. The admin later curates which datapoints get
-- promoted into Bell's canonical/shared DB (status pending → promoted | rejected).
-- No per-item opt-in; consent is at the ToS level (lawyer-blessed). Person→public
-- promotion stays lawyer-gated; companies flow freely. Admin curation + matching +
-- wiring imports into this pool are Layers 2–3.

CREATE TABLE IF NOT EXISTS contributed_datapoints (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT NOT NULL,                  -- the contributing tenant
  entity_type   TEXT   NOT NULL,                  -- 'company' | 'person' (the CRM record's entity)
  entity_id     BIGINT NOT NULL,                  -- canonical company/person id
  field         TEXT   NOT NULL,                  -- 'phone'|'email'|'website'|'address'|'social'|'name'|'title'|'note'|'custom'
  label         TEXT,                             -- user's label (for 'custom')
  value         TEXT   NOT NULL,
  source        TEXT   NOT NULL DEFAULT 'crm_add',-- 'crm_add' | 'import'
  import_batch_id BIGINT,                         -- set when source='import'
  status        TEXT   NOT NULL DEFAULT 'pending',-- 'pending' | 'promoted' | 'rejected'
  validation    JSONB  NOT NULL DEFAULT '{}'::jsonb, -- dataquality flags (e.g. {"ok":true} / {"reason":"bad_email"})
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ
);

-- The user's overlay on a given record (tenant + entity).
CREATE INDEX IF NOT EXISTS idx_contrib_dp_tenant_entity
  ON contributed_datapoints (tenant_id, entity_type, entity_id);

-- The admin review pool (everything still pending).
CREATE INDEX IF NOT EXISTS idx_contrib_dp_pending
  ON contributed_datapoints (status, created_at DESC) WHERE status = 'pending';

-- Guard against the same tenant adding the identical datapoint twice to a record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_contrib_dp_dedupe
  ON contributed_datapoints (tenant_id, entity_type, entity_id, field, value);

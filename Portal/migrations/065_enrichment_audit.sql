-- 065 — Enrichment audit (Import Phase 2, Layer 2).
-- Every admin decision on a contributed datapoint (promote into canonical, or
-- reject) writes one attribute-level audit row → provenance + reversibility.

CREATE TABLE IF NOT EXISTS enrichment_audit (
  id                 BIGSERIAL PRIMARY KEY,
  datapoint_id       BIGINT,
  entity_type        TEXT   NOT NULL,        -- 'company' | 'person'
  entity_id          BIGINT NOT NULL,
  field              TEXT   NOT NULL,
  old_value          TEXT,                   -- value before (for fill-blank/overwrite audit)
  new_value          TEXT,
  contributor_tenant BIGINT,
  decided_by         TEXT,
  action             TEXT   NOT NULL,        -- 'promote' | 'reject'
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_enrichment_audit_entity ON enrichment_audit (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_audit_datapoint ON enrichment_audit (datapoint_id);

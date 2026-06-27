-- 063 — User-imported lists (req #2: "users import own email lists + target companies").
--
-- Imported rows are TENANT-PRIVATE by default (they never touch Bell's shared /
-- public DB). If the user opts in to "contribute to Bell", the rows are flagged
-- pending_review for an ADMIN enrichment queue (Phase 2) — admin approves which
-- ones enrich the canonical DB, and those canonical changes sync local<->prod
-- the same way research candidates do. The publish step stays lawyer-gated
-- (Qatar PDPPL req #3 consent clause) — the opt-in checkbox is the user consent.

CREATE TABLE IF NOT EXISTS import_batches (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   BIGINT NOT NULL,
  kind        TEXT   NOT NULL,                 -- 'company' | 'contact'
  filename    TEXT,
  row_count   INTEGER NOT NULL DEFAULT 0,
  contribute  BOOLEAN NOT NULL DEFAULT false,  -- user opted in to share for enrichment
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_batches_tenant ON import_batches (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS imported_records (
  id            BIGSERIAL PRIMARY KEY,
  tenant_id     BIGINT NOT NULL,
  batch_id      BIGINT REFERENCES import_batches(id) ON DELETE CASCADE,
  kind          TEXT   NOT NULL,               -- 'company' | 'contact'
  name          TEXT,
  email         TEXT,
  phone         TEXT,
  company_name  TEXT,
  title         TEXT,
  website       TEXT,
  city          TEXT,
  country       TEXT,
  notes         TEXT,
  raw           JSONB  NOT NULL DEFAULT '{}'::jsonb,   -- original row, every column preserved
  -- Phase 2 enrichment match (to Bell's canonical company/person):
  matched_entity_type TEXT,                    -- 'company' | 'person' | NULL
  matched_entity_id   BIGINT,
  -- Admin enrichment queue lifecycle (only relevant when the batch opted in):
  enrich_status TEXT NOT NULL DEFAULT 'private', -- 'private' | 'pending_review' | 'approved' | 'rejected'
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_imported_records_tenant ON imported_records (tenant_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_imported_records_batch  ON imported_records (batch_id);
CREATE INDEX IF NOT EXISTS idx_imported_records_queue  ON imported_records (enrich_status) WHERE enrich_status = 'pending_review';

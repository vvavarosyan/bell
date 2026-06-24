-- 060 — LOCAL-ONLY enrichment reject log: what an engine FOUND or GENERATED but
-- did NOT save, and why. Surfaced in the company "Sources & Activity" tab so the
-- operator can see exactly what was discarded.
--
-- This table is deliberately NOT in MIRROR_TABLE_NAMES, so it never syncs to
-- production. The local engines are the only writers, so on prod it stays empty.

CREATE TABLE IF NOT EXISTS enrichment_rejects (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL,
  engine      text NOT NULL,        -- 'harvester' | 'email' | 'facts' | 'finder'
  kind        text NOT NULL,        -- 'email' | 'phone' | 'social' | 'person' | 'fact' | 'website'
  value       text NOT NULL,
  reason      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, engine, kind, value)
);

CREATE INDEX IF NOT EXISTS idx_enrichment_rejects_company
  ON enrichment_rejects (company_id, created_at DESC);

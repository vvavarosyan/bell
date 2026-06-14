-- 041_manual_lookups.sql
-- Manual Company Lookup — an admin types a company name, the local engines go
-- find everything about it, and the result is staged HERE for approve/reject.
--
-- This table is LOCAL-ONLY: it is deliberately NOT in the Bell.qa mirror
-- (server/sync/tables.js MIRROR_TABLES), so an un-approved lookup never reaches
-- production. On APPROVE we create a real `companies` row (which then syncs like
-- any approved company) and run the engines to populate it. On REJECT nothing is
-- ever created — the staged preview is simply discarded.

CREATE TABLE IF NOT EXISTS manual_lookups (
  id                 bigserial PRIMARY KEY,
  query_name         text NOT NULL,
  name_normalized    text,
  status             text NOT NULL DEFAULT 'running',   -- running | pending | matched | approved | rejected | error
  result             jsonb,                             -- preview findings, or match/enrich summary
  matched_company_id bigint REFERENCES companies(id) ON DELETE SET NULL,
  triggered_by       text,
  decided_by         text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  decided_at         timestamptz
);

CREATE INDEX IF NOT EXISTS idx_manual_lookups_status  ON manual_lookups (status);
CREATE INDEX IF NOT EXISTS idx_manual_lookups_created ON manual_lookups (created_at DESC);

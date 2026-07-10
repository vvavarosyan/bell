-- 079: QSE disclosures (Phase 2 C1) — announcements, financial-statement
-- documents and market notices from the Qatar Stock Exchange (qe.com.qa) for
-- the ~54 listed companies. Scraped locally ("Run QSE Scan.command", plain
-- fetch — no browser), MIRRORED to prod (sync/tables.js) like tenders; prod
-- regenerates the 'disclosure' signals from these rows itself.
--
-- source_uid is the source's own stable identity per row kind:
--   news:<InformationTypeDetailID>   the exchange's id for an announcement
--   fs:<symbol>:<year>:Q<n>          one financial-statement document
--   notice:<year>:<number>           one market notice
-- company_id is a SOFT ref (no FK — same as tenders.award_company_id): linked
-- conservatively by normalized-exact name match, NULL when no confident match.

BEGIN;

CREATE TABLE IF NOT EXISTS qse_disclosures (
  id            bigserial PRIMARY KEY,
  source_uid    text NOT NULL UNIQUE,
  dtype         text NOT NULL,          -- news | financial_statement | market_notice
  symbol        text,                   -- QSE ticker (QNBK); NULL for market notices
  company_name  text,                   -- listed name as the exchange prints it
  company_id    bigint,                 -- soft ref to companies, may stay NULL
  category      text,                   -- financial_results | dividend | capital_action | board | agm | investor_call | general | market_notice
  headline      text NOT NULL,
  summary       text,
  body          text,
  url           text,                   -- attachment / document / notice link
  published_at  timestamptz,            -- only when the source states a date
  raw           jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qse_disclosures_symbol       ON qse_disclosures (symbol);
CREATE INDEX IF NOT EXISTS idx_qse_disclosures_company      ON qse_disclosures (company_id);
CREATE INDEX IF NOT EXISTS idx_qse_disclosures_published    ON qse_disclosures (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_qse_disclosures_dtype        ON qse_disclosures (dtype);

COMMIT;

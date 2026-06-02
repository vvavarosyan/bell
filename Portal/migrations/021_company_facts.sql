-- =============================================================================
-- Rich research data — company facts (v0021)
-- =============================================================================
-- Research reports contain structured facts beyond prose: financials, ownership,
-- and partnerships. We store them as first-class, queryable rows attached to the
-- company (not just buried in report text), each with provenance + confidence so
-- fresher / higher-confidence data can supersede older facts.
--
-- These are MIRROR tables (synced local↔prod). Rows created by research running
-- ON prod take ids from the high band (research_entity_id_seq, migration 0017),
-- same as research people/links, so the mirror never collides.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS company_financials (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metric      text NOT NULL,            -- revenue | net_profit | valuation | funding_raised | assets | employees | …
  value_text  text,                     -- as reported, e.g. "QAR 1.2 billion"
  value_num   numeric,                  -- parsed when possible
  currency    text,
  period      text,                     -- e.g. "FY2023", "2024-Q1"
  as_of       date,
  confidence  text,                     -- low | medium | high
  source      text,                     -- e.g. "research:job-42"
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_shareholders (
  id           bigserial PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  holder_name  text NOT NULL,
  holder_type  text,                    -- person | company | government | fund | other
  stake_pct    numeric,
  stake_text   text,                    -- as reported, e.g. "≈ 30%"
  as_of        date,
  confidence   text,
  source       text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_partnerships (
  id                 bigserial PRIMARY KEY,
  company_id         bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  partner_name       text NOT NULL,
  partner_company_id bigint REFERENCES companies(id) ON DELETE SET NULL,
  relationship       text,             -- partner | jv | supplier | customer | investor | subsidiary | parent
  description        text,
  since              text,
  confidence         text,
  source             text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_company_financials_company   ON company_financials (company_id);
CREATE INDEX IF NOT EXISTS idx_company_shareholders_company ON company_shareholders (company_id);
CREATE INDEX IF NOT EXISTS idx_company_partnerships_company ON company_partnerships (company_id);

INSERT INTO schema_migrations (version) VALUES ('0021') ON CONFLICT DO NOTHING;

COMMIT;

-- 076 — Stage 12 (Local Engine 6 · Tech-Stack Fingerprinter) — Phase 2/B1,
-- green-lit by Val 2026-07-09. Mirrors the stage10/11 pattern (058/059) +
-- a company_tech table holding what each company's website runs (CMS,
-- e-commerce, analytics, chat, payments, frameworks). Detected locally from
-- the homepage HTML — $0, no external calls. Idempotent.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage12_status text NOT NULL DEFAULT 'pending';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage12_at     timestamptz;

CREATE INDEX IF NOT EXISTS idx_companies_stage12_pending
  ON companies (id) WHERE stage12_at IS NULL;

ALTER TABLE engine_heartbeat ADD COLUMN IF NOT EXISTS tech_total integer NOT NULL DEFAULT 0;
ALTER TABLE engine_heartbeat ADD COLUMN IF NOT EXISTS tech_left  integer;

-- What the company's website runs. One row per company+technology; re-scans
-- refresh updated_at (the mirror watermark) + evidence.
CREATE TABLE IF NOT EXISTS company_tech (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL,
  tech        text   NOT NULL,              -- e.g. 'WordPress', 'Shopify', 'Google Analytics'
  category    text,                         -- cms | ecommerce | analytics | marketing | chat | framework | payments | infrastructure | integration
  evidence    text,                         -- the matched marker (audit trail, Sources tab)
  confidence  text   NOT NULL DEFAULT 'high',
  source      text   NOT NULL DEFAULT 'homepage',
  detected_at timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, tech)
);

CREATE INDEX IF NOT EXISTS idx_company_tech_company ON company_tech (company_id);
CREATE INDEX IF NOT EXISTS idx_company_tech_tech    ON company_tech (tech);

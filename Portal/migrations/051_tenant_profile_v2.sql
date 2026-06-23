-- 051: richer tenant ICP / company profile (builds on 050_tenant_profile).
--   • company_name              — the tenant's own company name
--   • pricing_items (jsonb)      — [{ "title": "...", "price": "..." }, …] replaces single pricing text
--   • target_tech_stack (text[]) — ICP: target companies using these tools (WordPress, Shopify, …)
--   • target_has_website         — ICP: 'any' | 'has' | 'none'
--   • target_titles / keywords   — promoted from text to text[] (multi-select)
--   • drops target_geographies   — Bell is Qatar-only, so geography targeting is unused
--
-- tenant_profile is new (migration 050) and effectively empty, so converting the
-- two text columns to text[] via drop+add loses nothing. Runner executes the whole
-- file as one statement batch (no BEGIN/COMMIT needed); all statements are idempotent.

ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS company_name       text;
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS pricing_items      jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS target_tech_stack  text[];
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS target_has_website text;   -- 'any' | 'has' | 'none'

ALTER TABLE tenant_profile DROP COLUMN IF EXISTS target_geographies;           -- Qatar-only
ALTER TABLE tenant_profile DROP COLUMN IF EXISTS pricing;                      -- replaced by pricing_items

ALTER TABLE tenant_profile DROP COLUMN IF EXISTS target_titles;
ALTER TABLE tenant_profile ADD  COLUMN IF NOT EXISTS target_titles   text[];
ALTER TABLE tenant_profile DROP COLUMN IF EXISTS target_keywords;
ALTER TABLE tenant_profile ADD  COLUMN IF NOT EXISTS target_keywords text[];

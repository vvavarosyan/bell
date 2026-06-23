-- Per-tenant company profile + ICP (ideal customer profile). Drives personalized
-- Signals and Bella. Filled manually in Settings or by Bella. One row per tenant.
CREATE TABLE IF NOT EXISTS tenant_profile (
  tenant_id          bigint PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  company_about      text,        -- what the company does
  products_services  text,        -- products / services offered (and prices)
  pricing            text,        -- pricing model / price points
  current_customers  text,        -- who they sell to today
  target_industries  text[],      -- ICP: industries to target
  target_sizes       text[],      -- ICP: company-size buckets
  target_geographies text,        -- ICP: regions / cities
  target_titles      text,        -- ICP: decision-maker titles to reach
  target_keywords    text,        -- ICP: keywords / buying signals
  icp_notes          text,        -- freeform ICP notes
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         text
);

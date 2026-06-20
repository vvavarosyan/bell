-- 046_company_industries.sql
-- Multiple industries per company. A Qatar firm often spans several industries
-- ("Trading & Contracting", "Brand Consulting"), so we keep a SET of canonical
-- industry tags plus one primary:
--   • companies.industry          = PRIMARY industry (unchanged; existing column)
--   • companies.industries text[] = ALL canonical industry tags (incl. primary)
-- Tags are DERIVED (server/lib/industry.js) from the source-directory category,
-- LinkedIn, and strict name/description inference — see the backfill + ingestion
-- wiring. `industry_locked` protects a manually-set industry from re-derivation.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS industries      text[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry_locked boolean NOT NULL DEFAULT false;

-- Filter companies by any tag:  WHERE industries && ARRAY['Banking & Finance']
CREATE INDEX IF NOT EXISTS idx_companies_industries ON companies USING gin (industries);

-- Fold the industry tags into search_blob so search + the industry filter match
-- ANY tag (not just the primary). Re-defines the trigger to append the tags.
CREATE OR REPLACE FUNCTION companies_search_blob_trg() RETURNS trigger AS $$
BEGIN
  NEW.search_blob := build_company_search_blob(
    NEW.name, NEW.legal_name, NEW.primary_registration_no, NEW.bin,
    NEW.city, NEW.country, NEW.sector, NEW.industry,
    NEW.website::text, NEW.email::text, NEW.phone, NEW.extra_fields)
    || ' ' || lower(coalesce(array_to_string(NEW.industries, ' '), ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

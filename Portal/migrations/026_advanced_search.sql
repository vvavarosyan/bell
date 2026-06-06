-- 026_advanced_search.sql
-- Advanced company search: typo/abbreviation-tolerant name matching (pg_trgm)
-- + every detail searchable (CR/CP number, QFC #, ISIN/symbol, city, contacts,
-- and any extra_fields value) via a maintained `search_blob` text column.
--
-- How it works:
--   • search_blob aggregates the searchable text of a company (name, legal name,
--     registration numbers, BIN, city/country, sector/industry, website/email/
--     phone, a name acronym, and every scalar value in extra_fields).
--   • A BEFORE INSERT/UPDATE trigger keeps it current for ALL writers (ingest,
--     mirror sync, research, manual edits) — no app code has to remember to set it.
--   • GIN trigram indexes on search_blob and name_normalized make both the
--     substring search (search_blob LIKE '%q%') and the fuzzy match
--     (name_normalized % q) fast on 100k+ rows.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS search_blob text;

-- Build the searchable blob for one company from its column values.
CREATE OR REPLACE FUNCTION build_company_search_blob(
  p_name text, p_legal_name text, p_reg text, p_bin text,
  p_city text, p_country text, p_sector text, p_industry text,
  p_website text, p_email text, p_phone text, p_extra jsonb
) RETURNS text AS $$
DECLARE
  v_blob text;
  v_acro text;
  v_val  text;
BEGIN
  v_blob := lower(concat_ws(' ',
    p_name, p_legal_name, p_reg, p_bin, p_city, p_country,
    p_sector, p_industry, p_website, p_email, p_phone));

  -- Acronym from the name's words (e.g. "Qatar Islamic Bank" -> "qib") so users
  -- can find a company by its initials.
  SELECT string_agg(left(w, 1), '')
    INTO v_acro
    FROM regexp_split_to_table(
           lower(regexp_replace(coalesce(p_name, ''), '[^a-zA-Z0-9 ]', ' ', 'g')),
           '\s+') AS w
   WHERE w <> '';
  IF v_acro IS NOT NULL AND char_length(v_acro) >= 2 THEN
    v_blob := v_blob || ' ' || v_acro;
  END IF;

  -- Every scalar value held in extra_fields (CR/CP #, ISIN, symbol, statuses…).
  IF p_extra IS NOT NULL THEN
    FOR v_val IN SELECT value FROM jsonb_each_text(p_extra) LOOP
      IF v_val IS NOT NULL AND v_val <> '' THEN
        v_blob := v_blob || ' ' || lower(v_val);
      END IF;
    END LOOP;
  END IF;

  RETURN v_blob;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Backfill existing rows (direct call; the trigger below handles future writes).
UPDATE companies SET search_blob = build_company_search_blob(
  name, legal_name, primary_registration_no, bin, city, country,
  sector, industry, website::text, email::text, phone, extra_fields);

-- Keep search_blob current on every write.
CREATE OR REPLACE FUNCTION companies_search_blob_trg() RETURNS trigger AS $$
BEGIN
  NEW.search_blob := build_company_search_blob(
    NEW.name, NEW.legal_name, NEW.primary_registration_no, NEW.bin,
    NEW.city, NEW.country, NEW.sector, NEW.industry,
    NEW.website::text, NEW.email::text, NEW.phone, NEW.extra_fields);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS companies_search_blob_biu ON companies;
CREATE TRIGGER companies_search_blob_biu
  BEFORE INSERT OR UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION companies_search_blob_trg();

-- Fast substring search across the whole blob. (name_normalized already has a
-- gin_trgm_ops index from migration 001 — idx_companies_name_trgm — which serves
-- the fuzzy `%` match and similarity() ranking, so we don't duplicate it here.)
CREATE INDEX IF NOT EXISTS idx_companies_search_blob_trgm
  ON companies USING gin (search_blob gin_trgm_ops);

INSERT INTO schema_migrations (version) VALUES ('0026') ON CONFLICT DO NOTHING;

COMMIT;

-- 100_sector_index.sql
-- The business-type search (lib/business_types.js) matches exact stated QCCI
-- sub-category values held in companies.sector via btrim(sector) = ANY(...).
-- Expression index so that predicate doesn't seq-scan 190k rows per keystroke.
CREATE INDEX IF NOT EXISTS idx_companies_sector_btrim
  ON companies (btrim(sector)) WHERE sector IS NOT NULL;

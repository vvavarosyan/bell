-- 103_osm_review.sql — let unmatched OSM places flow through Discovery Review.
-- review_status: NULL = still a candidate, 'promoted' = became a company,
-- 'ignored' = dismissed. (matched_company_id links a place to its company.)
ALTER TABLE osm_places ADD COLUMN IF NOT EXISTS review_status text;
CREATE INDEX IF NOT EXISTS osm_places_review_idx ON osm_places (review_status)
  WHERE review_status IS NULL AND matched_company_id IS NULL;

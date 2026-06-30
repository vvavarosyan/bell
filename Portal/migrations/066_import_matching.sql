-- 066 — Import Phase 2: matching engine (design §4).
--
-- Adds the per-row match OUTCOME columns to imported_records and the block
-- (candidate-generation) indexes the engine needs so each import row touches a
-- few dozen candidates, never the whole 76k table.
--
-- Already present (reused, not re-created):
--   • name-trigram GIN: idx_companies_name_trgm (companies.name_normalized),
--     idx_people_name_trgm (people.full_name)            — migration 001
--   • contact value btrees: idx_company_contacts_value,
--     idx_person_contacts_value                          — migration 002
--   • people email btree: idx_people_email               — migration 001
--
-- This migration adds: the company website-domain expression index (domain
-- block) + phone btrees (phone block). The conservative match band + the
-- "never auto-match on a fuzzy name alone" guard live in server/lib/matching.js.

ALTER TABLE imported_records ADD COLUMN IF NOT EXISTS match_confidence numeric;
ALTER TABLE imported_records ADD COLUMN IF NOT EXISTS match_status     text;   -- 'matched' | 'review' | 'new'

-- Registrable host of companies.website, normalized IDENTICALLY to the
-- companyDomain() helper in matching.js: lower → strip scheme → strip a leading
-- "www." → take the host before the first "/". Keep these two in lock-step;
-- the engine's domain-block query must reuse this exact expression to hit the index.
CREATE INDEX IF NOT EXISTS idx_companies_website_domain
  ON companies (
    lower(split_part(regexp_replace(regexp_replace(website::text, '^[a-z]+://', '', 'i'), '^www\.', '', 'i'), '/', 1))
  )
  WHERE website IS NOT NULL;

-- Phone block (companies.phone / people.phone carry the primary number directly;
-- additional numbers live in *_contacts.value, already indexed).
CREATE INDEX IF NOT EXISTS idx_companies_phone ON companies (phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_people_phone    ON people    (phone) WHERE phone IS NOT NULL;

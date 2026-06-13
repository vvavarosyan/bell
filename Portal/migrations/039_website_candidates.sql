-- 039_website_candidates.sql
-- Review queue for SEARCH-found websites. Domain guesses are high-precision and
-- auto-saved; search results are fuzzier (name collisions), so the Finder now
-- proposes them here for one-click human approval instead of writing them
-- straight onto companies.website. Approving sets the website (then the
-- harvester picks it up); rejecting records the host in rejection memory.

BEGIN;

CREATE TABLE IF NOT EXISTS website_candidates (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  candidate_url text   NOT NULL,
  reason        text,
  status        text   NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  decided_by    text,
  UNIQUE (company_id, candidate_url)
);

CREATE INDEX IF NOT EXISTS idx_website_candidates_status  ON website_candidates (status);
CREATE INDEX IF NOT EXISTS idx_website_candidates_company ON website_candidates (company_id);

INSERT INTO schema_migrations (version) VALUES ('0039') ON CONFLICT DO NOTHING;

COMMIT;

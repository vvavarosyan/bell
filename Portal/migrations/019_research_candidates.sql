-- =============================================================================
-- Research approval queue — candidate holding pen (v0019)
-- =============================================================================
-- Companies that research DISCOVERS are no longer written straight into the live
-- `companies` table. They land here first and wait for an admin decision on the
-- local engine:
--
--   kind = 'pending'    → a new Qatar company awaiting approval (hidden from
--                         customers; not counted). Approve → promoted to companies.
--   kind = 'non_qatar'  → not Qatar-based. KEPT (not discarded) in this admin-only
--                         store for future expansion to other countries. Never
--                         enters Bell.
--   kind = 'rejected'   → admin said no. Remembered so research won't re-queue it.
--   kind = 'approved'   → promoted into companies (promoted_company_id points to it).
--
-- People are unaffected (they auto-enter). Existing companies are still enriched
-- in place. Only APPROVED Qatar companies ever reach Bell's customers.
-- =============================================================================

BEGIN;

CREATE SEQUENCE IF NOT EXISTS research_candidates_id_seq AS bigint;

CREATE TABLE IF NOT EXISTS research_candidates (
  id                    bigint PRIMARY KEY DEFAULT nextval('research_candidates_id_seq'),
  kind                  text        NOT NULL DEFAULT 'pending'
                          CHECK (kind IN ('pending','non_qatar','rejected','approved')),
  name                  text        NOT NULL,
  name_normalized       text,
  country               text,
  primary_registration_no text,
  website               text,
  linkedin_url          text,
  city                  text,
  industry              text,
  relation_to_target    text,
  raw                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  discovered_from_job_id bigint,
  discovered_at         timestamptz NOT NULL DEFAULT now(),
  decided_by            text,
  decided_at            timestamptz,
  promoted_company_id   bigint,
  notes                 text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER SEQUENCE research_candidates_id_seq OWNED BY research_candidates.id;

-- Dedupe lookups: research matches incoming discoveries against existing
-- candidates so a rejected / non-Qatar / already-pending company isn't re-added.
CREATE INDEX IF NOT EXISTS idx_research_candidates_kind        ON research_candidates (kind);
CREATE INDEX IF NOT EXISTS idx_research_candidates_norm        ON research_candidates (name_normalized);
CREATE INDEX IF NOT EXISTS idx_research_candidates_linkedin    ON research_candidates (linkedin_url) WHERE linkedin_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_candidates_reg         ON research_candidates (primary_registration_no) WHERE primary_registration_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_candidates_updated     ON research_candidates (updated_at);

INSERT INTO schema_migrations (version) VALUES ('0019') ON CONFLICT DO NOTHING;

COMMIT;

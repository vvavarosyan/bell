-- =============================================================================
-- Bell Data Intelligence — Assembly: dedup canonical link + review queue (v0005)
-- =============================================================================
-- Phase 5 (Assembly) introduces:
--   • companies.canonical_id    — self FK pointing to the canonical row when
--                                 this row was merged into another. NULL on
--                                 canonical rows (standalone or merged-into).
--   • companies.merge_status    — 'canonical' | 'merged_into' | 'standalone'
--                                  - canonical:  this row has been chosen as the
--                                                surviving canonical for one or
--                                                more duplicates that point here
--                                  - merged_into: this row was a duplicate that
--                                                got merged into canonical_id
--                                  - standalone:  not yet involved in any dedup
--   • dedup_candidates table    — pairs of company IDs flagged for review (or
--                                 already auto-merged), with similarity score
--                                 + reasons.
--
-- Same for people: person_canonical_id, person_merge_status, person_dedup_candidates.
-- (Jobs are deduped by linkedin_job_url alone; no canonical_id needed.)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Companies
-- -----------------------------------------------------------------------------
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS canonical_id  bigint REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merge_status  text NOT NULL DEFAULT 'standalone'
        CHECK (merge_status IN ('standalone','canonical','merged_into'));

CREATE INDEX IF NOT EXISTS idx_companies_canonical_id ON companies (canonical_id);
CREATE INDEX IF NOT EXISTS idx_companies_merge_status ON companies (merge_status);

CREATE TABLE IF NOT EXISTS dedup_candidates (
    id                  bigserial PRIMARY KEY,
    company_a_id        bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    company_b_id        bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    similarity_score    numeric(4,3) NOT NULL,             -- 0.000 - 1.000
    similarity_reasons  jsonb NOT NULL DEFAULT '[]'::jsonb,-- ["linkedin_url_match","fuzzy_name(0.92)"]

    decision            text NOT NULL DEFAULT 'pending'
        CHECK (decision IN ('pending','auto_merged','merged_a_to_b','merged_b_to_a','kept_separate')),
    decided_at          timestamptz,
    decided_by          text,                              -- admin email when manual

    created_at          timestamptz NOT NULL DEFAULT now(),

    -- Treat (a,b) as an unordered pair: enforce a < b at insert time so we
    -- don't end up with both (123,456) and (456,123).
    CHECK (company_a_id < company_b_id),
    UNIQUE (company_a_id, company_b_id)
);

CREATE INDEX IF NOT EXISTS idx_dedup_candidates_decision ON dedup_candidates (decision);
CREATE INDEX IF NOT EXISTS idx_dedup_candidates_score    ON dedup_candidates (similarity_score DESC);


-- -----------------------------------------------------------------------------
-- People (same shape, different table)
-- -----------------------------------------------------------------------------
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS canonical_id  bigint REFERENCES people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merge_status  text NOT NULL DEFAULT 'standalone'
        CHECK (merge_status IN ('standalone','canonical','merged_into'));

CREATE INDEX IF NOT EXISTS idx_people_canonical_id ON people (canonical_id);
CREATE INDEX IF NOT EXISTS idx_people_merge_status ON people (merge_status);

CREATE TABLE IF NOT EXISTS person_dedup_candidates (
    id                  bigserial PRIMARY KEY,
    person_a_id         bigint NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    person_b_id         bigint NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    similarity_score    numeric(4,3) NOT NULL,
    similarity_reasons  jsonb NOT NULL DEFAULT '[]'::jsonb,
    decision            text NOT NULL DEFAULT 'pending'
        CHECK (decision IN ('pending','auto_merged','merged_a_to_b','merged_b_to_a','kept_separate')),
    decided_at          timestamptz,
    decided_by          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CHECK (person_a_id < person_b_id),
    UNIQUE (person_a_id, person_b_id)
);

CREATE INDEX IF NOT EXISTS idx_person_dedup_decision ON person_dedup_candidates (decision);
CREATE INDEX IF NOT EXISTS idx_person_dedup_score    ON person_dedup_candidates (similarity_score DESC);

COMMIT;

-- Deep-enrichment program (Val 2026-07-19/20): Firecrawl Spark agent batches + Apify Google
-- Maps sweep. ALL processing is LOCAL (Val's rule) — results sync up via the existing mirror.
--
-- spark_runs         — one row per agent run (the 5-free-daily budget ledger + coverage stats,
--                      so batch size can self-adjust when a run comes back thin).
-- spark_discoveries  — companies DISCOVERED while researching submitted ones. Qatar candidates
--                      await promotion into companies (review-gated at first); NON-Qatar rows
--                      are kept for the future Middle-East expansion and are ADMIN-ONLY by
--                      design: no customer-facing route reads this table.
-- gmaps_places       — staging for the Google Maps sweep (both candidate actors write here;
--                      place_id-deduped; matcher links to companies or flags as new).
-- companies.spark_status — submission tracker so EVERY company is eventually submitted.

BEGIN;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS spark_status text;   -- NULL | submitted | done | empty | failed
ALTER TABLE companies ADD COLUMN IF NOT EXISTS spark_at timestamptz;
CREATE INDEX IF NOT EXISTS companies_spark_pending_idx ON companies (id) WHERE spark_status IS NULL;

CREATE TABLE IF NOT EXISTS spark_runs (
  id               bigserial PRIMARY KEY,
  firecrawl_job_id text,
  batch_size       int NOT NULL,
  company_ids      bigint[] NOT NULL,
  status           text NOT NULL DEFAULT 'running'   -- running | completed | failed | empty
                     CHECK (status IN ('running','completed','failed','empty')),
  returned_count   int,
  ingested_facts   int,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS spark_discoveries (
  id                bigserial PRIMARY KEY,
  name              text NOT NULL,
  country           text,                             -- as stated by the agent; 'Qatar' → promotion candidate
  website           text,
  relation          text,                             -- partner / subsidiary / parent / competitor / mentioned
  source_company_id bigint,                           -- the submitted company it was found via (soft ref)
  source_url        text,
  raw               jsonb,                            -- verbatim agent object (packRaw'd)
  status            text NOT NULL DEFAULT 'new'       -- new | promoted | ignored
                      CHECK (status IN ('new','promoted','ignored')),
  promoted_company_id bigint,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS spark_discoveries_dedupe_idx ON spark_discoveries (lower(name), COALESCE(lower(website), ''));

CREATE TABLE IF NOT EXISTS gmaps_places (
  id            bigserial PRIMARY KEY,
  place_id      text NOT NULL UNIQUE,                 -- Google's placeId — the dedupe key
  actor         text NOT NULL,                        -- which actor found it (compass | microworlds)
  search_term   text,
  title         text,
  category      text,
  address       text,
  phone         text,
  website       text,
  email         text,                                 -- microworlds enriches emails; compass doesn't
  latitude      double precision,
  longitude     double precision,
  rating        double precision,
  reviews_count int,
  raw           jsonb,                                -- verbatim place (packRaw'd)
  matched_company_id bigint,                          -- soft ref; NULL = no match yet
  match_method  text,                                 -- phone | website | name | manual
  status        text NOT NULL DEFAULT 'new'           -- new | matched | candidate_new | ignored
                  CHECK (status IN ('new','matched','candidate_new','ignored')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gmaps_places_status_idx ON gmaps_places (status);

INSERT INTO schema_migrations (version) VALUES ('0099') ON CONFLICT DO NOTHING;

COMMIT;

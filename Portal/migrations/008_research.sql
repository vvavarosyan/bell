-- =============================================================================
-- Bell Data Intelligence — Research section (v0008)
-- =============================================================================
-- Tables backing the Research surface. Six job types match the marketing site:
-- company / person / sector / theme / region / regulation. Each job is one
-- Firecrawl Spark Pro Agent run that produces a structured report with cited
-- sources.
--
-- Snowball Doctrine (see memory):
--   1) Every report that produces new Qatari entities (companies, people) MUST
--      flow back into the canonical tables — research_derived_entities is the
--      audit log for that ingestion pass.
--   2) Every report is publishable to the public bell.qa Research page —
--      is_published / public_slug / published_at ship now so the surface can
--      be wired later without another migration.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- research_jobs — one row per research request
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_jobs (
    id                    bigserial PRIMARY KEY,

    type                  text NOT NULL
                            CHECK (type IN ('company','person','sector','theme','region','regulation')),

    -- Optional anchors into the canonical tables. For 'company' / 'person'
    -- types these point at the subject. For sector/theme/region/regulation
    -- they're NULL and `target_label` carries the free-form subject.
    target_company_id     bigint REFERENCES companies(id) ON DELETE SET NULL,
    target_person_id      bigint REFERENCES people(id)    ON DELETE SET NULL,
    target_label          text,                            -- "Qatari private healthcare", "Dr. Aisha Al-Sulaiti", etc.

    brief                 text NOT NULL,                   -- the one-sentence prompt

    status                text NOT NULL DEFAULT 'queued'
                            CHECK (status IN ('queued','gathering','synthesizing','ready','failed','cancelled')),

    -- Firecrawl Agent handle (set by orchestrator in R2)
    firecrawl_job_id      text,
    firecrawl_payload     jsonb,                           -- raw response when ready
    agent_count           integer NOT NULL DEFAULT 1,      -- displayed in Console

    -- Counters surfaced in the UI (filled in by the orchestrator). Default 0
    -- means an empty/just-created job renders cleanly.
    source_count          integer NOT NULL DEFAULT 0,
    section_count         integer NOT NULL DEFAULT 0,
    citation_count        integer NOT NULL DEFAULT 0,

    -- Cost tracking (mirrors enrichment_runs pattern)
    credits_used          numeric(12,4) NOT NULL DEFAULT 0,
    usd_spent             numeric(12,4) NOT NULL DEFAULT 0,

    created_by            text,                            -- admin email
    created_at            timestamptz NOT NULL DEFAULT now(),
    started_at            timestamptz,
    ready_at              timestamptz,
    eta_seconds           integer,                         -- best-effort ETA written by orchestrator
    error_message         text,

    extra_fields          jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_research_jobs_status      ON research_jobs (status);
CREATE INDEX IF NOT EXISTS idx_research_jobs_type        ON research_jobs (type);
CREATE INDEX IF NOT EXISTS idx_research_jobs_created     ON research_jobs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_jobs_company     ON research_jobs (target_company_id) WHERE target_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_research_jobs_person      ON research_jobs (target_person_id)  WHERE target_person_id  IS NOT NULL;

-- ---------------------------------------------------------------------------
-- research_sources — every URL/source the Agent pulled for a job
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_sources (
    id                    bigserial PRIMARY KEY,
    job_id                bigint NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,

    class                 text NOT NULL
                            CHECK (class IN ('filing','press','graph','industry','academic','court','web','other')),
    label                 text,
    url                   text,
    excerpt               text,
    retrieved_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_sources_job  ON research_sources (job_id);
CREATE INDEX IF NOT EXISTS idx_research_sources_class ON research_sources (class);

-- ---------------------------------------------------------------------------
-- research_reports — the structured deliverable
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_reports (
    id                    bigserial PRIMARY KEY,
    job_id                bigint NOT NULL UNIQUE REFERENCES research_jobs(id) ON DELETE CASCADE,

    title                 text NOT NULL,
    summary               text,
    -- Ordered array: [{number, title, body_markdown, citation_ids[]}, ...]
    sections              jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata              jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Public surface (Snowball Doctrine — ship the columns now, wire later)
    is_published          boolean NOT NULL DEFAULT false,
    public_slug           text UNIQUE,
    published_at          timestamptz,
    view_count            integer NOT NULL DEFAULT 0,

    assembled_at          timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_reports_assembled ON research_reports (assembled_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_reports_published ON research_reports (is_published) WHERE is_published = true;

-- ---------------------------------------------------------------------------
-- research_citations — links report sections back to research_sources
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_citations (
    id                    bigserial PRIMARY KEY,
    report_id             bigint NOT NULL REFERENCES research_reports(id) ON DELETE CASCADE,
    source_id             bigint NOT NULL REFERENCES research_sources(id) ON DELETE CASCADE,
    section_number        integer NOT NULL,
    anchor_text           text
);

CREATE INDEX IF NOT EXISTS idx_research_citations_report ON research_citations (report_id);
CREATE INDEX IF NOT EXISTS idx_research_citations_source ON research_citations (source_id);

-- ---------------------------------------------------------------------------
-- research_derived_entities — the SNOWBALL audit log
-- Every company/person the Agent surfaced that resulted in a DB action gets a
-- row here. Lets us trace which job created/enriched which canonical record.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_derived_entities (
    id                    bigserial PRIMARY KEY,
    job_id                bigint NOT NULL REFERENCES research_jobs(id) ON DELETE CASCADE,

    entity_type           text NOT NULL CHECK (entity_type IN ('company','person')),
    entity_id             bigint NOT NULL,                 -- companies.id OR people.id
    action                text NOT NULL CHECK (action IN ('created','enriched','no_change','skipped')),

    -- For created: the seed fields. For enriched: just the diff that was applied.
    fields_changed        jsonb NOT NULL DEFAULT '{}'::jsonb,
    notes                 text,

    derived_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_derived_job    ON research_derived_entities (job_id);
CREATE INDEX IF NOT EXISTS idx_research_derived_entity ON research_derived_entities (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- research_credits — per-day per-type cost roll-up (mirrors enrichment_credits)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_credits (
    day                   date NOT NULL,
    type                  text NOT NULL,
    tool                  text NOT NULL,                   -- 'firecrawl_agent'
    credits_used          numeric(12,4) NOT NULL DEFAULT 0,
    usd_spent             numeric(12,4) NOT NULL DEFAULT 0,
    run_count             integer NOT NULL DEFAULT 0,
    PRIMARY KEY (day, type, tool)
);

INSERT INTO schema_migrations (version) VALUES ('0008') ON CONFLICT DO NOTHING;

COMMIT;

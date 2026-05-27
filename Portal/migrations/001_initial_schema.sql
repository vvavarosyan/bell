-- =============================================================================
-- Bell Data Intelligence — initial schema (v0001)
-- =============================================================================
-- Designed for both local Postgres (Postgres.app on macOS) and Bell.qa's
-- Railway-hosted Postgres. Mirror this schema in Bell.qa exactly to keep the
-- Final Data JSON upload plug-and-play.
--
-- Conventions:
--   - id           bigserial primary key (internal, never exposed)
--   - bin/pin/jin  human-readable identifier (BIN-00000001 style)
--   - *_at         timestamptz everywhere (UTC)
--   - jsonb        used liberally for raw payloads + flexible enrichment data
--   - is_active    boolean status flag (inactives kept, Bell.qa filters them)
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Extensions
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;       -- fuzzy name matching for dedup
CREATE EXTENSION IF NOT EXISTS citext;        -- case-insensitive text (emails, urls)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";   -- generate uuids if needed


-- -----------------------------------------------------------------------------
-- Identifier sequences (BIN / PIN / JIN are generated from these)
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS bin_seq START 1;
CREATE SEQUENCE IF NOT EXISTS pin_seq START 1;
CREATE SEQUENCE IF NOT EXISTS jin_seq START 1;

CREATE OR REPLACE FUNCTION format_bin(n bigint) RETURNS text
  LANGUAGE sql IMMUTABLE AS
  $$ SELECT 'BIN-' || lpad(n::text, 8, '0'); $$;

CREATE OR REPLACE FUNCTION format_pin(n bigint) RETURNS text
  LANGUAGE sql IMMUTABLE AS
  $$ SELECT 'BELL-P-' || lpad(n::text, 8, '0'); $$;

CREATE OR REPLACE FUNCTION format_jin(n bigint) RETURNS text
  LANGUAGE sql IMMUTABLE AS
  $$ SELECT 'BELL-J-' || lpad(n::text, 8, '0'); $$;


-- =============================================================================
-- COMPANIES
-- =============================================================================
CREATE TABLE companies (
    id                       bigserial PRIMARY KEY,
    bin                      text UNIQUE,                          -- assigned during Assembly

    -- Core identity (from Data Gathering)
    name                     text NOT NULL,
    name_normalized          text NOT NULL,                        -- lower + trimmed + punctuation-stripped
    legal_name               text,
    legal_form               text,                                 -- e.g. LLC, WLL, PJSC

    -- Status (normalized across sources)
    is_active                boolean NOT NULL DEFAULT true,
    status_raw               text,                                 -- the original status string from source
    status_normalized        text,                                 -- one of: active, inactive, suspended, withdrawn, in_liquidation, frozen, deregistered, not_licensed, unknown

    -- Registration / licensing
    primary_registration_no  text,                                 -- best identifier across sources (QFC license #, MOCI CR #)
    incorporation_date       date,

    -- Contact
    website                  citext,
    email                    citext,
    phone                    text,
    address                  text,
    city                     text,
    country                  text DEFAULT 'Qatar',
    postal_code              text,
    latitude                 double precision,
    longitude                double precision,

    -- Classification
    industry                 text,
    sector                   text,
    sub_sector               text,
    employee_count           integer,
    employee_count_range     text,
    founded_year             integer,
    company_size_category    text,

    -- LinkedIn (Stage 1 + 2)
    linkedin_url             text UNIQUE,
    linkedin_id              text,
    linkedin_description     text,
    linkedin_followers       integer,
    linkedin_logo_url        text,
    linkedin_cover_url       text,
    linkedin_specialties     text[],
    linkedin_headquarters    text,
    linkedin_locations       jsonb,

    -- Google Maps (Stage 5)
    gmaps_place_id           text,
    gmaps_url                text,
    gmaps_rating             numeric(2,1),
    gmaps_reviews_count      integer,
    gmaps_hours              jsonb,
    gmaps_photos             jsonb,

    -- Open extensibility for future enrichment fields without schema churn
    extra_fields             jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Stage progress (set by enrichment pipeline)
    stage1_status            text NOT NULL DEFAULT 'pending',  -- pending | running | done | no_data | failed
    stage1_at                timestamptz,
    stage2_status            text NOT NULL DEFAULT 'pending',
    stage2_at                timestamptz,
    stage3_status            text NOT NULL DEFAULT 'pending',
    stage3_at                timestamptz,
    stage4_status            text NOT NULL DEFAULT 'pending',
    stage4_at                timestamptz,
    stage5_status            text NOT NULL DEFAULT 'pending',
    stage5_at                timestamptz,

    -- Bookkeeping
    created_at               timestamptz NOT NULL DEFAULT now(),
    updated_at               timestamptz NOT NULL DEFAULT now(),
    assembled_at             timestamptz,                       -- when BIN was assigned
    archived                 boolean NOT NULL DEFAULT false     -- soft delete; never hard-delete
);

CREATE INDEX idx_companies_name_trgm           ON companies USING gin (name_normalized gin_trgm_ops);
CREATE INDEX idx_companies_is_active           ON companies (is_active);
CREATE INDEX idx_companies_status_normalized   ON companies (status_normalized);
CREATE INDEX idx_companies_primary_reg_no      ON companies (primary_registration_no);
CREATE INDEX idx_companies_linkedin_url        ON companies (linkedin_url) WHERE linkedin_url IS NOT NULL;
CREATE INDEX idx_companies_stage1_status       ON companies (stage1_status);
CREATE INDEX idx_companies_stage2_status       ON companies (stage2_status);
CREATE INDEX idx_companies_stage3_status       ON companies (stage3_status);
CREATE INDEX idx_companies_stage4_status       ON companies (stage4_status);
CREATE INDEX idx_companies_stage5_status       ON companies (stage5_status);
CREATE INDEX idx_companies_extra_fields_gin    ON companies USING gin (extra_fields);


-- =============================================================================
-- COMPANY_SOURCES — many-to-many: which directories a company appears in
-- =============================================================================
-- A single company may appear in QFC + MOCI + QFZ + QSTP. Each appearance has
-- its own original ID, URL, and raw payload preserved for full traceability.
CREATE TABLE company_sources (
    id               bigserial PRIMARY KEY,
    company_id       bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    source           text NOT NULL,                       -- QFZ | QFC | MOCI | QSTP | (future)
    source_record_id text NOT NULL,                       -- the original ID in that directory (license #, CR #, slug, etc.)
    source_url       text,
    raw_payload      jsonb NOT NULL,                      -- full original record from the scraper
    first_seen_at    timestamptz NOT NULL DEFAULT now(),
    last_seen_at     timestamptz NOT NULL DEFAULT now(),

    UNIQUE (source, source_record_id)
);

CREATE INDEX idx_company_sources_company_id ON company_sources (company_id);
CREATE INDEX idx_company_sources_source     ON company_sources (source);


-- =============================================================================
-- PEOPLE
-- =============================================================================
CREATE TABLE people (
    id                   bigserial PRIMARY KEY,
    pin                  text UNIQUE,                            -- assigned during Assembly

    -- Identity
    full_name            text NOT NULL,
    first_name           text,
    last_name            text,
    headline             text,

    -- LinkedIn (Stage 3)
    linkedin_url         text UNIQUE NOT NULL,
    linkedin_public_id   text,
    linkedin_profile_id  text,

    -- Contact
    email                citext,
    phone                text,

    -- Location
    location_text        text,
    country              text,
    city                 text,

    -- Profile
    summary              text,
    profile_picture_url  text,
    languages            jsonb,
    skills               jsonb,
    education            jsonb,
    experience           jsonb,                                  -- full history; current job lives in person_companies
    certifications       jsonb,

    -- Reveal flow (1 credit per profile)
    is_revealed          boolean NOT NULL DEFAULT false,
    revealed_at          timestamptz,
    revealed_by          text,                                   -- admin email

    -- Open extensibility
    extra_fields         jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Bookkeeping
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    assembled_at         timestamptz,
    archived             boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_people_name_trgm     ON people USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_people_email         ON people (email) WHERE email IS NOT NULL;
CREATE INDEX idx_people_is_revealed   ON people (is_revealed);


-- =============================================================================
-- PERSON_COMPANIES — many-to-many: employment history + org chart
-- =============================================================================
CREATE TABLE person_companies (
    id               bigserial PRIMARY KEY,
    person_id        bigint NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    company_id       bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

    -- Current role at this company
    title            text,
    department       text,
    seniority_level  text,                                   -- intern | junior | mid | senior | manager | director | vp | c_level | owner | unknown
    org_chart_level  integer,                                -- 1=CEO, 2=Exec, 3=Director, 4=Manager, 5=IC

    -- Tenure
    start_date       date,
    end_date         date,
    is_current       boolean NOT NULL DEFAULT true,

    -- Provenance
    source_stage     integer NOT NULL DEFAULT 3,              -- which enrichment stage produced this link
    raw_payload      jsonb,

    -- Bookkeeping
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Composite uniqueness with NULL-safe expressions (Postgres only allows expressions
-- inside CREATE UNIQUE INDEX, not inside a table-level UNIQUE constraint).
CREATE UNIQUE INDEX uq_person_companies_assignment
    ON person_companies (
        person_id,
        company_id,
        COALESCE(start_date, '1970-01-01'::date),
        COALESCE(title, '')
    );

CREATE INDEX idx_person_companies_person     ON person_companies (person_id);
CREATE INDEX idx_person_companies_company    ON person_companies (company_id);
CREATE INDEX idx_person_companies_current    ON person_companies (is_current) WHERE is_current = true;


-- =============================================================================
-- JOBS
-- =============================================================================
CREATE TABLE jobs (
    id                bigserial PRIMARY KEY,
    jin               text UNIQUE,                           -- assigned during Assembly

    company_id        bigint REFERENCES companies(id) ON DELETE SET NULL,

    -- Posting identity
    linkedin_job_url  text UNIQUE NOT NULL,
    linkedin_job_id   text,
    title             text NOT NULL,
    description       text,

    -- Location + remote
    location_text     text,
    is_remote         boolean,
    workplace_type    text,                                  -- onsite | remote | hybrid | unknown

    -- Employment terms
    employment_type   text,                                  -- full_time | part_time | contract | internship | temporary
    seniority_level   text,
    job_function      text[],
    industries        text[],

    -- Compensation
    salary_min        numeric,
    salary_max        numeric,
    salary_currency   text,
    salary_period     text,                                  -- yearly | monthly | hourly

    -- Lifecycle
    posted_at         timestamptz,
    expires_at        timestamptz,
    is_active         boolean NOT NULL DEFAULT true,
    applicant_count   integer,

    -- Open extensibility
    extra_fields      jsonb NOT NULL DEFAULT '{}'::jsonb,
    raw_payload       jsonb,

    -- Bookkeeping
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    assembled_at      timestamptz,
    archived          boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_jobs_company_id      ON jobs (company_id);
CREATE INDEX idx_jobs_title_trgm      ON jobs USING gin (title gin_trgm_ops);
CREATE INDEX idx_jobs_is_active       ON jobs (is_active);
CREATE INDEX idx_jobs_posted_at       ON jobs (posted_at DESC NULLS LAST);


-- =============================================================================
-- ENRICHMENT OPERATIONS (audit + cost tracking + queue)
-- =============================================================================
CREATE TABLE enrichment_runs (
    id                bigserial PRIMARY KEY,
    stage             integer NOT NULL CHECK (stage BETWEEN 1 AND 5),
    tool              text NOT NULL,                         -- firecrawl_spark_pro | apify_dev_fusion | apify_harvestapi_employees | apify_jobs | apify_google_maps
    target_kind       text NOT NULL,                         -- 'company' | 'people' | 'job'
    target_ids        bigint[] NOT NULL,                     -- IDs from the corresponding table

    status            text NOT NULL DEFAULT 'queued',        -- queued | running | completed | partial | failed | cancelled
    progress_done     integer NOT NULL DEFAULT 0,
    progress_total    integer NOT NULL DEFAULT 0,

    started_at        timestamptz,
    completed_at      timestamptz,

    input_payload     jsonb,                                 -- what was sent to Firecrawl/Apify
    output_summary    jsonb,                                 -- summary of returned data
    error_message     text,

    credits_used      numeric(12,4) DEFAULT 0,
    usd_used          numeric(12,4) DEFAULT 0,

    triggered_by      text,                                  -- admin email
    created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrichment_runs_stage       ON enrichment_runs (stage);
CREATE INDEX idx_enrichment_runs_status      ON enrichment_runs (status);
CREATE INDEX idx_enrichment_runs_created_at  ON enrichment_runs (created_at DESC);


CREATE TABLE enrichment_credits (
    id            bigserial PRIMARY KEY,
    day           date NOT NULL,
    stage         integer NOT NULL,
    tool          text NOT NULL,
    credits_used  numeric(12,4) NOT NULL DEFAULT 0,
    usd_used      numeric(12,4) NOT NULL DEFAULT 0,
    run_count     integer NOT NULL DEFAULT 0,

    UNIQUE (day, stage, tool)
);


-- =============================================================================
-- DEDUPLICATION (manual + automatic merge log)
-- =============================================================================
CREATE TABLE dedup_links (
    id              bigserial PRIMARY KEY,
    record_type     text NOT NULL CHECK (record_type IN ('company', 'person', 'job')),
    kept_record_id  bigint NOT NULL,                         -- the survivor
    merged_record_id bigint NOT NULL,                        -- the absorbed one
    match_strategy  text NOT NULL,                           -- exact_reg_no | fuzzy_name_addr | manual
    confidence      numeric(4,3),                            -- 0.000-1.000
    merged_at       timestamptz NOT NULL DEFAULT now(),
    decided_by      text,                                    -- admin email or 'automatic'

    UNIQUE (record_type, merged_record_id)
);


CREATE TABLE similar_company_queue (
    id                  bigserial PRIMARY KEY,
    source_company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    similar_linkedin_url text NOT NULL,
    similar_name        text,
    similar_industry    text,
    similar_size        text,

    decision            text NOT NULL DEFAULT 'pending',    -- pending | added_to_scope | skipped
    decided_at          timestamptz,
    decided_by          text,

    discovered_at       timestamptz NOT NULL DEFAULT now(),

    UNIQUE (source_company_id, similar_linkedin_url)
);


-- =============================================================================
-- SETTINGS (Portal — does NOT include API keys, those live in macOS Keychain)
-- =============================================================================
CREATE TABLE settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
    ('schema_version', '"0001"'::jsonb),
    ('admin_email', '"vvavarosyan@yahoo.com"'::jsonb),
    ('dedup_fuzzy_threshold', '0.85'::jsonb),
    ('reveal_credit_cost', '1'::jsonb)
ON CONFLICT (key) DO NOTHING;


-- =============================================================================
-- SCHEMA MIGRATIONS LOG (tracks which SQL files have been applied)
-- =============================================================================
CREATE TABLE schema_migrations (
    version     text PRIMARY KEY,
    applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES ('0001') ON CONFLICT DO NOTHING;


-- =============================================================================
-- TRIGGERS: keep updated_at fresh on every row UPDATE
-- =============================================================================
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_touch        BEFORE UPDATE ON companies        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_people_touch           BEFORE UPDATE ON people           FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_person_companies_touch BEFORE UPDATE ON person_companies FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_jobs_touch             BEFORE UPDATE ON jobs             FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_settings_touch         BEFORE UPDATE ON settings         FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

COMMIT;

-- =============================================================================
-- Bell Data Intelligence — Qatar Open Data integration (v0009)
-- =============================================================================
-- Source: data.gov.qa (Opendatasoft Explore API v2.1).
-- Strategy: catalog refresh every few hours, records sync daily at 15:00.
-- We download whole datasets via /exports/json (no pagination cap) so each
-- dataset is one HTTP call regardless of size.
--
-- Future surfaces (per Val 2026-05-26):
--   • is_published / public_slug → bell.qa/data/<slug> SEO pages (deferred)
--   • companies/people enrichment snowball pass (deferred)
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- od_datasets — one row per dataset in the data.gov.qa catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS od_datasets (
    id                          bigserial PRIMARY KEY,

    -- Opendatasoft's stable slug for this dataset (used as URL segment)
    dataset_id                  text UNIQUE NOT NULL,

    -- Metadata from the catalog endpoint
    title                       text NOT NULL,
    description                 text,
    publisher                   text,
    license                     text,
    language                    text,

    -- Faceted taxonomy
    theme                       text,                          -- primary theme
    themes                      text[],                        -- all themes
    keywords                    text[],
    features                    text[],                        -- 'geo', 'analyze', etc.

    -- Schema (column names + types) — lets the UI render record tables
    fields_schema               jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Counts + timestamps from the source
    record_count                bigint NOT NULL DEFAULT 0,
    source_created_at           timestamptz,
    source_modified_at          timestamptz,                   -- when the source updated it
    source_data_processed_at    timestamptz,                   -- when the source last (re)processed
    source_metadata_processed_at timestamptz,

    -- Our sync state
    our_first_seen_at           timestamptz NOT NULL DEFAULT now(),
    our_last_catalog_sync_at    timestamptz NOT NULL DEFAULT now(),
    our_last_record_sync_at     timestamptz,
    our_last_record_count       bigint NOT NULL DEFAULT 0,
    our_record_sync_status      text NOT NULL DEFAULT 'pending'
                                   CHECK (our_record_sync_status IN ('pending','running','done','failed','no_data')),
    our_record_sync_error       text,

    -- Public surface (Snowball Doctrine — schema present, wiring deferred)
    is_published                boolean NOT NULL DEFAULT false,
    public_slug                 text UNIQUE,
    published_at                timestamptz,

    -- Open extensibility for future facets / metadata
    extra_fields                jsonb NOT NULL DEFAULT '{}'::jsonb,

    archived                    boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_od_datasets_theme        ON od_datasets (theme);
CREATE INDEX IF NOT EXISTS idx_od_datasets_publisher    ON od_datasets (publisher);
CREATE INDEX IF NOT EXISTS idx_od_datasets_modified     ON od_datasets (source_modified_at DESC);
CREATE INDEX IF NOT EXISTS idx_od_datasets_sync_status  ON od_datasets (our_record_sync_status);
CREATE INDEX IF NOT EXISTS idx_od_datasets_archived     ON od_datasets (archived);
CREATE INDEX IF NOT EXISTS idx_od_datasets_themes_gin   ON od_datasets USING gin (themes);
CREATE INDEX IF NOT EXISTS idx_od_datasets_keywords_gin ON od_datasets USING gin (keywords);

-- ---------------------------------------------------------------------------
-- od_records — one row per record across all datasets. data jsonb holds the
-- entire row payload as returned by Opendatasoft. GIN index makes deep
-- queries against the jsonb feasible.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS od_records (
    id                          bigserial PRIMARY KEY,
    dataset_id_fk               bigint NOT NULL REFERENCES od_datasets(id) ON DELETE CASCADE,

    -- Source's stable record id (when present; some datasets lack it)
    record_id                   text,

    data                        jsonb NOT NULL,                -- the full row

    our_synced_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_od_records_dataset ON od_records (dataset_id_fk);
CREATE INDEX IF NOT EXISTS idx_od_records_record  ON od_records (dataset_id_fk, record_id);
CREATE INDEX IF NOT EXISTS idx_od_records_data    ON od_records USING gin (data);

-- ---------------------------------------------------------------------------
-- od_sync_runs — audit log. One row per sync attempt (catalog or per-dataset).
-- Mirrors enrichment_runs / job_runs pattern.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS od_sync_runs (
    id                          bigserial PRIMARY KEY,

    kind                        text NOT NULL                  -- 'catalog' | 'records' | 'seed'
                                   CHECK (kind IN ('catalog','records','seed')),

    -- For per-dataset record syncs; NULL for catalog-wide runs
    dataset_id_fk               bigint REFERENCES od_datasets(id) ON DELETE SET NULL,
    dataset_id_text             text,                          -- preserves slug after dataset delete

    trigger                     text NOT NULL DEFAULT 'auto'   -- 'auto' | 'manual' | 'seed'
                                   CHECK (trigger IN ('auto','manual','seed')),
    triggered_by                text,                          -- admin email

    status                      text NOT NULL
                                   CHECK (status IN ('running','completed','failed','no_change','no_data')),

    started_at                  timestamptz NOT NULL DEFAULT now(),
    completed_at                timestamptz,

    -- Counters
    new_datasets                integer NOT NULL DEFAULT 0,    -- catalog runs
    updated_datasets            integer NOT NULL DEFAULT 0,    -- catalog runs
    new_records                 integer NOT NULL DEFAULT 0,    -- per-dataset runs
    updated_records             integer NOT NULL DEFAULT 0,    -- per-dataset runs
    deleted_records             integer NOT NULL DEFAULT 0,    -- per-dataset runs

    -- Bookkeeping
    bytes_downloaded            bigint NOT NULL DEFAULT 0,
    api_calls                   integer NOT NULL DEFAULT 0,
    error_message               text,
    summary                     jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_od_sync_runs_started ON od_sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_od_sync_runs_kind    ON od_sync_runs (kind);
CREATE INDEX IF NOT EXISTS idx_od_sync_runs_status  ON od_sync_runs (status);
CREATE INDEX IF NOT EXISTS idx_od_sync_runs_dataset ON od_sync_runs (dataset_id_fk) WHERE dataset_id_fk IS NOT NULL;

INSERT INTO schema_migrations (version) VALUES ('0009') ON CONFLICT DO NOTHING;

COMMIT;

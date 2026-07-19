-- Data Completeness Tracks A+B: company branches/locations + WhatsApp contacts.
--
-- company_locations — one row per physical location of a company (head office + branches).
-- Sources: the deeper website harvest (multiple addresses per site), linkedin_locations
-- address text, and existing companies.address/lat-lng. Geocoding via Qatar's own public
-- QARS locator (services.gisqatar.org.qa) — EXACT-or-nothing (Rule 2.1: a location that
-- cannot be resolved keeps NULL coordinates and an honest geocode_status; we never guess a
-- centroid). Mirrored to prod (registered in sync/tables.js; company_id is a SOFT ref like
-- gis_landmarks, so mirror ordering doesn't matter). NOTE: no touch trigger — every UPDATE
-- must bump updated_at explicitly (house style for scraped tables; it feeds the sync
-- watermark).

BEGIN;

CREATE TABLE IF NOT EXISTS company_locations (
  id             bigserial PRIMARY KEY,
  company_id     bigint NOT NULL,                 -- soft ref -> companies.id (no FK)
  label          text,                            -- 'Head Office', 'Lusail Branch', page heading…
  address        text NOT NULL,                   -- the verbatim address line captured
  zone_no        int,                             -- parsed INWANI components (NULL = unparsed)
  street_no      int,
  building_no    int,
  latitude       double precision,                -- NULL until geocoded (missing stays missing)
  longitude      double precision,
  is_primary     boolean NOT NULL DEFAULT false,
  source         text NOT NULL,                   -- 'stage7-website' | 'linkedin' | 'companies-address' | 'stage5-existing'
  source_url     text,
  geocode_status text,                            -- NULL=pending | ok | not_found | unparseable | stage5-existing
  geocode_method text,                            -- 'qars-exact' etc
  geocode_score  double precision,
  geocoded_at    timestamptz,
  raw            jsonb,                           -- verbatim locator response (packRaw'd)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS company_locations_company_idx ON company_locations (company_id);
CREATE INDEX IF NOT EXISTS company_locations_geo_idx ON company_locations (latitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS company_locations_pending_idx ON company_locations (geocode_status) WHERE geocode_status IS NULL;
-- One row per (company, address text): re-harvest updates, never duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS company_locations_dedupe_idx ON company_locations (company_id, lower(address));

-- WhatsApp becomes a first-class company contact type (Track A: wa.me/api.whatsapp.com links
-- were fingerprinted for tech-stack but the NUMBER was discarded — 0 whatsapp rows DB-wide).
-- Company contacts only; person-level WhatsApp is PDPPL territory and stays out.
ALTER TABLE company_contacts DROP CONSTRAINT IF EXISTS company_contacts_type_check;
ALTER TABLE company_contacts ADD CONSTRAINT company_contacts_type_check
  CHECK (type IN ('email','phone','social','whatsapp'));

INSERT INTO schema_migrations (version) VALUES ('0098') ON CONFLICT DO NOTHING;

COMMIT;

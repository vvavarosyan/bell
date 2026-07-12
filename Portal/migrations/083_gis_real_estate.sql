-- Qatar GIS + Real Estate (Val 2026-07-12). Physical geography from the public
-- Qatar GIS ArcGIS server (services.gisqatar.org.qa) + the property market from
-- the Weekly Real Estate Sales Bulletin already in od_records. All source-stated
-- (Rule 2.1). Mirrored to prod by id (register in sync/tables.js, parents first).
--
-- Geometry: no PostGIS — we store a centroid (lat/lng) + area only; the map's
-- heavy parcel/land-use polygons are a later, lazily-loaded layer.

-- Municipality → the top of the geography spine (8 rows).
CREATE TABLE IF NOT EXISTS gis_municipalities (
  id           bigserial PRIMARY KEY,
  gf_objectid  integer UNIQUE NOT NULL,     -- source ArcGIS OBJECTID (stable dedup key)
  mncp_no      integer,
  code         text,
  ename        text,
  aname        text,
  centroid_lat double precision,
  centroid_lng double precision,
  area_sqm     double precision,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Districts (neighbourhoods, ~846). The RE bulletin geo-tags at this level.
CREATE TABLE IF NOT EXISTS gis_districts (
  id           bigserial PRIMARY KEY,
  gf_objectid  integer UNIQUE NOT NULL,
  dist_no      integer,
  code         text,
  ename        text,
  aname        text,
  key_no       double precision,
  centroid_lat double precision,
  centroid_lng double precision,
  area_sqm     double precision,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gis_districts_ename_idx ON gis_districts (lower(ename));

-- Zones (INWANI addressing zones, ~91). zone_no repeats across municipalities,
-- so the real key is (municipal_code, zone_no) — kept as columns for later joins.
CREATE TABLE IF NOT EXISTS gis_zones (
  id            bigserial PRIMARY KEY,
  gf_objectid   integer UNIQUE NOT NULL,
  zone_no       integer,
  municipal_code text,
  ename         text,
  aname         text,
  key_no        double precision,
  centroid_lat  double precision,
  centroid_lng  double precision,
  area_sqm      double precision,
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gis_zones_zoneno_idx ON gis_zones (municipal_code, zone_no);

-- Landmarks = named buildings / POIs (~7,227) with address, contact, photo.
-- company_id is a soft ref (like tenders.award_company_id) filled later ONLY by a
-- verified+unique email/CR match — never fuzzy-asserted.
CREATE TABLE IF NOT EXISTS gis_landmarks (
  id               bigserial PRIMARY KEY,
  gf_objectid      integer UNIQUE NOT NULL,
  landmark_id      integer,
  category         text,
  category_aname   text,
  subcategory_name text,
  ename            text,
  aname            text,
  building_no      integer,
  zone_no          integer,
  street_no        integer,
  street_ename     text,
  street_aname     text,
  district_ename   text,
  district_aname   text,
  email            text,
  phone            text,
  pobox_no         integer,
  photo_url        text,
  latitude         double precision,
  longitude        double precision,
  company_id       bigint,                  -- soft ref → companies.id (no FK, may be NULL)
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gis_landmarks_zone_idx    ON gis_landmarks (zone_no);
CREATE INDEX IF NOT EXISTS gis_landmarks_company_idx ON gis_landmarks (company_id);
CREATE INDEX IF NOT EXISTS gis_landmarks_email_idx   ON gis_landmarks (lower(email));

-- Real-estate transactions, promoted from the Weekly Sales Bulletin (od_records)
-- into a first-class, geo-tagged table. Every figure is the source's own; parties
-- are anonymized by the publisher and are NEVER linked to a company (Rule 2.1).
CREATE TABLE IF NOT EXISTS real_estate_transactions (
  id                bigserial PRIMARY KEY,
  od_record_id      bigint UNIQUE NOT NULL,  -- provenance → od_records.id (local-only source; no FK on prod)
  registration_date date,
  municipality_name text,
  district_name     text,
  property_type     text,
  usage             text,
  property_value    numeric,
  area_sqm          numeric,
  price_per_sqm     numeric,
  price_per_sqft    numeric,
  currency          text NOT NULL DEFAULT 'QAR',
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ret_month_idx    ON real_estate_transactions (registration_date);
CREATE INDEX IF NOT EXISTS ret_district_idx ON real_estate_transactions (lower(district_name));

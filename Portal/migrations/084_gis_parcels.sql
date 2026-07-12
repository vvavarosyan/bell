-- Qatar GIS parcels + land-use (Val 2026-07-12: "every sqm of Qatar, every area's
-- box, even empty areas"). The full cadastre — 253k land parcels (PIN + area) and
-- 190k land-use zoning areas — each located to its district by point-in-polygon
-- (no PostGIS; done in JS at ingest, only the centroid + district id are stored,
-- not the heavy polygon). All source-stated. Mirrored by id.

-- Every land parcel in Qatar (the "box for every area").
CREATE TABLE IF NOT EXISTS gis_cadastre_plots (
  id           bigserial PRIMARY KEY,
  gf_objectid  integer UNIQUE NOT NULL,     -- source ArcGIS OBJECTID
  pin          text,                        -- parcel identification number
  area_sqm     double precision,            -- PDAREA (source-stated)
  cdst_key     text,
  centroid_lat double precision,
  centroid_lng double precision,
  district_id  bigint,                      -- soft ref → gis_districts.id (point-in-polygon)
  zone_id      bigint,                      -- soft ref → gis_zones.id
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cadastre_district_idx ON gis_cadastre_plots (district_id);
CREATE INDEX IF NOT EXISTS cadastre_pin_idx      ON gis_cadastre_plots (pin);

-- Land-use / zoning areas: what each area is designated for (residential,
-- mixed-use G+N, industrial, community facility, empty/undeveloped, …).
CREATE TABLE IF NOT EXISTS gis_landuse (
  id           bigserial PRIMARY KEY,
  gf_objectid  integer UNIQUE NOT NULL,
  zoning       text,                        -- e.g. R5, RES, MU2 G+5, MInd, CF
  zoning_label text,                        -- friendly expansion of the code
  code         integer,
  area_sqm     double precision,
  centroid_lat double precision,
  centroid_lng double precision,
  district_id  bigint,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS landuse_district_idx ON gis_landuse (district_id);
CREATE INDEX IF NOT EXISTS landuse_zoning_idx   ON gis_landuse (zoning);

-- Resumable-scan progress (LOCAL only — like search_ledger; never mirrored).
CREATE TABLE IF NOT EXISTS gis_scan_progress (
  layer       text PRIMARY KEY,             -- 'cadastre' | 'landuse'
  next_offset integer NOT NULL DEFAULT 0,
  total       integer,
  done        boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

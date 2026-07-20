-- 102_osm.sql — OpenStreetMap Qatar reference layer (Val 2026-07-20 "gather all
-- data"). Open data © OpenStreetMap contributors (ODbL), so we may store it.
-- POIs (businesses / restaurants / shops / establishments) + distinct named
-- streets. Both mirror to prod. A place may soft-link to a Bell company when the
-- two are the same business (matched_company_id); it never auto-creates a company.

CREATE TABLE IF NOT EXISTS osm_places (
  id             bigserial PRIMARY KEY,
  osm_type       text   NOT NULL,          -- node | way | relation
  osm_id         bigint NOT NULL,
  name           text,
  name_en        text,
  name_ar        text,
  category       text,                     -- primary tag value: restaurant, pharmacy, supermarket…
  category_key   text,                     -- tag key: amenity | shop | office | tourism | leisure | healthcare
  category_group text,                     -- friendly group: Food & Drink, Shopping, Health…
  latitude       double precision,
  longitude      double precision,
  phone          text,
  website        text,
  opening_hours  text,
  address        text,
  cuisine        text,
  matched_company_id bigint,               -- soft ref to a Bell company (no FK; id-mirror)
  tags           jsonb,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS osm_places_osm_uidx  ON osm_places (osm_type, osm_id);
CREATE INDEX IF NOT EXISTS osm_places_geo_idx   ON osm_places (latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS osm_places_group_idx ON osm_places (category_group);
CREATE INDEX IF NOT EXISTS osm_places_name_idx  ON osm_places (lower(name));
CREATE INDEX IF NOT EXISTS osm_places_match_idx ON osm_places (matched_company_id) WHERE matched_company_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS osm_streets (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL,
  name_en       text,
  name_ar       text,
  highway       text,                      -- residential | primary | secondary …
  latitude      double precision,          -- representative point
  longitude     double precision,
  city          text,                      -- nearest GIS district (best-effort)
  segment_count int DEFAULT 1,             -- OSM ways that share this name
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);
-- One row per distinct street name (streets fragment into many OSM ways).
CREATE UNIQUE INDEX IF NOT EXISTS osm_streets_name_uidx ON osm_streets (lower(name));
CREATE INDEX IF NOT EXISTS osm_streets_geo_idx ON osm_streets (latitude, longitude) WHERE latitude IS NOT NULL;

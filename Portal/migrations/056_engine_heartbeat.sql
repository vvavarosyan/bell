-- 056: heartbeat for the always-on Continuous Enrichment Engine. One row (id=1),
-- updated every sweep round, so the Portal can show the engine is alive and how
-- far the frontier has advanced. Local-only operational state (not mirrored).
CREATE TABLE IF NOT EXISTS engine_heartbeat (
  id              smallint PRIMARY KEY DEFAULT 1,
  started_at      timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  state           text,            -- starting | sweeping | idle | error | stopped
  round_no        integer DEFAULT 0,
  found_total     integer DEFAULT 0,
  harvested_total integer DEFAULT 0,
  mapped_total    integer DEFAULT 0,
  find_left       integer,
  harvest_left    integer,
  map_left        integer,
  pid             integer
);

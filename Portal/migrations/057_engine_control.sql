-- 057: control row for the always-on Continuous Engine — pause/resume + pacing.
-- The daemon reads this each round; the Portal's Engine dashboard writes it.
CREATE TABLE IF NOT EXISTS engine_control (
  id          smallint PRIMARY KEY DEFAULT 1,
  paused      boolean NOT NULL DEFAULT false,
  night_chunk integer,
  day_chunk   integer,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);
INSERT INTO engine_control (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

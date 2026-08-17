-- A board that never succeeded is not "always due".
--
-- boardsDue gated the sweep on last_ok_at, which only a SUCCESSFUL read sets. 3,138 of 3,422
-- own-site careers boards have never succeeded (the measured audit: Qatar employers do not
-- publish schema.org JobPosting), so the IS NULL clause made every one of them due EVERY
-- night — the weekly cadence the 2026-08-09 decision demoted them to never actually applied,
-- and a handful of bot-walled pages (mcdonalds.com, msc.com) turned the source red nightly.
--
-- updated_at cannot serve as "last attempt": the harvester's board upserts touch it on every
-- re-record. This column is stamped by recordSweep alone, on success AND failure.

ALTER TABLE job_boards ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

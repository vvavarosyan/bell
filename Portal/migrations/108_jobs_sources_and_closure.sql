-- 108 — Job vacancies from real sources, and the machinery to STOP showing one that has closed.
--
-- Val, 2026-08-07: cover the ENTIRE active company database, not only large employers — and
-- "if the post is deleted or expired or they already hired somebody, we delete it from our portal,
-- so it's not misleading information for our users."
--
-- The `jobs` table is LinkedIn-shaped: linkedin_job_url, linkedin_job_id, and nothing generic. Its
-- 87 rows are a single paid Apify test run from 2026-05-22. This migration is ADDITIVE — it renames
-- nothing and drops nothing, so those rows survive untouched.
--
-- ── WHY CLOSURE NEEDS ITS OWN TABLES ───────────────────────────────────────────────────────────
-- NO JOB SOURCE EVER STATES THAT A VACANCY WAS FILLED. Some state an expiry; most state nothing.
-- The only general signal is a job DISAPPEARING from its board — and a board that failed to load
-- looks exactly like a board with nothing on it. One DNS hiccup would otherwise close an
-- employer's entire vacancy list, which is its own kind of misleading information.
--
-- So a sweep must be able to prove it succeeded before its silence means anything. That is what
-- job_board_sweeps is for: closure is only ever computed from sweeps that are RECORDED as ok.

BEGIN;

-- ── Generic source identity on jobs ────────────────────────────────────────────────────────────
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source          text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_url      text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS external_id     text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS board_key       text;
-- The employer as the SOURCE names it, verbatim, when it names one at all. Oracle returns null on
-- 86 of 86 requisitions sampled; QatarEnergy states "QatarEnergy"; Qatar Living names the employer
-- on every listing. Kept separate from company_id so the claim and the link stay distinguishable.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS employer_stated text;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_seen_at    timestamptz;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS closed_at       timestamptz;
-- Why it closed, in Bell's own words: 'expired' (the source stated a date that has passed),
-- 'withdrawn' (absent from N consecutive PROVEN-GOOD sweeps), 'board_gone' (the board itself
-- stopped existing). Never a guess — each value corresponds to evidence.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS close_reason    text;

-- ⚠️ UNIQUENESS IS (board_key, external_id), NOT (source, external_id).
-- Oracle requisition ids are small per-tenant integers: Qatar Foundation states 3308, Milaha
-- states 2501, and two Qatar employers on the same platform WILL collide. Under a source-wide key
-- the second board's upsert would land on the first board's row, flip its company_id, board one
-- would then see the job as absent and close it, board two would re-steal it — one row
-- ping-ponging between two companies forever. Partial, so the 87 legacy rows (no board_key) are
-- unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS jobs_board_external_uniq
  ON jobs (board_key, external_id)
  WHERE board_key IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_open_by_company
  ON jobs (company_id) WHERE closed_at IS NULL AND COALESCE(archived, false) = false;
CREATE INDEX IF NOT EXISTS jobs_board_key ON jobs (board_key) WHERE board_key IS NOT NULL;

-- ── Where each company publishes its vacancies ─────────────────────────────────────────────────
-- Filled by the harvester's pickCareersLinks() across every website Bell holds — recording a URL
-- costs no extra fetch, so this scales to all ~17,930 sites rather than a curated shortlist.
--
-- LOCAL-ONLY. Deliberately absent from MIRROR_TABLES: production consumes JOBS, not the plumbing
-- that finds them, and mirroring sweep bookkeeping would put engine internals in front of
-- customers for no gain.
CREATE TABLE IF NOT EXISTS job_boards (
  id              bigserial PRIMARY KEY,
  company_id      bigint REFERENCES companies(id) ON DELETE CASCADE,
  -- Stable identity for the BOARD itself, independent of which company Bell thinks owns it —
  -- e.g. 'oracle:ejqa.fa.em2.oraclecloud.com'. It is the upsert key for jobs, so it must not
  -- change when an attribution is corrected.
  board_key       text NOT NULL UNIQUE,
  platform        text NOT NULL,
  url             text NOT NULL,
  -- From pickCareersLinks: 'own' (same registrable domain as the company), 'ats' (a hosted
  -- applicant-tracking platform), 'external' (someone else's host entirely).
  kind            text NOT NULL DEFAULT 'own',
  -- Whether Bell may attribute this board's jobs to company_id. Starts 'unverified' — the
  -- identity gate promotes it on evidence, and NOTHING is attributed while unverified. This is
  -- the guard against Bell storing a global brand's website on a small Qatar firm: "Honey Well
  -- Trading & Contracting" carries honeywell.com, whose board holds 1,282 vacancies in Chennai.
  attribution     text NOT NULL DEFAULT 'unverified',
  attribution_why text,
  active          boolean NOT NULL DEFAULT true,
  last_ok_at      timestamptz,
  last_error      text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_boards_company ON job_boards (company_id);
CREATE INDEX IF NOT EXISTS job_boards_due
  ON job_boards (last_ok_at NULLS FIRST) WHERE active AND attribution <> 'rejected';

-- ── Proof that a board was actually read ───────────────────────────────────────────────────────
-- Without this, "the job is gone" and "we could not read the board" are the same observation, and
-- the second one silently deletes real vacancies.
CREATE TABLE IF NOT EXISTS job_board_sweeps (
  id          bigserial PRIMARY KEY,
  board_key   text NOT NULL,
  swept_at    timestamptz NOT NULL DEFAULT now(),
  ok          boolean NOT NULL,
  jobs_seen   integer NOT NULL DEFAULT 0,
  error       text
);
CREATE INDEX IF NOT EXISTS job_board_sweeps_board ON job_board_sweeps (board_key, swept_at DESC);

COMMIT;

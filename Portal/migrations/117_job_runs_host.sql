-- WHICH MACHINE RAN THIS? Bell has two, and the job log could not tell them apart.
--
-- 2026-08-10, ten minutes apart, in the same job_runs table:
--     10:14:37  duty_alarm  ok
--     10:16:08  duty_alarm  error   email_provider_key_missing
-- Both real, both correct, and together they look like a flapping bug. They are not. Bell runs on
-- TWO machines against ONE database — the Mac (control screen) and the ROG (engine room) — and
-- API keys are stored per-machine: the macOS Keychain on the Mac, environment variables anywhere
-- else (keychain.js). Val had just added the Resend key on the Mac. So the Mac could send and the
-- ROG could not, and the log recorded both outcomes with no way to say which was which.
--
-- Every diagnosis of a scheduled duty starts with "where did this run", and until now the answer
-- had to be inferred from timing. That is the same failure family as the rest of this table's
-- history: the record was true but not sufficient to act on.
--
-- job_runs is NOT in MIRROR_TABLES (sync/tables.js) — it is engine-box-local operational data and
-- never reaches production, so adding a column here cannot disturb the mirror.

ALTER TABLE job_runs ADD COLUMN IF NOT EXISTS host text;

-- Existing rows keep host NULL, which reads honestly as "recorded before Bell tracked this"
-- rather than being backfilled with a guess about which machine it was.
CREATE INDEX IF NOT EXISTS idx_job_runs_kind_host
  ON job_runs (kind, host, COALESCE(completed_at, started_at) DESC);

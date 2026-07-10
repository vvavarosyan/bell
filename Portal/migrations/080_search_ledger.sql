-- 080: Proof-of-search ledger (Phase 2 A3). "Genuinely no data online" must be
-- PROVEN, not assumed: one append-only row per enrichment attempt recording
-- what each local engine searched, when, and with what outcome — so the
-- "100% valid DB" claim is auditable before automated outreach turns on.
--
-- Outcomes (semantics enforced in enrichment/local/ledger_rules.js, unit-tested):
--   found           the engine wrote data
--   candidate       finder queued a probable website for human review
--   verified_empty  the engine's full method ran with its search tiers available
--                   and found nothing — this IS proof of absence for that method
--   degraded_empty  nothing found, but a tier was disabled/blocked (Apify token,
--                   Firecrawl quota, captcha-blocked search, robots, unreachable
--                   site, SMTP-unverifiable email) — NOT proof; retry later
--   skipped         precondition missing (no website / no people) — nothing searched
--   error           the engine crashed on this company
--
-- APPEND-ONLY on purpose: a rescan wipes stageN_at (the frontier) but history
-- must survive — extra_fields stage keys are overwritten on every re-run, which
-- is exactly the gap this table fills. Like enrichment_rejects (060), this is
-- operational/audit data: deliberately NOT in MIRROR_TABLES, never synced to
-- production. Growth is bounded in practice by run cadence; if it ever matters,
-- prune rows older than the newest N per (company_id, stage).

BEGIN;

CREATE TABLE IF NOT EXISTS search_ledger (
  id          bigserial PRIMARY KEY,
  company_id  bigint NOT NULL,
  stage       smallint NOT NULL,        -- 7..12 (the companies.stageN_* family)
  engine      text NOT NULL,            -- finder | harvester | network | email | facts | tech
  outcome     text NOT NULL,            -- see header
  searched    jsonb,                    -- what actually ran: tiers, pages, queries, counts
  at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_ledger_company ON search_ledger (company_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_search_ledger_outcome ON search_ledger (outcome, at DESC);

COMMIT;

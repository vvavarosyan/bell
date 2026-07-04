-- 075 — TENDERS (Signals v2 follow-up, greenlit by Val 2026-07-04).
--
-- Qatar public tenders + awards (Monaqasat, Ashghal, QatarEnergy, Kahramaa,
-- QSE, or manual). An AWARD linked to a Bell company is the strongest owned
-- buyer-intent / active-vendor signal there is; big OPEN tenders show a buyer
-- actively procuring. server/tenders/ingest.js upserts rows (idempotent by
-- source+source_ref) and fuzzy-links award recipients to companies; the
-- signals engine (server/news/signals.js genTenderSignals) turns them into
-- 'tender' signals that feed the in-market score.
--
-- Derived/ingested runtime data — NOT part of the local→prod mirror.

BEGIN;

CREATE TABLE IF NOT EXISTS tenders (
  id                 bigserial PRIMARY KEY,
  source             text NOT NULL,                 -- monaqasat | ashghal | qatarenergy | kahramaa | qse | manual
  source_ref         text,                          -- tender/reference number at the source
  title              text NOT NULL,
  buyer              text,                          -- procuring entity (e.g. Ashghal)
  category           text,                          -- works | supply | services | consultancy | it | ...
  status             text NOT NULL DEFAULT 'open',  -- open | awarded | cancelled
  award_company_name text,                          -- raw awarded-vendor name (matched → company_id)
  award_company_id   bigint,                        -- resolved Bell company (fuzzy match)
  value_amount       numeric,                       -- contract / estimated value
  currency           text DEFAULT 'QAR',
  url                text,
  published_at       timestamptz,                   -- when announced
  deadline_at        timestamptz,                   -- submission deadline (open tenders)
  awarded_at         timestamptz,                   -- when awarded
  raw                jsonb,                          -- original scraped payload
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_ref)
);

CREATE INDEX IF NOT EXISTS idx_tenders_published     ON tenders (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenders_status        ON tenders (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenders_award_company ON tenders (award_company_id);

COMMIT;

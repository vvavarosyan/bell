-- 070 — SIGNALS (Phase C, approved by Val 2026-07-02).
--
-- Market signals DERIVED from data Bell already owns — nothing invented:
--   hiring          ← new job postings              (jobs)
--   newly_licensed  ← fresh registry entries        (companies.created_at)
--   partnership     ← new network edges             (company_relationships, Engine 3)
--   leadership      ← senior arrivals               (person_companies; NO person names — titles only, PDPPL-safe)
--   news_event      ← Bell-summarized news linked to companies (news_items)
--
-- Generated on the news-engine service (BDI_NEWS_ENGINE=1) every ~15 min by
-- server/news/signals.js. Runtime/derived data like feed_events — NOT part of
-- the local→prod mirror. dedup_key makes generation idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS signals (
  id             bigserial PRIMARY KEY,
  kind           text    NOT NULL,               -- hiring | newly_licensed | partnership | leadership | news_event
  subkind        text,                           -- e.g. news category for news_event
  company_id     bigint,                         -- main company (FK soft — company may be merged/removed later)
  company_name   text,
  title          text    NOT NULL,
  body           text,
  -- provenance
  source_kind    text,                           -- jobs | registry | relationships | people | news
  ref_table      text,
  ref_id         bigint,
  -- ICP-matching denormalizations (avoid joins on every read)
  industry       text,
  employee_count integer,
  importance     numeric NOT NULL DEFAULT 0.5,   -- 0..1
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  dedup_key      text UNIQUE                      -- idempotent generation
);

CREATE INDEX IF NOT EXISTS idx_signals_occurred ON signals (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_kind     ON signals (kind, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_company  ON signals (company_id);

COMMIT;

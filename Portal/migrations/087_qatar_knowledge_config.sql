-- Phase 6 · Qatar Knowledge Base — Batch B. Per-source crawl config + Al Meezan
-- (the authoritative laws source) + crawl fixes. All source-stated (Rule 2.1).

-- Per-source crawl tuning so one generic crawler handles very different gov
-- sites without code changes. Keys used by server/knowledge/crawl.js:
--   follow_query (bool) · insecure_tls (bool) · include_pattern (regex text) ·
--   exclude_pattern (regex text) · and, for the Al Meezan id-walk crawler:
--   walk_from / walk_to / walk_cursor (ints).
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- FIX: the International Media Office serves its English pages at the ROOT
-- (imo.gov.qa/about-the-imo …), not under /en/. The original /en/ prefix matched
-- almost no internal links, so only ~2 pages were learned. Point the prefix at
-- the host root and exclude the Arabic mirror.
UPDATE knowledge_sources
   SET url_prefix = 'https://imo.gov.qa/',
       config = config || '{"exclude_pattern": "/ar(/|$)"}'::jsonb,
       updated_at = now()
 WHERE base_url = 'https://imo.gov.qa/en/';

-- The Council of Ministers site is ASP.NET (navigates via ?query params) — let
-- the crawler keep query strings so it can follow those links.
UPDATE knowledge_sources
   SET config = config || '{"follow_query": true}'::jsonb,
       updated_at = now()
 WHERE base_url = 'https://cm.gov.qa/en/Pages/default.aspx';

-- Al Meezan — Qatar's authoritative legal portal (Constitution, laws, decree-laws,
-- decrees, decisions). Enumerated by a bounded, resumable ID-walk of
-- LawPage.aspx?id=N (its listings are JS-only); every stored row is validated as
-- a real law. TLS relaxed for THIS host only (incomplete cert chain).
INSERT INTO knowledge_sources (name, base_url, category, crawl_method, url_prefix, max_pages, crawl_interval_days, config)
SELECT * FROM (VALUES
  ('Al Meezan (Qatari Legal Portal)',
   'https://www.almeezan.qa/LawPage.aspx?id=2&language=en',
   'laws', 'almeezan', 'https://www.almeezan.qa/', 1500, 30,
   '{"insecure_tls": true, "walk_from": 1, "walk_to": 7200}'::jsonb)
) AS v(name, base_url, category, crawl_method, url_prefix, max_pages, crawl_interval_days, config)
WHERE NOT EXISTS (SELECT 1 FROM knowledge_sources WHERE crawl_method = 'almeezan');

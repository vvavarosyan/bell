-- Phase 6 · Qatar Knowledge Base (Val 2026-07-12). Bell learns every aspect of
-- Qatar — laws, ministries, processes/fees, key people, the political system —
-- from official sources, crawled locally (Crawl4AI / plain fetch; Firecrawl only
-- for discovery / JS-heavy pages) with periodic re-crawl + change detection so
-- Bell & Bella always know what's current. All source-stated (Rule 2.1).

-- The registry of sources to learn from (operator-managed).
CREATE TABLE IF NOT EXISTS knowledge_sources (
  id             bigserial PRIMARY KEY,
  name           text NOT NULL,
  base_url       text NOT NULL,
  category       text,               -- governance | laws | services | economy | people | other
  crawl_method   text NOT NULL DEFAULT 'fetch',   -- fetch | crawl4ai | firecrawl
  url_prefix     text,               -- only follow links under this prefix (defaults to base_url)
  max_pages      int NOT NULL DEFAULT 300,
  crawl_interval_days int NOT NULL DEFAULT 30,
  active         boolean NOT NULL DEFAULT true,
  last_crawled_at timestamptz,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- One row per learned page/document.
CREATE TABLE IF NOT EXISTS knowledge_pages (
  id           bigserial PRIMARY KEY,
  source_id    bigint,               -- soft ref → knowledge_sources.id
  url          text UNIQUE NOT NULL,
  title        text,
  section      text,
  content      text,                 -- cleaned readable text
  content_hash text,                 -- md5 of content, for change detection
  lang         text DEFAULT 'en',
  word_count   int,
  entities     jsonb,                -- extracted people / ministries / laws (later)
  ts           tsvector,             -- full-text search (config 'simple' → EN + AR safe)
  fetched_at   timestamptz NOT NULL DEFAULT now(),
  changed_at   timestamptz,          -- last time the content actually changed
  active       boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_pages_ts_idx     ON knowledge_pages USING gin(ts);
CREATE INDEX IF NOT EXISTS knowledge_pages_source_idx ON knowledge_pages (source_id);

-- Change log — every new / changed / removed page (powers "did anything change?"
-- periodic tracking + can surface as signals/notifications).
CREATE TABLE IF NOT EXISTS knowledge_changes (
  id          bigserial PRIMARY KEY,
  page_id     bigint,
  url         text,
  title       text,
  source_name text,
  kind        text NOT NULL,         -- new | changed | removed
  detected_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_changes_time_idx ON knowledge_changes (detected_at DESC);

-- Seed the Phase-1 LOCAL (plain-fetch) sources — governance + who-governs. Al
-- Meezan (laws) and Hukoomi (fees) come via their own dedicated crawlers.
INSERT INTO knowledge_sources (name, base_url, category, crawl_method, url_prefix, max_pages, crawl_interval_days)
SELECT * FROM (VALUES
  ('Ministry of Foreign Affairs',        'https://mofa.gov.qa/en/home',              'governance', 'fetch', 'https://mofa.gov.qa/en/', 250, 14),
  ('International Media Office',          'https://imo.gov.qa/en/',                   'people',     'fetch', 'https://imo.gov.qa/en/', 200, 14),
  ('General Secretariat, Council of Ministers', 'https://cm.gov.qa/en/Pages/default.aspx', 'governance', 'fetch', 'https://cm.gov.qa/en/', 200, 7),
  ('Shura Council',                      'https://www.shura.qa/en',                  'governance', 'fetch', 'https://www.shura.qa/en', 150, 21)
) AS v(name, base_url, category, crawl_method, url_prefix, max_pages, crawl_interval_days)
WHERE NOT EXISTS (SELECT 1 FROM knowledge_sources WHERE base_url = v.base_url);

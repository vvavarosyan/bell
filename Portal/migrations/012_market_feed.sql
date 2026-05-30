-- =============================================================================
-- Bell Data Intelligence — Market Feed (v0012)
-- =============================================================================
-- Live intelligence stream: news (RSS / Google News / GDELT) + research +
-- company registrations + data updates, processed by Bell and surfaced in one
-- ranked, filterable feed.
--
--   news_sources  — feed registry (what to poll, health, cadence)
--   news_items    — raw + processed news articles (dedup by guid)
--   feed_events   — the UNIFIED stream that powers the Market Feed in one query
--
-- PROD-OWNED tables: the poller runs on the always-on production app. These are
-- NOT in the local→prod mirror (like credits/reveals).
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- news_sources — the feed registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_sources (
  id                    bigserial PRIMARY KEY,
  name                  text NOT NULL,
  url                   text NOT NULL UNIQUE,
  kind                  text NOT NULL DEFAULT 'rss'
                          CHECK (kind IN ('rss','google_news','gdelt')),
  category_hint         text,                          -- default category for this source
  country               text DEFAULT 'QA',
  language              text DEFAULT 'en',
  active                boolean NOT NULL DEFAULT true,
  poll_interval_seconds integer NOT NULL DEFAULT 900,  -- 15 min default
  last_polled_at        timestamptz,
  last_status           text,                          -- 'ok' | 'error'
  last_error            text,
  consecutive_failures  integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_sources_active ON news_sources (active);

-- ---------------------------------------------------------------------------
-- news_items — one row per article (deduped by guid)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news_items (
  id                 bigserial PRIMARY KEY,
  source_id          bigint REFERENCES news_sources(id) ON DELETE SET NULL,
  source_name        text,
  guid               text NOT NULL UNIQUE,             -- publisher guid or url hash
  url                text,
  title              text NOT NULL,
  summary            text,
  image_url          text,
  author             text,
  published_at       timestamptz,
  fetched_at         timestamptz NOT NULL DEFAULT now(),
  language           text,
  -- Bell processing (filled by the LLM pass)
  category           text,                             -- economic | political | corporate | energy | real_estate | tech | legal | sports | other
  subcategories      text[],
  sentiment          text,                             -- positive | negative | neutral
  sentiment_score    numeric,
  region             text,
  entities           jsonb   NOT NULL DEFAULT '{}'::jsonb,    -- {companies:[], people:[], orgs:[], places:[]}
  linked_company_ids bigint[] NOT NULL DEFAULT '{}',
  linked_person_ids  bigint[] NOT NULL DEFAULT '{}',
  importance_score   numeric NOT NULL DEFAULT 0,
  is_breaking        boolean NOT NULL DEFAULT false,
  processed          boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_news_items_published   ON news_items (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_news_items_unprocessed ON news_items (processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_news_items_category    ON news_items (category);

-- ---------------------------------------------------------------------------
-- feed_events — unified activity stream (one query powers the whole feed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feed_events (
  id                 bigserial PRIMARY KEY,
  kind               text NOT NULL,   -- news | research | company_registered | dataset_update | signal
  ref_table          text,
  ref_id             bigint,
  title              text NOT NULL,
  summary            text,
  url                text,
  image_url          text,
  category           text,
  source_name        text,
  sentiment          text,
  importance         numeric NOT NULL DEFAULT 0,
  entities           jsonb   NOT NULL DEFAULT '{}'::jsonb,
  linked_company_ids bigint[] NOT NULL DEFAULT '{}',
  payload            jsonb   NOT NULL DEFAULT '{}'::jsonb,
  occurred_at        timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, ref_table, ref_id)
);
CREATE INDEX IF NOT EXISTS idx_feed_events_occurred  ON feed_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_events_kind      ON feed_events (kind);
CREATE INDEX IF NOT EXISTS idx_feed_events_category  ON feed_events (category);
CREATE INDEX IF NOT EXISTS idx_feed_events_companies ON feed_events USING gin (linked_company_ids);

-- ---------------------------------------------------------------------------
-- Seed sources. Google News RSS is reliable + flexible (any topic → a clean
-- feed); a few direct outlets add depth. Tune/extend later from the admin UI.
-- ---------------------------------------------------------------------------
INSERT INTO news_sources (name, url, kind, category_hint, country, language, poll_interval_seconds) VALUES
  ('Google News — Qatar Business',     'https://news.google.com/rss/search?q=Qatar+business&hl=en-US&gl=US&ceid=US:en',            'google_news', 'corporate',   'QA', 'en', 600),
  ('Google News — Qatar Economy',      'https://news.google.com/rss/search?q=Qatar+economy&hl=en-US&gl=US&ceid=US:en',             'google_news', 'economic',    'QA', 'en', 600),
  ('Google News — Qatar Politics',     'https://news.google.com/rss/search?q=Qatar+government+OR+ministry&hl=en-US&gl=US&ceid=US:en','google_news','political',   'QA', 'en', 900),
  ('Google News — QatarEnergy',        'https://news.google.com/rss/search?q=QatarEnergy+OR+Qatar+LNG&hl=en-US&gl=US&ceid=US:en',  'google_news', 'energy',      'QA', 'en', 900),
  ('Google News — Qatar Investment',   'https://news.google.com/rss/search?q=%22Qatar+Investment+Authority%22+OR+QIA&hl=en-US&gl=US&ceid=US:en','google_news','economic','QA','en', 1800),
  ('Google News — Qatar Real Estate',  'https://news.google.com/rss/search?q=Qatar+real+estate+OR+construction&hl=en-US&gl=US&ceid=US:en','google_news','real_estate','QA','en', 1800),
  ('Google News — Qatar Stock Exchange','https://news.google.com/rss/search?q=%22Qatar+Stock+Exchange%22+OR+QSE&hl=en-US&gl=US&ceid=US:en','google_news','economic','QA','en', 1800),
  ('Google News — Qatar Tech',         'https://news.google.com/rss/search?q=Qatar+technology+OR+startup&hl=en-US&gl=US&ceid=US:en','google_news','tech',       'QA', 'en', 1800),
  ('Google News — Qatar (all)',        'https://news.google.com/rss/search?q=Qatar+when:1d&hl=en-US&gl=US&ceid=US:en',             'google_news', 'other',       'QA', 'en', 600),
  ('Al Jazeera — All',                 'https://www.aljazeera.com/xml/rss/all.xml',                                               'rss',         'political',   'QA', 'en', 900),
  ('The Peninsula Qatar',              'https://thepeninsulaqatar.com/feed',                                                      'rss',         'other',       'QA', 'en', 1200),
  ('Doha News',                        'https://dohanews.co/feed/',                                                               'rss',         'other',       'QA', 'en', 1800)
ON CONFLICT (url) DO NOTHING;

INSERT INTO schema_migrations (version) VALUES ('0012') ON CONFLICT DO NOTHING;

COMMIT;

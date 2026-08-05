-- 105 — Replace the dead Google News feeds with Qatar's own publishers.
--
-- WHY. All nine Google News feeds stopped producing on 2026-07-10 and nothing surfaced it: the
-- poller kept returning a healthy HTTP 200 on an empty feed, and the admin route that would have
-- shown "this source has produced nothing in 27 days" was unreachable dead code (two handlers
-- registered on GET /sources — fixed in the same release). Verified live on production
-- 2026-08-06: the newest 100 news items were 99 Al Jazeera + 1 Doha News, zero Google. That is
-- exactly why the UI appeared to have only two sources — only two were actually working.
--
-- Val, 2026-08-06: "yes replace please with the ones you suggested."
--
-- EVERY URL BELOW WAS FETCHED BEFORE IT WAS WRITTEN HERE (Rule 2.2), on 2026-08-06:
--   qna.org.qa/en/Pages/RSS-Feeds/Economy-Local          HTTP 200, 50 items
--     ("QDB Invests in Multiverse Computing")
--   qna.org.qa/en/Pages/RSS-Feeds/Economy-International  HTTP 200, 50 items
--   qna.org.qa/en/Pages/RSS-Feeds/Analysis-and-Reports   HTTP 200, 32 items
--   gulf-times.com/rssFeed/2                             HTTP 200, 50 items — BUSINESS
--     ("Al Mahhar Holding H1 net profit surges 8.1%")
--   gulf-times.com/rssFeed/1                             HTTP 200, 50 items — general Qatar
-- Deliberately NOT added, because they do not work and Bell does not add a source it has not
-- seen produce items:
--   al-sharq.com/rss        HTTP 200 but zero <item> — it is an HTML index page, not a feed
--   qna.org.qa/en/rss       404 · gulf-times.com/feed 404 · thepeninsulaqatar.com/feed — the
--   Peninsula has never produced from its own feed (its 76 stored items all arrived via Google)
--   gulf-times.com/rssFeed/3 is SPORT — excluded on purpose, it is not business intelligence.
--
-- Qatar News Agency is the state wire, so it is the single most authoritative feed available for
-- Qatari company and economy events — and it names companies, which is what Bell's signal
-- generators key on.
--
-- Idempotent: url is UNIQUE, so re-running changes nothing.

INSERT INTO news_sources (name, url, kind, category_hint, country, language, poll_interval_seconds)
VALUES
  ('Qatar News Agency — Economy',        'https://qna.org.qa/en/Pages/RSS-Feeds/Economy-Local',          'rss', 'business',  'QA', 'en', 900),
  ('Qatar News Agency — International',  'https://qna.org.qa/en/Pages/RSS-Feeds/Economy-International',  'rss', 'business',  'QA', 'en', 1800),
  ('Qatar News Agency — Analysis',       'https://qna.org.qa/en/Pages/RSS-Feeds/Analysis-and-Reports',   'rss', 'other',     'QA', 'en', 3600),
  ('Gulf Times — Business',              'https://www.gulf-times.com/rssFeed/2',                          'rss', 'business',  'QA', 'en', 900),
  ('Gulf Times — Qatar',                 'https://www.gulf-times.com/rssFeed/1',                          'rss', 'other',     'QA', 'en', 1800)
ON CONFLICT (url) DO NOTHING;

-- Retire the Google feeds — but ONLY the ones that have genuinely stopped. This is written as a
-- measurement, not a blanket switch-off: a google_news source is deactivated only if it has
-- produced NOTHING in the last 21 days. If Google ever starts serving Bell again, a source that
-- is still working stays on, and re-enabling is a single UPDATE.
UPDATE news_sources s
   SET active = false,
       last_error = COALESCE(s.last_error, 'retired 2026-08-06: no items in 21+ days; replaced by QNA + Gulf Times'),
       updated_at = now()
 WHERE s.kind = 'google_news'
   AND s.active
   AND NOT EXISTS (
     SELECT 1 FROM news_items i
      WHERE i.source_id = s.id
        AND i.created_at > now() - interval '21 days');

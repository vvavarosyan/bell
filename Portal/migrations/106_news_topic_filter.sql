-- 106 — Per-source topic filter, and narrow Al Jazeera to business/Qatar.
--
-- WHY. bell.qa's sitemap carries 101 news pages and Google indexes them. Checked live
-- 2026-08-06, they include "SpaceX rocket segment to crash into the Moon", "Mohamed Salah lands
-- in Turkiye ahead of Trabzonspor move" and "Japan's Nikkei rises 3.66%". A Qatar
-- business-intelligence company is publishing football transfers under its own domain — it
-- dilutes the SEO signal and reads as unprofessional.
--
-- Al Jazeera publishes exactly ONE feed (xml/rss/all.xml — its /economy and /tag/... variants
-- both 404, verified), so narrowing cannot be done by choosing a different URL. It has to happen
-- at ingest. Val, 2026-08-06: "narrow it please."
--
-- topic_filter is a case-insensitive regex tested against title + summary. NULL = keep
-- everything, which is every other source's behaviour and the default. The poller treats an
-- INVALID regex as "keep the item" and logs once, so a bad pattern can never silence a source —
-- that is the precise failure mode that hid the Google News outage for 27 days.

ALTER TABLE news_sources ADD COLUMN IF NOT EXISTS topic_filter text;

COMMENT ON COLUMN news_sources.topic_filter IS
  'Optional case-insensitive regex over title+summary. NULL keeps every item. An invalid regex keeps every item (never silences the source).';

-- Qatar OR business/economy. Deliberately does NOT list sport terms to exclude: an allow-list is
-- safer than a block-list, because tomorrow''s irrelevant story will be about something nobody
-- thought to block.
UPDATE news_sources
   SET topic_filter = '(qatar|doha|qatari|al udeid|lusail|msheireb|gcc|gulf cooperation|opec|lng|liquefied natural gas|econom|business|trade|tariff|investment|investor|market|bourse|stock exchange|bank|finance|financial|inflation|budget|gdp|imf|world bank|oil price|gas price|energy deal|contract award|acquisition|merger|ipo|sovereign wealth|qia)',
       updated_at = now()
 WHERE url = 'https://www.aljazeera.com/xml/rss/all.xml';

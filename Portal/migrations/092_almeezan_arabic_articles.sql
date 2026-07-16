-- Al Meezan: capture the laws we were silently dropping, and their ARTICLES.
--
-- Val 2026-07-15: "I asked Bella about PDPPL regulations but she did not know anything
-- about it." Two verified causes (both fixed in server/knowledge/crawl_almeezan.js):
--
--   1. The crawler only ever fetched ?language=en. Al Meezan publishes ~2015-onward laws
--      in ARABIC ONLY; the English URL still returns HTTP 200 but with an EMPTY <title>,
--      so isLawPage() rejected it and the law was dropped with no warning. Qatar's PDPPL
--      (Law 13/2016) is id 7121 — proven live: &language=en → empty title (rejected),
--      &language=ar → "قانون رقم (13) لسنة 2016 بشأن حماية خصوصية البيانات الشخصية".
--      The crawler now tries English, then falls back to Arabic.
--
--   2. A LawPage's body is only the PREAMBLE; the ARTICLES live behind LawArticles.aspx
--      links. That is why all 4,565 stored laws average ~99 words and Bella could never
--      quote one. The crawler now pulls each chapter's articles too.
--
-- This migration makes the next scan actually re-walk with those fixes:
--   • walk_to 7200 → 11000. Al Meezan ids run past 10,400 (verified live: id 8200 =
--     'قانون رقم (26) لسنة 2019'), so the old ceiling cut off everything from ~2017 on.
--   • walk_cursor → 1, so the walk restarts from the beginning and re-checks every id with
--     the Arabic fallback + article fetch. upsertPage is idempotent (unchanged pages come
--     back 'same'), so this re-enriches rather than duplicates.
--
-- gazette_baseline_at is deliberately LEFT ALONE: it marks the end of the first full
-- archive pass, and re-walking must not turn a backfilled law into a fake "new law" signal.

UPDATE knowledge_sources
   SET config = coalesce(config, '{}'::jsonb)
                || jsonb_build_object('walk_to', 11000, 'walk_cursor', 1),
       updated_at = now()
 WHERE name ILIKE '%meezan%';

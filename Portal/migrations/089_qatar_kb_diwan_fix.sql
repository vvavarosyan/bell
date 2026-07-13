-- Phase 6 · Qatar Knowledge Base — data-quality fix (Val, 2026-07-13).
-- The first scan of Amiri Diwan leaked Arabic pages (served under the /ar-qa/ PATH,
-- which the old `sc_lang=ar` query-exclude never caught) and a soft-404 ("404 Page"),
-- and threw 62 errors from follow_query exploding ?sc_lang variants on Sitecore.
-- Fix: pin the crawl to the English /en/ PATH, stop following query strings, and
-- exclude the Arabic path explicitly. Re-probed live: 45 clean English links, zero
-- /ar-qa/, zero query-string links. (The stored junk is removed by the Bad-KB-Page
-- cleanup .command; the soft-404 guard in crawl.js stops new ones.)
UPDATE knowledge_sources
   SET url_prefix = 'https://www.diwan.gov.qa/en/',
       config = (config - 'follow_query') || '{"exclude_pattern":"/ar-qa(/|$)|/ar(/|$)"}'::jsonb,
       updated_at = now()
 WHERE base_url = 'https://www.diwan.gov.qa/?sc_lang=en';

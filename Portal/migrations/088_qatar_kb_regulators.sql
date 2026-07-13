-- Phase 6 · Qatar Knowledge Base — Tier-3 regulators + key authorities
-- (Val, 2026-07-13, after Hukoomi parked). Every source below was probed LIVE and
-- confirmed to serve real, server-rendered English content through the existing
-- generic crawler (server/knowledge/crawl.js) — no browser needed. Link graphs
-- verified (in-prefix links: MOCI 47 · CRA 146 · GTA 37 · QFC 85 · MoJ 46 · Diwan
-- 50), so BFS actually traverses each site rather than stopping at the homepage.
-- Arabic mirrors excluded (English only). Source-stated (Rule 2.1).
--
-- Deliberately NOT seeded here (need dedicated handling, not plain fetch):
--   • QCB / QFMA / MoPH — Microsoft SharePoint shells: near-empty landing pages,
--     sparse link graphs, Arabic content bleeding onto /en/ paths. Need SharePoint
--     Pages/ entry points + _vti_bin/_layouts/Authenticate exclusions — a separate
--     tuning pass, not a blind seed.
--   • GCO — WAF-gated (403 to plain fetch); needs the render path, like Hukoomi.
--   • NCSA / Ministry of Finance — JS shells (need Crawl4AI render).

INSERT INTO knowledge_sources (name, base_url, category, crawl_method, url_prefix, max_pages, crawl_interval_days, config)
SELECT * FROM (VALUES
  ('Ministry of Commerce and Industry',   'https://www.moci.gov.qa/en/',   'governance', 'fetch', 'https://www.moci.gov.qa/en/',  200, 21, '{"exclude_pattern":"/ar(/|$)"}'::jsonb),
  ('Communications Regulatory Authority', 'https://www.cra.gov.qa/en',     'regulator',  'fetch', 'https://www.cra.gov.qa/en/',   200, 21, '{"exclude_pattern":"/ar(/|$)"}'::jsonb),
  ('General Tax Authority',               'https://www.gta.gov.qa/en',     'regulator',  'fetch', 'https://www.gta.gov.qa/en/',   200, 21, '{"exclude_pattern":"/ar(/|$)"}'::jsonb),
  ('Qatar Financial Centre',              'https://www.qfc.qa/en',         'regulator',  'fetch', 'https://www.qfc.qa/en/',       200, 21, '{"exclude_pattern":"/ar(/|$)"}'::jsonb),
  ('Ministry of Justice',                 'https://www.moj.gov.qa/en',     'governance', 'fetch', 'https://www.moj.gov.qa/en/',   200, 21, '{"exclude_pattern":"/ar(/|$)","insecure_tls":true}'::jsonb),
  ('Amiri Diwan',                         'https://www.diwan.gov.qa/?sc_lang=en', 'governance', 'fetch', 'https://www.diwan.gov.qa/', 150, 21, '{"follow_query":true,"exclude_pattern":"sc_lang=ar"}'::jsonb)
) AS v(name, base_url, category, crawl_method, url_prefix, max_pages, crawl_interval_days, config)
WHERE NOT EXISTS (SELECT 1 FROM knowledge_sources WHERE base_url = v.base_url);

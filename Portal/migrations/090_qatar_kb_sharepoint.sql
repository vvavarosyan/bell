-- Phase 6 · Qatar Knowledge Base — two SharePoint regulators (Val, 2026-07-13).
-- A parallel investigation proved these serve REAL server-rendered English content on
-- their leaf Pages/*.aspx (the landing pages are JS shells, but the crawler's min-word
-- + isErrorShell gates skip those). Evidence: QFMA "Licensing Requirements" 397w,
-- "QFMA Law & Regulation" 288w, "Who We Are" 342w — 41-link English nav, no Arabic
-- bleed. MoPH "National Health Strategy 2024-2030" 503w, "Healthcare Professionals
-- Services" 311w — 60-link nav. The exclude patterns drop SharePoint system paths
-- (_vti_bin/_layouts/Authenticate/spsdisco/*.axd), the Arabic mirror, and Sitecore
-- template-literal ({{…}}) link junk. QCB was DROPPED — its /en/ path serves Arabic
-- with a 2-link graph (belongs in the browser-batch bucket with Hukoomi).

INSERT INTO knowledge_sources (name, base_url, category, crawl_method, url_prefix, max_pages, crawl_interval_days, config)
SELECT * FROM (VALUES
  ('Qatar Financial Markets Authority', 'https://www.qfma.org.qa/English', 'regulator',  'fetch', 'https://www.qfma.org.qa/English/', 120, 21,
     '{"exclude_pattern":"_vti_bin|_layouts|Authenticate\\.aspx|spsdisco\\.aspx|WebResource\\.axd|ScriptResource\\.axd|\\.axd|/Arabic/|%7[Bb]|\\{\\{"}'::jsonb),
  ('Ministry of Public Health',         'https://www.moph.gov.qa/english', 'governance', 'fetch', 'https://www.moph.gov.qa/english/', 200, 21,
     '{"exclude_pattern":"_vti_bin|_layouts|Authenticate\\.aspx|spsdisco|WebResource\\.axd|\\.axd|/arabic(/|$)"}'::jsonb)
) AS v(name, base_url, category, crawl_method, url_prefix, max_pages, crawl_interval_days, config)
WHERE NOT EXISTS (SELECT 1 FROM knowledge_sources WHERE base_url = v.base_url);

# Hukoomi (fees & government processes) — recon + build plan

**Status: PARKED after live recon (2026‑07‑13). Needs a Crawl4AI (real‑browser) crawler, not the plain‑fetch KB pipeline. Build it in a session where Val can watch the browser run.**

Val asked for Qatar government **fees, processes, required documents, restrictions** (Phase 6 Qatar Knowledge Base). Hukoomi (`hukoomi.gov.qa`) is the official one‑stop services portal that has this. This note records exactly what I found probing it live, so the future build starts de‑risked.

## What Hukoomi is (verified live 2026‑07‑13)

- **Cloudflare JS challenge** on every plain request → a bare `fetch()`/`curl` gets HTTP 403 "Just a moment…". Our local plain‑fetch crawler (`server/knowledge/crawl.js`) cannot pass it.
- **A second security appliance** on top: even a same‑origin in‑browser `fetch('/sitemap.xml')` returns **"The requested URL was rejected"**. So there is no usable sitemap to enumerate service URLs from.
- **Next.js SPA over Sitecore CMS** (`robots.txt` disallows `/*sitecore*`; pages carry `__NEXT_DATA__` with a `buildId`, e.g. `dJ1VK4dlXXTY_gsSpBIqq`). The `buildId` changes on every deploy, and the `/_next/data/<buildId>/…json` endpoints are WAF‑gated too.
- **Navigation is JS‑router**, not `<a href>` — the category → service links are rendered by React on click, so there are no crawlable hrefs to follow from the plain HTML.
- **BUT a real browser passes everything.** In the in‑app browser the homepage (`/en`), the services catalog (`/en/categories`), and governance pages all rendered fine. So Crawl4AI (Playwright, which Bell already runs locally) can reach and render Hukoomi — for both discovery AND the recurring re‑crawl (it is local + browser‑based, exactly what Val wanted for monitoring).

## Content worth having (seen on the site)

- **Services catalog** at `/en/categories` → per‑service pages with **fees, step‑by‑step process, required documents, the responsible entity, and channel** (online/in‑person). This is the fees/processes Val asked for.
- **Governance pages** (also useful for the KB): `/en/the-amir`, `/en/the-constitution`, `/en/advisory-council`, `/en/municipal-council`, `/en/government-and-legislatives`, `/en/strategy`.
- English + Arabic (Arabic under `/ar/…`).

## Recommended build (a dedicated Crawl4AI batch)

1. **Crawler**: `server/knowledge/crawl_hukoomi.js` driving **Crawl4AI** (the existing `server/enrichment/local/crawl4ai.js`), which renders JS and holds the Cloudflare clearance cookie for the session. Register the source in `knowledge_sources` with `crawl_method='crawl4ai'` and route it in `scan_knowledge.js` (the router switch is already there).
2. **Discovery** (no sitemap): render `/en/categories`, read the in‑page category list from the rendered DOM (or the `__NEXT_DATA__` JSON on that page), then render each category to collect its service slugs. Cache slugs so re‑crawls skip re‑discovery unless a category changed.
3. **Per‑service extraction**: from each rendered service page, capture **verbatim** the fee lines (QAR amounts → the existing `extractAmounts`), the numbered steps, the required‑documents list, the responsible entity, and the channel. Store into `knowledge_pages` (+ `entities.amounts` already handles fees). **Every value source‑stated (Rule 2.1)** — if a service page omits a fee, store no fee.
4. **Prove it (Rule 2.2)** against the BROWSER‑serialized HTML of 3–5 real service pages (X/X fees + steps correct) before shipping — Val should watch the Crawl4AI run once, since Cloudflare + the second appliance make headless verification flaky.
5. **Politeness**: Cloudflare throttles rapid clients; pace ~1 page / 1–2 s, recycle the browser periodically (the Crawl4AI harness already recycles every 150 pages), and never run it alongside another browser engine (8 GB Mac — Rule 2.5).

## Why it's parked, not built tonight

Building against Cloudflare + a second security appliance + a JS SPA needs a real browser and can only be trusted after a live, watched Crawl4AI run — it can't be verified headlessly overnight, and half‑shipping an unproven scraper violates the working agreement. The rest of the Qatar Knowledge Base (governance sources + Al Meezan laws + entity extraction + the browse UI) shipped tonight; Hukoomi is the one source that genuinely needs the browser path.

**Coordinate with Val before building** (he wanted coordination on the KB, and this one needs him to watch the Crawl4AI run once).

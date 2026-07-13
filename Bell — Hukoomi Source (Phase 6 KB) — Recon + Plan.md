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

## UPDATE 2026‑07‑13 — CONFIRMED BUILDABLE via our Crawl4AI engine

Tested live through Bell's own Crawl4AI service (already running on the Mac, `127.0.0.1:11235`):
- **Crawl4AI passes the Cloudflare challenge and renders Hukoomi** — `POST /crawl` on `/en/categories` returned `ok:true, status 200` with the full 306 KB rendered page (NOT the "Just a moment…" wall). So `crawl4aiRender(url)` (server/enrichment/local/crawl4ai.js) is the fetch path. (Caveat: pass `wait_for:0`, not a number — the server treats `wait_for` as a CSS selector.)
- **The content is Sitecore JSS** — everything lives in `__NEXT_DATA__.props.pageProps.layoutData.sitecore.route.placeholders` (the rendered components) + a global `itemAPI`. Category/service links are in the `MainPlaceHolder` component fields (JSS), not `<a href>` DOM links.

**Concrete build plan (next):** `server/knowledge/crawl_hukoomi.js`, crawl_method `crawl4ai`, routed in `scan_knowledge.js`:
1. Render `/en/categories` → parse the `MainPlaceHolder` JSS component tree for category → service item URLs.
2. Render each service page → read its own `layoutData` JSS fields for the fee / steps / required‑documents / responsible‑entity / channel (verbatim, Rule 2.1).
3. Store into `knowledge_pages` (source "Hukoomi"), entities.amounts already captures QAR fees.
4. Prove on 3–5 real service pages (X/X fees+steps correct) — this is the step to do WITH Val watching one Crawl4AI run, since Cloudflare + the JSS field names need eyes on a live render.

Remaining unknowns to pin during the build: the exact JSS field names for fee/steps/documents on a service page (needs one service page rendered + inspected), and the discovery walk through the category components.

## UPDATE 2026‑07‑13 (watched session with Val) — structure fully mapped; 1 fiddly piece left

Confirmed live through Crawl4AI + the in‑app browser:
- **Crawl4AI beats Cloudflare + renders + waits.** Use a direct `POST :11235/crawl` with `wait_selector:"css:.service-card"` + `settle_ms:3000` (crawl4aiRender only forwards `wait_for`=page_timeout, NOT `wait_selector` — so the Hukoomi crawler calls /crawl directly).
- **15 categories** at `/en/categories` (JSON in the rendered page).
- **Service cards** (`.service-card` → `.service-card--description-container > p` = title; `.service-card-ministry-container` = responsible ministry). Discovered **175 services** on the business category alone. `serviceTitles()` in `crawl_hukoomi.js` parses them reliably.
- **Service page = clean content:** `Service Description · Steps · Fees · Additional Information` + the ministry — extracts perfectly via `extractContent()`. Verified: "Apply for a License to Open a Branch…" → Fees "No fees are required", Steps "Download and fill…", Ministry of Education. There is also a **clean JSON endpoint per service**: `GET /_next/data/<buildId>/en/categories/<cat>/<service>.json` (buildId from `__NEXT_DATA__`).

**THE ONE BLOCKER:** the service **URL/slug** cannot be derived from the rendered page — the card title is ABBREVIATED ("Open Branch of Existing") vs the real slug ("open‑**a**‑branch‑of‑**an**‑existing"), and the card carries no href/data‑slug. The real service list is fetched client‑side from a **Sitecore search API on a different host**: `https://api-ra.qdf.gov.qa/searchapi/search/…` and `https://api-ra.qdf.gov.qa/sitecore/api/ssc/item/<GUID>/children?sc_lang=en&sc_apikey={CC80BAFB-FEC8-4931-81FD-A5D648ECBF25}`. A naive GET of those returns 404 — the working call needs the exact method/params/headers, captured from the live request. Once replayed, it yields every service's real slug → build `/en/categories/<cat>/<slug>` (or fetch its `/_next/data` JSON directly). **This is solo reverse‑engineering (capture the exact api-ra request/response), not a watched step.**

`crawl_hukoomi.js` is written (discovery + `extractContent` per service + upsertPage + resumable per‑category cursor); it just needs the real‑slug source wired in place of title‑slugification.

### FINAL VERDICT (2026‑07‑13, after full reverse‑engineering): the full catalog is AUTH‑GATED — recommend PARK

Captured the exact services call: **`POST https://api-ra.qdf.gov.qa/searchapi/search/categories`** with body `{"platform":"web","language":"en","category_name":"<Category Display Name>","default_sort_val":"a-z","request_type":"search","search_val":"","filter_val":{}}` (empty `search_val` = all services in that category). BUT replaying it returns **403** — and it stays 403 with the static Sitecore apikey in every header form (`apikey`, `sc_apikey`, `x-api-key`, `Authorization: Bearer`, query `?sc_apikey=`). The page's own call succeeds because it carries **session‑specific auth** (a rotating token, not the static key). So a crawler would have to (a) run a real browser session to mint the token, (b) replay the POST per category, and (c) re‑mint whenever the token rotates — **fragile**, and the failure mode is silent stale/empty data, which is exactly the "garbage" we must avoid (Rule 2.1 + Val's reliability bar).

What IS public + maintainable (no auth): the per‑service JSON `GET /_next/data/<buildId>/en/categories/<cat>/<slug>.json` and the rendered service page (fees/steps extract perfectly) — but ONLY if you already know the real slug, and the only complete slug source is the auth‑gated POST above. The public `/_next/data/<cat>.json` holds just a few featured services per category (~low coverage).

**Recommendation: PARK Hukoomi here** (thoroughly documented). Revisit only if Hukoomi exposes an open services API, publishes a sitemap, or the token proves stable/static. Better ROI now: the plain‑fetch Qatar sources (Official Gazette new‑law signal, Tier‑3 regulators QCB/GTA/MOL) which are reliable + maintainable.

## Why it was parked initially

Building against Cloudflare + a second security appliance + a JS SPA needs a real browser and can only be trusted after a live, watched Crawl4AI run — it can't be verified headlessly overnight, and half‑shipping an unproven scraper violates the working agreement. The rest of the Qatar Knowledge Base (governance sources + Al Meezan laws + entity extraction + the browse UI) shipped tonight; Hukoomi is the one source that genuinely needs the browser path.

**Coordinate with Val before building** (he wanted coordination on the KB, and this one needs him to watch the Crawl4AI run once).

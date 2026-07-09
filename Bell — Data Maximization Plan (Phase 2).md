# Bell — Data Maximization Plan (Phase 2)

**Date:** 2026‑07‑09 · **Status:** researched, awaiting Val's picks · **Directive:** §7.4 — upgrade the local engines to gather the maximum possible data, free and locally; keep the DB the latest available; research new data types; **100% valid DB before automated outreach**. *"Bell is a powerful radar — if data exists, Bell must have it."*

Everything below is **$0 external cost** (time only) unless marked. Nothing here needs proxies. All heavy work runs on the local Mac (8GB‑frugal, resumable, night‑paced) per the locality doctrine.

---

## 1. Where the database stands (from code + memory — verify counts in the Portal)

~191K companies total / ~76K active. Engines 7–11 (Harvester, Finder, Network Mapper, Email Finder, Company Facts) built + always‑on; coverage dashboard exists (Local Engines tab). Known soft spots, in order of pain:

1. **Activity codes / precise line-of-business** — companies carry derived industry *tags* only; no registry activity codes. (#72 works via tags today; codes would make it exact.)
2. **Financials/capital** — essentially empty (Engine 5 fills only from company websites that mention money).
3. **Websites** — ~14K of 76K active have one; the Finder+Firecrawl sweep addresses the rest over time.
4. **Decision‑maker emails** — Layer 2 limited by SMTP blocking; verify‑API is the known upgrade.
5. **Addresses for the map** — partial; many companies lack street/zone detail.
6. **Jobs** — thin (Stage 4 built but only ever run at tiny scale).

## 2. Track A — Squeeze the sources we already own (free, local)

### A1 ⭐ MOCI Stage‑2 detail engine — the crown jewel
Tonight's recon (on‑disk diagnostics from the May scan, `Data/…/MOCI/state/`) confirms:

- The Business Map's Power BI model has a **full Activities dimension** (`activity_names_lookup`, `Activity_Group`, `ACTIVITY_ID` — 605 mentions in captured traffic) linked to companies.
- The **detail page carries ~12 extra fields per company**: **Activities**, **Company Capital**, Trade Name, CR Creation Date, **Number of Branches**, CP Issue Date, Company Type, **Municipality, Zone, Street, Building** (README, confirmed against the scraper).
- The scraper already cracks the private `querydata` API via Playwright interception, **request bodies were captured** (direct batched queries — `WHERE CR_NUM IN (…)` — were the author's own designed-but-unbuilt Stage 2), and stage‑1 delivered 133,360 listings in ~28 minutes.

**One build closes four gaps at once:** activity codes (→ #72 becomes code‑exact + Companies findability gets registry‑grade precision), capital (→ the financials gap), full addresses (→ map), branches (→ expansion signals). Scale: ~60K active companies priority, ~213K total; 30–50h of night runs, fully resumable, scheduled — same pattern as the tender enrich. **Recommendation: build first.**

### A2 Registry freshness cadence
Per‑source scan `.command`s already exist (QFZ, QFC, CRA ICT, Made‑in‑Qatar, QFCRA, MOCI stage‑1, MoPH). The gap is *cadence + push*, and Val already mandated the fix: **#73 expanded — daily scheduled checks + auto‑push for ALL sources** (held until he's watched Signals a few days). Design lands there; nothing separate to build here.

### A3 Proof‑of‑search ledger
"Genuinely no data online" must be **proven, not assumed**: a small per‑company record of *what was searched, where, when, with what outcome* (engines already stamp `stage*_at`; this adds the outcome semantics + a "verified‑empty" badge in the drawer + coverage dashboard). Small build; makes the 100%‑valid claim auditable before outreach turns on.

## 3. Track B — New free local engine

### B1 Tech‑stack fingerprinting (named in §7.4)
Fingerprint each company website we already fetch (harvester HTML + headers): CMS (WordPress/Shopify/Wix/Drupal), commerce, analytics, chat widgets, hosting/CDN, frameworks. Pure local pattern matching — no external calls, no cost, unit‑testable. New datum → new Companies filter ("runs Shopify"), Bella awareness, and future signals ("just adopted X"). Moderate build on the Engine‑4/5 wiring pattern.

## 4. Track C — New external data (free‑first menu)

| # | Source | What Bell gains | Cost | Effort | Notes |
|---|--------|----------------|------|--------|-------|
| C1 | **QSE disclosures** — qe.com.qa (Company News + **Q‑Disclosure XBRL** + AGMs + board nominations + insider trades) | Structured financials + leadership/board‑change + capital‑action **signals** for Qatar's ~50 biggest companies; feeds news too | Free | Medium | Public pages; study structure live at build (likely server‑rendered lists). Highest signal value per company anywhere in Qatar. |
| C2 | ~~data.gov.qa acquisition~~ → **✅ ALREADY IN BELL** (Val's correction 2026‑07‑09): all 1,426 datasets live in Deep Data (`od_datasets`/`od_records`, API prepared, in production) | **Remaining opportunity = UTILIZATION**: derive signals/market statistics from the datasets we already hold (trade flows, labour, sector growth → Data Statistics sidebar + Bella context + map layers) + a re‑sync freshness cadence (fold into #73) | Free | Low‑Med | My research miss — I listed as "new" what Bell already ingested. Utilization work = querying our own od_records, zero scraping. |
| C3 | **Trade/logistics** | Import/export flows by product & country (buyer‑intent context for traders/logistics users) | Free via C2 | Low | Official trade stats live inside the od_* data we already hold (C2 utilization). **Vessel‑level AIS (MarineTraffic etc.) is commercial/ToS‑restricted — recommend AGAINST scraping**; check Mwani's official schedule pages at build instead. |
| C4 | **Kahramaa + Ministry of Transport tenders** | 4th/5th tender sources (km.qa list is structured) | Free | Low‑Med | Fold into the tenders pipeline after #73 scheduler lands. |
| C5 | **Al‑Meezan (almeezan.qa)** | Qatar's legislation portal — laws, not company data | Free | — | **Re‑routed to Phase 6**: it's the backbone for the Qatar regulatory knowledge base, not a DB feed. |

Not recommended now: vessel AIS scraping (ToS/legal), paid data brokers (against §7.4 free‑first), anything person‑data‑heavy without the PDPPL lawyer (outreach linchpin unchanged).

## 4b. How the giants do it — and Bell's edge (researched 2026‑07‑09)

**ZoomInfo:** contributory network (customers' email/CRM metadata feeds the shared DB), AI crawling of the public web, human+ML verification, technographics via its Datanyze acquisition (website fingerprinting), and "Intent" built on ~210M IP‑to‑org pairings + keyword‑to‑device tracking. **Apollo:** huge contact DB from a contributory network + public crawling + email‑verification loops; its intent data is **bought third‑party** (Bombora/LeadSift), account‑level only — and practitioner reviews call it noisy.

**Bell already runs the same machine, Qatar‑deep:** contributory network = Import Phase 2 + snowball doctrine · AI crawling = Engines 7–11 + Crawl4AI · verification = Engine 4 + the 100% accuracy bar · technographics = **B1 (this phase)** · org charts/scoops = People + news_events + leadership signals.

**Bell's edge — our touch:** the giants *infer* intent from anonymous web traffic and keyword statistics; **Bell owns real, verifiable intent** — actual government tenders (open + awarded winners), hiring velocity from real postings, registry deltas, and (C1) QSE disclosures. In Qatar, Bell's signal ground‑truth is stronger than anything ZoomInfo can model from bidstream data. Depth-per-market beats breadth: 100% of Qatar first, then replicate source‑by‑source across GCC (UAE, KSA, Oman, Kuwait, Bahrain) on the same engine chassis — only the sources are country‑specific, the machine is not.

## 5. Recommended sequence

1. **A1 MOCI Stage‑2** (nights, after the tender enrich finishes — same resumable pattern; biggest single upgrade the DB can get, and it feeds #72/findability/map/financials at once).
2. **B1 Tech‑stack engine** (build while A1 runs nights — independent code paths).
3. **A3 Proof‑of‑search** (small; certifies the "100% valid" bar).
4. **C1 QSE** then **C2 data.gov.qa** (each = study live → build scraper/ingest → signals).
5. A2/C4 land inside the expanded #73 scheduler when Val green‑lights it.

## 6. Decisions for Val

1. Approve the sequence above, or reorder (anything can move except A1‑before‑#72‑upgrade, which is inherent).
2. **A1 nights:** OK to dedicate the Mac's nights to MOCI Stage‑2 once tender enrich completes? (Same click‑only pattern: an install/run `.command` + progress/health check `.command`.)
3. **B1 tech‑stack:** green‑light the new engine? (Free, local; adds one migration + an EngineTab card.)
4. **C1 vs C2 order** if you disagree with QSE‑first.
5. Anything on the menu you want researched deeper before building?

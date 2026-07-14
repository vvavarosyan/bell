# MoPH licensed pharmacies / health facilities — recon + park

**Status: PARKED 2026‑07‑14 (Val's call). The licensing INFO pages are already in the KB and reliable; the NAMED registry needs a Playwright navigation‑aware scraper we don't have yet. Fully mapped below so it's a clean pickup.**

## What's valuable + PDPPL‑safe
MoPH (moph.gov.qa) publishes two registries of **licensed businesses** (not individuals → not PDPPL‑sensitive):
- **Pharmacy Locator** `/english/OurServices/eservices/Pages/pharmacy-locator.aspx` — every licensed pharmacy: **name, phone, area, and Google‑Maps coordinates** (`.pahrmacy-locator-item` → `<h4>` name + phone text + a "Find On Map" `?query=LAT,LNG` link).
- **Health Facilities register** `/english/OurServices/eservices/Pages/Health-Facilities.aspx` — *"online register [that] only shows medical institutes currently licensed in the state of Qatar and approved by MoPH"*; per‑facility price‑list PDFs at `/Admin/HealthFacilitiesPriceList/{ID}.pdf`.

These would enrich Bell company profiles ("holds a MoPH facility/pharmacy licence") and are a trust signal.

## The mechanism (fully mapped live 2026‑07‑14)
- It's a **SharePoint + ASP.NET WebForms** page. Filtering is a **postback**: a `<select id="ddlAreas">` of **~100+ Qatar districts** (val=0 "Select Area", val=130 "Abu Hamour", … up to 244+) + an `<input type="submit" name="…$btnSearch">`. Selecting an area + Search does a full‑page `__doPostBack` and the server re‑renders `divResults` with that district's pharmacies.
- Baseline GET (no area) returns only the first ~10 pharmacies (alphabetical "A"). The full list requires iterating the ~100 area postbacks.

## Why plain fetch + Crawl4AI both fail
- **Plain‑fetch postback** (replay `__VIEWSTATE`/`__EVENTVALIDATION` + `ddlAreas` + `btnSearch` as a form POST): the WAF returns **"Request Rejected"** (246 bytes). Same appliance that rejects the SharePoint `_api` REST. GET is allowed; POST is not.
- **Crawl4AI** (our browser engine): it renders the page (WAF‑cleared) and **executes** the area‑select + Search click / `__doPostBack`, but it does **not reliably capture the page AFTER the postback navigation** — every attempt (flat `js_code`+`wait_for`, and `session_id`+`js_only`) returned the **baseline "A" list**. Storing that would label every district with the default pharmacies = **misleading data → must not ship (Rule 2.1)**.

## The clean build (when picked up)
An ASP.NET full‑page postback needs a browser that **waits for the navigation** — that's **Playwright** (Bell doesn't depend on it today; it only talks to the Crawl4AI service). Plan:
1. Add Playwright (chromium) to the Portal.
2. Open the locator once (clears the WAF/JS), then for each of the ~100 `ddlAreas` values: `selectOption` → click Search → `waitForLoadState('networkidle')` → parse `.pahrmacy-locator-item` (name/phone/lat/lng). **Per‑area success tracking + retry** so the run is never silently partial (proof‑of‑search philosophy — [[qatar-knowledge-base]] A3 ledger).
3. Dedup by name+phone; store `licensed_facilities` (mirror table) with source + as‑of date; a `Run MoPH Licences Scan.command`; a Bella `get_licensed_facilities` tool; match to companies by name (careful — Rule 2.1).
4. Pace hard against the WAF; single browser (8 GB — Rule 2.5); never alongside another crawler.

Revisit when the Playwright dependency is acceptable. Same class as [[hukoomi]] but NOT auth‑dead — this one is buildable, just needs the right browser tool.

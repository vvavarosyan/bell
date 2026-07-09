# Bell — MOCI Stage-2 Design (Phase 2 · A1)

**Date:** 2026‑07‑09 · **Status:** model fully mined + query builder proven offline; **one live capture needed** before the production loop. · **Why it matters:** the single biggest upgrade the DB can get — activity codes (→ #72 code‑exact), company capital, full address+coordinates, branch count, and registry people, for ~60K active companies. Free, local, resumable.

## What Stage 1 already gives us
The MOCI scraper pulls the ~listing for every company: CR/CP number, org name, statuses, legal form, expiry dates (133,360 rows in the last scan). No activities, no capital, no address detail, no people.

## What Stage 2 adds (mined from the report's own Power BI model, 2026‑07‑09)
The Business Map is a Power BI report over dataset model **6970** (report `6ab0e66a‑1d50‑4bbf‑9971‑4dc7369c3a20`). Its `/conceptualschema` — captured in `state/diagnostic-wabi.json` — exposes **73 entities**. The ones we harvest:

- **`CR_CP_data`** (55 cols) — the master detail row. Bell pulls: `CR_NO, CP_NO, NAME, ORG_NAME_ENU, CR_ISSUE_DATE, CR_EXPIRY_DATE, CP_ISSUE_DATE, CP_EXPIRY_DATE, CP_STATUS, X_CRN_STATUS, LEGAL_FORM_EN, CAPITAL, NATIONALITY, MUNICIPALITY, DISTRICT, ZONE, STREET_NUMBER, BUILDING_NUM, LONGITUDE, LATITUDE, "number of branches"`.
- **`final_table`** — the activity link already joined to names: `CR_NUM, ACTIVITY_ID, "Relation.ISIC ID", activity_names_lookup, arab_activity_names`. This is the #72 **code‑exact** prize (numeric activity + ISIC, not just a tag).
- **`Activity`** dimension — `ActivityID, Code, "Activity names", group_name` (fallback/label source).
- **`CR_BOARD` / `CR_Partner` / `CR_Signatory`** — registry PEOPLE with `Name` + `Designation`/type. Board members, partners, signatories straight from the registry. ⚠️ PDPPL‑sensitive (People lockdown) — ingest to the admin‑only people store, never expose publicly; decide handling with Val before wiring people.

## How Stage 2 pulls it (the transport)
The report renders by POSTing `SemanticQueryDataShapeCommand` queries to its Power BI **querydata** endpoint on a dedicated capacity host (`…pbidedicated.windows.net/webapi/capacities/…/QueryExecutionService/…querydata`). We replicate that: one query with a `Where … CR_NO In (batch)` fetches a whole batch of companies' detail in a single round trip — far faster than the per‑company detail‑page navigation the original author sketched.

- **Query builder — BUILT + PROVEN offline** (`stage2_query.py`, 14/14 self‑tests): constructs the exact `From → Select → Where(In) → Binding` grammar mined from the report's own captured requests, with SQL‑quote escaping and the model id. Testable with zero network.
- **Transport token — must be captured live.** The Authorization token + exact endpoint are **browser‑negotiated** (confirmed: not present anywhere in the diagnostics). So Stage 2 captures the report's own querydata request in a live session and **replays** it with our batch bodies, reusing the live token. This is why a one‑time live diagnose is required — and it's the same "prove on real data first" gate that made Stage 1 correct and would have prevented the Monaqasat mispairing bug.
- **Decoder — reuse, don't reinvent.** `scraper.py` already has `decode_dsr` + `decode_listing_response` for Power BI's compressed DSR columnar format (dictionaries + R/C bitmasks). Stage 2's response is the same format with our columns; we finalise the column‑mapping against the **real captured response**, not a guess.

## The one live step (diagnose‑first)
`diagnose_details.py` + **`Diagnose MOCI Details.command`** (BUILT): opens a visible Chrome, you click "Search for Organizations" once, it captures the live querydata request and replays our **detail** + **activity** queries for 6 real CR numbers from the latest scan, then saves `state/diagnostic-details.json`. Read‑only — nothing touches Bell. That file lets Claude finalise the decoder + the field→Bell mapping against real bytes.

## Field → Bell mapping (to finalise post‑capture)
| MOCI field | Bell destination |
|---|---|
| CAPITAL (+currency) | `company_financials` (metric `registered_capital`, source `moci`) |
| ACTIVITY_ID + ISIC + activity_names_lookup | new `company_activities` (code‑exact) → upgrades #72 + Companies findability |
| MUNICIPALITY/DISTRICT/ZONE/STREET/BUILDING + LON/LAT | company address + map coordinates |
| number of branches | company `extra_fields.branches` → expansion signal |
| LEGAL_FORM_EN, NATIONALITY, dates, statuses | company fields (fill gaps; never overwrite a better value) |
| CR_BOARD/Partner/Signatory (name+designation) | admin‑only people (PDPPL) — **hold for Val's decision** |

## Build sequence
1. **(Val, once)** run **Diagnose MOCI Details.command** → send `state/diagnostic-details.json`.
2. **(Claude)** finalise the DSR decoder mapping + `company_activities` migration + the Stage‑2 production loop **inside `scraper.py`** (`SCRAPE_MODE=details`): resumable batches of ~200 CRs, night‑paced, writes `moci_details_*.json`, then the existing ingest maps it into Bell + mirror‑push.
3. **(Val)** run it over nights (30–50h, resumable) alongside the always‑on engine.

Everything above is `$0`, local, and respects the 8GB‑RAM + click‑only constraints.

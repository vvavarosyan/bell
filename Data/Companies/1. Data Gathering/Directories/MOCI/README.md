# MOCI — Ministry of Commerce & Industry Business Map

Local engine that pulls every active company from MOCI's business map
into clean JSON files ready for Bell.qa upload — no terminal, no code.

Source: <https://businessmap.moci.gov.qa>

> **About this scraper:** MOCI is fundamentally different from QFZ and
> QFC. The whole site is a React shell wrapping a Microsoft Power BI
> embedded report — there is no public REST API, no usable CSV export
> path, and no auth token that can hit the Power BI Export REST API.
> The only viable approach is to drive a real browser (headless
> Chromium) and intercept the private `wabi.powerbi.com` queries that
> Power BI's iframe uses to render the report. That's what this
> scraper does, via Playwright.
>
> **About scale:** MOCI has 213,199 companies total, ~59,871 active.
> By default this scraper captures the ~59,871 Active subset across
> both the Commercial Organizations table (10 listing fields) and the
> Professional License table (8 listing fields), plus the ~12 extra
> fields each company exposes on its detail page (Trade Name, Company
> Capital, CR Creation Date, Number of Branches, CP Issue Date,
> Company Type, Municipality, Zone, Street, Building, Activities). A
> full scan with detail data is **30–50 hours** of work, spread across
> several scheduled runs that resume from where the previous run left
> off.

---

## Status — this scraper is scaffolded but not yet finalised

The Playwright bootstrap, the request interceptor, the click-commands,
and the diagnostic capture are all in place. The **production
listing/detail parser still needs one piece of real data from MOCI** to
finalise: the exact JSON field-names Power BI uses inside its
`querydata` responses. That comes from running the diagnostic once
against the live site.

**Run order on first install:**

1. Double-click `Install Daily Auto-Scan.command` — sets up the
   Python venv, installs Playwright (~30 MB), downloads Chromium
   (~150 MB, one-time), and registers the weekly schedule. Takes
   roughly 3-5 minutes the first time.
2. Double-click `Diagnose MOCI.command` — launches Chromium, opens
   the live MOCI page, captures the Power BI traffic for ~60 seconds,
   writes the result to `state/diagnostic-summary.txt` and
   `state/diagnostic-wabi.json`.
3. Send those two files to Claude. Claude finalises the listing/
   detail field-name parser based on what Power BI actually returned.
4. Double-click `Run Scan Now.command` — starts the real scrape.
   (The weekly auto-scan will also kick in automatically.)

---

## What you'll see in this folder

| File | What it does |
|---|---|
| **▶ Run Scan Now.command** | Production scrape on demand. |
| **🔍 Diagnose MOCI.command** | One-time live capture for Claude to tune the parser. |
| **⚙ Install Daily Auto-Scan.command** | First-time setup + weekly schedule registration. Re-run after editing `schedule.config`. |
| **✕ Uninstall Daily Auto-Scan.command** | Turns off the weekly auto-scan. |
| `schedule.config` | Day-of-week, time, runtime cap, active-only flag, detail-fetch flag, polite delays. |
| `scraper.py` | Playwright + Power BI request interceptor. |
| `requirements.txt` | Playwright + lxml (installed into `.venv/`). |
| `.venv/` | Self-contained Python env + Chromium (~250 MB total). |
| `state/progress.json` | Resume state — auto-managed. |
| `state/scraper.lock` | PID lock so two runs can't overlap. |
| `scans/` | Output: `moci_companies_<date>_<time>.json` + `moci_companies_latest.json`. |

---

## Default schedule + scope

`schedule.config` defaults to:

    day=sun                              ← weekly run, Sundays
    time=02:00                           ← starts at 2:00 AM local
    max_run_minutes=720                  ← 12-hour cap per run
    active_only=true                     ← only Active companies
    include_professional_license=true    ← scrape both tables
    fetch_details=true                   ← pull the 12 extra detail fields
    scroll_pause=1.0
    detail_pause=1.5
    headless=true                        ← run invisibly

Edit any of these in TextEdit, then double-click `Install Daily
Auto-Scan.command` again to apply.

---

## Why weekly, not daily

Three reasons. (1) A full Active scrape with detail is 30–50 hours —
that doesn't fit in a daily 12-hour window without resume, and
running multiple back-to-back days hammers MOCI's already-flaky
backend. (2) MOCI's `/app/Token/EmbedToken` endpoint has been seen
returning 503 — weekly cadence gives more chances to retry on bad
days. (3) Business-registry data doesn't change fast enough to need
daily updates anyway.

If you want it more frequent later, change `day=daily` in
`schedule.config` and the install script will register a daily
LaunchAgent instead.

---

## Output JSON shape (target — final shape after diagnostic tuning)

    {
      "source": "MOCI - Qatar Business Map",
      "source_url": "https://businessmap.moci.gov.qa",
      "scraper_version": "1.0.0",
      "scan_started_at": "...",
      "scan_completed_at": "...",
      "active_only": true,
      "total_count": 59871,
      "commercial_count": 46871,
      "professional_count": 13000,
      "companies": [
        {
          "entity_type": "commercial",
          "organization_name": "Abdali Curtains & Accessories",
          "trade_name": null,
          "legal_form": "W.L.L",
          "cr_number": "99993",
          "cr_status": "Active",
          "cr_creation_date": "11/06/2017",
          "cr_expiry_date": "06/12/2025",
          "company_capital": "200000",
          "cp_number": "62894",
          "cp_status": "Active",
          "cp_issue_date": "02/07/2014",
          "cp_expiry_date": "26/11/2025",
          "number_of_branches": 1,
          "company_type": "Commercial",
          "classification": "Small",
          "classification_year": "2023",
          "municipality": "AL DOHA MUNICIPALITY",
          "zone": "26",
          "street": "850",
          "building": "42",
          "activities": [
            {"code": "521300", "name": "Trading in curtains"}
          ]
        }
      ],
      "professional_licenses": [ ... 8 fields each, same shape ... ]
    }

---

## Diagnostic step in detail

The MOCI scraper is built to a known-unknown: the exact JSON field
names Power BI uses internally for company rows. We know what data is
available (confirmed via Claude Chrome Extension's live inspection),
but Power BI's `wabi.powerbi.com/querydata` responses use abbreviated
column references (e.g. `M0`, `M1`, `D0`...) that vary by report. The
Diagnose command captures one real response so the parser can be
written against the actual shape rather than guessed.

`Diagnose MOCI.command` writes two files into `state/`:

* `diagnostic-summary.txt` — human-readable summary of what was
  captured (URLs, statuses, top-level JSON keys).
* `diagnostic-wabi.json` — every captured `wabi.powerbi.com` request +
  response in full.

Send those to Claude. The production parser will be locked in based on
what they reveal, and `Run Scan Now.command` becomes meaningful from
that moment.

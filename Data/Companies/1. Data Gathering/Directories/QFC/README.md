# QFC — Qatar Financial Centre Public Register Scraper

Local engine that pulls every company in the QFC Public Register into
clean JSON files ready to upload to the Bell.qa platform — no terminal,
no code.

Source: <https://eservices.qfc.qa/QFCPublicRegister/PublicRegister.aspx>

> **About what's collected:** the live QFC public register has roughly
> **5,242 companies across 175 listing pages**, spanning every licence
> status (Licensed, Withdrawn, Liquidation, Inactive, etc. — confirmed via
> direct browser inspection). The unfiltered default view returns every
> company regardless of status, so the scraper simply paginates
> `?page=1..175` instead of trying to iterate the broken status-filter
> mechanism. Plus the 10 trusts from the Register of Trusts as a separate
> entity type.
>
> **For each company** we capture from the listing card: QFC number,
> Arabic name, English name, license status (one of the 12 categories),
> location — and from the detail page (one POST per company): permitted
> activities, registration status, place of incorporation, date of QFC
> incorporation/registration, legal status, directors, principal
> representative + place of business + date of incorporation outside QFC
> (for branches), financial year end, date of licence, senior executive
> function, registered address, plus any bonus fields the site exposes
> (e.g. share capital, secretary, significant shareholders) — those land
> in `detail_other_*` keys so nothing is silently dropped.
>
> **For each trust** we capture: TR-number, Arabic name, English name,
> registration status, location, date of registration, trustee
> information, and CRM account number.
>
> **A full scan takes roughly 4.5 hours** at default delays (2-4 sec
> randomized between every request) — comfortably inside the 6-hour
> per-run cap. If the run hits the cap mid-scan, the next scheduled run
> resumes from the next listing page automatically.
>
> **WAF note:** the site has an Azure Web Application Firewall that
> returns 403 on aggressive scrapers. The default delays are tuned to
> stay below its threshold. If you see 403s in `scans/scheduler.log`,
> bump `delay_min` / `delay_max` higher in `schedule.config`.

---

## One-time setup

1. **Install Python 3.** Most Macs already have it. If not, open the
   `Install Daily Auto-Scan.command` once — if Python is missing it will
   tell you how to install it from <https://www.python.org/downloads/>.

2. **Turn on the daily auto-scan.** In this folder, double-click:

       Install Daily Auto-Scan.command

   The installer creates a private Python virtual environment (`.venv/`)
   right next to the scraper, installs `requests`, `beautifulsoup4` and
   `lxml` into it, and registers a daily LaunchAgent. Nothing else on
   your system is modified.

> The first time you double-click a `.command` file, macOS may show a
> security prompt. If it does, **right-click the file → Open**, and click
> **Open** in the dialog. macOS remembers your choice from then on.

---

## What you'll see in the folder

| File | What it does |
|---|---|
| **▶ Run Scan Now.command** | Double-click to run / resume the scraper right now. |
| **⚙ Install Daily Auto-Scan.command** | Double-click once to enable daily auto-scan + venv. Re-run after editing the schedule to update it. |
| **✕ Uninstall Daily Auto-Scan.command** | Double-click to turn off the daily auto-scan. |
| `schedule.config` | Plain text — time of day + max minutes per run. |
| `scraper.py` | The scraper itself. Don't need to touch. |
| `requirements.txt` | Python deps installed into `.venv/`. |
| `.venv/` | Created by the installer. Self-contained Python env. |
| `state/progress.json` | Resume state — automatic, deleted on completion. |
| `state/scraper.lock` | PID lock so two runs can't overlap. |
| `scans/` | Output: a `qfc_companies_<date>_<time>.json` per completed scan, plus `qfc_companies_latest.json`. |

---

## How the daily run works

1. **Each night at 2:00 AM** (configurable), the LaunchAgent starts the
   scraper. It iterates through every status filter, paginates within
   each, and POSTs each company's detail page with the Referer/Origin
   headers the server requires (this is the critical bit — without
   those headers the server bounces us to qfc.qa's homepage). A full
   scan finishes in roughly 90 minutes at default delays.
2. **If a run hits the 6-hour cap** before finishing (only really
   plausible if you slowed the delays way down or QFC was rate-limiting),
   progress is saved per `(status, page)` and the next scheduled run
   picks up exactly where it left off.
3. **If you double-click Run Scan Now.command** while a scheduled run is
   in progress, it detects the lock and exits harmlessly.

---

## Changing the time / runtime cap / delays

1. Open `schedule.config` in **TextEdit** (right-click → Open With → TextEdit).
2. Change any of these lines:

       time=02:00              ← time of day, HH:MM 24-hour local
       max_run_minutes=360     ← cap per run, default 360 (6 hours)
       delay_min=1.5           ← shortest pause between requests (seconds)
       delay_max=3.5           ← longest pause between requests (seconds)
       fetch_details=false     ← try per-company detail POSTs (currently broken on QFC side)

   The file has a trade-off table in the comments. As reference points:

       2.0 - 4.0s     ~4.5 hours    (default — comfortable in 6h, WAF-safe)
       1.5 - 3.5s     ~3.7 hours    (slightly faster, slight WAF risk)
       3.0 - 6.0s     ~6.8 hours    (paranoid, may span 2 runs)

3. Save the file.
4. Double-click `Install Daily Auto-Scan.command` again to apply.

If you ever see HTTP 429 or 503 errors in `scans/scheduler.log`, the
site is pushing back — raise the delays.

---

## Where the JSON files land

    scans/
    ├── qfc_companies_2026-05-15_021412.json   ← a completed scan
    ├── qfc_companies_latest.json              ← pointer to most recent
    ├── scheduler.log                          ← stdout of each scheduled run
    └── scheduler-error.log                    ← stderr of each scheduled run

Each output file looks like:

    {
      "source": "QFC - Qatar Financial Centre Public Register",
      "source_url": "https://eservices.qfc.qa/QFCPublicRegister/PublicRegister.aspx",
      "scraper_version": "3.0.0",
      "scan_started_at": "2026-05-13T02:00:01+00:00",
      "scan_completed_at": "2026-05-13T06:32:14+00:00",
      "total_count": 5252,
      "company_count": 5242,
      "trust_count": 10,
      "pages_scraped": 175,
      "total_pages": 175,
      "companies": [
        {
          "entity_type": "company",
          "qfc_number": "05243",
          "arabic_name": "...",
          "english_name": "Innovbon Technologies LLC",
          "license_status": "Licensed",
          "location": "Doha Qatar Office No. 4...",
          "licence_status": "Licensed",
          "permitted_activities": "Designing the structure...",
          "registration_status": "Registered",
          "place_of_incorporation": "QFC",
          "legal_status": "QFC LLC",
          "directors": "Mr SUSHANT PUPNEJA",
          "registered_address": "Office No. 4, Floor No. 9, QFC Tower 1, Doha, Qatar",
          "financial_year_end": "31-December",
          "date_of_qfc_incorporation_or_registration": "12/05/2026",
          "date_of_licence": "12/05/2026",
          "senior_executive_function": "Mr SUSHANT PUPNEJA",
          "_source_listing_page": 1,
          "_scraped_at": "..."
        }
      ],
      "trusts": [
        {
          "entity_type": "trust",
          "qfc_number": "TR00001",
          "english_name": "The West Bay Trust",
          "arabic_name": "...",
          "license_status": "Registered",
          "location": "Doha Qatar Office No. 1422...",
          "date_of_registration_of_the_trust": "07 Feb 2022",
          "crm_account_no": "104363",
          "trustee_information": "Name TMF Group LLC ..."
        }
      ]
    }

Fields not present on a particular company (e.g. Principal Representative
— Branch-only, not LLC) come through as `null`. Unrecognized labels land
under `detail_other_*` so nothing is silently dropped.

---

## Checking that the scheduler ran

    scans/scheduler.log          ← each line tagged with [YYYY-MM-DD HH:MM:SS]
    scans/scheduler-error.log    ← should be empty in normal operation
    state/progress.json          ← if present, a scan is in flight

If you see `state/scraper.lock` and no python process is running, it's a
stale lock from an interrupted run. The next scrape will clean it up
automatically.

---

## Advanced (only if you're curious)

The daily schedule is a standard macOS LaunchAgent at
`~/Library/LaunchAgents/com.bell-qa.qfc-scraper.plist`. It invokes
`.venv/bin/python3 scraper.py` with `SCRAPE_MAX_MINUTES` set from
`schedule.config`. The Uninstall command unloads and removes it.

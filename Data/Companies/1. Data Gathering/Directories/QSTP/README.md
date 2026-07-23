# QSTP — Qatar Science & Technology Park Community Directory

Local engine that pulls the QSTP community-directory listing into clean
JSON files ready to upload to the Bell.qa platform — no terminal, no
code.

Source: <https://qstp.qa/directory/>

> **About what's collected:** the QSTP directory currently has ~98
> companies. For each one we capture: ID, name, slug, directory URL,
> logo URL, category (Company / Startup), sector tags (AI, Energy,
> Health & Biomed, etc.), description, Impact statement, Sector
> statement, Stage (Pre-Seed / Seed / etc. — where present), and
> contact details (website, email, LinkedIn, Twitter/X, Facebook,
> Instagram, YouTube, phone).
>
> A full scan finishes in **under a minute** — the WordPress REST API
> returns all 98 companies in a single request, and we hit only 5
> small HTML pages to fill in two fields the API doesn't expose
> (Stage + icon-based contact links for newer startup entries).

---

## One-time setup

1. **Install Node.js** if you don't have it: <https://nodejs.org>
   (LTS `.pkg`, double-click to install).
2. In this folder, double-click `Install Daily Auto-Scan.command`.
   It installs `axios` and `cheerio` (the two scraper deps) into
   `node_modules/` and registers a daily LaunchAgent.

> The first time you double-click a `.command` file, macOS may show a
> security prompt — right-click → Open, then click Open in the dialog.

---

## What you'll see in the folder

| File | What it does |
|---|---|
| **▶ Run Scan Now.command** | Double-click to run the scraper immediately. |
| **⚙ Install Daily Auto-Scan.command** | Double-click once to enable daily auto-scan. Re-run after editing the schedule. |
| **✕ Uninstall Daily Auto-Scan.command** | Double-click to turn off the daily auto-scan. |
| `schedule.config` | Plain text — change the time of day. |
| `scrape_qstp.js` | The scraper itself. |
| `package.json` | Dependency manifest. |
| `node_modules/` | Created by the installer. Contains axios + cheerio. |
| `scans/` | Output: dated JSON + a `qstp_companies_latest.json` pointer. |

---

## How it works under the hood

The QSTP site is a WordPress + Elementor setup with a custom post type
(`directory`). The cleanest data source is the public WordPress REST
API. The scraper does:

1. `GET /wp-json/wp/v2/directory?per_page=100&_embed=wp:featuredmedia` —
   returns ~98 companies with ID, name, slug, link, logo URL (via
   embedded featured media), `content.rendered` HTML (description,
   Impact, Sector, contact links), category IDs, tag IDs.
2. For each of the 5 paginated listing pages, scrapes the rendered
   Elementor cards for two fields the REST API doesn't expose:
   - **Stage** (Pre-Seed / Seed / Series A-E / Growth) — rendered by
     Elementor's dynamic-heading widget.
   - **Icon-based contact links** — newer startup entries use icon
     widgets with `title="Website"`, `title="LinkedIn"`, etc. that
     don't appear in the REST `content.rendered`.
3. Merges DOM data into REST API records by WordPress post ID and
   writes the final JSON.

A 1.5-second polite delay sits between the listing-page requests.

---

## Output JSON shape

    scans/
    ├── qstp_companies_2026-05-15_090000.json   ← dated run
    └── qstp_companies_latest.json              ← always the most recent

Each file looks like:

    {
      "source": "QSTP - Qatar Science & Technology Park Community Directory",
      "source_url": "https://qstp.qa/directory/",
      "scraper_version": "1.0.0",
      "scan_date": "2026-05-15T09:00:00.000Z",
      "total_count": 98,
      "companies": [
        {
          "id": 19814,
          "name": "Agricope",
          "slug": "agricope",
          "directory_url": "https://qstp.qa/directory/agricope/",
          "logo_url": "https://qstp.qa/wp-content/uploads/2024/12/Agricope-logo.webp",
          "category": "Startup",
          "sector_tags": ["AI"],
          "description": "AGRICOPE is a food supply technology company...",
          "impact": "Efficient AI Scaling",
          "sector": "AI/ML/Data",
          "stage": "Pre-Seed",
          "contact": {
            "website": "https://example.com",
            "email": "info@example.com",
            "linkedin": "https://linkedin.com/company/example",
            "twitter": "https://twitter.com/example"
          }
        }
      ]
    }

Fields that aren't present on a given company are simply omitted (e.g.
some companies don't have an Impact / Sector / Stage field). The output
is alphabetised by company name.

---

## Changing the time of day

1. Open `schedule.config` in **TextEdit**.
2. Change `time=09:00` to your preferred time (24-hour, HH:MM).
3. Save and double-click `Install Daily Auto-Scan.command` again.

---

## Logs

    scans/scheduler.log         ← stdout from each scheduled run
    scans/scheduler-error.log   ← stderr — should be empty in normal operation

If a scheduled run fails, check those files first.

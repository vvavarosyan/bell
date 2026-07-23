# QFZ — Qatar Free Zones Scraper

Local engine that pulls the full QFZ investor directory into clean JSON
files ready to upload to the Bell.qa platform — no terminal, no code.

Source: <https://qfz.gov.qa/investors/featured-investors/>

---

## One-time setup

1. **Install Node.js.** Download the LTS `.pkg` from <https://nodejs.org>
   and double-click to install. (Skip this step if you've used Node before.)

2. **Turn on the daily auto-scan.** In this folder, double-click:

       Install Daily Auto-Scan.command

   That's it. The scraper will now run every day automatically and drop
   fresh JSON files into `scans/`.

> The first time you double-click a `.command` file, macOS may show a
> security prompt. If it does, **right-click the file → Open**, and click
> **Open** in the dialog. macOS remembers your choice from then on.

---

## What you'll see in the folder

| File | What it does |
|---|---|
| **▶ Run Scan Now.command** | Double-click to run the scraper immediately. |
| **⚙ Install Daily Auto-Scan.command** | Double-click once to enable daily auto-scan. Re-run after editing the schedule to update it. |
| **✕ Uninstall Daily Auto-Scan.command** | Double-click to turn off the daily auto-scan. |
| `schedule.config` | Plain text — change the time of day here. |
| `scrape_qfz.js` | The scraper itself. Don't need to touch. |
| `scans/` | Output: dated JSON files + a `qfz_companies_latest.json`. |

> Tip: rename the `.command` files in Finder to put a star or arrow in
> front (e.g. `★ Install Daily Auto-Scan.command`) — they'll sort to the
> top of the folder.

---

## Changing the time of day

1. Open `schedule.config` in **TextEdit** (right-click → Open With → TextEdit).
2. Change the `time=` line, e.g.

       time=23:30        ← every day at 11:30 PM

   Use 24-hour format, `HH:MM`, local Mac time.
3. Save the file.
4. Double-click `Install Daily Auto-Scan.command` again to apply.

---

## Where the JSON files land

Every run creates a timestamped file plus a stable "latest" pointer:

    scans/
    ├── qfz_companies_2026-05-12_090000.json   ← dated run
    └── qfz_companies_latest.json              ← always the most recent

Each file is self-describing:

    {
      "source": "QFZ - Qatar Free Zones",
      "source_url": "https://qfz.gov.qa/investors/featured-investors/",
      "scan_date": "2026-05-12T09:00:00.000Z",
      "total_count": 703,
      "companies": [
        { "name": "...", "sectors": "...", "description": "..." }
      ]
    }

If Bell.qa's importer wants a plain array, upload the `.companies`
portion. Otherwise the whole file is fine.

---

## Checking that the scheduler ran

If you want to confirm yesterday's auto-run worked, check the log file:

    scans/scheduler.log          ← normal output from each scheduled run
    scans/scheduler-error.log    ← any errors (should be empty)

Or just look in `scans/` — there should be a new dated file matching
the schedule time.

---

## Advanced (only if you're curious)

The daily schedule is a standard macOS LaunchAgent at
`~/Library/LaunchAgents/com.bell-qa.qfz-scraper.plist`. The installer
generates this file from `schedule.config` and loads it with
`launchctl`. The Uninstall command unloads and removes it. Nothing else
on your system is modified.

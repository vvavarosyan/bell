# Bell Data Intelligence

> 🚀 **Going online?** Start with **[`DEPLOYMENT SETUP GUIDE.md`](./DEPLOYMENT%20SETUP%20GUIDE.md)** — full step-by-step for GitHub, Railway, Postgres, and custom domains.

Local engine for gathering, enriching, assembling, and exporting Qatar business
data for **Bell.qa**. Runs entirely on your Mac. No terminal needed for normal
operation — everything is driven by double-clickable `.command` files and a
local web Portal.

This same codebase deploys to `app.bell.qa` (user SaaS Portal) and `admin.bell.qa`
(admin Portal) via Railway. The local Mac stays the engine for heavy ops; Railway
serves customers. See the deployment guide above for the architecture in detail.

> **Folder rename**: this folder is in transition from
> `Bell.qa Qatar Database Scanner` → `Bell Data Intelligence`. Once renamed in
> Finder, the rest of the system continues to work because nothing inside
> uses hardcoded absolute paths.

---

## The pipeline

Raw data flows through four stages before it reaches Bell.qa:

1. **Data Gathering** — scrapers pull raw records from Qatar directories +
   future sources.
2. **Data Enrichment** — Firecrawl + Apify actors add LinkedIn profiles,
   employees, jobs, Google Maps data (5 stages, run from the Portal).
3. **Data Assembly** — dedup, validate, assign Bell identifiers
   (`BIN-00000001`, `BELL-P-00000001`, `BELL-J-00000001`), flag inactives.
4. **Final Data** — clean JSON exports ready for admin upload to Bell.qa.

---

## Folder layout

```
Bell Data Intelligence/
├── Data/
│   ├── Companies/
│   │   ├── 1. Data Gathering/          ← Directories (QFZ, QFC, MOCI, QSTP) + future Sources
│   │   ├── 2. Data Enrichment/         ← outputs of the 5 enrichment stages
│   │   ├── 3. Data Assembly/           ← dedup + BIN assignment
│   │   └── 4. Final Data/              ← upload-ready JSON
│   ├── People/                         ← born from Companies > Stage 3 (LinkedIn employees)
│   │   ├── 1. Data Enrichment/
│   │   ├── 2. Data Assembly/           ← PIN assignment (BELL-P-...)
│   │   └── 3. Final Data/
│   └── Jobs/                           ← born from Companies > Stage 4 (LinkedIn jobs)
│       ├── 1. Data Enrichment/
│       ├── 2. Data Assembly/           ← JIN assignment (BELL-J-...)
│       └── 3. Final Data/
├── Portal/                              ← local web UI (browser-based, "Data Operations")
│   ├── server/                          ← Node + Express, talks to local Postgres
│   ├── ui/                              ← React, the Data Operations view
│   └── migrations/                      ← Postgres schema migrations
├── Operations/                          ← credit usage, run logs, enrichment queue
├── Config/                              ← settings, schedule configs (API keys live in Keychain)
├── Open Bell.qa Portal.command          ← double-click to launch Postgres + Portal (Phase 2)
├── Setup Postgres.command               ← one-click local DB setup (Phase 1)
└── Reinstall All Scheduled Scans.command ← refresh nightly scraper schedules after a move/rename
```

---

## Identifier scheme

| Type      | Format               | Example                |
| --------- | -------------------- | ---------------------- |
| Company   | `BIN-XXXXXXXX`       | `BIN-00012345`         |
| Person    | `BELL-P-XXXXXXXX`    | `BELL-P-00098765`      |
| Job       | `BELL-J-XXXXXXXX`    | `BELL-J-00007777`      |

IDs are assigned during **Data Assembly**, after dedup has merged duplicates
across sources, so the identifier sticks for the lifetime of a record.

---

## The 5 enrichment stages

Each company in the Portal shows five status indicators (red / green + date)
matching these stages:

| Stage | Tool                                                          | What it adds                                          |
| ----- | ------------------------------------------------------------- | ----------------------------------------------------- |
| 1     | **Firecrawl Spark Pro**                                       | Discovers each company's LinkedIn URL                 |
| 2     | Apify `dev_fusion/Linkedin-Company-Scraper`                   | Full LinkedIn company profile + "similar companies"   |
| 3     | Apify `harvestapi/linkedin-company-employees`                 | Employees → fills the People table; org chart         |
| 4     | Apify LinkedIn jobs actor (TBD)                               | Job postings → fills the Jobs table                   |
| 5     | Apify `compass/crawler-google-places`                         | Google Maps enrichment (independent of stages 1–4)    |

In the Portal you select one or more companies and either:

- run a single stage, or
- click **Full Enrichment** — runs Stage 1 + Stage 5 in parallel, then 2 → 3 → 4
  once a LinkedIn URL is known.

---

## Status: Bell Data Intelligence

| Phase | Component                              | Status      |
| ----- | -------------------------------------- | ----------- |
| 0     | Folder skeleton + migration            | ✅ Done     |
| 1     | Local Postgres + schemas               | 🛠 In progress |
| 2     | Portal foundation (Node + React)       | ⏳ Pending  |
| 3     | Data Gathering integration             | ⏳ Pending  |
| 4     | Enrichment pipeline (5 stages)         | ⏳ Pending  |
| 5     | Assembly: dedup + identifier assignment| ⏳ Pending  |
| 6     | Final Data export                      | ⏳ Pending  |

---

## Existing scrapers (Data Gathering)

| Directory | Records gathered                              | Status     |
| --------- | --------------------------------------------- | ---------- |
| QFZ       | Featured investors (Qatar Free Zones)         | ✅ Daily   |
| QFC       | 5,272 companies + 10 trusts                   | ✅ Working |
| MOCI      | 133,360 records via manual capture            | ✅ Working (manual) |
| QSTP      | ~98 companies (REST API + DOM)                | ✅ Daily   |

See each directory's own README under
`Data/Companies/1. Data Gathering/Directories/<NAME>/` for run instructions.

---

## After a folder rename or move

If you ever rename or move the `Bell Data Intelligence` folder, your scheduled
nightly scans will keep firing the OLD paths. To fix in one click:

> **Double-click `Reinstall All Scheduled Scans.command` at the top of this folder.**

It re-installs the four LaunchAgents with the current paths.

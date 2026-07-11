# Bell Data Intelligence — working agreement

Read this fully before touching anything. It is the operating contract for this repo, written by Claude with Val, 2026‑07‑10.

Val is the founder and sole operator. He is **not** a developer and does not read code. Explain in plain language, name the exact file/button/command for every step, and never assume he'll infer a missing step.

---

## ⏳ OPEN CHECKLIST — Val still has to do these (as of 2026‑07‑10)

**Ask him where he is in this list at the start of the session. Do not assume it's done.**

- [ ] **0.** While a long enrich runs: local Portal (`127.0.0.1:3939`) → **Local Engines → Pause**. Un‑pause when it's finished. (8 GB Mac; two browser stacks is what caused the old slowdowns.)
- [ ] **1.** `Enrich Tender Details.command` — was running 2026‑07‑10 evening. Hours, resumable.
- [ ] **2.** `Check Tender Detail.command` → expect **`OPEN with a closing date` ≈ 331 / 331** (the open count grew with the newest scan).
      ⚠️ It will ALSO report **`captured by parser v4: 0`**, **`still to (re)enrich: ~19,400`** AND **the junk‑`entity_ref` warning (~10,000)**. **All three are expected, not failures** — `DETAIL_V` was bumped 3 → 4 so the archive gets re‑checked once more (picks up `raw.fields`, the verbatim capture of every published field), and the junk `"Request"` refs are wiped during that v4 pass (fix added 2026‑07‑10: the enrich merges `raw`, so on pages with no real entity ref the stale junk used to survive re‑enrichment — 3,725 v3 rows proved it).
- [ ] **3.** `Backfill Tender Industries.command` — recompute categorisation on the cleaned set.
- [ ] **4.** Test: local Portal → **Signals → Tenders** → open a Monaqasat tender. Expect a real **closing date**, a **full description**, and **no** cards titled `- Materials Department`.
- [ ] **5.** Deploy BOTH: `Push Changes.command`, then `Open Production Release.command`.
      Commit: `Monaqasat detail fixes + QSE disclosures source + proof-of-search ledger`
      (the batch also carries Phase 2 A3+C1, built 2026‑07‑10 — see §5.)
- [ ] **5b.** Double‑click `Open Bell.qa Portal.command` once — restarts the local Portal so it applies the new database migrations (079 QSE disclosures, 080 search ledger).
- [ ] **5c.** Double‑click `Run QSE Scan.command` (2–3 min, plain fetch — safe to run any time, even during an enrich). Expect "~54 listed companies", several hundred announcements, and a successful push. **"Disclosures" signals appear on app.bell.qa → Signals within ~15 minutes** (signals generate on prod; the local Portal's Signals tab does not generate them).
- [ ] **6.** Re‑run `Enrich Tender Details.command` once more (hours, resumable). This is the v4 pass that fills the **"As published"** block on every tender AND clears the junk entity_refs. Verify with `Check Tender Detail.command`: `captured by parser v4` climbs toward the detail‑page count and the junk‑entity_ref warning disappears.
- [ ] **7.** After all enrich passes: `Install Always-On Engine.command` (safely restarts the engine service — it froze mid‑round 2026‑07‑10 09:26; a **45‑minute round watchdog** is now in the tree so a future stuck round restarts itself), then local Portal → **Local Engines → Resume**. ⚠️ Do step 5b (Portal restart) BEFORE this, or the new proof‑of‑search rows have no table to land in.

**Not urgent, whenever he has a spare night:**
- [ ] **271 rows "awaiting host heal"** — fragment rows whose host title is still truncated (hosts sit in the awarded archive). They look like phantoms but are **unproven**, so the repair tool refuses to delete them. Clear via `Backfill Full Tender Archive.command` (hours) → then `Preview Tender Phantom Repair.command` → `Apply Tender Phantom Repair.command`.

**Parked at Val's request:** MOCI Stage‑2 (the diagnose run needed hours of manual scrolling). Design preserved in `Bell — MOCI Stage-2 Design (Phase 2 A1).md`. Don't restart it without asking.

---

## 1. What Bell is

**bell.qa** — a Qatar business‑intelligence platform. It gathers company, people, tender and signal data from Qatar sources, enriches it, and sells access (search, reveal‑to‑CRM, signals, research, outreach) to paying tenants.

**One codebase, three deployments** (differ only by `BDI_MODE`):

| Deployment | Where | `BDI_MODE` | Role |
|---|---|---|---|
| Local engine | Val's Mac, `127.0.0.1:3939` | `local-admin` | ALL heavy work: scraping, enrichment, dedup, assembly. No auth. Pushes data up. |
| User portal | `app.bell.qa` | `user` | Customer SaaS. Authenticated, tenant‑scoped. No heavy ops. |
| Admin portal | `admin.bell.qa` | `admin` | Platform admin. Read‑only for canonical data. |

Plus a separate Next.js marketing site (`bell-marketing/`) at `bell.qa`.

Stack: Railway (compute + Postgres) · Cloudflare · Clerk (auth) · Stripe · Resend. **Not Vercel.**

Prod is a **full id‑based mirror** of local. The local engine pushes; Railway computes nothing. Hard deletes propagate via `sync_deletions` tombstones → `POST /api/sync/delete`.

---

## 2. Non‑negotiable rules

### 2.1 Never guess. Ever.
**If the source doesn't state it, Bell doesn't claim it.** No inferred units, no derived industries from a buyer's department, no "probably". A missing value must stay missing. An unknown option must **fail loudly**, never fall back to a destructive default.

This rule has been violated four times and each time it corrupted production silently:
- A parser asserted `contract_days` when the page printed a bare `3` with no unit.
- A rescan route did `SCOPES[scope] || SCOPES.all` → re‑queued every engine for every company, nearly burning ~120k paid Firecrawl credits.
- A card parser guessed a detail link by array position → attached the wrong tender's data.
- A regex scanned forward from a table header and captured the **next header** (`entity_ref` = the literal string `"Request"`).

### 2.2 Prove parsers on live data before shipping
Run the exact logic against the real page and show `X/X correct` against ground truth. **Verify against BROWSER‑serialized HTML, not `fetch()` HTML** — they differ (entities decoded, `&#xD;&#xA;` becomes a real newline). A line‑position parser once scored 12/12 on fetch‑HTML and 6/12 on the browser HTML production actually uses.

### 2.3 Test discipline
- `node --check` every edited JS file.
- **PGlite** (`@electric-sql/pglite`) for any SQL logic, applying the real migration files.
- Unit tests against real captured fixtures. Existing suite: `server/tests/tender_phantom_split.test.mjs` (55 tests) — run it after touching tenders.
- `node --check` does **not** catch React hook order. See 2.6.

### 2.4 Never truncate serialized JSON
Use `server/tenders/raw.js` → `packRaw(raw)`. `JSON.stringify(x).slice(0, N)` produces invalid jsonb, Postgres rejects it, the row's catch swallows the error, and the record is silently lost.

### 2.5 8 GB Mac — memory discipline
Val's machine has 8 GB. `ramSafeConcurrency()` caps tender scraping to **2** concurrent renders. Crawl4AI recycles its browser every 150 pages.
**Never run two enrichment engines at once.** Before any long tender enrich, tell Val to pause the always‑on engine (local Portal → Local Engines → Pause). A singleton guard exists in `continuous_sweep.js` but cannot stop already‑running processes.

### 2.6 React hooks above every early return
All `useState`/`useEffect`/etc. must precede any `return` in a component, or the page blanks with no error. Grep hook placement after editing UI. (The other blank‑page cause is stale JS cache — no‑cache headers in `server.js` fix it.)

### 2.7 PDPPL
Qatar's data‑protection law governs anything touching personal data. People data is **locked from customers** (admin keeps access). Registry people (board/partners/signatories) are PDPPL‑sensitive — **ask Val before wiring them anywhere.**

### 2.8 Model rules
Bella = `claude-sonnet-5`, **never** send `temperature` (HTTP 400), **never** Fable or Opus for Bella. News + marketing Bella = `claude-haiku-4-5`.

---

## 3. How Val works

**Click‑only.** He does not use a terminal. Every operation is a double‑click `.command` file in the workspace root, or a button in the local Portal. Long runs must be **resumable** — he will close the window.

When you build something he must run, you build the `.command` for it.

**Deploy** = `Push Changes.command` (→ staging) then `Open Production Release.command` (→ prod). **Always both environments**, never one alone. Deploys are **batched to the end of a phase** — build and verify locally through the whole phase, then ship once.

**⚠️ Do not run `git` against the mounted workspace folder from a sandbox** — it leaves a stale `.git/index.lock` that breaks his Push (fix: `Fix Git Lock.command`).

### If you have git access (Claude Code)

**⭐ THE REPO HAS EXACTLY TWO BRANCHES, FOREVER.**

| Branch | Meaning | Who pushes |
|---|---|---|
| `develop` | staging — Railway auto‑deploys to the staging services | you, freely |
| `main` | **production** — Railway auto‑deploys to app.bell.qa + admin.bell.qa | Val, or you only when he says so **in that session** |

- **Never create a branch.** No `feature/…`, no `fix/…`, no `claude/…`, no date‑stamped branches, no worktree branches. Commit straight to `develop`. Val has said branch sprawl from previous Claude Code sessions was a real problem; two clean branches is the permanent state.
- **Never `git checkout -b`, `git branch`, `git switch -c`, or `git worktree add`.** If you think a branch is warranted, stop and ask Val first.
- **Never delete, rename, force‑push, rebase, or reset** any branch. No `git push --force`, no history rewriting.
- Never push `main` without Val's explicit say‑so in the current session.
- **Production ships through a pull request, and only Val merges it.** `Push Changes.command` pushes `develop` (→ staging; it refuses to run from any other branch). `Open Production Release.command` opens a PR `develop` → `main` in Val's browser; **he** clicks Merge, and Railway deploys production. Never merge that PR, never merge `develop` into `main` locally, never push `main` directly. Stay on `develop`; `git rev-parse --abbrev-ref HEAD` must always print `develop`.
- Never commit secrets. `.env`, keychain values, `BDI_SYNC_TOKEN`, API keys — none of it goes in a commit.
- If you find a stray branch, **report it to Val, don't delete it yourself.**

Also: don't run `git` from a sandbox against this folder (stale `.git/index.lock`). Running `git` natively in Claude Code on Val's Mac is fine.

### End every turn with
1. **Numbered steps for Val**, in order, each naming **where** it happens — which `.command` to double‑click, which portal (local `127.0.0.1:3939` vs `app.bell.qa` vs `admin.bell.qa`), which environment. He does not know where things live; spell it out. One action per step.
2. **What to test**, and what "correct" looks like (the exact number or screen he should see).
3. A short commit message — only when it's actually deploy time.
4. **Questions, separated at the end**, never mixed into the steps.

**Instruction rules for Val (he is not a developer):**
- Never hand him a shell command to run. If something must run, **build a `.command` file for it** and tell him to double‑click it.
- Never say "just run the tests" or "commit this" — either you do it, or you give him a double‑click.
- Long operations must be resumable and must say roughly how long they take, so he can walk away.
- When a run finishes, tell him exactly which output line proves it worked.
- If a step is destructive or spends money, say so plainly **before** the step, and give him a preview/dry‑run first (that is why every repair tool ships as `Preview …` + `Apply …`).

Be honest about what is proven vs assumed. A past audit produced **four false "gap" claims** — treat audit‑style assertions as suspect until code‑verified. Say "I have not verified this" rather than implying you have.

---

## 4. Repo map

```
Portal/
  server/
    tenders/        scrape_monaqasat|ashghal|qatarenergy, ingest, enrich, match, raw, push_prod
    enrichment/
      local/        harvester, finder, relationships, email_finder, company_facts,
                    tech_stack, crawl4ai, render, http      ← Engines 1–6, all $0
      stages/       stage1..6  ← EXTERNAL, PAID (Apify, Firecrawl), manual‑only
    bella/          brain, tools (41), prompt, store, scheduler, voice, marketing
    news/           signals.js (signal generators), enrich.js (Haiku summaries)
    routes/         express routers
    scripts/        one‑shot + diagnostic scripts run by .command files
    tests/          node test files (run with plain `node`)
  migrations/       NNN_name.sql, applied in order at Portal boot. Latest = 078.
  ui/components/    React 18 (esm.sh import map) + htm tagged templates. No build step.
Data/Companies/1. Data Gathering/Directories/   MOCI, QFC, QFZ, QSTP scrapers (Python)
*.command                                        Val's entry points
```

**Key gotcha:** `db.js` installs a global int8 → JS Number parser. Do not remove it or id comparisons break silently.

---

## 5. Current state (2026‑07‑10)

### Live
25,199 tenders (Monaqasat + Ashghal + QatarEnergy) · tender→industry matching + opportunity signals · QSE disclosures (420 live, 'disclosure' signals) · multi‑industry ICP scoring · Engine 6 tech‑stack fingerprinting · Bella G1–G4.2 (chat + voice + 50 tools) · news publishing + SEO · Import Phase 2 · credit/reveal system · 0 Risk Phase 1.

~191K companies, ~76K active, ~16K with websites.

### Uncommitted work in the tree (tested, NOT deployed)
1. **Monaqasat detail‑table fixes** — see `server/tests/tender_phantom_split.test.mjs` (55/55) and the header comments in `scrape_monaqasat.js`. Four bugs: phantom tenders from refs embedded in titles, `deadline_at` NULL on all open tenders, `entity_ref = "Request"`, truncated descriptions. Plus verbatim capture of all ~25 published fields, `packRaw`, and (2026‑07‑10) the junk‑entity_ref merge fix in `enrich.js` — the enrich merges `raw`, so stale `"Request"` survived re‑enrichment on pages with no real entity ref; now deleted before merge.
2. **Phase 2 C1 — QSE disclosures source** (built + tested 2026‑07‑10): `server/qse/` (scrape_qse / sql / ingest_qse) + migration 079 + `Run QSE Scan.command` + new signal kind `disclosure` (news/signals.js, routes/signals.js, SignalsTab). ALL plain fetch, no browser: `/pps/qse_files/MarketWatch.txt` (54 listed companies incl. venture market), per‑company announcements embedded server‑side in company‑profile pages (dedup on the exchange's own `InformationTypeDetailID`), financial‑statement documents + market notices via Liferay serveResource POSTs. Mirrored table (registered in `sync/tables.js`); prod regenerates the signals itself. Proven live on QNBK/QIBK/TQES + all four endpoints; 20/20 unit tests on verbatim fixtures; 15/15 PGlite on real migrations 070+077+079+080. ⚠ qe.com.qa's WAF stalls rapid clients — the scan paces ~0.8s/page.
3. **Phase 2 A3 — proof‑of‑search ledger** (built + tested 2026‑07‑10): migration 080 `search_ledger` (append‑only, LOCAL‑ONLY, never synced — like enrichment_rejects) + `enrichment/local/ledger.js` + pure `ledger_rules.js`. Outcomes: found / candidate / **verified_empty** (full method ran, tiers live → real proof) / **degraded_empty** (a tier was disabled/blocked, or SMTP‑unverifiable email → NOT proof) / skipped / error. Hooked into all six engines' markStage; finder now records which search tiers actually ran. Also fixed: engines 1/2/3 left a company stuck on `running` forever if it threw mid‑enrich — now stamped `failed`. UI: "Search proof" block in the company drawer + "Proof of search" card in Local Engines (local‑admin only). 12/12 unit tests. Takes effect after the local Portal restarts (migration 080) and the always‑on engine restarts (new code).

Commit message when it ships:
`Monaqasat detail fixes + QSE disclosures source + proof-of-search ledger`

### ⏳ Immediately pending — ask Val about these first
He is running **`Enrich Tender Details.command`** (hours, resumable; measured 2026‑07‑10 ~19:00: ~55 rows/min, ETA ~22:00). When it finishes, follow the OPEN CHECKLIST at the top (steps 2 → 7): check, backfill industries, local test, deploy, Portal restart, QSE scan, v4 enrich pass, engine restart + resume.

Also open: **271 rows "awaiting host heal"** — needs `Backfill Full Tender Archive.command` (hours) to heal archive titles, then re‑run Preview/Apply Tender Phantom Repair. Archived rows, not urgent.

---

## 6. The plan (6 phases, Val green‑lit)

1. **Tenders → buyer‑intent signals** — ✅ done. Remaining: `#73` auto‑scan scheduler (LaunchAgent, daily, all sources), parked until Val has watched signals for a few days.
2. **Data maximization** ← *current phase.* Engine 6 done. **A3 proof‑of‑search ledger + C1 QSE disclosures: BUILT 2026‑07‑10** (in the tree, undeployed — see §5). Remaining in phase: C2 utilization (derive statistics/signals from the od_* datasets Bell already holds), C4 Kahramaa/MoT tenders (fold into #73). **MOCI Stage‑2 is PARKED** at Val's request (the diagnostic run was painful); the design lives in `Bell — MOCI Stage-2 Design (Phase 2 A1).md`.
3. **Bella as the brain of the business** ← *current phase, batch 1 BUILT + live‑verified 2026‑07‑11 (on develop, not on prod):* fill‑in fixed end‑to‑end (honest tool results — fill_field never claims success; failed fills show a red toast; data‑bella‑fill on Settings/ICP fields; Enter‑commit for chip fields; checkbox support; navigate now reaches Settings sub‑pages e.g. the ICP form; update_icp/update_account_prefs refresh the on‑screen form — the silent Save‑revert trap is gone) · speed (4th prompt‑cache breakpoint on conversation history — measured 94% cache read on turn 2; tools in a round run concurrently; cache‑hit % logged per turn) · awareness (get_tenders: q/industry/source/buyer/ICP filters + deadlines; NEW get_disclosures for QSE events; 50 tools total). REMAINING in phase: voice pipeline streaming (sentence‑chunked TTS — buffered today), multi‑action autonomy with one up‑front approval bundle, proactive signal awareness (nothing injects fresh signals into a turn yet), show_tenders/show_signals UI‑driving tools.
4. **Signup & onboarding** — more signup fields (QID is PDPPL‑sensitive, confirm with Val), guided visual setup, % completion, "Bella does it for me".
5. **Team** — Clerk Organizations. Backend foundation exists but is dormant (migration 027). Unbuilt.
6. **Bell as a business** — competition watch, Qatar regulatory knowledge base, self‑economics cost dashboard, moat strategy.

**Gate:** automated outreach stays off until the database is certified trustworthy (Val's rule).

Rolling/parked: self‑marketing decisions + PDPPL lawyer · 0 Risk staging test · Import‑2 user testing · Research engine (Firecrawl Spark broken, returns `data:null`) · Val's queued UI comments.

---

## 7. Source quirks worth not relearning

- `jsonb_exists(raw,'key')` is **TRUE when the value is JSON `null`** — the key exists. This looped 1,774 tenders forever as "pending".
- `pgrep -f <script>` also matches a `caffeinate` wrapper carrying the same path. Filter on the real process name.
- launchd agents **cannot use paths inside `~/Desktop`** → `EX_CONFIG (78)`, the job never runs and writes zero logs. Logs live in `~/Library/Logs/bell-qa/`.
- Monaqasat `value_amount` is the **tender bond**, not the contract value. Its "sector" field is a bidder *type* ("Suppliers"), not an industry.
- Monaqasat 5‑digit activity codes are real ISIC classes; low divisions arrive zero‑padded to 6 digits.
- Monaqasat card titles **embed the buyer's own reference** (`… - LTC-2417/2025 - …`). Split cards only on a ref alone on its own line.
- Detail pages are **header/value tables**. Parse `<td>` cells (`detailFields(html)`). Never scan forward from a label.
- Ashghal lists paginate by plain GET `?PageIndex=N`, not `__doPostBack`. Its awarded page publishes **winner + all bidders + ICV score**, which Monaqasat hides.
- A commented‑out `<td>` once shifted Ashghal's winner columns. Strip HTML comments before parsing tables.
- QatarEnergy serves tenders from an anonymous ASMX JSON endpoint — plain `fetch`, no browser needed.

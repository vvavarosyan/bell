# Bell Data Intelligence — working agreement

Read this fully before touching anything. It is the operating contract for this repo, written by Claude with Val, 2026‑07‑10.

Val is the founder and sole operator. He is **not** a developer and does not read code. Explain in plain language, name the exact file/button/command for every step, and never assume he'll infer a missing step.

---

## ⏳ OPEN CHECKLIST — as of 2026‑07‑20 (calibration day + Bell Score / find‑anything‑search session)

**Ask him where he is in this list at the start of the session. Do not assume it's done.**
Full detail lives in memory: [[self-marketing-outreach]] and [[data-completeness-program]].

**PERFECT BELLA — SHIPPED 2026‑07‑20 eve** (deep memory [[bella-perfection]]): silent‑no‑answer/voice‑drop chain fixed (forced honest wrap‑up, streamed fallback, watchdog reset, voice speaks on error); first‑token latency; HONESTY (no false "Done" — forced summary states what did/didn't complete); ORB "working" pulse; BELLA KNOWS THE MAP (map_nearby + land_info tools, 69 tools); voice polish (spoken "working on it" progress, no self‑interrupt, no overlapping turns); plan round‑budget scales to step count + no surprise mid‑plan card. **Remaining Bella polish (low pri):** C4 key‑prewarm (local‑only), C3 atomic tool‑pair, B5 batch‑tools (structural latency cure). **Awaiting Val's test.**

**BRANCH MODEL — SHIPPED 2026‑07‑20 (deep memory [[branch-model]]):** migration 101 `parent_company_id` + exact‑or‑review matcher (`server/enrichment/branch_link.js`) that collapses empty MoPH facility shells into their ONE registered parent (the DOC fix). Word‑preserving key + genericness guard — caught a real Rule‑2.1 bug (stored `name_normalized` is lossy: "Al Jaber Holding Company"→"al jaber" wrongly swallowed "Al Jaber & Partners"). Live: **851 shells → 276 parents** collapse, 62 skipped (generic name, left alone), 0 legal‑branch links (foreign parents). Val's clicks: **Preview Branch Model.command** then **Apply Branch Model.command** (Apply archives shells reversibly + pushes to prod itself). Drawer shows "Branches & facilities (N)" / "Part of a group"; Bella `get_company` now surfaces locations + branches. Independent of the reharvest/geocode steps. Map render fixes + DB‑backed land layer already DONE ([[map-location-quality]]).

**PENDING (Val's click, no rush) — DISCOVERY REVIEW:** local Portal (127.0.0.1:3939) → nav "Discovery Review" → work the 542 Maps candidates + 110 Qatar Spark discoveries: Approve real Qatar businesses (creates a full company + map pin, dedup‑guarded), Reject junk; 52 foreign are admin‑only (Dismiss). Tell Claude after a batch → Claude pushes. Detail: [[discovery-review-queue]].

**VAL'S PENDING STEPS (as of 2026‑07‑20 eve — all Bella + map + DOC‑safe fixes tested PERFECT by Val):**
- [ ] **a.** `Reharvest for Locations.command` is RUNNING (9,689 website companies incl. DOC, captures branch addresses + Google‑Maps‑link exact coords; hours, resumable). ⚠️ Do NOT run Spark or Geocode alongside it (8 GB Mac). When it finishes → Val pastes the closing summary → **Claude runs the data push himself** → then Val runs `Geocode Companies.command`. THAT is when DOC's website branches land on the map.
- [ ] **b.** `Run Spark Enrichment.command` (daily) — Val runs later; expect batch holds ~12, no "max credits". Paste closing lines.
- [ ] **c.** BRANCH MODEL — ✅ APPLIED by Val (851→276 collapse live). PLUS the "robust + awesome" upgrade DEPLOYED ([[branch-model]]): **map branch network** (always‑on parent→branch tie‑lines, lights up fully after Reharvest+Geocode) + **branch contact rollup** (Preview/Apply Branch Contact Rollup.command — rolls each operator's unique branch emails/phones onto the parent; venue‑domain + Qatar‑phone guards; 12→4 clean; Val's optional click, small yield now).
- [ ] **d.** Remaining safe DOC cleanups — ✅ mostly SHIPPED 2026‑07‑20 (deep memory [[data-quality-cleanups]]): **dedup registration‑conflict guard** (branch‑stripped base CR — 42828/2 still merges into 42828, only distinct base CRs blocked; belt inside mergeCompanies, all 4 paths) DEPLOYED, protects the next dedup run automatically. **Junk‑address forward guard** (guessAddress now delegates to the guarded extractor; isJunkAddress on contributions) DEPLOYED. **City guesses stopped at source** (QFC no longer hardcodes 'Doha'; Stage‑2 no longer writes LinkedIn HQ city) DEPLOYED. Junk‑address cleanup **APPLIED by Val** (236 cleared). **QFC "Doha" cleanup BUILT + DEPLOYED** (Val greenlit): **Preview/Apply QFC Doha City Cleanup.command** — corroboration‑guarded, clears only the 80 of 5,243 where nothing (coord/address/other source/branch) confirms Doha; several are actually Lusail. Awaiting Val's Preview→Apply click. **OSM INGEST — ✅ BUILT + DEPLOYED 2026‑07‑21 ([[osm-ingest]]):** migration 102 `osm_places`+`osm_streets`, area‑filtered Overpass engine (excludes Bahrain), `/api/osm/*` routes, Bella `search_places` + `map_nearby` places, **"Places (OSM)" map layer**, company dedup‑link. **Val's action:** double‑click **Ingest OpenStreetMap Qatar.command** to populate (fetches every named business/restaurant/shop/clinic/hotel/street in Qatar + pushes; don't run alongside a harvester).

- [ ] **1.** `Reharvest No-Email Companies.command` — was RUNNING 2026‑07‑19/20 (the ~8,600 harvested‑but‑no‑email cohort through the upgraded extractor; hours, resumable). Val will paste the closing lines ("Cohort: X → Y"). When done: **Claude runs the DATA push himself** (runPush) — do not send Val to `Push Changes.command` for data. (Interim pushes are fine and have run — 2026‑07‑20 morning push: 98 rows, 0 errors.)
- [ ] **2.** After step 1: `Geocode Companies.command` once more — newly harvested structured addresses convert the "unparseable" pile into map pins (first runs: 11 → 410 coords, 7.3k unparseable awaiting better addresses). It pushes to prod itself.
- [ ] **3.** THE OUTREACH MACHINE IS ARMED (BDI_OUTREACH_SCHEDULER=1 + BDI_OUTREACH_ENABLED=1 on app.bell.qa) and the **"Bella outreach" campaign is ACTIVE with MyWeb Systems** — first real cold send lands the next Qatar working window (Sat–Thu 07:00–17:00). Val checks admin.bell.qa → Marketing → Stats/Mail log. Weekly digest auto‑sends Sundays ≥09:00 (confirmed firing).
- [ ] **4.** Ramp‑up to the full ~5,400 role‑mailbox campaign: plan approved (tender‑heavy industries first — prioritization is coded into Plan), waiting on a few days of MyWeb/engine results before Val activates a bulk campaign.
- [ ] **5.** Eid al‑Fitr / Eid al‑Adha dates → add to the holiday calendar when Qatar announces them (admin → Marketing API or ask Claude).
- [ ] **6.** ⚖️ The PDPPL lawyer review of cold outreach is STILL OPEN (Val's standing instruction: machine runs on his authority; brief at repo root `Bell — Legal Brief for Counsel (Qatar PDPPL outreach).md`).

**Not urgent, whenever he has a spare night:**
- [ ] `Enrich Ashghal Details.command` — closed/archived Ashghal tender details. Browser‑based, hours; not alongside another long enrich.
- [ ] 271 tender rows "awaiting host heal" → `Backfill Full Tender Archive.command` then Preview/Apply Tender Phantom Repair.
- [ ] `Apply Website-Content Conflict.command` (engine paused) — cleans existing wrong‑content rows (QF Endowment etc.); Preview showed 0 false positives.

**Parked at Val's request:** MOCI Stage‑2 (design in `Bell — MOCI Stage-2 Design (Phase 2 A1).md`) · Hukoomi KB source (needs a watched browser run) · marketing‑site SEO validation (waiting on Google) · physical‑letter generator · Arabic outreach campaigns (one flag away).

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
- **Deploys (Val's standing rule, 2026‑07‑11): Claude deploys BOTH environments itself — always together.** Push `develop` (→ staging), then fast‑forward production: `git fetch origin main && git merge origin/main --no-edit && git push origin develop && git push origin develop:main`. Never force‑push; if `develop:main` isn't a fast‑forward after merging origin/main in, STOP and investigate. Only deploy work that is tested + verified (the 100% bar is unchanged — this changes WHO clicks, not what qualifies).
  ⚠️ **Reversion condition (Val's words):** once Bell is complete and has PAYING USERS, production goes back to manual — Val tests on staging, then merges to prod himself so users are never affected. When that day comes, restore the old rule here.
  `Push Changes.command` / `Open Production Release.command` remain Val's click‑path for when he deploys himself.
- Stay on `develop`; `git rev-parse --abbrev-ref HEAD` must always print `develop`.
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
    bella/          brain, tools (~57), prompt, store, scheduler, voice, marketing
    news/           signals.js (signal generators), enrich.js (Haiku summaries)
    routes/         express routers
    scripts/        one‑shot + diagnostic scripts run by .command files
    tests/          node test files (run with plain `node`)
  migrations/       NNN_name.sql, applied in order at Portal boot. Latest = 102.
  ui/components/    React 18 (esm.sh import map) + htm tagged templates. No build step.
Data/Companies/1. Data Gathering/Directories/   MOCI, QFC, QFZ, QSTP scrapers (Python)
*.command                                        Val's entry points
```

**Key gotcha:** `db.js` installs a global int8 → JS Number parser. Do not remove it or id comparisons break silently.

---

## 5. Current state (2026‑07‑19)

### Live (everything committed IS deployed — no uncommitted work; tree = both envs)
~27K tenders across FOUR sources (Monaqasat + Ashghal + QatarEnergy + Kahramaa) · signals + QSE disclosures + Qatar Market Pulse · Qatar Knowledge Base (governance + laws + regulators + Gazette feed, customer‑facing) · GIS/Real‑Estate on the Map · Bella (chat + voice, ~57 tools incl. add_to_outreach + get_outreach_status, platform‑admin gated) · Team/CRM/credits/0‑Risk · saved lists + notes.

**THE SELF‑MARKETING MACHINE (2026‑07‑18/19, ARMED + LIVE):** full autonomous cold‑outreach engine at admin.bell.qa → Marketing. Isolated go.bell.qa Resend channel (never falls back to transactional) · consent ledger + one‑click unsubscribe (/u/:token) + suppression manager · Haiku composer (no em‑dashes, no AI clichés, grounded) · warmup ramp (actual send‑days), Qatar hours + holidays, per‑domain throttle, circuit breaker (any complaint / >5% bounce = self‑pause), pre‑flight self‑test · follow‑ups (3 touches, sticky to Thompson‑bandit A/B arms on reply rate) · reply intelligence (IMAP poller on replies@bell.qa; quote‑stripped classification — the footer's own "Unsubscribe" word once made EVERY reply look like remove_me; "remove me" EN/AR = auto‑unsubscribe; interested = 🔥 hot lead + forward to hello@bell.qa) · conversion attribution → "Converted" · **email observatory** (migration 097 email_log at the sendEmail chokepoint — every send from every Bell system counted, all statuses) · weekly market‑updates digest (real tender/signal numbers) + welcome email for bell.qa/market-updates subscribers · contact form live at bell.qa/contact. Campaign "Bella outreach" ACTIVE (MyWeb Systems pilot). The Plan button orders targets tender‑heavy‑industries‑first. Lawyer review OPEN (Val's authority; brief at repo root).

**DATA COMPLETENESS Tracks A+B (2026‑07‑19, DEPLOYED):** harvester upgrade — role emails on external domains KEPT (Doha Clinic case → info@dchqatar.com captured, proven live), Cloudflare/entity/at‑dot de‑obfuscation, WhatsApp contacts (type 'whatsapp', shown in UI), locations/branches + /en /ar pages, per‑page render escalation, multi‑address capture, doctors/staff (admin‑locked via the existing people lockdown) · migration 098 `company_locations` (mirrored) · **$0 QARS geocoder** (Qatar's own GIS locator, INWANI zone/street/building codes, EXACT‑or‑nothing, built‑in ground‑truth proof pass that refuses to run under 85% agreement) · branch pins + sibling tie‑lines on the Map · "Locations (N)" drawer block · Bella get_company includes locations/WhatsApp. Val's commands: `Reharvest No-Email Companies.command` (the 8.6k no‑email cohort) + `Geocode Companies.command` (first runs took the map from 11 → 410 coordinates).

**BELL SCORE v2 + FIND-ANYTHING SEARCH (2026-07-20):** score formula rebuilt (19 components = 100; now counts WhatsApp/locations/coordinates/financials/tech/ownership) and made LIVE — every enrichment writer rescores per record, nightly_sweep heals drift (scoped `IS DISTINCT FROM` — never touch updated_at needlessly, it's the sync watermark), one-time rescore corrected 189,928 companies + 28,526 people (people scores had been frozen 5 weeks; "pharmacy" search had returned all of Healthcare; "IT" had returned 73% of the DB). Business-type search: `lib/business_types.js` bridges user wording to STATED vocabulary (QCCI sub-categories in companies.sector — 571 fine trades, industries[] tags, extra_fields.gmaps_categories) — "haircut salon" → Ladies Beauty Saloons (338), "gift shop" 64→527, name searches unaffected; matched-type chips + Business-type facet in Companies UI; Bella benefits automatically. Deep memory: [[bellscore-and-search]].

~191K companies, ~76K active, ~16K with websites. Latest migration = **100**. Deep memory: [[self-marketing-outreach]], [[data-completeness-program]], [[bellscore-and-search]].

### ⏳ Immediately pending — see the OPEN CHECKLIST at the top
Reharvest running → Claude runs the DATA push himself → Geocode again → watch MyWeb first send → ramp decision → lawyer.

---

## 6. The plan (6 phases, Val green‑lit)

1. **Tenders → buyer‑intent signals** — ✅ done. Remaining: `#73` auto‑scan scheduler (LaunchAgent, daily, all sources), parked until Val has watched signals for a few days.
2. **Data maximization** ← *current phase.* Engine 6 done. **A3 proof‑of‑search ledger + C1 QSE disclosures: BUILT 2026‑07‑10** (in the tree, undeployed — see §5). **C2 DONE 2026‑07‑12: Qatar Market Pulse** — trade flows (1.08M import + 94K export records → monthly QAR series + top partners), weekly real‑estate transactions, MOCI licence issued/canceled dynamics; derived by pure SQL over od_records (every number a sum/avg of source‑stated figures, sources + sync dates attached), 6h process cache (~3.3s cold), `/api/open-stats` + Market Feed 'Qatar Market Pulse' panel + Bella `get_market_stats` (54 tools). Phase 2 is COMPLETE except parked MOCI Stage‑2. **C4 DONE 2026‑07‑12: Kahramaa is tender source #4** (km.qa BusinessWebService ASMX, plain fetch — full archive 1,648 tenders + 8 award categories with winners/amounts; 1,968 rows live, 99 winners linked; `Run Kahramaa Scan.command`; MonaqasatNumber cross‑ref captured verbatim, ~90 true overlaps with our Monaqasat rows — display dedup TBD with Val). **MoT half of C4: no dedicated tender feed exists** — mot.gov.qa publishes via the central Monaqasat portal, which Bell already scrapes; closed honestly. **MOCI Stage‑2 is PARKED** at Val's request (the diagnostic run was painful); the design lives in `Bell — MOCI Stage-2 Design (Phase 2 A1).md`.
3. **Bella as the brain of the business** ← *current phase, batch 1 BUILT + live‑verified 2026‑07‑11 (on develop, not on prod):* fill‑in fixed end‑to‑end (honest tool results — fill_field never claims success; failed fills show a red toast; data‑bella‑fill on Settings/ICP fields; Enter‑commit for chip fields; checkbox support; navigate now reaches Settings sub‑pages e.g. the ICP form; update_icp/update_account_prefs refresh the on‑screen form — the silent Save‑revert trap is gone) · speed (4th prompt‑cache breakpoint on conversation history — measured 94% cache read on turn 2; tools in a round run concurrently; cache‑hit % logged per turn) · awareness (get_tenders: q/industry/source/buyer/ICP filters + deadlines; NEW get_disclosures for QSE events; 50 tools total). Batch 2 SHIPPED 2026‑07‑11 (both envs): **plan bundles** (propose_plan — one card for a whole multi‑step job; approval grants that turn a per‑tool budget counted from the card's own steps; live‑verified end‑to‑end) + **sentence‑streamed voice** (first sentence goes to TTS while the reply still generates; barge‑in stops queue + aborts the turn; ui/lib/speech.js pure segmenter). Also: durable approvals inbox + orb badge (voice/chat/reload‑safe — fixed the lost‑card bug Val hit). Batch 3 SHIPPED 2026‑07‑12 (both envs): **proactive awareness** (a one‑line fresh‑signals brief with ICP matches rides every turn — live‑verified: Bella opens conversations with what matters) + **show_tenders/show_signals** (she drives the Signals radar + embedded Tenders browser like Companies; live‑verified in the browser) + **Arabic voice** (TTS pins language_code=ar on Arabic replies; optional BDI_BELLA_VOICE_ID_AR voice). Phase 3 is feature‑complete pending Val's full test round; 'onboarding — Bella does it for me' moves to Phase 4.
4. **Signup & onboarding** — more signup fields (QID is PDPPL‑sensitive, confirm with Val), guided visual setup, % completion, "Bella does it for me".
5. **Team** — Clerk Organizations. Backend foundation exists but is dormant (migration 027). Unbuilt.
6. **Bell as a business** ← *current phase; multiple batches SHIPPED both envs 2026‑07‑12/13.* **Economics cost dashboard DONE** (migration 085 operating_costs + routes/economics.js + EconomicsTab, admin). **Qatar GIS / Real Estate DONE** (ArcGIS ingest, buildings on the main Map, cadastre parcels, transactions). **Qatar Knowledge Base DONE (Batches A–D)** — Bell learns Qatar governance + LAWS from official sources, cited: migrations 086+087, `server/knowledge/{crawl,crawl_almeezan,entities}.js`, **Al Meezan** laws (resumable TLS‑relaxed id‑walk, EN+Arabic, validated‑law‑only), entity extraction (laws/bodies/amounts/officials w/ verbatim proof, PDPPL‑safe), Bella `search_qatar_kb`, customer‑facing **Qatar Knowledge** browse section (`routes/knowledge.js` + `KnowledgeTab.js`, search/filters/drawer/Recent‑updates), `Run Qatar Knowledge Scan.command`. 32 unit tests + PGlite + live browser‑verified; hardened via adversarial review (10 defects fixed). Val test guide: repo root `Bell — Qatar Knowledge Test + Run Guide (2026-07-13).md`. **Hukoomi (fees/processes) PARKED** — Cloudflare + Sitecore/Next.js SPA needs a Crawl4AI browser batch Val watches (`Bell — Hukoomi Source (Phase 6 KB) — Recon + Plan.md`). Remaining Phase 6: **competition watch · moat strategy · Official‑Gazette new‑law signal · Tier‑3 regulators (QCB/tax/labour/PDPPL/QFC/QFMA/CRA) · MoPH licensing**. See memory [[qatar-knowledge-base]], [[phase6-bell-as-business]].

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

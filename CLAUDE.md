# Bell Data Intelligence — working agreement

Read this fully before touching anything. It is the operating contract for this repo, written by Claude with Val, 2026‑07‑10.

Val is the founder and sole operator. He is **not** a developer and does not read code. Explain in plain language, name the exact file/button/command for every step, and never assume he'll infer a missing step.

---

## ⏳ OPEN CHECKLIST — as of 2026‑07‑20 (calibration day + Bell Score / find‑anything‑search session)

**Ask him where he is in this list at the start of the session. Do not assume it's done.**
Full detail lives in memory: [[self-marketing-outreach]] and [[data-completeness-program]].

**PERFECT BELLA — SHIPPED 2026‑07‑20 eve** (deep memory [[bella-perfection]]): silent‑no‑answer/voice‑drop chain fixed (forced honest wrap‑up, streamed fallback, watchdog reset, voice speaks on error); first‑token latency; HONESTY (no false "Done" — forced summary states what did/didn't complete); ORB "working" pulse; BELLA KNOWS THE MAP (map_nearby + land_info tools, 69 tools); voice polish (spoken "working on it" progress, no self‑interrupt, no overlapping turns); plan round‑budget scales to step count + no surprise mid‑plan card. **Remaining Bella polish (low pri):** C4 key‑prewarm (local‑only), C3 atomic tool‑pair, B5 batch‑tools (structural latency cure). **Awaiting Val's test.**

**BRANCH MODEL — SHIPPED 2026‑07‑20 (deep memory [[branch-model]]):** migration 101 `parent_company_id` + exact‑or‑review matcher (`server/enrichment/branch_link.js`) that collapses empty MoPH facility shells into their ONE registered parent (the DOC fix). Word‑preserving key + genericness guard — caught a real Rule‑2.1 bug (stored `name_normalized` is lossy: "Al Jaber Holding Company"→"al jaber" wrongly swallowed "Al Jaber & Partners"). Live: **851 shells → 276 parents** collapse, 62 skipped (generic name, left alone), 0 legal‑branch links (foreign parents). Val's clicks: **Preview Branch Model.command** then **Apply Branch Model.command** (Apply archives shells reversibly + pushes to prod itself). Drawer shows "Branches & facilities (N)" / "Part of a group"; Bella `get_company` now surfaces locations + branches. Independent of the reharvest/geocode steps. Map render fixes + DB‑backed land layer already DONE ([[map-location-quality]]).

**MAP + LOCATION DATA — 2026‑07‑21 (deep memory [[maplink-and-gazetteer]], [[duplicate-locations-bug]]):**
- **DOC IS FIXED.** Root cause was never geocoding: the harvester DISCARDED shortened Google‑Maps share links (`maps.app.goo.gl`) — `harvester.js:253` destructured only `coords`. DOC's site links all 3 branches that way. Now followed → Al Sadd + Lusail Marina + Izghawa live.
- **CAMERA‑vs‑PIN bug (Val caught):** a resolved share link carries `@lat,lng` (map CAMERA) *and* `!3d…!4d…` (the real PLACE). We read `@` → every pin ~259 m off, DOC landed in the wrong tower. Order is now `!3d!4d` → `!3d!2d` → `@` last. 1,347 camera pins deleted locally **and on prod** (12,644 gap tombstones → 1,348 removed).
- ⚠️ **`company_locations` has NO delete trigger** — always write `sync_deletions` BEFORE deleting a mirror row, or prod keeps it forever.
- **Map/UI:** phantom pin piles fixed (one pin per site per website — Yateem 80→5, 371 removed); branch spread is CLICK‑ONLY (Val: never re‑add an ambient network), lines land on the dots, spread outward on click, dark‑cased cyan; globe intro plays once per session; drawer has ONE "Locations & branches" box.
- **GAZETTEER name‑join is PARKED** — its Apply self‑refuses (proof 36%). Do NOT lower the bar: 77% of its yield is one tower (registered‑agent addresses) + confirmed wrong pins.
- **Data‑gap audit + weekly email:** `Data Gap Audit.command` (read‑only) and a Sunday self‑report (`Send Data Check Email Now.command` to test). It already found 387 emails / 420 phones seen‑but‑not‑stored — which turned out to be a **worse** bug than data loss, see next line.

- **OSM Discovery:** auto‑approve command (536 high‑confidence) **plus** "Approve all in category" buttons (Shopping 3,751 · Food & Drink 1,107 · Hotels 882 …).
**🔴 THE LEGACY CONTACT COLUMN — FIXED 2026‑07‑21 (deep memory [[legacy-contact-column]]):** the 387/420 were NOT lost — Bell had correctly DELETED them (contacts harvested from a website that turned out to be a *different* company). But every bulk `DELETE FROM company_contacts` bypasses `deleteContact()`, so **`companies.email`/`phone` kept the wrong address**, and `outreach/targeting.js` UNIONed that column in — stamping `is_verified = true` with no evidence (Rule 2.1) and leaving `email_status` NULL so the bounce exclusion could never fire. **297 role mailboxes belonging to OTHER companies were live outreach targets** (Anya Aviation Consultancy QFZ carried the London handbag brand's `wholesale@`). Shipped: outreach reads **company_contacts only** (7,948 role mailboxes remain — campaign not starved) · `resyncContactColumns()` called after every bulk delete · Bella's CRM send reads contacts first (unblocks 44 "no recipient") · dedup stranded‑children DELETE now guarded like its INSERT · audit no longer reports a deliberate deletion as loss (387→**1**, 420→**3**, both proven‑correct rejections). ⚠️ **Never re‑add a second email source to targeting.js.**

**PENDING (Val's click, no rush) — DISCOVERY REVIEW:** local Portal (127.0.0.1:3939) → nav "Discovery Review" → work the 542 Maps candidates + 110 Qatar Spark discoveries: Approve real Qatar businesses (creates a full company + map pin, dedup‑guarded), Reject junk; 52 foreign are admin‑only (Dismiss). Tell Claude after a batch → Claude pushes. Detail: [[discovery-review-queue]].


**🔴 OUTREACH TIER HOLE — CLOSED 2026‑07‑21 (deep memory [[address-verdicts]]):** migration 095's CHECK allowed `audience_tier` 'unclassified' and 'all', the campaign form OFFERED both, and `targeting.js` read `if (tier !== 'all' && …)` — so an 'all' campaign mailed EVERY tier and an 'unclassified' one mailed 6,330 addresses Bell cannot tie to a company. Now: `buildTargets` throws on any tier but role_mailbox/named_person (`countOnly` keeps the admin summary working), the two options are gone from the UI, migration 104 adds a **NOT VALID** CHECK (NOT VALID on purpose — prod's live campaign row must not abort boot). Also: **a role word on a consumer/ISP domain is no longer a company inbox** — `info@gmail.com` was a live target held against 3 companies. ⚠️ Never re‑add 'all'/'unclassified' as a sendable tier.

**ADDRESS REVIEW — NEW (2026‑07‑21):** resolves the ~6,300 `unclassified` addresses without guessing. 5 signals measured on live data, then attacked by 2 adversarial lenses. **NOTHING survived for the sendable direction** — no rule ever promotes to 'company inbox'; that is always Val's click. Auto (safe direction only): **A1** person linked to this company shares the exact name token → 48 · **A3** website‑template placeholder domain → 38. **300** get a suggested verdict *with the literal proof*; **5,368** stay undecided and out of outreach. Migration 104 `address_verdicts` (MIRRORED — the engine runs on prod, a local‑only verdict changes nothing). Val's path: local Portal → nav **"Address Review"**. Rejected on evidence, do NOT re‑add: inverse name test (would make 4,986 sendable), source‑payload `email` field name (a *negative* discriminator), domain‑echo (24.5% are real given names), fan‑out as an auto block (~52% is Bell's own duplicates).

**📍 LOCATION ROWS — a coordinate is not an address (2026‑07‑21, deep memory [[location-row-merge]]):** when a Google‑Maps link carries no place name the harvester writes the COORDINATE STRING into `company_locations.address`. The UNIQUE key is `(company_id, lower(address))`, so it can never collide with the row holding the real street address for the same doorway — every re‑harvest adds another (DOC: **7 rows for 3 clinics**). Shipped: **display** (`lib/location_display.js` — a coordinate‑shaped address is suppressed in the drawer, company detail, Bella `get_company` and the **physical‑letter generator**, which would have posted an envelope addressed to two numbers; Plus Codes count too — the OLC alphabet INCLUDES W and X) · **harvester guard** (no nameless‑pin row when the company already states a real address within ~22 m — without it, deleting is a treadmill: the next harvest re‑inserts under a new id, proven live) · **Preview/Apply Location Merge.command** (BYTE‑IDENTICAL coordinates only, never a distance threshold; excludes qars winners — QARS returns one point per BUILDING, 60 companies share Ooredoo Tower's; **tombstone BEFORE delete**). Also fixed: branch pins now derive their area from their OWN coordinate (was wrong on 544 of 1,090 — DOC's Izghawa clinic read "Lusail") and a branch pin within 22 m of the company's own pin no longer draws twice (461 stacked). ⚠️ **Killed by adversarial review, do NOT re‑add:** the landmark‑name bridge (pairs neighbours in one tower), text‑normalized dedup (the normalizer strips Arabic to an empty string — 3 sites 53 km apart collided, and it destroyed a verified qars geocode), the INWANI triple as a join key (0 of 537 bare rows carry one).

**📍 LOCATION PAIRS + STATED LABELS — 2026‑07‑22:** Discovery Review has a new **"Location pairs"** tab (16 waiting): a nameless pin beside a surveyed government building whose name appears in the company's own written address — Bell shows the proof (landmark, metres, zone), Val's click merges. DOC leads (Marina 50, 6.8 m). Reject is remembered on the pin row. Also: all four discovery/OSM promote paths wrote `label='Head office'` (a fabricated claim, 534 rows) — now they write the place's own stated name, and the 535 existing rows were relabelled via exact `matched_company_id`+coordinate joins and pushed. `promoteToCompany` no longer defaults city to 'Doha'.

**📍 ADDRESS TWINS + STATED LABELS ROUND 2 — 2026‑07‑22:** the same site written twice splits into MECHANICAL (187 punctuation variants → folded by **Preview/Apply Location Merge.command**, survivor = pinned > primary > older, inherits coords) and JUDGMENT (~100 → new **"Address twins"** tab in Discovery Review — 'Bldg 100' vs 'Bldg 102' is Val's call). Harvester now refuses to mint a wording variant of an address the company already states (normalized ≥12 chars). ⚠️ The RUNNING `Resolve Website Map Links.command` still carries pre‑guard code loaded at its start — counts drift until it exits; the Apply's drift‑refusal protects. **CHAIN LINKING (Yateem):** Val decided LINK‑NOT‑MERGE 2026‑07‑22 ("one organized view, sixteen true records"); adversarial design workflow launched — build lands when its spec returns.

**🔗 CHAIN MODEL — BUILT 2026‑07‑22 (deep memory [[chain-links]]):** Val's decision: LINK, never merge — one organized view, N true legal records, all via `parent_company_id`, one UPDATE to NULL undoes any link. **Tier 1 registry‑stated** (`Preview/Apply Chain Links.command`): the /n suffix on a base CR is the registry's own branch numbering — 1,309 firms / 2,284 links ready; gates: MOCI/QCCI source both ends (QFC/CRA licence numbers collide with CR bases), unique bare‑base parent, never overwrite an existing link; 2,056 groups held for review. **Tier 2 brand evidence** (Discovery Review → **"Chains"** tab, 62 groups): the Yateem shape — head #163975 holds the only CR, 15 no‑CR discoveries share yateemoptician.qa; strangers flagged, nothing links without Val's click. **Dedup guard extended:** sibling branch registrations (…/2 vs …/3) now refuse to merge. ⚠️ The adversarial‑verify phase of the design workflow hit a session limit and DID NOT RUN — that is why nothing auto‑links; do NOT upgrade Tier 2 to automatic without running it (resume: `wf_6857bba6-9aa`, measures are cached).

**🧾 TENDER TWINS — 2026‑07‑22:** the ~80 tenders published on BOTH Kahramaa and Monaqasat now show ONCE (display only, nothing deleted): Monaqasat row leads with an "also on Kahramaa" chip; detail drawer cross‑links both directions; `source=kahramaa` still shows Kahramaa's full 1,765; /stats + status facet count twin‑aware so chips equal list totals (source facet stays raw on purpose). Kahramaa's own `raw.monaqasat_number` is the join — stated verbatim, zero‑stripped compare. ⚠️ **Chain + phone adversarial workflows hit session limits twice** (resets 2:20pm Qatar) — chain refute/spec still UNRUN (resume `wf_6857bba6-9aa`), phone classification 1/6 done (resume `wf_2391735b-3ce`). Nothing shipped depends on them; retry after reset.

**VAL'S PENDING STEPS (as of 2026‑07‑20 eve — all Bella + map + DOC‑safe fixes tested PERFECT by Val):**
- [ ] **a.** `Reharvest for Locations.command` is RUNNING (9,689 website companies incl. DOC, captures branch addresses + Google‑Maps‑link exact coords; hours, resumable). ⚠️ Do NOT run Spark or Geocode alongside it (8 GB Mac). When it finishes → Val pastes the closing summary → **Claude runs the data push himself** → then Val runs `Geocode Companies.command`. THAT is when DOC's website branches land on the map.
- [ ] **b.** `Run Spark Enrichment.command` (daily) — Val runs later; expect batch holds ~12, no "max credits". Paste closing lines.
- [ ] **c.** BRANCH MODEL — ✅ APPLIED by Val (851→276 collapse live). PLUS the "robust + awesome" upgrade DEPLOYED ([[branch-model]]): **map branch network** (always‑on parent→branch tie‑lines, lights up fully after Reharvest+Geocode) + **branch contact rollup** (Preview/Apply Branch Contact Rollup.command — rolls each operator's unique branch emails/phones onto the parent; venue‑domain + Qatar‑phone guards; 12→4 clean; Val's optional click, small yield now).
- [ ] **d.** Remaining safe DOC cleanups — ✅ mostly SHIPPED 2026‑07‑20 (deep memory [[data-quality-cleanups]]): **dedup registration‑conflict guard** (branch‑stripped base CR — 42828/2 still merges into 42828, only distinct base CRs blocked; belt inside mergeCompanies, all 4 paths) DEPLOYED, protects the next dedup run automatically. **Junk‑address forward guard** (guessAddress now delegates to the guarded extractor; isJunkAddress on contributions) DEPLOYED. **City guesses stopped at source** (QFC no longer hardcodes 'Doha'; Stage‑2 no longer writes LinkedIn HQ city) DEPLOYED. Junk‑address cleanup **APPLIED by Val** (236 cleared). **QFC "Doha" cleanup BUILT + DEPLOYED** (Val greenlit): **Preview/Apply QFC Doha City Cleanup.command** — corroboration‑guarded, clears only the 80 of 5,243 where nothing (coord/address/other source/branch) confirms Doha; several are actually Lusail. Awaiting Val's Preview→Apply click. **OSM INGEST — ✅ BUILT + DEPLOYED 2026‑07‑21 ([[osm-ingest]]):** migration 102 `osm_places`+`osm_streets`, area‑filtered Overpass engine (excludes Bahrain), `/api/osm/*` routes, Bella `search_places` + `map_nearby` places, **"Places (OSM)" map layer**, company dedup‑link. **Val's action:** double‑click **Ingest OpenStreetMap Qatar.command** to populate (fetches every named business/restaurant/shop/clinic/hotel/street in Qatar + pushes; don't run alongside a harvester).
- [ ] **e.** **`Preview Legacy Contact Repair.command`** → then **`Apply Legacy Contact Repair.command`** (workspace root). Fixes the wrong‑company addresses left on the legacy column. Preview shows: **promote 126** role mailboxes an official source (QCCI/Tasmu/QSTP) states verbatim for that company · **clear 373 emails + 409 phones** that Bell already deleted as another company's (removed value kept in `extra_fields.legacy_contact_removed`, nothing destroyed silently) · **leave 233** alone (49 named persons = PDPPL, 150 unconfirmable, 24 junk). Seconds, not hours. Claude pushes to prod after.
- [ ] **f.** **`Preview Address Auto-Decide.command`** → **`Apply Address Auto-Decide.command`** (workspace root): records the 86 safe verdicts (48 people, 38 placeholder domains). Then local Portal → **Address Review** to work the 300 suggested ones — each shows Bell's proof and a suggested answer; "Company inbox" is never bulk‑appliable because that is the verdict that lets Bell email them.
- [ ] **g.** **`Preview Location Merge.command`** → **`Apply Location Merge.command`** (workspace root): collapses 5 rows that state only a coordinate another row already states with a real address (DOC is one). Seconds. No map pin changes — both rows sat on the same point.
- [ ] **h.** Local Portal → **Discovery Review** → **"Location pairs"** tab (16 cards): each shows a pin, the surveyed building at that exact spot, and the company's own written address that mentions it. Click **"Same place — use this address"** if they match (DOC's Marina 50 is the first card), **"Not the same"** otherwise. Tell Claude after — he pushes.
- [ ] **i.** AFTER `Resolve Website Map Links.command` finishes: re‑run **`Preview Location Merge.command`** → **`Apply Location Merge.command`** (it now also folds the 187 punctuation‑twin addresses; run it after the resolver exits or Apply will refuse on drift — that refusal is correct, just re‑Preview). Then the **"Address twins"** tab in Discovery Review (~100 judgment cards, no rush).
- [ ] **j.** **`Preview Chain Links.command`** → **`Apply Chain Links.command`** (workspace root): links 2,284 registry‑numbered branch registrations under their 1,309 parent firms (the /n CR suffix is the registry's own statement). Then Discovery Review → **"Chains"** tab: Yateem is the first card — "Link all 15 as branches" is the click that makes it ONE family. Claude pushes after.

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

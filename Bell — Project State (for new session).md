# Bell Data Intelligence — Project State & Handoff

**As of:** 2026‑07‑08 · **Purpose:** a complete, current snapshot of what Bell is, what's **done**, what's **built but not deployed**, what's **in‑flight**, and what's **pending** — so a new session can understand 100% of where we are **before** any new planning. This is a *state record, not a plan.* Phased planning is deliberately left for Val + the new session together.

> **Accuracy note:** This synthesizes the persistent memory (`MEMORY.md` + the individual memory files) plus the 2026‑07‑06→08 tender work. Memory is point‑in‑time; **verify against current code / the live site before asserting any file:line or behavior as fact.** Deep detail for each area lives in the memory file named in *(→ memory: slug)*.

---

## 1. What Bell is

Bell Data Intelligence (**bell.qa**) is a Qatar business‑intelligence platform. It gathers company, people, tender and signal data from Qatar sources, enriches it, and sells access (search, reveal‑to‑CRM, signals, research, outreach) to paying tenants.

**Doctrine that shapes every feature:**
- **Snowball doctrine** — every input enriches the DB; every output feeds a public surface. Design ingestion + publish flags this way. *(→ memory: bell_snowball_doctrine)*
- **"Every datum utilized"** — no captured field goes unused. *(→ memory: vision_data)*
- **Architecture doctrine** — ONE codebase, THREE deployments (local Mac engine, app.bell.qa, admin.bell.qa) + a separate Next.js marketing site; logical multi‑tenancy + RLS; optional dedicated‑instance tier; every new per‑tenant table gets `tenant_id` from day one. *(→ memory: bell_architecture_doctrine, capability_gating)*

## 2. Architecture & infrastructure

- **Stack:** Railway (compute + Postgres) + Cloudflare (CDN/DNS/SSL) + Clerk (auth) + Stripe (billing) + Resend (email). Single‑platform Railway (NOT Vercel). GitFlow‑lite: `main`=prod, `develop`=staging. *(→ memory: bell_deployment_stack)*
- **Three runtimes from one repo:** the **local Mac engine** does all heavy/local‑only work (ingestion, enrichment, assembly, canonical mutation, scraping) and **pushes** results to prod; **app.bell.qa** is the customer portal; **admin.bell.qa** is read‑only for canonical data. Capability gating (`capabilities.js`, keyed by `BDI_MODE`) hides/blocks local‑only ops off the local engine. *(→ memory: capability_gating, bdi_architecture)*
- **Local→Railway sync** = a **full id‑based MIRROR** (prod is an exact copy, zero compute on Railway). Hard‑deletes propagate via `sync_deletions` tombstones → `POST /api/sync/delete`. Auth via `BDI_SYNC_TOKEN`. *(→ memory: milestone_c_sync_design, mirror_sync_deletions)*
- **Identifiers:** BIN/PIN/JIN assigned only during the Assembly stage. *(→ memory: bdi_identifiers)*
- **Pipeline stages:** Data Gathering → Enrichment → Assembly → Final, with local Postgres + browser Portal. *(→ memory: bdi_architecture)*
- **Gotcha:** `db.js` installs a global int8→JS Number parser — **do not remove** or id comparisons silently break. *(→ memory: postgres_bigint_parser)*

## 3. How we work (hard constraints — these govern the new session)

- **Click‑only.** Val does not use the terminal. Everything must be a double‑click `.command` file or an in‑Portal button. Long runs must be **resumable** (he may Ctrl‑C and re‑run). *(→ memory: click_only_workflow)*
- **Deploy flow:** double‑click **Push Changes.command** (→ staging), then **Open Production Release.command** (→ prod). Scrapers/scans run locally — no deploy needed to run them; deploy only for UI changes + parity. *(→ memory: deploy_automation_plan)*
- **Always deploy BOTH envs** (staging AND prod) for parity, **batched to phase end** — build + verify locally through a phase, deploy once at the end. *(→ memory: always_deploy_both_envs, workflow_batched_deploys_and_instructions)*
- **End every turn** with clear numbered steps + what‑to‑test + a short commit message (deploy‑time only) + questions separated out. *(→ memory: workflow_batched_deploys_and_instructions)*
- **100% accuracy bar.** Prove parsers against live data (run the exact logic on the real page, show X/X correct) before shipping. Use **PGlite** for SQL logic and `node --check` for syntax. The Monaqasat mispairing bug came from rushing — don't repeat it. *(→ memory: tenders_pipeline)*
- **Specify WHERE** each manual step happens (local Portal vs app vs admin vs which `.command`). *(→ memory: feedback_specify_where_actions_happen)*
- **UI edits:** all React hooks ABOVE any early return; `node --check` misses this — grep hook placement after editing UI or the page blanks. *(→ memory: feedback_ui_hooks_verification)*
- **Blank‑page‑after‑deploy** has two causes: stale JS cache (fixed with no‑cache headers in server.js) and the hooks bug above. *(→ memory: stale_cache_blank_page)*
- **⚠️ Avoid `git` on the mounted folder** — it leaves a stale `.git/index.lock` that breaks Push (fix: Fix Git Lock.command). No GitHub/Railway connector exists yet. *(→ memory: deploy_automation_plan)*
- **Bella model = `claude-sonnet-5`** always; **never** send `temperature` (Sonnet‑5 returns HTTP 400); **never** fable/opus for Bella. Marketing Bella + news = `claude-haiku-4-5`. *(→ memory: vision_walkthrough_round2, anthropic_sonnet5_no_temperature)*
- **Low‑RAM (Val's Mac = 8GB):** tender enrich/scan now auto‑caps concurrency to 2 + recycles the Crawl4AI browser every 150 pages. *(→ memory: low_ram_tuning)*
- **Legal linchpin:** Qatar **PDPPL** governs the self‑marketing + outreach features (personal data). Treat as a blocker for anything that contacts people. *(→ memory: self_marketing_engine_plan, vision_zero_risk)*

---

## 4. STATUS BY WORKSTREAM

**Key:** ✅ DONE+DEPLOYED (verified prod) · 🟡 BUILT — UNDEPLOYED (often local‑effective) · 🔄 IN‑FLIGHT/partial · ⬜ PENDING/not built.

### 4.1 Platform milestones
- ✅ Milestone A — Railway + domains + Postgres. Verified prod.
- ✅ Milestone B1 — Clerk multitenant + Stripe. Verified prod.
- ✅ Milestone C — Mac→Railway mirror sync. Built 2026‑05‑29 (design = full id mirror). *(→ memory: bdi_milestones_done, milestone_c_sync_design)*
- ✅ Custom auth pages (Clerk headless, no Clerk badge); advanced fuzzy search (migration 026). *(→ memory: custom_auth_pages, advanced_search_design)*
- ✅ **Security/authz** deep‑reviewed 2026‑06‑22: tenant isolation SOUND, zero high findings; 2 LOWs fixed (undeployed). The old "no auth anywhere" note is OBSOLETE. *(→ memory: security_authz_gap)*
- ✅ Credit system — tenant_reveals + credits/ledger + revealOne/revealBulk (charge only unrevealed, idempotent) + reveal→auto‑CRM + masking. **Don't rebuild.** Remaining polish: map "Reveal" button, CRM toast, confirm dialog. *(→ memory: credit_system_plan)*

### 4.2 Data sources & ingestion
- ✅/🟡 Captured Qatar sources: QFZ, QFC (public register), MOCI businessmap, plus MoPH/DHP (facilities) and Tasmu. Free‑registry coverage largely exhausted; several sources investigated and rejected (Ashghal‑as‑registry, Tourism, Dubai DDA trap). *(→ memory: qatar_sources_status, moph_dhp_source)*
- 🟡 **3 new sources** — CRA ICT + Made‑in‑Qatar (+owners→people) + QFCRA (firms + ~470 approved individuals): scrapers + Run Scan commands on disk, wired; built+verified 2026‑06‑26, **one deploy pending**. *(→ memory: new_sources_scrapers)*
- ✅ Multi‑industry model — `companies.industries text[]` + primary (migration 046); Phase 1 of 4 (filter panel + stats page + search synonyms still to build). *(→ memory: industry_model, followups_open)*
- 🟡 Data‑quality engine — shared validators fix junk phones/socials/people/emails/websites at ingestion + dry‑run cleanup; built 2026‑06‑18; UI fixes + CRM edit/delete still pending. *(→ memory: data_quality_engine)*
- **Policies:** dedup scoring weights *(→ dedup_scoring_policy)*; upload reconciliation (newest status wins; disappeared companies never deleted) *(→ upload_reconciliation_policy)*; non‑displayed (international/rejected/pending) companies live LOCAL‑ONLY, never grow the online DB *(→ non_displayed_companies_local_only)*.

### 4.3 Enrichment engine
- ✅ **Local Website Harvester (Stage 7)** — Firecrawl‑free; crawls company sites → contacts/people/partners/logo. *(→ local_website_harvester)*
- ✅ **Network Mapper (Stage 9)** — discovers partners/clients/affiliates/competitors; routes new companies by country (Qatar auto‑enter / International / pending); `company_relationships` (migration 040). *(→ local_engine3_network_mapper)*
- ✅ Manual Lookup + Harvest History (migration 041); Engines‑1‑3‑on‑selected. *(→ manual_lookup_and_harvest_history)*
- 🟡 **⭐ Enrichment program (Val's #1 focus area)** — Phase A **24/7 Continuous Engine** BUILT (`continuous_sweep.js` + migration 056 + Install Always‑On Engine.command + status pill). Gaps: person‑emails / financials / website‑coverage / search‑API. **NEXT = Phase B email engine.** *(→ enrichment_program)*
- 🟡 WS1 local facts (Stage 11 extracts facts locally for FREE, Firecrawl opt‑in) + WS4 email suppression (bounce→global suppression + email_status, migration 061); Crawl4AI `/crawl` gained `js_code`. Built 2026‑06‑26. *(→ robustness_ws1_ws4_done)*
- 🟡 Low‑RAM tuning (this session, 2026‑07‑08) — undeployed local‑effective. *(→ low_ram_tuning)*

### 4.4 Tenders & Signals  ← most active area
- ✅ **Monaqasat** — ~21K tenders live on prod, correctly paired after the critical index‑drift bug fix (pair by title, verified live). *(→ tenders_pipeline)*
- 🔄 **Monaqasat detail enrichment IN PROGRESS + parser just fixed (2026‑07‑08).** Cards live (21,120). A real bug was found + fixed: the activity‑codes parser silently dropped any activity whose name exceeded 80 chars (tenders with all‑long names captured 0 → the "0 detailed" symptom). Fixed + versioned (`detail_v=2`) so **re‑running Enrich re‑checks every tender once (newest first) to correct activities — pending jumps back ~21K by design, now memory‑safe.** New **Check Tender Detail.command** reports enrichment health. Older pre‑2024 tenders genuinely have no activity codes. *(→ tenders_pipeline, low_ram_tuning)*
- 🟡 **Tenders UI** — `TendersTab.js` (embeddable) lives INSIDE the Signals section (a "Tenders" chip + folded into "All types"), NOT a sidebar item. Backed by enhanced `/api/tenders` + prod `/api/sync/count`. Built 2026‑07‑05, **UNDEPLOYED**. *(→ tenders_pipeline)*
- ✅/🟡 **Ashghal stage 1** — its own open tenders (~35) live via `scrape_ashghal.js` + Run Ashghal Scan.command.
- ✅ **Ashghal STAGE 2 — BUILT + DEPLOYED + scanned 2026‑07‑08** (scan: 2,782 new, 28 winners linked). Every parser verified live:
  - **Awarded winner/bidder tables** (the prize Monaqasat hides) — `scrape_ashghal_awarded.js` drives DisplayofAwarding.aspx postbacks with Playwright (`withPlaywrightPage` in render.js), parses winner + all bidders + Accepted/Winner price + ICV% + rank; winner→`linkTenderCompanies`. Needs the Harvester Browser installed.
  - **Full closed/archived lists** — corrected a wrong assumption: they page by plain GET **`?PageIndex=N`** (not `__doPostBack`). e‑Tenders + General × Open/Closed/Archived ≈ 2,900 tenders.
  - **Per‑tender detail** — `enrich_ashghal.js` (resumable): Bond / Document Fees / Category / description via `?...&TenderID=<int>`.
  - **Prospected** upcoming projects (`?Quarter=1..4`), new `prospected` status. New `archived`/`prospected` status badges in the UI. Pre‑Qual/EOI skipped (empty). *(full detail → tenders_pipeline)*
- ✅ **QatarEnergy (source #3) BUILT + DEPLOYED + scanned 2026‑07‑08** (scan: 1,236 tenders, **261 winners linked**). Easiest source — qatarenergy.qa exposes an ASMX JSON API (anonymous), so `scrape_qatarenergy.js` is a plain fetch (no browser/Crawl4AI). Open + upcoming + awarded contracts/POs/agreements; ~1,199 awarded records carry the winning contractor + price. `Run QatarEnergy Scan.command`. *(→ tenders_pipeline)*
- ✅ **All 3 tender sources LIVE (25,138 tenders on prod).** Tender UI lives in Signals with prominent **source chips** (Monaqasat / Ashghal / QatarEnergy + counts) + status chips + winner/bidder + activity‑code drawers.
- ⬜ **Tender PENDING queue:** (1) **activity‑code matching** — match tender activity codes to companies in that line of business → live buyer‑intent signals (needs Monaqasat enrichment finished + confirm companies store matchable activity codes); (2) **auto‑scan scheduler** — macOS LaunchAgent "Install Tender Auto‑Scan.command" (PARKED until Tenders+Signals feel 100%); (3) later: competition tracking (Firecrawl monitor → signal). All three tender sources (Monaqasat, Ashghal, QatarEnergy) are now built; **tender source filter = prominent chips** in TendersTab. *(→ tenders_pipeline, vision_signals)*
- ⬜ Signals vision — global + personalized signals/predictions/buyer‑intent from tenant ICP. Mostly unbuilt. *(→ vision_signals)*

### 4.5 Bella (AI assistant) — 3 isolated instances
Marketing salesperson (no DB) / user‑portal agent (revealed‑data + tools + act‑on‑behalf) / admin ops brain. Agentic with approval + credit gates; chat + voice (header center + edge‑glow). *(→ vision_bella)*
- ✅ **LIVE‑confirmed both envs:** G1 (portal chat), G2 / G2.1 (33→ tools, live refresh, quick‑replies), G2.2 + G3 (zero‑DB marketing selling), G4 voice, G4.1 (pill/glow/interrupt). *(→ vision_walkthrough_round2)*
- 🟡 **G4.2 + G2.3 BUILT — NEEDS DEPLOY:** TTS turbo_v2_5 + speed 1.08, voice‑active replies spoken, 41 tools (+people/reveal/billing/templates/prefs/deep‑data).
- 🟡 **Bella super‑upgrade batch** (2026‑07‑04, undeployed): acts on UI (show/open/filter/fill via `ui/lib/bellaBus.js`) + get_news + marketing confidence + 10s voice auto‑off + admin delete news/research.
- ⬜ Still pending: **Arabic voice**, marketing voice (D4), outreach un‑gating, **Research tools (F2)**, **Team Bella**, map ops, **G5 admin Bella**, per‑plan caps. *(→ vision_walkthrough_round2, next_batch_mandate_research_voice_team)*
- **Proven bug fixes to keep:** `res.on('close')`+`writableEnded` guards the +5ms abort bug; 90s watchdog; keychain 5s race. *(→ vision_walkthrough_round2)*

### 4.6 Product portal (the A‑to‑Z vision, section by section)
Read `product_vision_roadmap` first for planning; round‑2 deltas in `vision_walkthrough_round2`. Status per section:
- ✅ **ICP profile** built (migrations 050+051 + /api/icp + Settings UI + Companies has‑website filter). *(→ icp_profile_built)*
- ⬜ **Companies** — findability + engine expansion (partly there). ⬜ **People** — **PUBLIC LOCKDOWN banner** required (admin keeps access). *(→ vision_walkthrough_round2)*
- ⬜ **Map** — overlay UX, select‑area→Reveal (charge only unrevealed, shared reveal state)→CRM, Qatar building/property data, partnership network + flight/traffic layers (⚠️ Mapbox attribution). *(→ vision_map)*
- ⬜ **CRM** — full CRM, denser rows, email/outreach via tenant's own domain on Resend, bulk sequences, reveal→CRM toast, Bella access. *(→ vision_crm)*
- ⬜ **Jobs** drawer + filters; **Research** (verify + 3 new types + neutral "Other" + 3‑day exclusivity→Market Feed); **Billing** (plan up/down, buy credits, real invoices, 24h‑or‑freeze); **Settings** (ICP/company builder, own email domain, team roles, Bella comms style). *(→ vision_jobs?, vision_research, vision_billing, vision_settings)*
- ⬜ **Onboarding** guide — start new users on the ICP profile. Unbuilt. *(→ onboarding_guide_planned)*
- ✅ **Market Feed** — "Data Statistics" rename + green‑blinking dot shipped 2026‑06‑23 (undeployed); news summary/body is an INGESTION task. *(→ vision_market_feed, research_to_feed)*

### 4.7 Go‑to‑market
- 🔄 **Self‑marketing engine** (~70% built) — Bell uses its OWN DB to win paid users via value‑first outreach (gift anonymized teaser → reveal after signup); 7‑agent research + phased plan; **awaiting Val's 4 decisions**; ⚠️ PDPPL legal linchpin. *(→ self_marketing_engine_plan)*
- 🟡 **0 Risk Agreement** offering — revenue‑share (15%) instead of subscription for cash‑poor companies; signed+stamped agreement + CR/QID → admin approval → deep‑dossier lists. **Phase 1 BUILT 2026‑06‑30 (migration 067 + lib/zerorisk.js + routes + UI + marketing page + agreement DRAFT.docx), UNDEPLOYED**; awaiting Val's staging test + lawyer. *(→ vision_zero_risk)*
- ✅ **Marketing site** — 16 capability pages live; naming conventions + canonical numbers + brand vocabulary documented. Read first for any marketing/dashboard work. *(→ bellqa_marketing_site_state, marketing_buyer_intent_swap)*

### 4.8 Import Phase 2 (Match / Enrich / Govern)
- ✅ **Core COMPLETE + DEPLOYED staging+prod 2026‑06‑30** — capture + admin curation + sync reconciliation (PDPPL‑safe) + xlsx (SheetJS CDN) + matching §4 (conservative, PGlite‑tested) + inline confirm‑matches UI. ⏳ **PENDING Val's user‑account testing** (confirm‑matches + xlsx/Arabic + new‑contribution privacy). Only §2 polish left. *(→ import_phase2)*

### 4.9 Outreach & notifications
- 🟡 **Outreach engine (Phase 1)** — send/sequences(auto‑stop‑on‑reply)/inbound/compose‑UI all BUILT but admin‑gated + bell.qa‑locked. Phase 1 = own‑domain connect + un‑gate + daily limits + bulk‑send + metrics. **Don't rebuild the engine.** *(→ outreach_engine_state)*
- 🟡 **Notifications** — in‑app bell + center + admin announcements + branded email template (foundation 2026‑06‑14, migration 042, NOT deployed); email delivery + per‑event triggers + prefs + unsynced‑indicator pending. *(→ notification_system)*

### 4.10 Research
- 🔄 **PAUSED** — R1+R2 fully built but the engine is broken (Firecrawl Spark returns `data:null` even when credits charged). Resume when Firecrawl fixes Spark, or swap engine to scrape+LLM. Rules: only charge on `ready` (never failed/cancelled); reports auto‑release to Market Feed (anonymized, full report) — **exclusivity window is 0 now, MUST set to 3–7 days before real users.** Firecrawl research prompts flagged wrong by Val — revisit prompts.js/schemas.js/types.js. *(→ research_paused_firecrawl_spark, research_no_charge_on_failure, research_to_feed, firecrawl_research_prompt_issue, research_two_way_sync, research_approval_queue_plan)*

### 4.11 Team
- ⬜ Team = Clerk Organizations ↔ Bell tenants; backend foundation built (migration 027, **dormant**); Clerk dashboard config + Team UI + CRM assignment pending. Owner adds members + per‑feature permission ticks + per‑member credits/tracking + per‑record activity log; needs authz gap closed. **Unbuilt.** *(→ clerk_organizations, vision_team)*

---

## 5. Immediate open items (as of 2026‑07‑08)

1. ✅ **Tender batch DEPLOYED (staging + prod) + all scans run 2026‑07‑08** — Ashghal stage 2, Monaqasat activities parser fix + `detail_v` versioning, RAM tuning, QatarEnergy source, source chips. **25,138 tenders live** (Monaqasat 21,045 + Ashghal 2,857 + QatarEnergy 1,236); 289 winner→company links (Ashghal 28 + QatarEnergy 261).
   - ⚠️ **Follow‑up Tenders UI polish BUILT 2026‑07‑08 (Val feedback) — UNDEPLOYED, needs one more Push+Prod:** default view = **Open** (+ chips reordered Open/Awarded/All); **"detail pending"** hint scoped to Monaqasat only (was wrongly showing on all Ashghal/QatarEnergy — their data is complete); **Signals "Tenders · N" chip** now shows the true total (was a confusing window pseudo‑count of 32).
2. 🔄 **Finish Monaqasat activity re‑enrich** — Val running **Enrich Tender Details.command** overnight (resumable, memory‑safe, marks `detail_v=2`, newest‑first). Watch with **Check Tender Detail.command**; done when `v2 ≈ detail‑id count`.
3. ⬜ **Activity‑code matching** → live buyer‑intent signals (task #72; needs the overnight enrich finished + confirm companies store matchable activity codes).
4. ⬜ **Auto‑scan scheduler** (task #73, parked until Tenders+Signals feel 100%; QatarEnergy needs no engine, Ashghal/Monaqasat need Crawl4AI).
5. Multiple **BUILT‑UNDEPLOYED** batches still awaiting a deploy: Bella G4.2/G2.3 + super‑upgrade, 3 new sources, 0 Risk Phase 1, notifications foundation, data‑quality UI, Market Feed rename.

## 6. Where the detail lives (memory map)
- **Tenders:** `tenders_pipeline`, `vision_signals`, `low_ram_tuning`
- **Bella:** `vision_bella`, `vision_walkthrough_round2`, `bella_super_upgrade_batch`, `anthropic_sonnet5_no_temperature`, `next_batch_mandate_research_voice_team`
- **Architecture/deploy:** `bell_architecture_doctrine`, `bell_deployment_stack`, `capability_gating`, `milestone_c_sync_design`, `mirror_sync_deletions`, `deploy_automation_plan`, `postgres_bigint_parser`
- **Enrichment/sources:** `enrichment_program`, `local_website_harvester`, `local_engine3_network_mapper`, `robustness_ws1_ws4_done`, `new_sources_scrapers`, `qatar_sources_status`, `moph_dhp_source`, `industry_model`, `data_quality_engine`
- **Product vision:** `product_vision_roadmap`, `vision_*` (data, map, crm, signals, research, billing, settings, team, market_feed), `icp_profile_built`, `onboarding_guide_planned`
- **GTM/legal:** `self_marketing_engine_plan`, `vision_zero_risk`, `bellqa_marketing_site_state`
- **Import/credits/security:** `import_phase2`, `credit_system_plan`, `security_authz_gap`, `outreach_engine_state`, `notification_system`
- **Workflow rules:** `click_only_workflow`, `workflow_batched_deploys_and_instructions`, `always_deploy_both_envs`, `feedback_specify_where_actions_happen`, `feedback_ui_hooks_verification`, `stale_cache_blank_page`

---

## 7. Val's crucial directives (added 2026‑07‑08)

*These are Val's own directives — they must shape the plan. The new session should treat them as requirements, **research each thoroughly and find the best / most affordable / free way to achieve them** before proposing phases. This is a **living list** — Val will add more (here or live in the new session), so don't treat it as final.*

### 7.1 Bella — make her the brain of the user's business
- **Actually fill things in.** Anywhere a user can type or fill a detail, Bella must be able to do it too. Today she reports it's done but the field isn't actually filled — fix this.
- **Total data awareness.** Bella must see and understand ALL market signals, ALL news, ALL deep data, and ALL tenders — filter them, understand them, and either show them to the user or use that information to act.
- **Near‑instant speed.** Her thinking + responding is too slow. Make it dramatically faster — as close to instant as possible. *(Reconcile with §3's standing rule: Bella's model is fixed to `claude-sonnet-5` — speed must come from architecture, streaming, prompt caching, fewer round‑trips, parallel tool calls, etc., not from switching models.)*
- **Multi‑action autonomy with up‑front approvals.** Bella must chain many actions from a single request. Val's example: *"Please filter all Interior Design companies, separate the top 3, add them to my CRM, write and send them personalized emails, enroll them in follow‑up sequences, and change my title in Settings profile to CEO."* She must do **all** of it — ask for any required approvals **in advance**, then run **uninterrupted**; if the user didn't specify something (which email, ICP not set up) she must **ask clarifying questions and confirm** so she does exactly what the user expects. She must draft emails, send emails, create + enroll email sequences, and offer suggestions.
- **Positioning.** Bella is not just an assistant — she is the best **Business Development Manager, Sales representative, Marketer, Researcher, and Strategist — the brain of the user's business.**

### 7.2 Signup & onboarding
- **Collect more at signup** — QID, contact number, designation, etc.
- **Professional account setup + onboarding right after signup** — a guided flow where the user provides everything the profile/settings need, with a **% profile‑completion** indicator. The user can complete it now, **skip** and do it themselves later, or **ask Bella to do it for them.** Make onboarding **visual/guided** — highlight each section and explain what each is for.

### 7.3 Bell as a business — strategy, intelligence, defensibility, economics
- **Watch the competition.** Monitor foreign competitors + market leaders — their plans, roadmap, and the "politics" they play — to always stay several steps ahead on technology, features, offerings, and pricing.
- **Know the local rules.** Deeply understand Qatar's government, rules, regulations, and laws — how the government moves, and what to do to stay on top and play it right — while presenting that same data as a genuine help to residents and citizens (and benefiting from it).
- **Read the board.** Learn politics, strategy, and how the market and its leaders move — find every hidden gap, weakness, and strength ("every underwater stone, every hidden message").
- **Defensibility / moat.** Secure Bell from every angle so any attempt by anyone to become a competitor is neutralized decisively.
- **Solutioning.** Be able to generate solutions, suggestions, and concrete implementations to move Bell in a chosen direction.
- **Self‑economics.** Understand every cost — servers, external APIs, the local domain, hosting, marketing, everything — do its own calculations, grow itself, and always stay profitable.

### 7.4 For the new session
- **Research first, affordably.** For every point above, research thoroughly and find the best, cheapest, or free way to achieve it before proposing any phases.
- **Then plan.** Only after Val confirms §7 is complete (he has more to add) should the new session propose the phased plan.

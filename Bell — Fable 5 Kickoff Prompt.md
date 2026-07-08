# Bell Data Intelligence — Kickoff Prompt for the new (Fable 5) session

> Paste everything below the line into the new session.

---

We're continuing **Bell Data Intelligence** (bell.qa) — my Qatar business‑intelligence platform. One codebase, three deployments (local Mac engine, app.bell.qa portal, admin.bell.qa) + a separate Next.js marketing site. Railway + Postgres + Cloudflare + Clerk + Stripe + Resend.

**Do these in order before anything else:**

1. **Read your memory.** Open `MEMORY.md` (the index loaded each session) and read the individual memory files it points to. The master records to start with: `tenders_pipeline`, `product_vision_roadmap`, `vision_walkthrough_round2`, `enrichment_program`, `bell_architecture_doctrine`, `low_ram_tuning`.
2. **Read the state doc:** **`Bell — Project State (for new session).md`** (in the workspace root). It's a complete snapshot of what's **done / deployed**, **built but not deployed**, **in‑flight**, and **pending** across every workstream, with pointers into the memory for detail.
3. **Verify before asserting.** Memory and the state doc are point‑in‑time. Before you rely on any file/behavior, check it against the current code or the live site. Don't assume.

**Then STOP and wait for me.** Do **not** start building, and do **not** start phased planning yet. First:
- Give me a short, honest read‑back of where you think we are (done / in‑flight / pending) so I know you've absorbed it, and ask me any clarifying questions.
- Then **wait** — I'm going to add a few **crucial directives** that must shape the plan (see the placeholder section 7 in the state doc). Once I give them to you, plan properly **with phases** around them.

**Hard constraints (these govern how you work — from memory):**
- **Click‑only.** I don't use the terminal. Everything is a double‑click `.command` file or an in‑Portal button. Long runs must be **resumable**.
- **Deploy** = double‑click **Push Changes.command** (→ staging) then **Open Production Release.command** (→ prod). Scans/scrapers run locally — no deploy to run them; deploy only for UI + parity. **Deploy BOTH envs**, **batched to phase end.**
- **100% accuracy bar.** Prove parsers/logic on live data (show X/X correct) before shipping; PGlite for SQL, `node --check` for syntax. Don't rush (that's what caused the Monaqasat mispairing bug).
- **End every turn** with clear numbered steps + what‑to‑test + a short commit message (deploy‑time only) + questions separated out. Always say WHERE each step happens (which `.command` / portal / env).
- **UI:** all React hooks above any early return (or the page blanks); **avoid `git` on the mounted folder** (stale index.lock breaks Push).
- **Bella model = `claude-sonnet-5`**, never send `temperature`, never fable/opus for Bella; news/marketing Bella = `claude-haiku-4-5`.
- **My Mac is 8GB** — tender enrich/scan is now capped to concurrency 2 + recycles the Crawl4AI browser every 150 pages; keep new local‑engine work memory‑frugal.
- **PDPPL** (Qatar data‑protection law) is the legal linchpin for anything touching personal data / outreach.

**Where we are right now (quick orientation — the state doc has the full picture):**
- **Tenders:** Monaqasat ~21K live; detail enrichment in progress (resumable, now memory‑safe). **Ashghal stage 2 is BUILT but UNDEPLOYED** (awarded winners + closed/archived pagination + per‑tender detail + prospected). Pending: deploy the tender UI batch, run the full Ashghal scan, activity‑code→company matching, auto‑scan scheduler, then QatarEnergy.
- Several other batches are **BUILT‑UNDEPLOYED** awaiting a deploy (Bella G4.2/G2.3 + super‑upgrade, 3 new sources, 0‑Risk Phase 1, notifications foundation).
- Big **pending** areas: Bella (Arabic voice, Research tools, Team, admin Bella), the product‑portal vision sections (Map, People lockdown, CRM, Jobs, Billing, Settings, Team, Onboarding), self‑marketing engine (~70%, awaiting my decisions), Research (paused on Firecrawl Spark).

Start with steps 1–3, read it all back to me, and then wait for my crucial directives before you plan.

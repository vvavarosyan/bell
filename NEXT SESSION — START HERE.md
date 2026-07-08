# Bell Data Intelligence — next-session kickoff prompt

*(Paste everything below the line into a new session to continue seamlessly.)*

---

We're continuing work on **Bell Data Intelligence** (bell.qa) — my Qatar business-intelligence platform. One codebase, three deployments (local Mac engine, app.bell.qa portal, admin.bell.qa) + a separate Next.js marketing site. Railway + Postgres + Cloudflare + Clerk + Stripe + Resend. We've been building the **tender data pipeline** and I want to keep going.

**FIRST, before anything: read your memory file `tenders_pipeline.md`** (it's in MEMORY.md's index) — it's the master record of the whole tender workstream with every decision, bug, fix, and pending item. Skim MEMORY.md for the broader project too. The summary below is just orientation; the memory has the real detail. Verify anything you're about to rely on against the current code/live site — don't assume.

## Where we are (as of 2026-07-06)

**Monaqasat (source #1) — solid + trustworthy:**
- ~21,000 tenders live on prod, all **correctly paired** after we fixed a critical index-drift bug (each tender now maps to its own detail page by matching the title to the link's own text — verified 20/20 and 14/14 live). A "Repair Tenders (fix links).command" re-paired everything + cleared the old wrong detail.
- **Detail enrichment is the one thing in flight**: I run **"Enrich Tender Details.command"** (lean + fully resumable) to fill each tender's activity codes, contact, contract, and description. It may be fully done, partly done, or not yet run — **check the pending count first** and ask me. (There's also a heavier "Backfill Full Tender Archive.command" that re-walks cards first — not needed after the Repair.)

**Ashghal (source #2) — stage 1 done + live:**
- Ashghal's own **open** tenders (~35, source='ashghal', buyer "Public Works Authority (Ashghal)") are captured + live via `scrape_ashghal.js` + "Run Ashghal Scan.command". Parser is cell-by-cell on the list table (verified 35/35 live).
- **Stage 2 is pending** (this is the main tender task now): the **Closed/Archived** lists (~2,800) paginate via ASP.NET `__doPostBack` (10/page, no URL param — verified), so they need click-driven pagination; the **Awarded winner/bidder tables** (DisplayofAwarding.aspx — the PRIZE: winning contractor + all bidders + prices + ICV → real company linkage + buyer-intent signals); **Prospected** (upcoming projects by quarter); **Pre-Qualifications/EOIs**; and per-tender detail. Study each live via Chrome, build carefully, and verify the parser on real data before shipping.

**Tenders UI**: lives INSIDE the **Signals** section (a "Tenders" tab/chip + folded into "All types") — NOT a sidebar item. `TendersTab.js` (embeddable), backed by enhanced `/api/tenders` (filters/facets/sync-status/:id) + a prod `/api/sync/count`.

## Pending work, priority order
1. **Ashghal stage 2** — postback pagination for closed/archived + Awarded winner tables (start here — it's the prize) + prospected + pre-qual + detail. (memory task #77)
2. **Activity-code matching** — match each tender's activity codes to my companies in that line of business → live buyer-intent signals in Signals. Needs Monaqasat enrichment finished (activity data) + first confirm my companies store matchable activity codes. (task #72)
3. **Auto-scan scheduler** — a macOS LaunchAgent "Install Tender Auto-Scan.command" to run scans daily and auto-push. I PARKED this until Tenders + Signals feel 100%. (task #73)
4. Later: QatarEnergy (source #3), Competition tracking (Firecrawl monitor → signal).

## Hard constraints — follow these
- **I'm click-only.** Everything must be a double-click `.command` file or an in-portal button. Never ask me to type terminal commands. Long runs must be RESUMABLE (I may Ctrl-C mid-run and re-run).
- **Deploy** = double-click "Push Changes.command" (→ staging), then "Open Production Release.command" (→ prod). Scrapers/scans run on my Mac (local) — no deploy needed to run them; deploy only for UI changes + parity. Needs the Crawl4AI engine running for scans.
- **100% accuracy bar.** Prove parsers against live data (run the exact logic in Chrome on the real page and show X/X correct) before shipping. The mispairing bug came from rushing — don't repeat it. Use PGlite for SQL logic, `node --check` for syntax.
- **Batched deploys**: build + verify locally through a phase, deploy both envs once at the end, and end each turn with clear numbered steps + what-to-test + a short commit message + any questions separated out.
- **Bella model** = `claude-sonnet-5` (never send `temperature`); marketing Bella + news = `claude-haiku-4-5`. Never fable/opus for Bella. (Standing rule, not tender-specific.)

## Start by asking me
(a) Did "Enrich Tender Details.command" finish (pending count 0)? and (b) ready to build **Ashghal stage 2, winner tables first**? Then dive in — study the live Ashghal pages via Chrome, build the parser, verify it on real data, and wire it into the existing `tenders` pipeline (`source='ashghal'`, winner → `linkTenderCompanies`).

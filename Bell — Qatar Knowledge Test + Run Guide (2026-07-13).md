# Qatar Knowledge — morning test + run guide (2026‑07‑13)

Good morning Val. While you slept I finished and **deployed to both staging and production** a full **Qatar Knowledge Base** — Bell now learns Qatar's political system, ministries, key people **and its laws**, from official government sources, and can cite them. Everything below is tested (74 automated checks + a live browser run), but it needs YOU to populate it with a scan and then eyeball it.

Do the steps in order. Each says exactly where it happens and what "correct" looks like.

---

## Part 1 — turn it on (once)

**Step 1. Double‑click `Open Bell.qa Portal.command`.**
This restarts your local Portal so it loads the new code + database upgrades (the knowledge tables + the laws source). Wait ~30 seconds until the Terminal shows the "Bell Data Intelligence Portal / URL: …" banner.
✅ Correct: near the top it prints `Applied … migration(s)` (or, if I already applied them, it just boots cleanly). No red error text.

**Step 2. Double‑click `Run Qatar Knowledge Scan.command`.**
This is the one that actually learns Qatar. It:
- crawls the Foreign Ministry, International Media Office, Council of Ministers and Shura Council (deeper than before — the IMO bug that only learned 2 pages is fixed), then
- walks **Al Meezan**, Qatar's official legal portal, learning the Constitution, laws and decrees (English **and** Arabic), then
- extracts the laws / ministries / fees each page mentions, then
- publishes everything to the live site.

The government sources take a few minutes. **Al Meezan is big** — it walks its law archive in ~10‑minute, resumable chunks. When a run ends it prints either `cursor N (re‑run to continue)` or `full archive walked ✓`.
✅ Correct: the last lines show `Pages learned (total): <a few dozen or more>`, `… carry extracted laws/bodies`, and `Prod mirror push: {…}` with no error.

**Step 3 (optional, same evening). Double‑click `Run Qatar Knowledge Scan.command` again, 2–4 more times.**
Each run continues Al Meezan's law archive where it left off (you can close the window between runs). You'll see the `Laws & decrees` number climb. Stop whenever you like — it's resumable forever, and re‑running later only re‑checks for changes.

---

## Part 2 — test it (local Portal, `127.0.0.1:3939`)

**Step 4. Ask Bella (open Bella in the local Portal).** Try:
- "What is Qatar's political system?"
- "Who chairs the Council of Ministers?"
- After a couple of Al Meezan runs: "Tell me about Qatar's Law No. 10 of 1987" or "What laws do you have about public property?"
✅ Correct: she answers and **names her source** (e.g. "— Ministry of Foreign Affairs, mofa.gov.qa" or "— Al Meezan") with an as‑of date. If she has nothing on a topic, she should say so plainly — **not invent** a fact, fee, law or name. That honesty is the whole point.

**Step 5. Open the new section: left sidebar → Data → `Qatar Knowledge`** (book icon, between Real Estate and Deep Data).
Check, top to bottom:
- **Four stat cards**: Pages learned · Laws & decrees · Sources · Pages with entities. (Laws climbs as you run more Al Meezan passes.)
- **Search box** — type `constitution` or `property` or a ministry name → results filter, with the matched words highlighted.
- **Language pills** (All / English / العربية) — after Al Meezan runs, click العربية to see Arabic laws (they display right‑to‑left).
- **Source pills** — All / Ministry of Foreign Affairs / International Media Office / Al Meezan / Council of Ministers / Shura, each with a page count.
- **Click any result row** → a panel slides in from the right with the full text, the laws/bodies/fees it mentions as chips, and a "View the original source ↗" link.
- **Switch the "View" toggle to "Recent updates"** → the list of what each scan found new or changed (this is the change‑tracking you asked for — Bell will flag it here when a law or page changes).
✅ Correct: it looks like the screenshot I verified — real pages, working search/filters/drawer, no blank page.

---

## Part 3 — confirm it's live for customers (production)

**Step 6. Go to `app.bell.qa` → Data → Qatar Knowledge.**
After Step 2's push, the same section works on the live customer site (the scan publishes there automatically).
✅ Correct: same content and search as local. Bella on prod can also answer the Qatar questions with citations.

---

## What shipped (so you know what you're testing)

1. **Bella can answer Qatar questions with citations** (`search_qatar_kb`).
2. **Al Meezan laws** — the Constitution, laws, decree‑laws and decisions, English + Arabic, only stored when validated as a real law (never a guess).
3. **A customer‑facing "Qatar Knowledge" browse section** — search, filters, law/ministry "mentions", a detail drawer, and a "Recent updates" change feed.
4. **Entity extraction** — every page records the laws / ministries / fees it mentions, each with a verbatim proof snippet.
5. Under the hood: a much more robust crawler (fixed the IMO 2‑page bug, ASP.NET pages, memory + security hardening) — all reviewed by an adversarial multi‑agent pass that caught and fixed 10 issues before deploy.

**Parked, honestly:** **Hukoomi** (government service *fees & steps*) is real and valuable but sits behind Cloudflare + a second security wall as a JavaScript app — it needs our browser‑based engine (Crawl4AI) and a run you can watch, so I wrote up the full plan (`Bell — Hukoomi Source (Phase 6 KB) — Recon + Plan.md`) instead of half‑building it. Let's do it together in a session.

---

## Questions for you (answer whenever)

1. **Al Meezan law archive**: it grows a bit each scan run. Want me to add a small `.command` that runs it repeatedly on its own until the whole archive is learned (so you don't have to double‑click it 5+ times)? Or a nightly auto‑schedule?
2. **Officials**: the KB stores officials' names + public role from official pages (e.g. the Prime Minister). You OK'd public‑capacity info for customers — confirm the browse section showing officials' names/roles is fine, and I'll keep their personal contacts out until your lawyer signs off (as now).
3. **Next Qatar sources** after Hukoomi: I have a ranked list (Al Meezan ✓ done; then the Official Gazette as a "new law" alert, then regulators — central bank, tax, labour, PDPPL). Want me to keep working down it, or pause the KB and move to another Phase 6 piece (competition watch / cost dashboard)?

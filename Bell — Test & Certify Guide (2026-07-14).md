# Bell — Test & Certify Guide (2026‑07‑14)

**Goal:** verify everything shipped over the last stretch so the database can be *certified* and (your rule) automated outreach can eventually be turned on. Work top to bottom. For each item I've written **where → what to click → what "correct" looks like**. Tick ✅ if it matches, or note what's wrong and send it to me — I'll fix and redeploy.

**How to read it:** everything here is live on BOTH the local Portal (`127.0.0.1:3939`) and production (`app.bell.qa`). Test on the **local Portal** unless a step says otherwise — it's fastest and you're admin there. If a step fails, don't try to fix it — just tell me the item number and what you saw.

**Before you start — one restart:** double‑click **`Open Bell.qa Portal.command`** once, so the Portal is running today's code. (If a feature ever *looks* right but a save/click does nothing, that's a stale server — tell me and I'll restart it.)

---

## Part 1 — This week's moat features (most important; newest)

### 1.1 Freshness stamp on companies
- **Where:** Companies → click any company (e.g. the first one).
- **Look for:** just under the coloured source badges, a green shield line: **"Direct from official Qatar sources · as of [date]."**
- **Correct:** the line is there, with a recent date (within the last couple of months).

### 1.2 ☆ Save button + Saved Lists
- **Where:** open any company → top‑right corner of the drawer: **☆ Save**.
- **Do:** click ☆ Save → in the little popup, type a list name (e.g. "Q3 Targets") → **Add**.
- **Correct:** a toast says "Saved to Q3 Targets"; the star fills in.
- **Then:** left sidebar → **CRM** → the **Lists** sub‑tab (top row: Records · Lists · Pipeline · …).
- **Correct:** your "Q3 Targets" list is there showing "1 company." Open it → your company is listed → **Export CSV** downloads a file → **Rename** and **Delete list** work.
- **Also check:** open a *different* company → ☆ Save → your existing list appears with a checkbox; ticking it adds the company, un‑ticking removes it.

### 1.3 Company notes
- **Where:** open any company → **Company** tab (the default) → very top: **"Your notes."**
- **Do:** type a note (e.g. "Met their procurement lead — follow up Q3") → **Add**.
- **Correct:** the note appears with your email + today's date + **Edit / Delete**. No "add to CRM first" step needed. Edit and Delete both work.

### 1.4 "Who's buying" (buyer intelligence)
- **Where:** left sidebar → **Signals** → the pill row → **Who's buying**.
- **Correct:** a ranked list of Qatar entities that are actively procuring — each shows *"Procuring in [industries]"*, a count of **open tenders**, and an urgency like **"closes in 2d"** (red = urgent). Most urgent are near the top.
- **Do:** click any buyer card.
- **Correct:** a panel slides in listing **that buyer's open tenders** (what they're buying now) with industry tags + closing dates.
- **ICP test:** top‑right, switch **Global → For you**. (If it says you need an ICP, that's expected until you set target industries in **Settings → Company & ICP**.) With an ICP set, the list narrows to buyers procuring in *your* industries, and matching industries are highlighted.

### 1.5 "Who won" (award / winner intelligence)
- **Where:** Signals → pill row → **Who won**.
- **Correct:** a list of recent contract awards — **winner company · QAR value · ICV %** · buyer · bidder count (e.g. "National Industrial Contracting · QAR 378.8M · ICV 26.72% · Ashghal · 3 bidders").
- **Do:** click an **Ashghal** award (it'll have a bidder count).
- **Correct:** a panel shows the **Winner** (a blue link — click it to open that company) and a **full bidder table**: rank · company · ICV % · price · a ✓ on the winner. This is the competitive intel — confirm the numbers look real.

---

## Part 2 — Qatar Knowledge

> **First:** double‑click **`Run Qatar Knowledge Scan.command`** and let it finish (a few minutes). To fully light up the **New legislation** feed, run it **3–4 times total** across the day (or use **`Complete Al Meezan Laws.command`**, which loops until the whole law archive is learned) — the law walk is resumable.

### 2.1 The Qatar Knowledge tab
- **Where:** **Market Feed** → the **Qatar Knowledge** view (top row: All · News · Research · New companies · Qatar Knowledge).
- **Correct:** stat cards (pages learned, laws & decrees, sources), a search box, and source pills. New regulator pills should appear: **Ministry of Commerce & Industry, CRA, General Tax Authority, Qatar Financial Centre, Ministry of Justice, Amiri Diwan, Qatar Financial Markets Authority, Ministry of Public Health.**
- **Do:** search something (e.g. "tax" or "labour" or a ministry). Open a result → a drawer shows the page text + a link to the official source.
- **Language:** the English/العربية filter should correctly separate Arabic law pages from English ones (Arabic laws under العربية).

### 2.2 "New legislation" feed
- **Where:** Qatar Knowledge tab → the **New legislation** button (next to Browse / Recent updates).
- **Correct BEFORE the law archive finishes:** it honestly says **"Reading the full legal archive…"** — that's expected, not a bug.
- **Correct AFTER** the Al Meezan scan has completed a full pass: newly‑published laws appear here.

### 2.3 Bad data was removed
- **Where:** Qatar Knowledge → Browse → Source pill **Amiri Diwan**.
- **Correct:** English pages only — **no Arabic pages, no "404 Page"** (you already ran the cleanup; this just confirms it stuck).

---

## Part 3 — Bella (needs Anthropic credits)

> Bella uses the Claude API. If you're out of credits, top up first at **console.anthropic.com → Plans & Billing**, then test. If she replies with a plain "out of credit" sentence, that's the friendly‑error handling working — it just means top up.

- **Open Bella** (bottom‑left orb, or the **Chat** button top bar). Try each:
  1. **"Who's buying in construction right now?"** → she should list active buyers (uses the new buyer‑intent data).
  2. **"Who won recent Ashghal contracts?"** → recent awards with winner + value.
  3. **"What's new in Qatar law?"** → new legislation (or an honest "nothing new recorded yet").
  4. **"Show me open tenders in [your industry]."** → she opens the Tenders view filtered.
  5. **"Tell me about [a company name]."** → real company facts (industry, location, reviews, financials) — she should NOT invent anything.
  6. **Voice:** click **Voice/Talk**, ask a question → she speaks the answer; interrupting (barge‑in) stops her.
- **Correct overall:** answers are grounded in Bell's data, she cites sources for Qatar‑knowledge answers, and she says "I don't have that" rather than guessing.

---

## Part 4 — Core smoke check (make sure nothing regressed)

Quick "does it still work" pass — 30 seconds each:

- **4.1 Tenders:** Signals → **Tenders** pill → search a term → results appear; open one → detail drawer with the "As published" fields.
- **4.2 Signals radar:** Signals → **All types** → the rotating radar shows yellow tender blips; the section labels (TENDERS, HIRING, …) are readable.
- **4.3 Companies:** Companies → search a name → results; open one → all tabs (Company / People / Intel / Sources / Legal) load with no blank screen.
- **4.4 CRM:** CRM → Records shows your revealed companies; the Lists sub‑tab (from 1.2) is there.
- **4.5 Market Pulse:** Market Feed → the **Qatar Market Pulse** panel shows trade / real‑estate / licence numbers.
- **4.6 Map & Real Estate:** Map → building/parcel layers toggle on; Real Estate section → transactions + stats load.
- **4.7 Economics (admin):** Economics → revenue / cost / margin KPIs render.

---

## Part 5 — What to do with what you find

- **Anything wrong or confusing:** send me the **item number** (e.g. "1.4 — the buyer list was empty") + what you saw. I'll diagnose, fix, and redeploy both environments.
- **When a section passes:** that part is *certified*. Once the whole guide passes, the database is certified end‑to‑end — which is your gate for eventually turning on automated outreach.
- **No rush:** do it in whatever order suits you; the app stays live throughout.

---

### Quick reference — the `.command` files you'll double‑click
- **`Open Bell.qa Portal.command`** — start/restart the local Portal (do this first).
- **`Run Qatar Knowledge Scan.command`** — learn Qatar sources (run 3–4× for the full law archive), or **`Complete Al Meezan Laws.command`** to auto‑finish the laws.
- (Everything else in this guide is clicks inside the Portal — no other commands needed.)

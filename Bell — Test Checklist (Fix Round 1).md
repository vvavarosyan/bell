# Bell — what to test (Fix Round 1)

Written by Claude with Val, 2026‑07‑12. Everything below is BUILT, tested where a
test was possible, and DEPLOYED to both staging and production. This is your
walk‑through: for each item, do the action and check you see the "✅ expect".

**Where to test:** the live site **app.bell.qa** (production) unless a line says
otherwise. A few things are only visible on the local Portal (`127.0.0.1:3939`).

**Bella items need Anthropic credit.** You ran out mid‑test 2026‑07‑12. Add credit
at **console.anthropic.com → Plans & Billing**, then do the "Bella" section. If
credit is still out, Bella now shows a plain message telling you exactly that
(no more raw "HTTP 400" wall of text) — that itself is item 14.

---

## A. Tenders (no credit needed)

**1. Kahramaa statuses are now correct.**
Go to **Signals → Tenders**, filter **Source → Kahramaa**.
✅ Expect: the old tenders now say **Closed**, not Open. Only a handful (~13) that
genuinely close in the future still say Open. (Before: all 1,765 wrongly said Open.)

**2. Kahramaa tenders now have full detail.**
Open any Kahramaa tender's drawer (click a row).
✅ Expect: a real **Description**, a **Closing date**, and an **"As published"**
block with ~15 fields — Department, Purchase dates, Fees, Bid Bond, Bid Bond
Validity, Offer Validity, Notes, etc. (Before: the drawer was nearly empty.)

**3. Tender search finds anything.**
In **Signals → Tenders**, type **`5797/2025`** in the search box.
✅ Expect: the tender appears (before: nothing). Search now spans every status
(it no longer stays stuck on "Open") and matches any published detail — the
buyer's own reference, the Monaqasat/Kahramaa cross‑number, department,
description, winner, etc.

---

## B. Signals radar (no credit needed)

**4. Blips are not clickable.**
Go to **Signals**, watch the rotating radar. Try clicking a dot.
✅ Expect: nothing happens (they're display‑only now). Open signals from the
list below the radar instead.

**5. Blips light up exactly as the sweep line crosses them.**
Watch the rotating line pass over the dots.
✅ Expect: a dot flashes the instant the line touches it — no ~1‑second delay
anymore.

---

## C. Market Feed (no credit needed)

**6. Content and sidebar scroll separately.**
Go to **Market Feed**. Scroll the main article list; then scroll the right
sidebar (Data Statistics / Qatar Market Pulse / Trending).
✅ Expect: each scrolls on its own. You no longer have to scroll the whole feed
to the bottom to see the bottom of the sidebar.

---

## D. Bella — email branding (needs credit + a company with an email)

**7. Set up your email header, footer, signature.**
Go to **Settings → Email**. There are now **Email header (HTML)**, **Email
signature**, and **Email footer (HTML)** boxes, with a **live Preview** of how a
sent email will look.
✅ Expect: type into any of them → the preview updates. Save.

**8. Bella can create the branding for you.**
Ask Bella: *"Make me a professional email header and footer for my company."*
✅ Expect: she writes HTML branding and saves it (an Approve card first, since
it's a settings change), then points you to Settings → Email to review.

**9. Bella uses your branding and personalizes from company data.**
Reveal a company that has an email, then ask Bella to *"draft an outreach email
to them."*
✅ Expect: she first checks your email setup (and suggests finishing it if it's
empty), pulls that company's details (industry, description, Google reviews,
partnerships, the tech they run…) and weaves specifics in — not a generic
template. The header/footer/signature wrap it automatically; she should NOT type
her own signature into the body.

**10. If your branding isn't set, she suggests finishing it first.**
With the header/footer empty, ask Bella to send an email.
✅ Expect: she suggests setting up your branding before sending, and offers to
do it.

---

## E. Bella — honesty & conversations (needs credit)

**11. Voice conversations are saved as chat history.**
Click **Talk with Bella**, have a short spoken conversation, then open the
**Chat** panel.
✅ Expect: the spoken turns are there as chat messages, in the same conversation.

**12. A new visit opens a new chat.**
Close Bella, come back later (or a new browser session) and open Chat.
✅ Expect: a fresh, blank conversation — not the old one reopened. Your past
conversations are still in **History**. Within the same session, your current
conversation stays put.

**13. Bella tells the truth about filling fields.**
This is the one you caught. Ask: *"Set my position to Founder."*
✅ Expect: she does NOT claim it's done when it isn't. Because the field is
called **"Job title"**, she should either fill Job title and say so, or ask if
that's what you meant — never a false "done."

**14. Friendly message when Anthropic credit is out.**
(Only visible if credit is actually empty.)
✅ Expect: a plain sentence telling you Bella's Anthropic account is out of
credit and where to top it up — not a raw HTTP error.

---

## F. Proof of Search — a question for you

You asked whether Proof of Search can be on production too. Answer: right now it
is **local‑only by design** — it records what your **local engines** actually did
when enriching, and production runs no engines, so there's nothing for it to
record there. It is NOT currently on app.bell.qa.

We *can* mirror it up and show customers "Bell searched these sources and here's
what it found / didn't" as a trust signal — but that changes what customers see,
so tell me if you want it and I'll build it. **Decision needed from you.**

---

## G. Still on the list from before (untested Phase 2–3 work)

These were built earlier and you hadn't tested them yet. Worth a look:

- **Bella plans**: ask for a multi‑step job ("add the top 3 in‑market companies
  to my CRM and draft emails") → expect ONE approval card for the whole plan.
- **Bella voice**: interrupt her mid‑sentence by talking → she stops immediately.
  Arabic reply → she speaks Arabic.
- **QatarEnergy tender detail**: open QE tender **LT26102700** → expect full
  scope/description (this was a specific gap you reported).
- **QSE Disclosures**: Signals → filter **Disclosures** → expect board/company
  regulatory announcements.
- **Qatar Market Pulse**: Market Feed → right sidebar → expect trade, real‑estate,
  and licence stats.
- **Merged cross‑posted tenders**: a tender on both Monaqasat and Kahramaa shows
  as ONE row with a "Published on both portals" note in its drawer.

---

*If anything here doesn't match the "✅ expect", tell me the item number and what
you saw, and I'll fix it in the next round.*

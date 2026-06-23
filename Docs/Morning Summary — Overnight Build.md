# Morning Summary — Overnight Build

_Built and verified locally overnight. **Nothing is deployed** (per our batched-deploy workflow). Deploy the whole batch once, run the sync, then test the list below._

---

## What I fixed/built this run

1. **Fixed the People-section crash.** Clicking a person made the screen go dark. Cause: a sub-component (`ProfileTab`) was missing a prop and threw a runtime error. Fixed and verified — People now opens on local **and** app.bell.qa.

2. **Permanent stale-cache fix.** The recurring "blank page after a deploy" was the local portal serving old JavaScript with no cache validation. Added `no-cache` headers for JS/HTML files. This should end the blank-page-after-update problem for good.

3. **Company & ICP profile (new).** Settings → **"Company & ICP"**. Each tenant describes their business (what they do, products, pricing, customers) and exactly who they sell to (target industries, sizes, geographies, decision-maker titles, keywords). Stored per-tenant (migration 050). This is the foundation that will personalize **Signals** and guide **Bella**. Bella will be able to fill it in automatically later.

4. **Market Feed polish.** Renamed the right sidebar **"Bell Data Intelligence" → "Data Statistics."** The live dot is now **green and blinking at all times** (and pulses faster while actively scanning) — per your note.

## Also riding in this same undeployed batch (built earlier)

The **outreach loop**: per-tenant Bell sending identity (self-heals onto verified `bell.qa`), sending un-gated for customers, daily send limits, bulk personalized send, open/reply metrics, and CC + reveal-decision-makers in the compose flow. If you already deployed any of this, re-deploying is a harmless no-op.

---

## Deploy steps (one batch)

1. **Push** — run **Push Changes.command**. Commit message:
   `Phase 1 outreach + ICP profile; fix People drawer, cache headers, Market Feed dot`
2. **Deploy both** staging **and** production (parity rule — never staging only).
3. **Run the sync** once after deploy (local → Railway).
   - Migrations 048/049/050 auto-apply on boot — no manual database step.

## What to test (after deploy + sync)

1. **People** — local portal → People → click any person → drawer opens, no dark screen. Repeat on app.bell.qa.
2. **Settings → Company & ICP** — fill a few fields → Save → reload → values persist (test on app.bell.qa as a customer).
3. **Settings overall** — confirm it no longer goes dark (the earlier hooks bug).
4. **Market Feed** — sidebar reads "Data Statistics"; the live dot is green and blinking.
5. **(Optional) Outreach** — Settings → Sending domain shows your `bell.qa` identity as verified; send a CRM email; on a company record you see CC suggestions + "reveal decision-makers."

---

## Deferred / open (not blocking)

- **News body text** — the Market Feed UI already renders article summary + body, but news *ingestion* currently stores only titles. Populating bodies is a data-pipeline task (and you flagged a copyright concern on full article text). Left for Phase 2.
- **Signals engine** — ICP is now stored; the Signals page itself is the next build.
- **mail.bell.qa** subdomain — when you move to paid Resend.
- **21,962 no-signal companies** — need a MOCI activity re-scrape (proxy-gated) to lift industry coverage further.

## One question (not blocking)

For the ICP form, do you want **Bella to auto-fill it from a company name/website** as the primary path (with manual edit as fallback)? That decides how I build the Bella hook next.

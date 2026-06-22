# Bell Data Intelligence — Phased Build Plan & Current-State Assessment

*Drafted 2026-06-20 · turns the full A-to-Z vision (Market Feed → Bella, captured across our planning sessions) into an ordered build. Phases are sequenced by dependency: **trust the data first**, then the **outreach loop**, then **intelligence**, then **team & billing hardening**, then **Bella**, then the **map/property moonshots**. This is a working draft for us to adjust together.*

---

## 1. Where Bell is today — an honest read

Status key: ✅ Built · 🟡 Partial · ⬜ Not started

**Data & ingestion** — the strongest layer.
- ✅ Qatar sources (QFZ, QFC, MOCI, QCCI, MoPH, Tasmu), local engines (Website Harvester, Network Mapper, Manual Lookup), dedup, multi-industry model, data-quality engine + cleanup, mirror-sync to production.
- 🟡 **Industry completeness** — filtering an industry does not yet guarantee *every* matching company (coverage backfill pending). This blocks Flow #1's very first step.
- 🟡 24/7 continuous-gathering reliability + a health/monitoring view.
- ⬜ Local-scraper migration (still on Apify/Firecrawl; gated on residential proxies); SimilarWeb; email/phone validation + permutation engine.

**Portal core** — ✅ companies/people/jobs browse + drawers, advanced filter panel, stats page, reveal column, auth (Clerk + custom pages). 🟡 source-agnostic drawer reorg. ⬜ deep-data utilization.

**Reveal & credits** — 🟡 credit plan designed. ⬜ per-tenant reveal table + shared reveal state across surfaces + credit accounting wired to actions. *(This is the spine of every flow.)*

**CRM** — 🟡 notes/tasks/deals + edit/delete. ⬜ professional rebuild, email, sequences, metrics, decision-maker suggestions.

**Email / outreach** — ⬜ own-domain (Resend), templates, individual + bulk personalized send, sequences, daily limits, open/reply tracking.

**Market Feed** — ✅ news (11 sources) + research feed + distinct research cards. 🟡 news content (summary + body), "Data Statistics" rename, live green dot.

**Research** — ✅ company research + approval routing + exclusivity→feed (window currently 0). 🟡 needs verification. ⬜ person/sector + new types + neutral "Other"; Firecrawl Spark engine is broken (paused).

**Signals** — ⬜ not started.

**Map** — ✅ Mapbox, select-area, layers. 🟡 UX overlay. ⬜ reveal-to-CRM, partnership network viz, property/flight layers.

**Team** — 🟡 Clerk-Orgs foundation (dormant). ⬜ full build, and it depends on authz.

**Billing** — 🟡 Stripe + plan. ⬜ up/downgrade, extra credits, real invoices/receipts, live status + 24h-or-freeze.

**Settings** — 🟡 profile/email/notifications/account/security. ⬜ ICP builder, Bella controls, team settings.

**Notifications** — ✅ in-app center + triggers + branded email template (🟡 not yet deployed; delivery + preferences pending).

**Security / authz** — ⬜ **server-side enforcement gap** — most API routes rely on UI hiding. Load-bearing for Team, Bella, and the billing freeze.

**Bella** — ⬜ none of the three instances exist yet.

**Honest headline:** the **data + ingestion foundation is largely built and genuinely strong** (~70–80% of that layer). The **user-facing product that turns data into outcomes** — outreach, signals, billing depth, team, and Bella — is **mostly still ahead of us** (~20–30%). In plain terms: Bell is a strong Qatar database today, not yet the self-driving go-to-market platform of the vision. **That gap is the build**, and the phases below close it in the safest order.

---

## 2. The build sequence

### Phase 0 — Trust the data *(foundation; start here)*
**Goal:** data is complete, correct, always-fresh, and the app is secure enough to build on.
- **Industry completeness** — filtering any industry returns **every** matching company, no exceptions ("all healthcare", "all beauty salons"). Includes a coverage check that counts companies per industry so nothing is silently missed.
- **Local engines 24/7** — run nonstop with a health/monitoring view + auto-recovery; data flows to the local DB continuously.
- **Reveal economy core** — per-tenant reveal table; reveal = one shared state across Companies/People/Map; credit accounting (1/reveal, bulk, charge only unrevealed).
- **Security/authz hardening** — enforce role/permission/subscription **server-side** on every route.

*Why first: every flow begins with "filter → reveal → CRM" over trustworthy data, and nothing agentic is safe without authz.*

### Phase 1 — The outreach loop *(Flow #1, end-to-end)*
**Goal:** a user can go ICP → filter → reveal → CRM → personalized outreach at scale.
- **ICP in Settings** (manual) to drive filtering.
- **Reveal → auto-CRM** + bottom-right toast; **"reveal decision-makers"** people suggestions.
- **CRM rebuild** — dense, professional rows in the Bell vibe with inline action buttons.
- **Email** — own-domain via Resend (Settings), templates, **individual + bulk personalized** (`{{tokens}}`) send.
- **Sequences** — enroll individually + in bulk; **daily send limits**; replied → auto-remove, not-replied → keep; **open / reply / reply-rate** metrics.

*This is Bell's core value loop — the thing that makes the data pay off.*

### Phase 2 — Intelligence & enrichment depth
- **Signals** — global + ICP-personalized; one-click signal → CRM.
- **Market Feed content** — news summary + body, "Data Statistics" rename, live green dot.
- **Enrichment engines** — SimilarWeb layer; email/phone validation + permutation engine (validated-only into the DB; catch-all handling).
- **Research** — verify company research; activate person/sector + new types + neutral "Other"; 3-day exclusivity; all types enrich the DB.

### Phase 3 — Team & Billing hardening
- **Team** — members + credentials, per-feature permissions, per-member credits + tracking + requests, CRM author/owner delete rules, per-record activity log + reassignment, reveal attribution, performance dashboard.
- **Billing** — up/downgrade, buy extra credits (Stripe + discounts), real invoices/receipts, live status + 24h-or-freeze.

### Phase 4 — Bella *(agentic)*
- **User-portal Bella** — chat first: act-on-behalf over the secured tool layer, approval + credit-preview gates, Settings controls; visibility = the user's reveal state.
- Then **voice** (header-center + edge-glow).
- **Marketing Bella** (sales + site nav, no DB) and **Admin Bella** (logs/errors/ops brain).

### Phase 5 — Map depth & moonshots
- Map UX overlay; reveal-on-map; **partnership network viz**.
- **Flow #2 field-sales** — radius search, ICP suggestions, tech stack + weaknesses + pitch + decision-maker briefing.
- **Qatar building / property / real-estate** (owners, tenants) — with legal review; new Data → Real Estate.
- Flight/traffic layers; **local-scraper migration** off Apify/Firecrawl (after residential proxies land).

---

## 3. Where I recommend we start

**Phase 0, leading with industry completeness.** It's already partly built, it directly unblocks the first thing a user does in your flow ("show me *all* healthcare companies — no exceptions"), and it's the cheapest high-impact win. In the same pass I'll add a **local-engine health/continuous-run check** so we know the data is truly flowing 24/7. Then I'll scope the **reveal economy** and **authz**, which gate Phase 1.

**First concrete task:** audit and finish industry coverage so no company is ever missed by a filter, with a verification that reports coverage per industry.

---

## 4. Open decisions & research threads
- News: our-summary + excerpt + source link vs. full text *(copyright)*.
- Property / owner-tenant data — sourcing + legal/privacy.
- Voice STT/TTS provider + cost (cheap for marketing, capable for portals).
- SimilarWeb API plan / cost / limits.
- Email-validation provider + catch-all handling.
- Pick the **3 new research types** (replacing theme/region/regulation).
- Research engine: wait for Firecrawl Spark vs. swap to local scrape + LLM.

---

## 5. Doctrine we hold throughout
Every datum utilized + the platform self-upgrades on each new data point · data presented **source-agnostic** as Bell data · **100% sure** — never fake or guessed data · reveal = shared per-tenant state · deploy to **both** staging + production every change · all canonical/data ops stay **click-only** (.command files / Portal buttons) · Bella scoped per instance + every action audited.

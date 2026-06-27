# Bell Self-Marketing Engine — Research & Execution Plan

*Bell uses its own database + intelligence to win its own paid users — a self-feeding growth machine. Synthesized from a 7-agent research fleet (deliverability, copy, legal, matchmaking, codebase audit, experiment engine, growth flywheel), 2026-06-27.*

---

## 0. The one insight that makes this work

The most exciting part of your plan — **gifting each target a matched lead** — is also its single biggest legal landmine. Qatar's PDPPL is an **opt-in / consent-first** regime, and handing one company's named decision-maker + contact details to *another* company for marketing, without consent, is a **HIGH/CRITICAL risk** (fines QAR 1M–5M per violation, plus defamation exposure and reputational blowback if the gifted person complains). "It's from a public register" is **not** a defence.

**But the safe redesign is actually a *better* growth mechanic — and it aligns perfectly with what Bell already sells:**

> **Gift the matched COMPANY in the email — name it, describe it (sector, size, location), and attach a FACTUAL public signal** ("Doha Steel Fabrication — a ~50-person SME, recently licensed and hiring"), plus company-level/general contact (website, general phone). **Withhold the named decision-makers** (the personal data PDPPL protects most) **and the *other* similar matched companies — those unlock only AFTER the recipient signs up**, through Bell's existing **reveal → credit → auto-CRM** pipeline. *(Val's refinement, 2026-06-27 — stronger than a fully anonymized teaser: naming the real company is a better hook, while the legally-sensitive part — named individuals' personal contacts — never appears in a cold email; it's disclosed only in-product to a registered user.)*

**Safeguard:** keep the signal **factual/public** ("recently licensed," "hiring," "new branch") — never imply intent ("they're shopping for your competitor"), which risks commercial-harm/defamation.

This is the linchpin. Naming the company is a strong hook + reciprocity; **the payoff (the decision-makers + more leads) lives inside the product** — so the conversion event *is* the signup/reveal. Compliance and growth become the same motion. Everything below is built around this.

---

## 1. What we're really building

A loop that compounds every cycle:

**① Target** (Bell's DB picks a Qatar company) → **② Gift** (value-first email with an anonymized matched lead) → **③ Reply** (verifies the email + reveals intent → enriches Bell's shared DB) → **④ Trial** ("claim your lead" → onboarding) → **⑤ Activate** (reveal the lead + the user runs their *own* outreach → more replies → more verified data, at user-funded scale) → **⑥ Convert → Proof** (paid user → "Bell found Company X a client" case study → social proof lifts ② ).

Bell's two scarcest assets — **verified contactability** and **buying intent** — are *byproducts* of running this loop, and they're shared across all tenants. So cost-per-reply falls and match-quality rises every cycle. Data improves outreach; outreach improves data.

---

## 2. Reality check — we're ~70% there already

The codebase audit was decisive: **this is not greenfield.** Bell already has, per-tenant and clean:

| Capability | Status | Where |
|---|---|---|
| Personalized + bulk send (merge tokens, daily caps) | ✅ | `routes/crm.js`, `lib/email.js`, `lib/sendlimits.js` |
| Drip **sequences** (auto-stop on reply/won/lost, scheduler) | ✅ | `crm/sequences.js` |
| **Inbound reply** threading + auto-stop | ✅ (dormant until inbound domain set) | `crm/inbound.js`, `routes/crm_inbound.js` |
| **Bounce/complaint → global suppression** + email freshness | ✅ | `lib/suppression.js`, migration 061 |
| Email **verification** (Reoon + MX/SMTP) | ✅ | `enrichment/local/emailverify.js` |
| Sending **identity / domain connect** (Resend) | ✅ (one domain/tenant) | `lib/email_domains.js`, migration 048 |
| **Reveal + credits** (idempotent, auto-CRM) | ✅ | `lib/credits.js`, `tenant_reveals` |
| **Network Mapper** (relationships) | ✅ | migration 040 |
| Clean multi-tenancy — **Bell = internal tenant id=1, uncapped** | ✅ | `lib/auth.js` |

**The 5 real gaps** (ranked by leverage):
1. **ICP → target-list actuation** — nothing turns an ICP into a deduped target list (matching companies + verified decision-maker email, minus suppressed/already-contacted). *This is the fuel; highest priority.*
2. **Multi-domain rotation + per-domain health** — identity is one-default-per-tenant; cold scale needs N rotating cold domains with per-domain caps + circuit-breaker.
3. **Send-rate governor** — throttle/jitter, warm-up ramp, business-hours windows. (Critical: tenant id=1 is *uncapped* today — nothing stops an unsafe blast.)
4. **List-Unsubscribe (one-click) + pre-send verification** — compliance + deliverability wrapper around the existing hygiene primitives.
5. **Campaign analytics + reply classification** — per-sequence/step/domain funnel + auto-tag replies (interested / unsubscribe / OOO).

A dedicated **buyer-intent/signals table does not exist** — but we can derive signals on the fly from data we already have (see §4).

---

## 3. The hard external constraint — cold email ≠ transactional email

**Resend (and SendGrid, Postmark, Mailgun, SES) prohibit cold outreach in their ToS and will ban the account — including Bell's transactional mail.** Cold outreach must run on **completely separate infrastructure**:

- **5–10 dedicated cold domains** (e.g. `trybell.qa`, `getbell.qa`) — **never bell.qa**. Full SPF/DKIM/DMARC (`p=none`→`quarantine`→`reject`) + custom return-path + tracking subdomain per domain; redirect each root → bell.qa.
- **Recommended stack:** Google Workspace mailboxes (~$7/inbox/mo) + a cold-email engine (**Smartlead / Instantly**, ~$40–95/mo). ~**$440–470/mo for 1,000/day**. (Mailreef ~$249/mo flat is a Phase-2 upgrade.)
- **Cap 35–40 emails/inbox/day.** Math: **500/day ≈ 15 inboxes / 5–6 domains; 1,000/day ≈ 30 inboxes / 10 domains** (+20–30% buffer).
- **6–8 week warm-up ramp** (per inbox): wk1 warmup-only → wk2 add 5 cold → … → wk8 35–40 cold.
- Keep complaints **< 0.1%**, bounces **< 2%**; monitor Google Postmaster per domain. **Gmail (Nov 2025) now rejects non-compliant bulk mail at SMTP level** — auth + ramp are pass/fail now, not nice-to-have.
- **Qatar:** send **Sun–Wed AST, ~9–11am / 1–2pm**, Ramadan-aware, English default with an Arabic touch.

**My recommendation:** don't build a cold sender from scratch. **Bell's engine owns targeting + matchmaking + content + the optimization brain; it drives Smartlead/Instantly (via API) for the actual cold sends.** bell.qa transactional (Resend) stays untouched. This is faster, safer, and ToS-compliant.

---

## 4. The matchmaking engine (the fuel) — works on TODAY's data

For a target recipient, find the best "perfect customer for *them*" from Bell's DB:

1. **Infer their ICP via a curated Qatar sector-adjacency map** (`seller → their customer profile`). Examples:
   - Legal services → newly-registered companies (need setup)
   - Construction/contracting → real-estate developers, government, hospitality
   - IT/Telecom → companies hiring or with a thin web presence (digitizing)
   - Manpower/recruitment → any company with open jobs (active hiring)
   - Insurance/Banking → expanding firms, new fleets/branches
2. **FitScore** (0–100) over existing columns: `35×industry-adjacency + 25×signal-strength + 15×size/location + 15×bell_score(completeness) + 10×freshness − penalties` (drop inactive/suspended/self/already-a-known-client/low-score/suppressed).
3. **Signals derived on the fly** (no signals table needed for v1): `incorporation_date`/`created_at` (newly licensed = strongest + free), open `jobs` (hiring), new `company_relationships` edges (expansion), recent `company_financials` (funding). Add a thin `company_signals` materialized table in v2.
4. **Pick the contact:** highest-seniority *current* person with a **verified** email (Stage 10 / migration 061), prefer owner/founder for SMEs.
5. **Privacy gate:** the email shows only the **anonymized teaser** (sector + size band + city + signal + "1 verified contact attached"). Real record unlocks post-signup via reveal→credit→CRM.

v1 ships on data Bell already has — no new scraping required.

---

## 5. The email system (value-first, reply-optimized)

- **Anatomy:** 75–125 words, one CTA, real specifics, no fluff. Subject 3–6 words, curiosity > pitch, **avoid "free"** (spam trigger). Plain-text feel; light HTML only in the signature.
- **Sequence:** main value-gift email → FU#1 (day 3, second proof point) → FU#2 (day 7, gentle "should I give this lead to someone else?" — real scarcity, signals decay) → breakup (day 12, value-forward). 55% of replies come from follow-ups.
- **Signature:** table-layout HTML, one logo image, name/title/Bell, one-line value prop ("100% Qatar coverage · live signals · automated outreach"), booking link; compliance footer with **physical Doha address + one-click unsubscribe**.
- Full template library, subject-line bank (12+), and signature spec are captured in the research and ready to drop into Bell's merge-token engine. The gift block injects `{{anonymized_lead_descriptor}}` + `{{buying_signal}}` at send time; identity stays behind the reveal gate.

---

## 6. The self-improving brain

- **Method:** batched **Thompson-sampling bandit** on **positive-reply** (not opens — Apple MPP made opens meaningless; use them only as a deliverability tripwire). Bandit beats A/B/n here because at ~3% reply rates a 4-way A/B needs ~9,000 sends before it learns anything; the bandit maximizes cumulative reply yield instead.
- **Update daily** on a rolling 7-day reply window; **10% exploration floor**; **hard reputation guardrails** (bounce >3% / complaint >0.1% → auto-suspend that arm regardless of replies).
- **Per-segment** (industry × size × signal) — start global, auto-split a segment into its own bandit once it has volume.
- **Nightly loop:** score → reallocate → retire dominated arms → **breed new variants** from the winners' DNA (LLM-templated) → **feed positive-reply back into matchmaking** so targeting tunes itself.
- **Data model:** `experiments / variants(α,β posterior, lineage) / assignments(segment) / events(sent…paid)` — events is the source of truth, posteriors are rollups; all `tenant_id`-scoped.

---

## 7. Growth math (why this is worth it)

| Scenario | Sends/day | Positive-reply | Trial→paid | New paid/mo | M3 | M6 | **M12** |
|---|---|---|---|---|---|---|---|
| Conservative | 150 | 6% | 14% | ~10 | ~28 | ~52 | **~95** |
| Aggressive | 400 | 10% | 25% | ~108 | ~300 | ~560 | **~1,030** |

(83% delivery, 30% reply→trial, ~5%/mo churn assumed.) **Highest-leverage lever is trial→paid (activation)** — and you *just shipped the onboarding checklist* that drives it. Second is positive-reply (the value-gift + tight ICP). Scale sends only as deliverability holds.

Even the conservative path — ~95 paid Qatar accounts in year one, self-generated, near-zero CAC — is a strong, defensible business. The aggressive path is the "unstoppable" scenario.

---

## 8. Other snowball mechanisms (fund the cheap, high-impact ones first)

| Snowball | Loop | Priority |
|---|---|---|
| **Every reply → intent dataset** | replies tag intent → powers a Signals product + sharper targeting | **Now** (nearly free) |
| **Reveals → shared enriched DB** | each reveal verifies/enriches the canonical record for all tenants | **Now** (already doctrine) |
| **Bounce/verification → contactability moat** | suppression + verified flags → highest-deliverability DB in Qatar | **Now** |
| **Market Feed → SEO/inbound** | research + public profiles → indexed pages → organic signups | **Soon** (only durable non-outreach channel) |
| **Public company profiles → "claim your profile"** | indexed profiles → owner signups | Soon |
| **Outreach activity → "State of Qatar B2B" report** | anonymized benchmarks → PR + backlinks | Soon |
| Referral-for-credits | credits are Bell's native low-cost currency; B2B referrals convert 15–25% | Soon |

---

## 9. Phased build plan

**Phase 0 — Legal foundation + safe-gift design (BLOCKING).**
Qatar PDPPL/NCSA lawyer review · lock the anonymized-teaser → reveal-after-signup model · build one-click **List-Unsubscribe** + global do-not-contact (extend `email_suppressions`) + sender-ID footer + privacy policy. *Compliance == the conversion mechanic.*

**Phase 1 — Matchmaking + targeting (the fuel).**
Curated sector-adjacency map · `FitScore` service + derived signals · **ICP→target-list actuation** (gap #1) · Bell runs as tenant id=1 · output = per-target anonymized teaser + lead held behind reveal.

**Phase 2 — Sending infra + deliverability (the pipes).**
Buy 5–10 cold domains + DNS · Google Workspace + Smartlead/Instantly · **multi-domain rotation + per-domain health** (gap #2) · **send-rate governor / warm-up / windows** (gap #3) · pre-send Reoon verify (gap #4) · 6–8 wk ramp.

**Phase 3 — Measurement + self-improvement (the brain).**
Campaign analytics + reply classification (gap #5) · Thompson bandit + experiment data model · feedback loop into matchmaking.

**Phase 4 — Funnel + flywheel + scale.**
"Claim your free lead" landing + magic-link → pre-built workspace → onboarding checklist (shipped) · opt-in trial (+A/B card-on-file for high-intent) · referral-for-credits · case-study automation · Market Feed SEO · scale sends as deliverability proves out.

---

## 10. Decisions I need from you (morning)

1. **Legal first?** Strongly recommend yes — engage a Qatar PDPPL lawyer before any send. The teaser redesign de-risks it massively but a local review is non-negotiable before launch. *(Want me to draft the brief for the lawyer + the privacy policy?)*
2. **Cold-send execution:** delegate to **Smartlead/Instantly + Workspace** (my rec — fast, compliant), or build Bell's own sender on SES + domains (more control, more risk/time)?
3. **Where to start building:** I recommend **Phase 1 (matchmaking + ICP→target-list)** in parallel with Phase 0 legal — it's pure backend on data we have, fully testable, and it's the fuel everything else needs. *(I can start it immediately.)*
4. **Scale ambition:** begin conservative (150/day, ~95 users/yr) and ramp, or push aggressive infra from the start?

Tell me 1–4 and I'll turn the chosen phase into a concrete, tested build batch.

---

## 11. Decisions made + corrected sequencing (Val, 2026-06-27)

- **Gift model:** name the company + factual public signal, **withhold named decision-makers + similar companies → unlock after signup** (see §0). ✅ locked.
- **Lawyer:** Val sources the lawyer; brief drafted ("Bell — Legal Brief for Counsel"). ✅
- **Sending infra:** Smartlead/Instantly + **separate cheap cold domains** (NOT subdomains of bell.qa — subdomains bleed reputation to the root domain, which Gmail/MS judge at org level, and root-level blacklists/DMARC can drag bell.qa transactional mail down. Domains ≈ $1/mo each; inboxes are the real cost, identical either way). ✅
- **Scale:** start **conservative (150/day), ramp once proven.** ✅
- **🔑 CORRECTED ORDER:** the **production-readiness audit + Stripe sandbox→live is the FINAL gate before launch — NOT next.** First finish the platform (below), then audit + go-live, then outreach.

## 12. Platform must be 100% complete BEFORE outreach (Val's gate)

Outreach is the *last* thing. Before it, finish: **maximize data** (gathering + enrichment for Companies / People / Jobs — see §13), **Signals**, **Team** section, **Settings**, **Bella AI** integration, and the new requirements below — then the readiness audit + Stripe-live.

**New platform requirements added (Val, 2026-06-27):**
1. **Business calendar** with two-way sync to Google / Apple / Outlook calendars.
2. **User-imported targets** — users add their own email lists + companies they want to reach out to.
3. **User-contributed enrichment (⭐ snowball)** — users add new datapoints in their CRM; Bell collects/enriches its OWN shared database from that in the background. *(Needs a consent clause in the user terms — flag for the lawyer.)*
4. **CRM integrations** — connect external CRMs (HubSpot / Salesforce / Zoho / Pipedrive) to Bell (two-way sync).
5. **Data export with limits** — users export their data, capped by plan.

## 13. Data-coverage status + the two pushes that gate everything (2026-06-27)

Engines 1–5 are healthy and **fully caught up** (all 76,633 companies processed, idle until new data). But coverage must grow before the platform is "ready" or outreach can work:

- **Websites: 16,295 / 76,633 (21%).** ~60k are registry-only (still valuable for filtering + the company-level gift). **Push: add Apify Google Maps** as a website source — many Qatar SMEs are on Maps with a site the registries don't list → more harvest → more emails.
- **Decision-maker emails: only 363** — the critical gap, because outreach needs them. **1,103 were rejected as "smtp-disabled"** (Mac can't SMTP-verify). **Push: re-run Engine 4 (Email Finder) now that Reoon is wired** (top up Reoon first) → recover those + find many more. This is the single highest-value data action for the whole self-marketing plan.

**Net:** data isn't "done." The two pushes above (decision-maker emails via Reoon re-run; websites via Apify Maps) feed filtering, the gift mechanic, and outreach itself — do them as part of finishing the platform.

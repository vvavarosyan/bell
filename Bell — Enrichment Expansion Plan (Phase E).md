# Bell — Enrichment Expansion Plan (Phase E)
*Prepared 2026-07-02 · from a full code-level audit of every engine + the current coverage picture. Nothing below is built yet — this is the plan to approve.*

## 1. Where we stand

The enrichment machine is **11 stages** — 6 external-powered (S1 LinkedIn discovery via Firecrawl, S2 LinkedIn company / S3 employees / S5 Google Maps via Apify, S6 website contacts via Firecrawl) and 5 **local $0 engines** (S7 website harvester, S8 website finder, S9 network mapper, S10 email finder with verification, S11 local facts). The 24/7 continuous sweep is resumable, cost-gated, and idempotent. The audit's verdict: *"remarkably clean, well-documented, instrumented — ready for expansion."*

**The two gaps that matter most** (they gate findability, signals, dossiers, and the future self-marketing engine):

| Gap | Today | Why it matters |
|---|---|---|
| **Websites** | ~21% of companies | No website → no harvest → no contacts, no facts, no logo |
| **Verified decision-maker emails** | ~363 total | The single bottleneck for outreach + the 0 Risk dossier promise |

Secondary gaps: financials depth, jobs coverage (only Qatar Airways today — S4 was never enabled), and no per-field coverage dashboard (we can't SEE our gaps at a glance).

## 2. The expansion — three tiers

### Tier 1 — FREE & LOCAL (build immediately on approval)
1. **Coverage dashboard** — per-field % (website, phone, company email, person email, LinkedIn, geo, industry, logo) on the Local Engines tab. *You can't push what you can't measure.* (small)
2. **Email pattern-learning upgrade (S10)** — learn a company's email pattern from ANY known person email (today it only learns from company emails), then generate + verify candidates for every known decision-maker. This is the highest-leverage free push on the 363-email problem. (small)
3. **Maps-data squeeze (S5 residue)** — extract employee-count proxies and extra fields from Google Maps data we ALREADY paid for. (small)
4. **S1 self-heal completeness fix** — when a wrong LinkedIn URL is replaced, also wipe the S6 contacts harvested from the wrong site (audit finding — prevents stale wrong data). (small)
5. **Crawler pooling** — reuse headless browser sessions in the local engines (~2× sweep speed, same $0). (small)
6. **Email-verification audit trail** — failed verifications currently vanish silently; log them so re-runs skip known-bads and we can count what's left. (small)

### Tier 2 — PAID, ONE-TIME OR METERED (your approval per item)
7. **Apify Maps website rescan** — re-run S5 with the fixed maps-trust logic over the ~60k website-less companies. Estimate **$250–450 one-time** (Apify Places pricing). Expected: the single biggest website-coverage jump available. |
8. **Enable S4 — Jobs** — the stage exists as a skeleton; pick the Apify LinkedIn-jobs actor and run over active companies (~$0.02–0.05/company, scoped batches). Directly feeds the Jobs section + hiring signals + freshness. |
9. **Reoon top-up** — your click in the Reoon console; unblocks the email-finder rescan (pairs with #2 for maximum effect). ~$0.001/verification. |

### Tier 3 — RESIDENTIAL PROXIES (your purchase unlocks a new class)
10. **Local web-search engine** — replaces paid search APIs for the website finder's search fallback; today the finder's search path is its throughput constraint. With rotating residential IPs it runs free and unthrottled. (medium build)
11. **Heavier local scraping** — directory/aggregator sweeps and richer harvesting that datacenter IPs get blocked on. (medium, ongoing)
- Typical cost: **$50–150/month** for a rotating residential plan (Val buys; provider recommendation at purchase time).

## 3. Recommended order

**Now:** Tier 1 (all six — pure code, zero spend) → deploy → the dashboard then SHOWS the before/after of every later push.
**Next (your approvals):** Reoon top-up + S10 rescan (emails) → Apify Maps rescan (websites) → S4 jobs enablement.
**Then:** proxies purchase → local search engine → the finder's throughput ceiling disappears.

## 4. Decisions needed from Val

| # | Decision | Cost | My recommendation |
|---|---|---|---|
| D1 | Build Tier 1 now | $0 | ✅ Yes — immediately |
| D2 | Apify Maps website rescan | ~$250–450 once | ✅ Yes, after Tier 1 dashboard exists |
| D3 | Enable S4 Jobs (pick actor + scope) | ~$0.02–0.05/co, batched | ✅ Yes, scoped to active/trading companies first |
| D4 | Reoon top-up | Your console | ✅ Yes — pairs with the free S10 upgrade |
| D5 | Residential proxies | ~$50–150/mo | ✅ Worth it — unlocks the free search engine; timing yours |

*Everything stays within the doctrine: only 100%-verified data enters records; every datapoint keeps provenance; canonical writes stay on the local engine; prod remains a mirror.*

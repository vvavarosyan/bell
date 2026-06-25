# Bell Data Intelligence — Robustness Research & Plan
*Compiled 2026-06-25 from 4 parallel research streams. Prices/free-tiers are current-ish — re-verify before committing budget.*

## The big picture
Bell already has the hard parts most platforms never build: per-value **provenance** (source + source URL + confidence), a **Sources & Activity** view, a **reject log**, strong **dedup/entity-resolution** (BIN/PIN/JIN = the Dun & Bradstreet DUNS pattern), and a 24/7 engine. The gaps are: (1) we **overpay** to find websites, (2) **email verification is blocked** (SMTP), (3) there are **more sources** to pull, and (4) we don't yet score **confidence/freshness** or recycle our own bounce data. This plan fixes all four — most of it cheap or free.

---

## 1) Website coverage — cut cost ~10× and raise yield ~10×
Today: Firecrawl search finds a site but only **~5% auto-save**, so the real cost is **~$0.04 per website actually found**, and we pay even on companies that have no site. Fix it in three moves:

- **Free pre-filter funnel first (rejects the misses at $0).** Domain-guess (Qatar TLD order `.com.qa → .qa → .com → .net.qa`, strip legal suffixes, Arabic→Latin) → validate by DNS A/MX/HTTP → confirm via **crt.sh** (certificate transparency) and **Common Crawl**. Most "no findable site" companies get rejected for free instead of burning credits.
- **Free map dumps before paying anyone.** **Foursquare Open Places** (Apache-2.0, monthly download, has a `website` field) + **OpenStreetMap Overpass** — filter to Qatar, read locally. $0.
- **When we do pay, pull the website from a Google Maps listing — not a web search.** **Apify Google Maps scraper** returns the `website` field with a built-in "has website" filter → **~$0.003–0.008 per website found, ~50–70% hit** (vs ~$0.04 at 5%). That's the single biggest ROI fix. (We already use Apify, so no new vendor.)
- **Extract once, free forever.** Use **Crawl4AI's `generate_schema`** to build a CSS/XPath extractor per site-template with one LLM call, cache it, then extract every page free — replaces the **~5-credit Firecrawl LLM extract per company** in Engine 5.
- Keep Firecrawl only as the *escalation* (sites that defeat the local stack), not the default.

## 2) Decision-maker emails — cheap verification + better discovery
Confirmed: your network blocks SMTP (only 1 verified, 328 "smtp-disabled"), and **self-hosting a verifier doesn't help** (port 25 is blocked on Macs *and* clouds; can't verify Gmail/Outlook). A hosted API is the only real fix.

- **Verification → Reoon (recommended).** Free **20/day that renews forever** (≈600/mo at $0), then **~$1.19 per 1,000**, and it **doesn't charge for "unknown"** results. Verifying ~5,000 emails ≈ **$6**. Best fit for "only if it won't cost much." (MillionVerifier is the bulk fallback — no catch-all charges, ~$0.45–1.49/1k; NeverBounce gives 1,000 free one-time.) This **unlocks Engine 4**, which is currently dead from the SMTP block.
- **Discovery (where to get more decision-makers):** company team/leadership pages (free, we already crawl) → **news/press appointments** (free; e.g. Zawya "People in the News" — high yield, low risk) → **LinkedIn via Apify HarvestAPI** (cookieless, $4–12/1k, has a seniority filter) → **QFC/QSE registers** (free, authoritative ~470 named approved persons). Note: MOCI does **not** publish directors, so SME decision-makers must be *derived* — exactly what our crawler is for.

## 3) New Qatar sources (ranked — net-new beyond what we have)
**Quick wins (easy + scrapable now):**
- **CRA ICT Companies Directory** — open **Excel export**, 409 tech companies with **CR#, permit#, email, phone, website, category**. Trivial.
- **Made in Qatar** (Qatar Chamber) — 355 manufacturers with **owner name, phone, website, products**. Plain HTML.
- **QFCRA Public Registers** — ~470 **named approved individuals (decision-makers)** + regulated firms, keyed by QFC#.

**Build next:** Tawteen ICV supplier DB (QatarEnergy ecosystem, CR# + localization score), QDB Tasdeer exporter directory (HS codes), Monaqasat classified contractors (gov grades), QCAA travel/cargo agencies, Kahramaa contractors, QFMA licensees, Qatar CID. *Note: several richest ones (Monaqasat, Tawteen, Ashghal, businessmap) are Qatar-geo-blocked → need a Qatar residential proxy + local Crawl4AI.*

**Shelve (not worth it):** QatarEnergy Mushtaryat (login-only), UPDA/MME (login), MOI inquiry (captcha), Hukoomi (auth-gated), Qatar Credit Bureau (paid/confidential), Zawya/MEED (paywall+ToS), OpenCorporates QA (15/100 quality), generic Yellow Pages (low-trust). **data.gov.qa** = aggregate stats only (no named companies) — useful as a *coverage benchmark*, not a source.

**Superpower:** the best new sources all expose the **CR number**, which dedups cleanly against our MoCI/QFC/QCCI data — low-risk merges.

## 4) Accuracy & freshness — make the data trustworthy + self-improving
This is how ZoomInfo/Apollo/Cognism win. We have the provenance layer; we're missing the confidence + freshness loop. Cheapest, highest-impact first:

1. **Wire the Resend bounce/complaint webhook → the contact** (it already exists but only updates the CRM send row). On hard bounce: mark the email `invalid`, zero its confidence, add to a **suppression list** so we never re-send it. *This turns every campaign into a free, ground-truth verification pass — the #1 ROI change in the whole plan.*
2. **Persist the verifier's full result** (`valid/invalid/catch_all/role/unknown`) instead of discarding it → status chips + filters.
3. **`last_verified_at` per field + a "recrawl oldest first" frontier** in the engine → re-verify everything ~monthly (B2B data decays ~2%/month; titles/phones faster).
4. **"Report wrong / suggest edit" button → corrections queue** (never auto-overwrite; escalate when multiple users agree).
5. **Per-field confidence score + 5-tier badge** ("2 sources agree · SMTP-verified · matches pattern") + a `min_confidence` gate on reveal/export.
6. **Weekly 100–200 record QA sample → a real, publishable accuracy %** + per-source accuracy (tells us which crawler is degrading).

---

## Recommended sequence
1. **Website ROI fix (#1)** — stops the current credit bleed *and* finds more sites cheaper. Highest urgency.
2. **Reoon email verification (#2)** — ~$0–6, unlocks decision-maker emails.
3. **Easy new sources (#3)** — CRA ICT + Made in Qatar + QFCRA (people).
4. **Accuracy loop (#4)** — start with the Resend bounce→suppression wire (tiny, huge).

## What I'll need from you (accounts/keys — all free or cheap to start)
- **Apify** API token (you likely already have one for the LinkedIn/Maps stages) → for Google Maps website lookups.
- **Reoon** free account → API key for email verification.
- A **Qatar residential proxy** later, only for the geo-blocked sources (decide when we get there).

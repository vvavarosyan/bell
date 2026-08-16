# Bell — Operation Data Trust
*The program that takes Bell from 14.6% email coverage and an idle engine room to market-grade data.*
*Written 2026-08-16 from a measured audit: 6 investigation agents + 35 adversarial verifications + first-hand checks. Every number below was measured on the live database or fetched from the live web on 2026-08-15/16; corrections from the adversarial round are already applied.*

---

## 1. The honest state (say this to yourself before any demo)

- **82,910 active companies. 12,115 have an email (14.6%). Zero of the 19,443 stored emails have ever been verified deliverable.**
- The email pipeline IS the website harvester: 70.5% of all stored emails came from reading company websites, and a cleanly-harvested website yields an email ~2 times out of 3. Websites are the throat.
- **About half of Bell's emails and ~73% of its visible descriptions came from GUESSED websites** (the finder's old domain-guessing method planted 14,816 unverified domains; 1,835 companies share 763 hosts — where several companies "share" one guessed domain, most of them are wrong; one web-template's London phone number is stored as the contact for 640+ Qatar companies). This is Val's "enriched based on wrong data", quantified.
- **MOCI and QCCI have added zero new companies for ~3 months** (last new MOCI record 2026-05-21, QCCI 2026-06-09). The two sources covering 63,997 companies are frozen; only QFC/MoPH/OSM/Spark added rows in the last 30 days.
- The ROG is healthy but **work-starved by design**: frontiers all zero, cooldown floors gate re-entry, 29 consecutive hours at ≤43 stamps/hour, and the 30-day engines bunch into one monster day a month. Capacity measured: the fleet can lap everything in 1–3 days.

## 2. The buried treasure (found by the audit)

1. **4,780 website candidates, found for free, never reviewed.** The finder's free search DID run across essentially all 65k no-website companies this month — but by deliberate precision-first design it auto-saves almost nothing; its yield lands in `website_candidates`, where **4,780 sit pending and 0 have ever been approved**. Search-verified sites harvest-complete at 90.6% vs 60.4% for guesses. This queue + a name-on-page auto-approval gate (task #96) is the largest free website→email win available.
2. **A working paid email-verification key already exists** (Reoon, in the Mac keychain, 414 person emails verified with it in past runs). Verifying the entire 16,986-address company stock: **~$17–20 one-time** ($1/1k), ~$6/month for new finds. (Claude earlier quoted $50–150 — wrong; corrected here.)
3. **The award dataset is invisible to customers**: 23,052 award reports carrying 71,369 competitor bids (names, CR numbers, amounts) and 9,030 ICV scores live only in `tenders.raw` — no route, no UI, no Bella tool reads them. This is the moat data, unexploited.
4. **Stage 10 (pattern+verify) is already built and shipped** with exactly the right Rule-2.1 semantics (an SMTP 250 from the domain's own MX is the server stating the mailbox exists; catch-all never stored as verified) — it has processed 49 of 82,910 companies.

## 3. Dead ends, closed honestly (do not re-open)

- **yellowpages.qa**: content is real, but `robots.txt` says `Disallow: /` for all non-search-engine agents. Bell honors robots. Closed.
- **The 2,816 failed-harvest "retry pool"**: already retried automatically every 14 days (orchestrator FAILED_FLOOR_DAYS); the pool is the residue that keeps failing. No win there.
- **LinkedIn scraping**: prohibited by their User Agreement §8.2. Never build.
- **Kompass / qataryellowpagesonline**: bot-gated, volume unverifiable. **qatcom.com**: dead. **Baladiya / MoL registers**: no public register exists. **Bing API**: dead (Aug 2025). **Google CSE**: closed to new customers.
- **D&B / ZoomInfo**: enterprise-quote, resale-hostile licensing.

## 4. The program

### Workstream A — STOP THE ROT (accuracy, $0, highest priority)
- **A1. Guessed-website quarantine.** Shared-host cleanup (763 hosts / 1,835 companies), template-contact purge (the London-phone class), a harvester fan-out guard so one host can never again contaminate hundreds of records, and visible provenance on anything guess-derived. Preview/Apply for Val.
- **A2. Duplicates.** 233 exact-name groups visible (13 of 15 sampled are true duplicates, minted by post-June ingests while dedup was idle); cross-body CR drain continues nightly; 2,141 "(name missing)" shells largely fold via the shell tier; 5 literal "$name" CRA rows deleted.
- **A3. Honest freshness labels.** Assume-active stays (Val's documented decision) but every status shows its as-of date; register-confirmed median age is ~87 days and falls as B2 lands.

### Workstream B — FILL THE WELL (coverage, $0)
- **B1. Work the 4,780-candidate queue** with the task-#96 name-on-page gate: auto-approve when the page itself names the company (evidence, not judgment — Val's automation constraint), review-queue the rest. Then harvest the approved. Expected: thousands of new *verified-by-evidence* websites → ~65% of them yield emails.
- **B2. Registry freshness.** QCCI re-crawl (live from tonight, own browser, $0); **MOCI stage-1 rescan scheduled on the ROG** (parser finished; 3 frozen months of new companies waiting); Wave-2 sources (QSE·Qatar Chamber·MoPH·Tasmu·CRA·MadeInQatar·QFCRA) onto a monthly rotation.
- **B3. Smooth the engine calendar.** Spread the 30-day re-laps daily instead of one 15k-touch day; put the freed capacity behind B1's approved-candidate harvesting.
- **B4. Contacts Bell already holds:** 140 tender buyer/procurement emails (onto tender records; gov contacts, not PDPPL-locked) and 25 recruiter emails in job payloads. Small, $0, grows with every sweep.

### Workstream C — PAID (awaiting Val; corrected prices)
- **C1. Verify the email stock: ~$17–20 one-time** with the key Bell already owns; ~$6/month after. Turns "19,443 unverified" into an honest deliverable/invalid ledger — and directly protects customers' campaigns.
- **C2. Pattern+verify for the 7,842 site-but-no-email companies** — same Reoon budget class (~$10–20), stage 10 already shipped.
- **C3. Apify Maps for the 65k** — verified "from $1.50/1,000 places"; ~$100–200 for the full pass; pilot-first. Parked until money flows (Val, 2026-08-16).
- **C4. Serper search** (~$20–65 full sweep) — optional accelerant behind the #96 gate.

### Workstream D — PRODUCT (why they pay)
- **D1. Tenant SMTP** (~2–4 days): custom-domain sending identities are already live; SMTP itself has zero code. First step is a one-line live test that Railway Pro actually allows outbound SMTP (the premise is documented but unverifiable from code).
- **D2. Award intelligence surfacing** — the 23k awards / 71k bids / 9k ICV dataset gets a route, UI, Bella tool and signals. The single strongest "nobody else has this" screen in the product.
- **D3. Polish that customers feel:** bounced-email red in CRM timeline, task-assignment notifications, Bella approval-card batching.

### The ROG's day (once A–B land)
| When | What |
|---|---|
| always-on | continuous sweep: new companies + smoothed re-laps + approved-candidate harvesting |
| 00:30 | nightly: self-update · tender scan · awards · QSE · job boards · QCCI 1,000-chunk · registry merge · chains · score heal |
| 07:00 / 19:00 | push to production (+ tenant re-point reconcile) |
| 10:00 | Spark daily |
| Sat 08:00 | registry scan QFZ/QSTP/QFC **+ MOCI stage-1** + one Wave-2 source (rotating) |
| Sun 09:00 | geocode + weekly own-site jobs read |

## 5. Order of work
1. B1 (candidate queue + #96 gate) — biggest free coverage win
2. A1 (contamination quarantine) — biggest accuracy win
3. B2 (MOCI Saturday + Wave-2 rotation)
4. D2 (award surfacing) — biggest product win
5. A2 (duplicates) · B3 (calendar) · B4 (held contacts)
6. D1 (SMTP, after the Railway probe) · D3 (polish) · A3 (labels)
7. C1/C2 the day Val approves ~$20; C3/C4 when money flows

## 6. Still unverified (flagged, not asserted)
- Railway Pro outbound-SMTP permission — needs a live probe from prod.
- Apify/Serper prices — fetched from their pages 2026-08-15 but not contract-confirmed.
- Whether the ROG's Crawl4AI passes qatarcid's Cloudflare — tonight's probe answers it on the duties card.
- 21 of 40 audit findings did not get their adversarial pass (session limits); the load-bearing ones above were verified first-hand instead.

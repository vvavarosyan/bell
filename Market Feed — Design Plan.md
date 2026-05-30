# Market Feed — Design Plan

**Status:** Design / pre-build. Decisions below are locked with Val (2026-05-29).
**Goal:** A live intelligence stream that makes a Bell user feel like the entire
country's events are flowing through one screen — news, research, new companies,
data, and signals, all ingested by Bell, processed (categorized + linked to the
company database), and surfaced in real time.

---

## Locked decisions

1. **Engine runs on Railway, always-on (Option A).** A background poller in the
   production app fetches feeds every few minutes, dedupes, and tags each item
   with a cheap LLM. Matches the existing Deep Data scheduler pattern (already
   runs 24/7 on prod). News data is **prod-owned** (like credits/reveals) — NOT
   part of the local→prod mirror.
2. **Source strategy: free layers only (to start).**
   - Direct **RSS** from Qatar + regional + global outlets.
   - **Google News RSS** topic queries (turn any topic into a feed).
   - **GDELT** free events firehose (~15-min updates) for the "live scan" layer.
   - A paid news API is a later option if breadth feels thin.
3. **Research → global feed: auto-shared, anonymized, after an exclusivity
   window.** The researcher keeps it private to them for a window (gives a
   first-mover edge), then it joins the global feed with the author hidden.
   Opting out entirely (never joins the pool) costs credits, framed as a premium
   "keep private" action. Rationale: credits buy *speed/exclusivity*; the
   collective research pool becomes a network-effect moat.

---

## The "everything stream" — content types

Market Feed is not just news. It blends every event type Bell already ingests
into one ranked, filterable stream (this is the Snowball Doctrine made visible):

| Kind                  | Source                                   | Example feed line |
| --------------------- | ---------------------------------------- | ----------------- |
| `news`                | RSS / Google News / GDELT                | "QatarEnergy signs LNG supply deal with…" |
| `research`            | Published research reports (anonymized)  | "Research: competitive landscape of Qatar fintech" |
| `company_registered`  | MOCI/QFC/QFZ scrapers                     | "New company registered: Doha Capital WLL (Finance)" |
| `dataset_update`      | Qatar Open Data sync                     | "New dataset: Building permits Q2 2026" |
| `signal` (phase 3)    | LLM extraction over the above            | "Hiring spike: Ooredoo +120 roles" / "Leadership change…" |

Every item is **linked to Bell company records** where possible — a mentioned
company becomes a clickable chip that opens its drawer. That linkage is the core
value: the news is tied to your data.

---

## Data model (proposed)

All on the **production** DB. New tables:

### `news_sources` — the feed registry
`id, name, url, kind('rss'|'google_news'|'gdelt'), category_hint, country,
language, active, poll_interval_seconds, last_polled_at, last_status, last_error,
created_at`

### `news_items`
`id, source_id, guid (UNIQUE — dedup), title, url, summary, image_url, author,
source_name, published_at, fetched_at, language, category, subcategories text[],
sentiment, sentiment_score, region, entities jsonb, linked_company_ids bigint[],
linked_person_ids bigint[], importance_score, is_breaking, processed bool,
created_at, updated_at`

### `feed_events` — the unified stream (powers the feed in ONE query)
`id, kind, ref_table, ref_id, title, summary, category, occurred_at, importance,
entities jsonb, linked_company_ids bigint[], payload jsonb, created_at`

Every producer (news poller, research publisher, scraper ingest, open-data sync)
writes a `feed_events` row. The feed UI reads this one table — fast pagination,
infinite scroll, filters. Each row links back to its detail object.

### Research changes (existing `research_reports`)
Add: `is_private bool` (credit opt-out), `feed_release_at timestamptz`
(= created_at + exclusivity window). A small job promotes reports into
`feed_events` once `now() >= feed_release_at AND NOT is_private`, with **no author
/ tenant** carried into the feed row.

---

## Ingestion pipeline (prod poller)

1. Scheduler iterates `news_sources` due for polling (tiered intervals: breaking
   sources every 2–5 min, others every 15–30 min).
2. Fetch the feed (RSS/Atom XML, Google News RSS, or GDELT API).
3. Parse → candidate items; **dedupe by `guid`** (skip ones we have).
4. Insert raw `news_items` (`processed=false`).
5. **Batch LLM pass** on unprocessed items (one call per ~20 headlines, cheap
   model): category, sentiment, entities, importance score.
6. **Entity-link**: fuzzy-match extracted company names to Bell companies
   (`name_normalized`) → `linked_company_ids`.
7. Write a `feed_events` row per item.

**Cost controls:** cheapest capable model; batch classification; only new items;
tiered poll intervals; daily LLM spend cap; store headline+summary+link only.

---

## Legal / quality

- Show **headline + short snippet + source link + Bell's own analysis** only.
  Do NOT republish full article text (copyright). Bell's value is the
  processing layer (categorization, company-linking, scoring) — transformative
  and safe.
- Per-source health tracking + exponential backoff on failures.
- Respect feed etiquette (reasonable poll intervals, conditional GET / ETag).

---

## API (all under the `feature` gate: signed-in + subscription)

- `GET /api/feed` — paginated `feed_events`; filters: `category, sector,
  sentiment, source, kind, q, tracked_only, cursor`.
- `GET /api/feed/stats` — live counters (sources scanned, items today, links
  made, trending entities) for the "Bell is scanning…" bar.
- `GET /api/feed/trending` — top companies/people/topics in the last N hours.
- Admin-only (`admin.bell.qa`): `GET/POST /api/news/sources` (manage registry),
  trigger a manual poll.

---

## UI — the "wow" layer (Market Feed tab)

- **Breaking ticker** across the top.
- **Live stats bar:** "Scanned 142 sources · 1,247 events today · 38 linked to
  companies you track," with a subtle scanning pulse.
- **Infinite-scroll feed** of cards, styled per kind (news / research /
  registration / dataset / signal). Auto-appends new items with a soft "new"
  animation (poll every ~20s).
- **Company chips** on each card → open the company drawer.
- **Filter rail:** category, sector, sentiment, source, language (Arabic/
  English), "only companies I track."
- **Trending sidebar:** hottest companies/people/topics now.
- **"Turn into research"** — one click on a headline spins up a Research job.
- **Phase 3:** Qatar map that pulses where events happen; economy
  sentiment/volume chart; daily brief email; personalization from tracked lists.

---

## Phasing

**Phase 1 — Core live news feed**
`news_sources` + `news_items` + `feed_events`; prod poller (RSS + Google News);
LLM categorize + company-link; Market Feed UI (ticker, cards, filters, infinite
scroll, live stats, company chips). Validate + load the real feed URLs.

**Phase 2 — The everything-stream**
GDELT events; global research into the feed (exclusivity window + anonymization +
credit opt-out); company-registration + dataset events into the feed; trending;
"turn into research."

**Phase 3 — Power features**
Map pulse; sentiment/volume charts; signal extraction (funding / leadership /
hiring); daily brief email; personalization from tracked companies (needs the
watchlist/CRM surface).

---

## Open questions to settle before/during build

- **Exact feed list** — compile + validate RSS URLs per outlet (Gulf Times, The
  Peninsula, Qatar Tribune, Doha News, Lusail, Al Sharq, QNA; Al Jazeera, Zawya,
  Arabian Business, MEED, The National, Arab News; Reuters/AP via wires/Google
  News). First build task.
- **Exclusivity window length** (e.g. 3 days?) and **credit cost** to keep a
  research private.
- **"Companies I track"** — needs a watchlist/saved-list concept (today the
  closest signal is `tenant_reveals`; a proper watchlist likely comes with CRM).
- Poll cadence + daily LLM spend cap (tune for cost vs freshness).
- Which single service runs the poller (avoid double-polling across app/admin
  deployments that share the prod DB).

# Bell Data Intelligence — session kickoff

**Last updated:** 2026‑07‑10 (end of the Monaqasat data‑integrity session)

This project now runs in **Claude Code** (the **Code** tab of the Claude desktop app), opened on this folder.

`CLAUDE.md` in this folder is loaded automatically at the start of every session — it carries the rules, the plan, the current state, and the source quirks. **You do not need to paste a long prompt any more.** Just open the folder and say what you want.

---

## Paste this on the first Claude Code session

> Read `CLAUDE.md`, then `Bell — Project State (for new session).md`.
>
> Give me a short, honest read‑back of where we are — including anything you can't verify. Then check whether `Enrich Tender Details` has finished (`Check Tender Detail.command` reads the local DB), and tell me the next step.
>
> Remember: I don't use the terminal. Everything I do is a double‑click `.command` file or a button in the local Portal. Never push `main` without me saying so, and never create a new branch.

That's it. Everything else it needs is in `CLAUDE.md`.

---

## ⏳ Where we stopped (do these in order)

`Enrich Tender Details.command` was running. When it finishes:

1. **`Check Tender Detail.command`** — expect `OPEN with a closing date` ≈ **324 / 324**, and no line warning about junk `entity_ref`.
   ⚠️ It will *also* say **`captured by parser v4: 0`** and **`still to (re)enrich: ~21,000`**. **That is expected — not a failure.** `DETAIL_V` was bumped 3 → 4 so the archive gets one more pass to pick up the new "As published" field capture. You'll do that pass in step 6.
2. **`Backfill Tender Industries.command`** — recompute categorisation on the cleaned set.
3. **Test** in the local Portal (`127.0.0.1:3939`) → **Signals → Tenders** → open any Monaqasat tender. You should see a real **closing date**, a **full description**, and **no** cards titled `- Materials Department`.
4. **Deploy both environments:** `Push Changes.command`, then `Open Production Release.command`.
   Commit message: `Monaqasat: fix phantom tenders, closing dates, entity_ref, description`
5. **Re‑run `Enrich Tender Details.command`** (hours, resumable). This is the v4 pass — it adds the **"As published"** block (every field the source prints, verbatim) to each tender.
6. **`Check Tender Detail.command`** again — `captured by parser v4` should now be climbing toward the detail‑page count.

⚠️ **While a long enrich runs, pause the always‑on engine** — local Portal → **Local Engines → Pause**. Two browser stacks on an 8 GB Mac is what caused the old slowdowns. Un‑pause afterwards.

---

## Still open, not urgent

- **271 tenders "awaiting host heal."** They look like phantom rows, but their host tender lives in the awarded archive whose title is still truncated, so the repair tool refuses to prove — and refuses to delete — them. To clear: run **`Backfill Full Tender Archive.command`** (hours), then **Preview** → **Apply Tender Phantom Repair** again. Archived rows only.

---

## What was done in the last session

The "27 uncategorised open tenders" turned out to be **phantom rows the scraper invented**, and chasing them exposed three more silent corruptions. All fixed, all proven on live data, **not yet deployed**:

| Bug | Effect in production |
|---|---|
| Card splitter split on refs **embedded in titles** (`… - LTC-2417/2025 - …`) | invented 29 fake tenders **and truncated the real ones** (host lost buyer, bond, dates) |
| `Closing date` read with the wrong label / from a table **header** | `deadline_at` was NULL on **all 324 open** Monaqasat tenders |
| `entity_ref` regex captured the **next column header** | every enriched tender stored the literal string `"Request"` |
| `description` regex cut at the first keyword | descriptions truncated to a few words |
| `contract_days` asserted a unit the page never prints | a tender showing `3` was published as "3 days" |
| `JSON.stringify(raw).slice(0, 20000)` in 3 write paths | invalid jsonb → Postgres rejects → error swallowed → **row silently lost** |

**Root cause of the middle four:** the detail page is **header/value tables**, so any regex that scans forward from a label captures the next header. Everything now reads real `<td>` cells (`detailFields(html)` in `scrape_monaqasat.js`).

**The trap worth remembering:** a line‑position parser scored **12/12 on `fetch()` HTML and 6/12 on browser‑serialized HTML** — because the rendered Subject cell contains real CR/LF. Browser HTML is what production uses. Always verify against it.

Verification: **55/55** unit tests (`server/tests/tender_phantom_split.test.mjs`), **6/6** PGlite on real migrations, **12/12** live detail pages, `node --check` clean.

Repair already run by Val: **29 phantoms deleted** locally and on prod. Prod now holds **25,199** tenders.

---

## New files from that session

- `server/tenders/raw.js` — `packRaw()`; never truncate serialized JSON.
- `server/scripts/repair_tender_phantoms.js` + **`Preview Tender Phantom Repair.command`** / **`Apply Tender Phantom Repair.command`**.
- `server/tests/tender_phantom_split.test.mjs` — 55 tests.
- `CLAUDE.md`, `.claude/settings.json` — the working agreement and its guardrails.

---

## The plan

Six phases, green‑lit. Phase 1 (tenders → buyer‑intent signals) is done. **Phase 2 (data maximization) is current:** Engine 6 tech‑stack is live and running; next is **A3 proof‑of‑search ledger**, then **C1 QSE disclosures**. **MOCI Stage‑2 is parked** at Val's request. Then Phase 3 Bella‑as‑brain, 4 onboarding, 5 Team, 6 Bell‑as‑a‑business.

Full detail: `CLAUDE.md` §6 and `Bell — Project State (for new session).md`.

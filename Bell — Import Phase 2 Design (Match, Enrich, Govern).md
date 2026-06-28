# Bell — Import Phase 2 Design
### Make imported lists usable, match them to Bell, and (safely) let them enrich the shared DB

*Synthesized from research on HubSpot · Salesforce · Apollo · ZoomInfo · Clay · Pipedrive · D&B · dedupe.io/splink · MDM data-stewardship + crowdsourced-trust literature, mapped onto Bell's architecture (canonical DB lives on the local engine → mirror-syncs to prod). Phase 1 already shipped: private CSV import + parse + header-alias auto-map + `imported_records`/`import_batches` with `matched_entity_type/id` + `enrich_status` + the `contribute` opt-in.*

---

## 0. ⭐ REVISED MODEL — Val's direction (2026-06-28) — supersedes the opt-in framing below

**No per-item opt-in checkbox.** Instead:

1. **Users can add UNLIMITED datapoints to ANY record in their CRM** — extra phones/emails/addresses, corrections, new related people, custom fields, notes-as-data — on companies *and* people. (This merges roadmap req #2 "import lists" with req #3 "users add datapoints → enrich Bell.")
2. **Everything a user contributes** — both **imports** and **datapoints added to CRM records** — is **captured automatically into an admin-only pool**, with full provenance (which tenant, which target record, what value, when).
3. **The admin manually curates that pool** — goes through it datapoint by datapoint and decides which values are safe (for quality, **reputation, and law**) to merge into Bell's canonical/shared DB, and which to leave private/discard.
4. **Promoted datapoints** enter canonical (local engine) → mirror-sync to prod. Everything the user added is **still usable to that user in their own CRM** regardless of the admin's decision.

**⭐ 100% capture — NEW entities too (Val 2026-06-28):** the same admin-review model applies when a user adds a **brand-new company or person that Bell doesn't have yet** (not just datapoints on existing Bell records). So the pool holds TWO kinds of contribution: (a) **datapoints on an existing canonical entity** (Layer 1 — built), and (b) **new-entity proposals** (a company/person the user created in their CRM, or an unmatched import row). Both land in the admin pool; promoting a *new-entity proposal* CREATES the canonical company/person (entering the existing Qatar approval/pending doctrine) and links the user's CRM record to it. Nothing the user adds is ever dropped — captured 100%, private to them, admin decides what reaches Bell's shared DB.

**What this changes vs the rest of this doc:**
- Drop the Phase-1 "contribute to Bell" checkbox. Consent becomes a **ToS clause** (data you add may be reviewed + added to Bell's DB) — **lawyer must bless the wording.**
- **The admin is the primary gate** (manual review of everything). The mechanics below — the matching engine (§4), the validation **auto-reject** gate (junk never reaches the admin), contributor-trust + provenance (§3), and survivorship (Bell sources outrank) — all stay, but now as **tools that pre-filter and inform the admin**, not as auto-promoters. Auto-promote is OPTIONAL and OFF by default; start with everything queued for manual review, add auto-promote later only for the most certain (verified + independently corroborated) company data to cut admin load.
- **PDPPL split is unchanged and central:** company/firmographic data = safe bulk the admin can promote freely; **person-level data → public DB stays lawyer-gated** — the lawyer defines the rules the admin follows (admin judgment ≠ a lawful basis under PDPPL). See §6.

**Net build:** (i) a user-facing "add datapoints to any CRM record" capability + capture; (ii) imports feed the same pool; (iii) an **admin curation surface** (review pool → promote/reject per datapoint, with the match + provenance + validation flags shown) → promote-to-canonical → sync. The matching engine still links *imported* rows to the right canonical record; *CRM-record* datapoints already know their target.

---

## 1. The big idea — two tracks, very different risk
*(framing retained for the risk split; "opt-in" → now the ToS clause + admin gate from §0)*

Every serious platform separates **"my data, for me"** from **"my data, into the shared product."** Bell must too, because under Qatar PDPPL these carry completely different legal risk.

- **Track A — Private + usable (LOW risk, build now).** The user's imported contacts/companies become a working part of *their* CRM. We match each row to Bell's existing DB to enrich what we can, and keep the rest as private records. Nothing touches the shared/public DB. This is pure customer value and needs no lawyer.
- **Track B — Contribute → enrich the shared DB (GATED).** Only if the user opts in (off by default). Rows go through a **validate → score → gate → admin review → promote-to-canonical → sync** pipeline. **Company-level data ships; person-level data into the public DB stays lawyer-gated** (this is the ZoomInfo/Apollo litigation zone, and PDPPL is *stricter* than GDPR — see §6).

The two tracks share one **matching engine** (§4).

---

## 2. Track A — make imports usable (the customer win)

Goal: a user uploads "my-contacts.csv" and immediately has a usable, enriched CRM segment — not an orphan island.

**Flow:** upload → auto-map → **preview + validate** → **match against Bell** → commit → **summary + per-row report** → (one-click **undo**).

What we add on top of Phase 1:

1. **Preview + validation before commit.** Show the first ~20 mapped rows; run `dataquality.js` validators (email/phone/website) at preview time; block/flag bad rows. (Reuse existing validators — zero new logic.)
2. **Match each row to Bell's canonical DB** (the engine in §4). Three outcomes per row:
   - **Matched** → link the imported row to the existing Bell company/person (fills `matched_entity_type/id`), and **auto-add the matched entity to the user's CRM** (reuse `ensureCrmRecord`, source `import`). The user instantly works it with full Bell enrichment.
   - **Needs review** → show in a small "confirm matches" list (side-by-side: your row vs Bell's record) — user accepts/rejects.
   - **No match** → kept as a **private record** the user can still see/work (and, in Track B, optionally contribute).
3. **Import summary screen** — created / matched / review / private / skipped counts.
4. **Per-row skip report, downloadable** — every rejected row + a human reason ("missing email", "bad domain"). *(Agent-1: the single highest-value gap across all platforms; HubSpot's lack of it is its #1 complaint.)*
5. **One-click Undo of a whole import** — Phase 1 already groups rows by `import_batch_id`; add "Undo this import" = delete that batch's private rows + remove the CRM records it created. (Beats HubSpot, which has no true rollback.)
6. **Async + UTF-8 for large files.** Run imports >~2k rows as a background job (the pattern we already use for auto-approve/undo). **Explicitly handle UTF-8 + BOM** so Arabic names don't corrupt — critical for Qatar (Windows-1252 exports are the classic break).
7. **Save & reuse column mappings** per source/file-shape, and inline custom-field creation, so repeat uploads are one click. *(Phase 2.5 polish — nice-to-have.)*

Track A makes imports valuable **without any legal exposure** — it only ever shows the user data they uploaded plus Bell data they already have access to.

---

## 3. Track B — contribute → enrich the shared DB (the governed pipeline)

Only `contribute = true` batches enter this. The pipeline (industry-standard MDM shape):

```
opt-in row → VALIDATE → SCORE → 3-WAY GATE → [admin review queue] → PROMOTE to canonical (LOCAL) → mirror-sync to prod → provenance/audit
```

### The 3-way gate (this is what prevents another data disaster)

- **AUTO-REJECT** (log to the existing reject-log, never queue): fails schema/format (junk phone, role/disposable email, denylisted host — reuse `dataquality.js` + the `corroborates()` digit-soup/host-denylist fix from the website cleanup); hard-bounced/suppressed (migration 061); or a dup of a canonical record with no new fields.
- **AUTO-PROMOTE** (high-confidence only): the value is **verified** (email via Reoon MX/SMTP, etc.) **AND corroborated by ≥1 *independent Bell source*** (a Bell-owned scrape/registry — **not** the importer) **AND** the contributor's trust is above threshold. This is the same "corroboration-only" doctrine we just hard-learned on websites, extended to imports.
- **QUEUE for admin/steward**: everything plausible-but-single-sourced, fuzzy matches, or conflicting values.

### The anti-poisoning trio (non-negotiable — directly answers "how do we never repeat the bad-website mess")

1. **The importer can PROPOSE but never SELF-CONFIRM.** A contributed row can never be its own proof — promotion to public requires an *independent* Bell source. This single rule kills "a user (or bad actor) asserts a fake fact and it becomes canonical."
2. **Per-tenant contributor trust scoring.** Track each tenant's accept/reject/bounce history; a high reject/bounce rate auto-demotes them so their rows always queue (never auto-promote).
3. **Quarantine new contributors.** A tenant's first contributions always queue until they earn trust.

Plus **survivorship by trust precedence**: Bell's registry/scrape sources outrank contributed data per field — a contributed value can only **fill a blank** or raise a **conflict for review**, never overwrite a higher-trust canonical value. Every promotion writes an **attribute-level audit row** (who/source/when/confidence) → fully reversible (a merge journal, since native CRM merges are notoriously un-undoable).

### Admin review queue (local Portal)

A steward surface (like the Website Candidates tab): each pending row shows **confidence + corroborating evidence + contributor + source**; batch approve/reject/merge; **sort lowest-confidence/most-conflicting first**; "approve all above X confidence"; **spot-check a random sample of auto-promoted rows** (if sample error rises, tighten thresholds). Approved → promote to canonical (local) → the existing mirror-sync carries it to prod; **company adds enter the displayed DB, person adds stay gated** until legal clears §6.

---

## 4. The matching engine (shared by both tracks)

Standard 5-stage pipeline, all set-based in Postgres (cheap at 76k):

1. **Normalize** — lowercase; strip legal suffixes (LLC/W.L.L./Co.); collapse whitespace; canonicalize website → registrable domain; phone → E.164 (last-8 for Qatar); drop role/catch-all emails.
2. **Block (candidate generation, never N²)** — only compare rows sharing a cheap key, via indexes:
   - Companies: exact `website_domain` → `phone` → **`name` trigram (pg_trgm GIN, similarity > 0.4), scoped to Qatar**.
   - People: exact `email` → (`last_name` exact + `first_name` trgm) → `linkedin_url`.
3. **Score (weighted, deterministic — no ML needed):**

   | Signal | Weight |
   |---|---|
   | Exact email (person) / domain (company) | **+0.55** |
   | Phone (E.164) match | +0.25 |
   | Name similarity (Jaro-Winkler person / trigram company) | +0.30 × score |
   | Same city/area | +0.10 *(corroborator, never alone)* |
   | Email-domain ↔ company-domain link | +0.20 |
   | Conflicting domain/phone | **−0.30** |

4. **Decide by band:**
   - **≥ 0.82 → auto-match** — *but require an exact identifier (email/domain/phone) OR name ≥ 0.85 + city; never fuzzy-name-alone* (this is exactly the trap the website auto-approve fell into).
   - **0.55–0.82 → review.**
   - **< 0.55 → new record.**
5. **Indexes to add (migration):** `GIN(name gin_trgm_ops)` on companies + people, btree on `website_domain`, `phone`, person `email`. Then each import row touches a few dozen candidates, not 76k → O(N·k), trivially fast. A nightly internal dedup sweep can reuse the identical query.

---

## 5. Schema (migration 064) — mostly extends Phase 1

- `imported_records`: add `match_confidence numeric`, `match_status text` (matched/review/new), keep `matched_entity_type/id`.
- `contributor_trust` (per tenant): `tenant_id, contributions, approved, rejected, bounced, trust_score, quarantined_until` — feeds the gates.
- `enrichment_audit` (local): attribute-level promotions `(entity_type, entity_id, field, old, new, source, contributor_tenant, confidence, decided_by, at)` → audit + unmerge.
- Trigram + key indexes from §4. Reuse `enrich_status` (private/pending_review/approved/rejected) as the queue state.

---

## 6. PDPPL reality check (read before building Track B) — blunt, do not downplay

Qatar PDPPL (Law 13/2016) is **consent-first and gives you NO "legitimate-interest" escape hatch** — the exact basis the entire Western B2B-contributory industry (ZoomInfo, Apollo, Lusha) leans on. So:

- ✅ **Company / firmographic data → LOW risk. Build Track B aggressively here.** Legal name, CR number, sector, address, official website/phone are largely non-personal. This is Bell's safe moat.
- 🔴 **Person-level data into the *public/resold* DB → HIGH risk, LAWYER-GATED.** A contributed `jane@co.qa` / personal mobile is personal data; putting it in a shared resold DB without Jane's consent is PDPPL's danger zone. The contributor's warranty protects Bell *contractually against the user* but **Bell remains the controller** vs. Jane and the regulator. Fines: **QAR 1M–5M per violation, actively enforced since 2024–25.**
- 🔴 **Never build a public surface that NAMES a real individual to sell access** — a "teaser/preview" of a named person is precisely what cost ZoomInfo ~$30M. (Bell's anonymized-teaser model is safe *only* if the teaser doesn't identify a real person pre-payment.)
- **Must-haves regardless:** opt-in OFF by default (have it); a **contributor warranty + indemnity** ToS clause (right to share, grant to add to shared DB, ack that it may be shown to other customers); **one-click global opt-out/suppression for people** (extend the email-suppression + tombstone machinery).
- **Keep lawyer-gated:** the legal basis for any *non-consenting individual's* personal data entering the public DB; the warranty/indemnity wording; the cross-border (local→Railway) transfer notice. *(All already in the counsel brief.)*

**Net:** ship Track A + Track-B-for-companies now; hold Track-B-for-people behind the lawyer's sign-off — the engine is built either way, just don't flip the "people→public" switch.

---

## 7. Suggested build order

1. **Matching engine + indexes** (§4) — backend, testable, reused everywhere. *(Start here.)*
2. **Track A**: preview-validate + match-on-import + auto-CRM + summary + per-row report + undo. *(The customer win; no legal risk.)*
3. **Track B governance**: validate/score/3-gate + `contributor_trust` + admin review queue + promote-to-canonical (companies) + sync + audit.
4. **PDPPL gate**: keep person→public promotion disabled until counsel signs off; companies flow live.
5. **Polish**: saved mappings, inline custom fields, nightly internal dedup sweep reusing the match query.

---

## 8. Decisions for Val
- **A)** Build **Track A first** (private + match-to-CRM, ship-able now), then Track B? *(Recommended.)*
- **B)** For Track B, ship **company-enrichment live** now and keep **person-enrichment built-but-disabled** pending the lawyer? *(Recommended — matches PDPPL.)*
- **C)** Auto-promote threshold: start **conservative** (queue almost everything, auto-promote only verified + independently-corroborated), loosen as contributor-trust data accrues? *(Recommended.)*

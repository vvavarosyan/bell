# Bell Data Intelligence — Schema Reference

This document explains every table, column, and design decision in the local
Postgres database, and gives step-by-step instructions for **mirroring the
same schema on Bell.qa's Railway Postgres** so the Final Data JSON upload is
plug-and-play.

> **Current schema version**: `0001` (single migration file:
> `001_initial_schema.sql`).

---

## How to mirror this schema on Bell.qa (Railway)

You have two options. Pick whichever you prefer:

### Option A — Run the migration file directly against Bell.qa (recommended)

1. Open Railway → your Bell.qa Postgres service → **Data** tab → **Query**.
2. Open `Portal/migrations/001_initial_schema.sql` on your Mac (right-click,
   Open With → TextEdit).
3. Copy the entire file contents and paste it into the Railway Query window.
4. Click **Run**.

The migration is idempotent (`IF NOT EXISTS` everywhere, `ON CONFLICT DO NOTHING`
on seed inserts), so it's safe to run even if some tables already exist.

### Option B — Use Railway's CLI (terminal once, then never again)

```bash
# From your Mac, with the Bell.qa Railway project linked:
railway connect <postgres-service> < Portal/migrations/001_initial_schema.sql
```

Either way, Bell.qa ends up with exactly the same tables as your local DB.

---

## Tables at a glance

| Table                       | Purpose                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `companies`                 | Canonical company record. BIN assigned at Assembly.                                      |
| `company_sources`           | Many-to-many — every directory/source where a company appears (raw payload kept).         |
| `people`                    | Canonical person record. PIN assigned at Assembly. Reveal flag for credit-gated profiles. |
| `person_companies`          | Many-to-many — employment history. Powers the org-chart view in the Portal.               |
| `jobs`                      | Canonical job posting. JIN assigned at Assembly. Linked to a company.                    |
| `enrichment_runs`           | Audit log of every Firecrawl + Apify run, including cost.                                |
| `enrichment_credits`        | Per-day per-stage roll-up of credits + USD spent.                                        |
| `dedup_links`               | Record-merge log. Lets you trace which records got absorbed into which BIN/PIN/JIN.       |
| `similar_company_queue`     | "Similar companies" suggestions from Stage 2 Apify actor, awaiting admin decision.        |
| `settings`                  | Portal settings (NOT API keys — those live in macOS Keychain).                           |
| `schema_migrations`         | Versions applied. Don't touch manually.                                                  |

---

## Identifier scheme

Three sequences generate Bell identifiers. They live ONLY in this database;
they are not pulled from Bell.qa.

| Sequence  | Format helper       | Example              |
| --------- | ------------------- | -------------------- |
| `bin_seq` | `format_bin(n)`     | `BIN-00012345`       |
| `pin_seq` | `format_pin(n)`     | `BELL-P-00098765`    |
| `jin_seq` | `format_jin(n)`     | `BELL-J-00007777`    |

Identifiers are assigned at the **Assembly** stage, AFTER deduplication, so a
single canonical record always has a single stable BIN/PIN/JIN for life. Until
Assembly runs, the `bin` / `pin` / `jin` columns are `NULL`.

Example of assigning a BIN to a company that's been deduped:

```sql
UPDATE companies
SET bin = format_bin(nextval('bin_seq')),
    assembled_at = now()
WHERE id = $1 AND bin IS NULL;
```

---

## `companies` deep dive

Every field is nullable except `name` and `name_normalized` (we always have at
least the name from the scraper). Fields are grouped:

- **Identity** — `name`, `name_normalized`, `legal_name`, `legal_form`.
- **Status** — `is_active`, `status_raw`, `status_normalized`. Inactive companies
  (`License Withdrawn`, `In Liquidation`, etc.) stay in the table with
  `is_active=false`. Bell.qa filters them in the UI.
- **Registration** — `primary_registration_no` (the best ID we have across
  sources: QFC license #, MOCI CR #), `incorporation_date`.
- **Contact** — `website`, `email`, `phone`, `address`, geo.
- **Classification** — `industry`, `sector`, `sub_sector`, `employee_count`, etc.
- **LinkedIn** (Stage 1 + 2) — `linkedin_url`, plus all enriched LinkedIn fields.
- **Google Maps** (Stage 5) — `gmaps_*` fields.
- **`extra_fields jsonb`** — open bucket for any future enrichment field we
  haven't formalized yet. Keeps the schema stable as we add stages or actors.
- **Stage progress** — `stage1_status` ... `stage5_status` (`pending` / `running`
  / `done` / `no_data` / `failed`) and matching `stage1_at` ... `stage5_at`
  timestamps. The Portal renders these as 5 green/red dots per row.
- **Bookkeeping** — `created_at`, `updated_at`, `assembled_at`, `archived`.

### Status values reference (`status_normalized`)

We normalize the dozens of source statuses (QFC has 10, MOCI has 12, etc.) into
a single vocabulary so Bell.qa only has to understand these:

| `status_normalized` | `is_active` | Maps from (examples)                                            |
| ------------------- | ----------- | ---------------------------------------------------------------- |
| `active`            | true        | QFC "Licensed", MOCI "Active", QFZ default, QSTP "Active"        |
| `inactive`          | false       | QFC "Licensed - Inactive"                                        |
| `suspended`         | false       | QFC "License Suspended", "Suspended by Court Order"              |
| `withdrawn`         | false       | QFC "License Voluntarily Withdrawn", "Licence Withdrawn by QFCA" |
| `in_liquidation`    | false       | QFC "Licensed - In Liquidation"                                  |
| `frozen`            | false       | QFC "Frozen Under Court Order"                                   |
| `deregistered`      | false       | QFC "Under Deregistration"                                       |
| `not_licensed`      | false       | QFC "Not Licensed", "Not yet licensed..."                        |
| `unknown`           | true        | source had no recognizable status                                |

The mapping logic lives in the Assembly stage (Phase 5).

---

## `company_sources` — provenance

A single company often appears in multiple Qatar directories under slightly
different names or with different IDs. We never lose that — each appearance
gets its own row here with the **full original raw payload preserved as JSONB**.

```sql
SELECT source, source_record_id, source_url, first_seen_at
FROM company_sources
WHERE company_id = $1
ORDER BY first_seen_at;
```

That lets the Portal show "This company was found in QFC + MOCI + QSTP" with
clickable links back to the original listings.

---

## `people` + `person_companies` — the org chart

The 5-tuple of `person_companies` columns drives the company-profile org-chart
view: `org_chart_level` (1 = CEO, 2 = Exec, 3 = Director, 4 = Manager, 5 = IC),
`seniority_level`, `title`, `department`, `is_current`.

When you click "reveal" on a person in the Portal:

```sql
UPDATE people
SET is_revealed = true,
    revealed_at = now(),
    revealed_by = $admin_email
WHERE id = $1;

-- and charge the credit:
INSERT INTO enrichment_credits (day, stage, tool, credits_used, run_count)
VALUES (current_date, 3, 'reveal', 1, 1)
ON CONFLICT (day, stage, tool) DO UPDATE
SET credits_used = enrichment_credits.credits_used + 1,
    run_count   = enrichment_credits.run_count + 1;
```

When Bell.qa's CRM composes an outreach email, it joins `companies` → `person_companies`
→ `people` to surface "people you might CC" and "people you haven't revealed
yet" — the reveal call happens via the same API.

---

## `enrichment_runs` — every Apify/Firecrawl call

Each row records:

- which stage and tool ran
- which target records (`target_ids` as `bigint[]`)
- input payload (what we sent)
- output summary (what we got back, summarized)
- credits + USD spent
- status + error message
- who triggered it

The Portal's "Operations" view reads this table to show recent runs, costs,
and re-run buttons.

---

## `dedup_links` — merge log

When dedup decides two `company_sources` rows actually point at the same
company, it merges them into one `companies` row and writes a `dedup_links`
record:

```sql
INSERT INTO dedup_links (record_type, kept_record_id, merged_record_id, match_strategy, confidence, decided_by)
VALUES ('company', 42, 1284, 'exact_reg_no', 1.000, 'automatic');
```

For fuzzy matches (`match_strategy='fuzzy_name_addr'`), the Portal shows them
in a "review queue" so you can approve or split them.

---

## Final Data export (what Bell.qa actually consumes)

The Final Data JSON files (`Data/Companies/4. Final Data/companies.json`, etc.)
are produced by reading from these tables with one query each:

```sql
-- Final Companies upload
SELECT
    bin,
    name, legal_name, legal_form,
    status_normalized, is_active,
    primary_registration_no, incorporation_date,
    website, email, phone, address, city, country,
    industry, sector, employee_count, founded_year,
    linkedin_url, linkedin_description, linkedin_followers,
    gmaps_place_id, gmaps_url, gmaps_rating,
    extra_fields
FROM companies
WHERE archived = false
ORDER BY bin;
```

Bell.qa upserts on `bin` so re-uploads are safe.

---

## Future migrations

When we add a new field or table, create a new file in this folder:

```
Portal/migrations/
├── 001_initial_schema.sql       ← this file
├── 002_<short_description>.sql  ← future
└── 003_<short_description>.sql  ← future
```

Each file:

1. Wraps changes in `BEGIN; ... COMMIT;`.
2. Inserts a row into `schema_migrations` at the end:
   `INSERT INTO schema_migrations (version) VALUES ('NNNN') ON CONFLICT DO NOTHING;`
3. Uses `IF NOT EXISTS` on all `CREATE` statements so it's idempotent.

The `Setup Postgres.command` installer auto-detects new files and applies them
in order, skipping anything already in `schema_migrations`.


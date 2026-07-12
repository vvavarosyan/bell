// Sync model: production is an EXACT MIRROR of the local database.
//
// All heavy data work (scraping, enrichment, dedup, ID assignment) happens on
// the local Mac. Production (Railway) does NO data operations — it just receives
// a row-for-row copy. So we mirror EVERY row of each data table (archived,
// merged, un-assembled — everything), keyed by the primary `id`.
//
// Because the row `id` is mirrored too, foreign keys (company_sources.company_id,
// person_companies.person_id/company_id, jobs.company_id) line up automatically
// on prod — no BIN/PIN resolution needed. Columns are discovered dynamically
// from the prod schema (information_schema) so the mirror never drifts when a
// migration adds a column.
//
// Tables are listed parents-first so foreign-key targets exist before children
// are inserted. Each table's `watermark` column drives incremental pushes.
// `selfRef`: a self-referential FK column (a merged-duplicate row points to its
// canonical row via this column). Rows where it IS NULL (canonical/standalone)
// must be pushed BEFORE rows where it's set, so the canonical target already
// exists when the duplicate is inserted — otherwise the FK fails across chunk
// boundaries. Dedup is one level deep (duplicate → canonical), so a single
// NULLs-first ordering is sufficient.
//
// `syncWhere` (Import Phase 2 — sync reconciliation): an extra KEEP predicate.
// A row is only pushed to prod when this SQL is true. It exists so user-
// CONTRIBUTED new entities that an admin has NOT yet promoted stay LOCAL-ONLY —
// the same doctrine as research_candidates (never grow the online DB with
// un-curated data), and, for people, the PDPPL lawyer-gate (a contributed
// person must not enter the shared/resold DB before promotion). See
// CONTRIB_EXCLUDE below.

// Rows that must NEVER reach prod until an admin promotes them: user-contributed
// new entities still awaiting (or denied) review.
//   • A company added via "+ New"/import is created HIDDEN (is_active=false) and
//     only flips to is_active=true when promoteNewEntity() runs. Rejected ones
//     stay is_active=false (also archived) — they must never appear on prod.
//   • A contributed person carries an extra_fields.private flag that is removed
//     ONLY by the (lawyer-gated) person promotion. While the flag is present the
//     person is local-only.
// Their child contacts ride the same gate via the subqueries below. Promotion
// bumps the entity's updated_at (BEFORE UPDATE touch trigger), so a promoted
// row is naturally re-selected by the next incremental push.
// NOTE on the COALESCE: `extra_fields->>'created_via'` is NULL for the vast
// majority of rows (registry/scraped data), and `NULL = 'user_contributed'` is
// NULL — not FALSE. A bare `NULL AND is_active=false` evaluates to NULL, and the
// KEEP predicate `NOT (NULL)` is also NULL, which a WHERE treats as false — so a
// normal ARCHIVED company (is_active=false, no created_via) would be wrongly
// held back from prod. COALESCE(..., false) forces two-valued logic so only
// genuine user-contributed rows are ever excluded.
export const CONTRIB_EXCLUDE = {
  companies: `COALESCE(extra_fields->>'created_via' = 'user_contributed', false) AND is_active = false`,
  people:    `COALESCE(extra_fields->>'created_via' = 'user_contributed', false) AND jsonb_exists(extra_fields, 'private')`,
};

export const MIRROR_TABLES = [
  { name: 'companies',        watermark: 'updated_at',   selfRef: 'canonical_id',
    syncWhere: `NOT (${CONTRIB_EXCLUDE.companies})` },
  { name: 'people',           watermark: 'updated_at',   selfRef: 'canonical_id',
    syncWhere: `NOT (${CONTRIB_EXCLUDE.people})` },
  { name: 'jobs',             watermark: 'updated_at'  },
  { name: 'company_sources',  watermark: 'last_seen_at' },
  { name: 'person_companies', watermark: 'updated_at'  },
  // Contact details (emails / phones / socials) live here — without these the
  // reveal feature unlocks empty records on prod. Parents (companies/people)
  // are mirrored first so the FK ids resolve. A contact is held back whenever
  // its parent entity is being held back (otherwise the FK would dangle on prod).
  { name: 'company_contacts', watermark: 'updated_at',
    syncWhere: `company_id NOT IN (SELECT id FROM companies WHERE ${CONTRIB_EXCLUDE.companies})` },
  { name: 'person_contacts',  watermark: 'updated_at',
    syncWhere: `person_id NOT IN (SELECT id FROM people WHERE ${CONTRIB_EXCLUDE.people})` },
  // Rich research data — structured facts attached to companies.
  { name: 'company_financials',   watermark: 'updated_at' },
  { name: 'company_shareholders', watermark: 'updated_at' },
  { name: 'company_partnerships', watermark: 'updated_at' },
  // What each company's website runs (Engine 6 tech-stack fingerprints) —
  // mirrored so the portal can filter/show technographics.
  { name: 'company_tech',         watermark: 'updated_at' },
  // Qatar public tenders (scraped locally via "Run Tender Scan.command"). Mirror
  // them to prod so Bella + the in-market score can use them; prod regenerates
  // the 'tender' signals from these rows. award_company_id is a soft ref (no FK),
  // so ordering doesn't matter.
  { name: 'tenders',              watermark: 'updated_at' },
  // QSE stock-exchange disclosures (scraped locally via "Run QSE Scan.command").
  // Mirrored like tenders; prod regenerates the 'disclosure' signals from these
  // rows. company_id is a soft ref (no FK), so ordering doesn't matter.
  { name: 'qse_disclosures',      watermark: 'updated_at' },
  // Qatar GIS + Real Estate (scraped via "Run Qatar GIS Scan.command"). Mirrored
  // by id like everything else. gis_landmarks.company_id + the RE tables carry no
  // FK to companies (soft refs), so table ordering doesn't matter; od_record_id
  // is provenance only (od_records is local-only and never mirrored).
  { name: 'gis_municipalities',       watermark: 'updated_at' },
  { name: 'gis_districts',            watermark: 'updated_at' },
  { name: 'gis_zones',                watermark: 'updated_at' },
  { name: 'gis_landmarks',            watermark: 'updated_at' },
  { name: 'real_estate_transactions', watermark: 'updated_at' },
  // Full cadastre + land-use (~253k + ~190k). district_id/zone_id are soft refs.
  // gis_scan_progress stays LOCAL-only (never mirrored) — it's scan bookkeeping.
  { name: 'gis_cadastre_plots',       watermark: 'updated_at' },
  { name: 'gis_landuse',              watermark: 'updated_at' },
  // Qatar Knowledge Base (crawled locally via "Run Qatar Knowledge Scan.command").
  // Mirrored so Bella + the user-facing browser can query it on prod. source_id
  // is a soft ref; knowledge_changes is the change feed.
  { name: 'knowledge_sources',        watermark: 'updated_at' },
  { name: 'knowledge_pages',          watermark: 'updated_at' },
  { name: 'knowledge_changes',        watermark: 'detected_at' },
];

export const MIRROR_TABLE_NAMES = new Set(MIRROR_TABLES.map((t) => t.name));

// Rows per HTTP chunk from the local push. The prod ingest further sub-chunks
// each multi-row INSERT to stay under Postgres's 65535-parameter limit.
export const CHUNK_SIZE = 1000;

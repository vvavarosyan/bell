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
export const MIRROR_TABLES = [
  { name: 'companies',        watermark: 'updated_at',   selfRef: 'canonical_id' },
  { name: 'people',           watermark: 'updated_at',   selfRef: 'canonical_id' },
  { name: 'jobs',             watermark: 'updated_at'  },
  { name: 'company_sources',  watermark: 'last_seen_at' },
  { name: 'person_companies', watermark: 'updated_at'  },
  // Contact details (emails / phones / socials) live here — without these the
  // reveal feature unlocks empty records on prod. Parents (companies/people)
  // are mirrored first so the FK ids resolve.
  { name: 'company_contacts', watermark: 'updated_at'  },
  { name: 'person_contacts',  watermark: 'updated_at'  },
];

export const MIRROR_TABLE_NAMES = new Set(MIRROR_TABLES.map((t) => t.name));

// Rows per HTTP chunk from the local push. The prod ingest further sub-chunks
// each multi-row INSERT to stay under Postgres's 65535-parameter limit.
export const CHUNK_SIZE = 1000;

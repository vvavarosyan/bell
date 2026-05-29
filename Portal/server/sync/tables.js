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
export const MIRROR_TABLES = [
  { name: 'companies',        watermark: 'updated_at'  },
  { name: 'people',           watermark: 'updated_at'  },
  { name: 'jobs',             watermark: 'updated_at'  },
  { name: 'company_sources',  watermark: 'last_seen_at' },
  { name: 'person_companies', watermark: 'updated_at'  },
];

export const MIRROR_TABLE_NAMES = new Set(MIRROR_TABLES.map((t) => t.name));

// Rows per HTTP chunk from the local push. The prod ingest further sub-chunks
// each multi-row INSERT to stay under Postgres's 65535-parameter limit.
export const CHUNK_SIZE = 1000;

// Ingest one registry source's latest scan file into the database.
//   node scripts/ingest_source.js QFC
// Exists because ingestSource() was reachable only through a Portal route — the ROG's
// registry validation (2026-07-23) had to hand-write an out-of-repo harness to call it.
// Scheduled registry scans run: scrape → this → done.

import { pool } from '../db.js';
import { ingestSource, SOURCE_KEYS } from '../ingest/runner.js';

// Case-insensitive: MAPPERS keys are mixed-case (MoPH, Tasmu, MadeInQatar) but a
// scheduled wrapper passes whatever case is convenient. Resolve to the canonical key.
const raw = String(process.argv[2] || '').trim();
const src = SOURCE_KEYS.find((k) => k.toLowerCase() === raw.toLowerCase());
if (!src) { console.error('Usage: node scripts/ingest_source.js <' + SOURCE_KEYS.join('|') + '>'); process.exit(1); }
try {
  const out = await ingestSource(src);
  console.log(`INGEST ${src} COMPLETE:`, JSON.stringify(out));
  process.exit(0);
} catch (e) {
  console.error(`INGEST ${src} FAILED: ` + (e.stack || e.message));
  process.exit(1);
} finally {
  await pool.end().catch(() => {});
}

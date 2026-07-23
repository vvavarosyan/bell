// Ingest one registry source's latest scan file into the database.
//   node scripts/ingest_source.js QFC
// Exists because ingestSource() was reachable only through a Portal route — the ROG's
// registry validation (2026-07-23) had to hand-write an out-of-repo harness to call it.
// Scheduled registry scans run: scrape → this → done.

import { pool } from '../db.js';
import { ingestSource } from '../ingest/runner.js';

const src = String(process.argv[2] || '').toUpperCase();
if (!src) { console.error('Usage: node scripts/ingest_source.js <QFC|QFZ|QSTP|MOCI|QSE>'); process.exit(1); }
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

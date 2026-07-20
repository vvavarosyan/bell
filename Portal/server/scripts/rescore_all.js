// One-time batched Bell Score recompute — formula v2 rollout (2026-07-20).
// ----------------------------------------------------------------------------
// Recomputes every company + person score in id-range batches so each batch is
// its own short transaction (safe to run while a harvest is writing). Only rows
// whose score actually changes are written, so untouched rows keep their
// updated_at and the sync push stays proportional to real change.
// Idempotent: re-running just heals whatever is still stale.

import { query, pool } from '../db.js';
import { COMPANY_SCORE, PERSON_SCORE } from '../assembly/bell_score.js';

const BATCH = 5000;
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`);

async function rescoreTable(table, expr) {
  const b = (await query(`SELECT COALESCE(min(id),0)::bigint AS lo, COALESCE(max(id),0)::bigint AS hi FROM ${table}`)).rows[0];
  let changed = 0, scanned = 0;
  for (let lo = Number(b.lo); lo <= Number(b.hi); lo += BATCH) {
    const r = await query(
      `UPDATE ${table} SET bell_score = ${expr}
        WHERE id >= $1 AND id < $2 AND bell_score IS DISTINCT FROM ${expr}`,
      [lo, lo + BATCH]);
    changed += r.rowCount;
    scanned += BATCH;
    if (scanned % 50000 === 0 || lo + BATCH > Number(b.hi)) {
      log(`  ${table}: through id ${Math.min(lo + BATCH, Number(b.hi))} — ${changed} rescored so far`);
    }
  }
  return changed;
}

(async () => {
  log('Bell Score full recompute (formula v2) starting…');
  const co = await rescoreTable('companies', COMPANY_SCORE);
  const pe = await rescoreTable('people', PERSON_SCORE);
  log(`DONE — ${co} companies + ${pe} people rescored.`);
  try { await pool.end(); } catch {}
  process.exit(0);
})().catch((e) => { console.error('RESCORE FAILED: ' + (e.stack || e.message)); process.exit(1); });

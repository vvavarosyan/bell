// Runner for "Run Spark Enrichment.command" — up to 5 agent runs (the free daily budget),
// each a self-sized batch of pending companies, ingested fact-by-fact. Stops honestly on
// quota/submit errors. Resumable: submission is tracked per company (companies.spark_status).

import { query } from '../db.js';
import { runOneBatch, pendingCount, currentBatchSize } from '../enrichment/spark/engine.js';

// Firecrawl's free tier allows 5 agent runs/day. We calibrate with 1, then run
// the remaining 4 concurrently — each claims a disjoint company batch atomically.

const MAX_RUNS = 5;

async function tablesReady() {
  const r = await query(`SELECT to_regclass('spark_runs') AS t`);
  return !!r.rows[0].t;
}

async function main() {
  if (!(await tablesReady())) {
    console.error('The Spark tables are missing. Fix: double-click "Open Bell.qa Portal.command" once');
    console.error('(that applies the database upgrade), then run this command again.');
    process.exitCode = 1;
    return;
  }
  const pending = await pendingCount();
  const size = await currentBatchSize();
  console.log('Companies not yet submitted to Spark: ' + pending.toLocaleString());
  console.log('Current batch size: ' + size + ' (self-adjusts based on how complete each run comes back)');
  console.log('Running up to ' + MAX_RUNS + ' agent runs (the free daily budget). Each takes ~2-10 minutes.');
  console.log('');

  let totalFacts = 0, totalCompanies = 0, runsUsed = 0, calibrated = false, stop = false;

  const okLine = (tag, r) =>
    console.log(`  ✓ ${tag}${r.returned}/${r.submitted} researched · ${r.facts} facts · ${r.empty} nothing findable · coverage ${r.coverage}% (next batch: ${r.next_batch})`);

  // PHASE 1 — calibrate: run sequentially until ONE run succeeds. This is cheap
  // insurance: if the batch size is too big for a free run, only one run refuses
  // (not all 5 at once), and the remembered ceiling shrinks it before we fan out.
  while (runsUsed < MAX_RUNS && !calibrated && !stop) {
    runsUsed += 1;
    console.log('— Calibration run ' + runsUsed + '/' + MAX_RUNS + ' —');
    const r = await runOneBatch({ onProgress: (m) => console.log('  ' + m) });
    if (r.status === 'no_pending') { console.log('  Nothing left to submit — every company has been through Spark. 🎉'); stop = true; break; }
    if (r.status === 'shrunk') { console.log('  Too big for one free run — shrinking to ' + r.next_batch + ' and retrying.'); continue; }
    if (r.status === 'submit_failed' || r.status === 'run_failed') {
      console.log('  STOPPED: ' + (r.error || r.status));
      console.log(/quota|limit|429|payment|insufficient/i.test(String(r.error || ''))
        ? '  → Today\'s free runs look used up. Re-run tomorrow — it continues automatically.'
        : '  → Re-run this command to retry (the batch went back to pending). If it repeats, copy this to Claude.');
      stop = true; break;
    }
    okLine('', r); totalFacts += r.facts; totalCompanies += r.returned; calibrated = true;
  }

  // PHASE 2 — parallel: spend the remaining daily budget concurrently (Val:
  // "cant it send 5 directly? we can run agents simultaneously"). Each run claims
  // a DISJOINT batch atomically (FOR UPDATE SKIP LOCKED), so they never overlap.
  const remaining = MAX_RUNS - runsUsed;
  if (calibrated && !stop && remaining > 0 && (await pendingCount()) > 0) {
    console.log('');
    console.log('— Running ' + remaining + ' more agent' + (remaining === 1 ? '' : 's') + ' in parallel —');
    const settled = await Promise.all(
      Array.from({ length: remaining }, (_, i) =>
        runOneBatch({ onProgress: (m) => console.log('  [agent ' + (i + 2) + '] ' + m) })
          .catch((e) => ({ status: 'error', error: e.message }))));
    for (const r of settled) {
      if (r.status === 'completed') { okLine('[parallel] ', r); totalFacts += r.facts; totalCompanies += r.returned; }
      else if (r.status === 'no_pending') console.log('  [parallel] nothing left to submit.');
      else if (r.status === 'shrunk') console.log('  [parallel] one run hit "max credits" — its companies went back to pending (retry next time).');
      else console.log('  [parallel] ' + r.status + ': ' + (r.error || '') + ' — its companies went back to pending.');
    }
  }

  const left = await pendingCount();
  const disc = (await query(`SELECT count(*)::int AS n, count(*) FILTER (WHERE country ILIKE '%qatar%')::int AS qa FROM spark_discoveries WHERE status='new'`)).rows[0];
  console.log('');
  console.log('SESSION TOTAL: ' + totalCompanies + ' companies enriched, ' + totalFacts + ' facts added.');
  console.log('Discovered companies awaiting review: ' + disc.n + ' (' + disc.qa + ' look like Qatar companies).');
  console.log('Still to submit overall: ' + left.toLocaleString());
  console.log('');
  console.log('Data stays on this Mac; run "Push Changes.command" (or ask Claude) when you want it on the live site.');
}

main().catch((e) => {
  console.error('ERROR: ' + (e.message || e));
  console.error('Just re-run the command — submission is tracked per company and it resumes.');
  process.exitCode = 1;
});

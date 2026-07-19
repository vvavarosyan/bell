// Runner for "Run Spark Enrichment.command" — up to 5 agent runs (the free daily budget),
// each a self-sized batch of pending companies, ingested fact-by-fact. Stops honestly on
// quota/submit errors. Resumable: submission is tracked per company (companies.spark_status).

import { query } from '../db.js';
import { runOneBatch, pendingCount, currentBatchSize } from '../enrichment/spark/engine.js';

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

  let totalFacts = 0, totalCompanies = 0;
  for (let i = 1; i <= MAX_RUNS; i += 1) {
    console.log('— Run ' + i + '/' + MAX_RUNS + ' —');
    const r = await runOneBatch({ onProgress: (m) => console.log('  ' + m) });
    if (r.status === 'no_pending') { console.log('  Nothing left to submit — every company has been through Spark. 🎉'); break; }
    if (r.status === 'shrunk') {
      console.log('  Batch was too big for one free run ("max credits") — shrinking to ' + r.next_batch + ' and retrying with the next run.');
      continue;
    }
    if (r.status === 'submit_failed' || r.status === 'run_failed') {
      console.log('  STOPPED: ' + (r.error || r.status));
      if (/quota|limit|429|payment|insufficient/i.test(String(r.error || ''))) {
        console.log('  → Looks like today\'s free runs are used up. Re-run tomorrow — it continues automatically.');
      } else {
        console.log('  → Re-run this command to retry (the batch went back to pending). If it repeats, copy this output to Claude.');
      }
      break;
    }
    console.log(`  ✓ ${r.returned}/${r.submitted} companies researched · ${r.facts} facts ingested · ${r.empty} had nothing findable · coverage ${r.coverage}% (next batch: ${r.next_batch})`);
    totalFacts += r.facts;
    totalCompanies += r.returned;
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

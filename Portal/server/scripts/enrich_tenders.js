// Enrich tender details — run via "Enrich Tender Details.command".
//
// Fills in each Monaqasat tender's full detail (activity codes, procurement
// contact, contract duration, description) with the CORRECT pairing that the
// Repair established. Reads "pending" straight from the DB and commits each row
// as it goes, so it is FULLY RESUMABLE: close it / Ctrl-C at any moment and
// re-run — it continues from exactly where it stopped, never redoing finished
// tenders and never re-walking the card list.
//
// (This is the lean follow-up to the Repair. The heavier "Backfill Full Tender
// Archive.command" also re-walks every card first; after a Repair you don't need
// that — just this.)

import { enrichPendingTenders, pendingDetailCount } from '../tenders/enrich.js';
import { pushTendersToProd } from '../tenders/push_prod.js';
import { closeRenderer } from '../enrichment/local/render.js';
import { ramSafeConcurrency } from '../tenders/scrape_monaqasat.js';

const CONCURRENCY = ramSafeConcurrency(process.env.BELL_TENDER_CONCURRENCY);
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

(async () => {
  console.log('Bell — Enrich Tender Details (Monaqasat)');
  console.log('Fills each tender\'s full detail: activity codes, contact, contract, description.');
  console.log(`Runs ${CONCURRENCY} in parallel · RESUMABLE — safe to close / Ctrl-C anytime and re-run; it continues where it stopped.\n`);
  try {
    const pending = await pendingDetailCount('monaqasat');
    if (pending === 0) {
      console.log('Nothing pending — every tender already has its detail. ✓');
      try { await closeRenderer(); } catch { /* ignore */ }
      process.exit(0);
    }
    console.log(`${pending.toLocaleString()} tenders still need detail. Working…`);
    const t0 = Date.now();
    const en = await enrichPendingTenders({
      concurrency: CONCURRENCY,
      onProgress: ({ done, total, enriched }) => {
        const el = (Date.now() - t0) / 1000, rate = done / Math.max(el, 1), eta = rate > 0 ? (total - done) / rate : 0;
        const pct = total ? Math.round((done / total) * 100) : 100;
        process.stdout.write(`\r  ${done.toLocaleString()}/${total.toLocaleString()} (${pct}%) · ${enriched.toLocaleString()} detailed · ~${fmtDur(eta)} left      `);
      },
    });
    console.log(`\n  Detail captured for ${en.enriched.toLocaleString()} · ${en.remaining.toLocaleString()} still pending · ${fmtDur((Date.now() - t0) / 1000)}`);

    console.log('\nPublishing to the live site (app.bell.qa)…');
    const push = await pushTendersToProd();
    if (push.error) console.log('  ⚠ Push failed: ' + push.error + '\n    (Saved locally — open the portal Sync tab → Push to retry.)');
    else if (push.skipped) console.log('  ⚠ ' + push.skipped);
    else console.log('  ✓ Pushed ' + push.pushed.toLocaleString() + ' tenders live.');

    if (en.remaining > 0) console.log(`\n${en.remaining.toLocaleString()} still pending (site timeouts / you interrupted it). Run this again to continue — it resumes automatically.`);
    else console.log('\nDone — every Monaqasat tender now has its full, correctly-paired detail.');
  } catch (err) {
    console.error('\nEnrich failed: ' + (err.message || err));
    console.error('(Progress is saved — re-running continues where it left off.)');
  } finally {
    try { await closeRenderer(); } catch { /* ignore */ }
    process.exit(0);
  }
})();

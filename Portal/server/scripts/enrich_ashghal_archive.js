// Standalone Ashghal FULL detail enrichment — run via "Enrich Ashghal Details.command".
//
// The routine Ashghal scan enriches OPEN tenders only (the cheap, actionable
// set — those are done). This opt-in pass fills the detail for the ~2,800
// closed/archived tenders too: real description, Tender Bond, Document Fees,
// fuller Category. Needs the Crawl4AI engine running (browser rendering,
// concurrency-capped for the 8GB Mac). HOURS on first run — fully resumable,
// close the window anytime and re-run later; it continues where it stopped.

import { enrichAshghalDetails, pendingAshghalDetailCount } from '../tenders/enrich_ashghal.js';
import { pushTendersToProd } from '../tenders/push_prod.js';

(async () => {
  console.log('Bell — Ashghal FULL Detail Enrichment (open + closed + archived)');
  try {
    const pending = await pendingAshghalDetailCount({ scope: 'all' });
    console.log(pending.toLocaleString() + ' tenders still need detail. Working…\n');
    if (pending > 0) {
      const r = await enrichAshghalDetails({ scope: 'all', onProgress: (m) => console.log(m) });
      console.log('\nDetailed ' + (r.enriched ?? 0).toLocaleString() + ' · failed (retry next run) ' + (r.failed ?? 0));
    }
    console.log('\nPublishing to the live site (app.bell.qa)…');
    const push = await pushTendersToProd();
    if (push.error) console.log('  ⚠ Push failed: ' + push.error);
    else if (push.skipped) console.log('  ⚠ ' + push.skipped);
    else console.log('  ✓ Pushed ' + push.pushed.toLocaleString() + ' tenders live.');
  } catch (err) {
    console.error('Run failed: ' + (err.message || err));
  } finally {
    process.exit(0);
  }
})();

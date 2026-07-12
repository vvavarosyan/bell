// Standalone Kahramaa tender scan — run via "Run Kahramaa Scan.command".
//
// Kahramaa (km.qa) publishes its tenders + business awards through a JSON web
// service — plain fetch, NO browser or Crawl4AI needed. Captures the full
// tender archive (open + closed, ~1,650) and every award category WITH the
// winning company and amount, ingests them (source='kahramaa'), links winners
// to Bell companies, and publishes live. Idempotent — safe to re-run anytime.

import { runTenderScan } from '../tenders/scrape.js';
import { pushTendersToProd } from '../tenders/push_prod.js';
import { enrichKahramaaDetails, pendingKahramaaDetailCount } from '../tenders/enrich_kahramaa.js';

(async () => {
  console.log('Bell — Kahramaa Tender Scan');
  console.log('Fetching Kahramaa tenders (full archive) + business awards with winners…');
  console.log('Plain web-service fetch — about 1–2 minutes.\n');
  try {
    const out = await runTenderScan({ sources: ['kahramaa'] });
    const r = out.sources.kahramaa || {};
    if (r.error) {
      console.log('  kahramaa: ERROR — ' + r.error);
    } else {
      console.log('  ' + (r.scraped || 0).toLocaleString() + ' scraped · ' + (r.inserted || 0).toLocaleString() +
        ' new · ' + (r.updated || 0).toLocaleString() + ' updated · ' + (r.linked || 0).toLocaleString() +
        ' winners linked to companies');
    }
    if (out.sample && out.sample[0]) {
      const s = out.sample[0];
      console.log('\nSample — first tender captured:');
      console.log('  ' + s.source_ref + '  ' + String(s.title || '').slice(0, 66));
      console.log('  Status: ' + s.status + (s.award_company_name ? ('  ·  Winner: ' + s.award_company_name) : ''));
    }
    // Per-tender Details pages (department, purchase windows, bid bond +
    // validity, full description, notes — everything the source publishes,
    // captured verbatim). Also corrects status + the true submission deadline.
    // Plain fetch, resumable; first run covers the archive (~6 min).
    const pending = await pendingKahramaaDetailCount();
    if (pending > 0) {
      console.log('\n' + pending.toLocaleString() + ' tender detail page(s) to fetch…');
      const d = await enrichKahramaaDetails({ onProgress: (m) => console.log(m) });
      console.log('  ' + d.enriched.toLocaleString() + ' detailed · ' + d.failed + ' will retry next run');
    }

    if ((r.scraped || 0) === 0) {
      console.log('\n⚠ Nothing scraped. km.qa may be temporarily unreachable — try again shortly.');
    } else {
      console.log('\nSending Kahramaa tenders to the live site (app.bell.qa)…');
      const push = await pushTendersToProd();
      if (push.error) console.log('  ⚠ Push failed: ' + push.error + '\n    (Saved locally — open the portal Sync tab → Push to retry.)');
      else if (push.skipped) console.log('  ⚠ ' + push.skipped);
      else console.log('  ✓ Pushed ' + push.pushed.toLocaleString() + ' tenders live. In the portal, filter Tenders by Source → Kahramaa.');
    }
  } catch (err) {
    console.error('Scan failed: ' + (err.message || err));
  } finally {
    process.exit(0);
  }
})();

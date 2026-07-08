// Standalone Ashghal tender scan — run via "Run Ashghal Scan.command".
//
// Scrapes Ashghal (Public Works Authority) end-to-end from ashghal.gov.qa and
// publishes to the live site:
//   • LIST pages — e-Tenders (GTC/STC) + General, Open / Closed / Archived,
//     walked across every PageIndex page (~2,900 tenders).
//   • AWARDED winner/bidder tables — the winning contractor + all bidders +
//     prices + ICV + rank (Monaqasat hides these); winner → company linkage.
//   • PROSPECTED — upcoming projects Ashghal intends to tender, by quarter.
//   • per-tender DETAIL for open tenders — bond, document fees, description.
//
// Runs on the LOCAL engine: lists/prospected/detail render through Crawl4AI; the
// awarded tables are driven with the local Playwright browser (postback clicks),
// so that section needs "Install Harvester Browser.command" too. Everything is
// idempotent — safe to re-run.

import { runTenderScan } from '../tenders/scrape.js';
import { closeRenderer } from '../enrichment/local/render.js';
import { pushTendersToProd } from '../tenders/push_prod.js';
import { enrichAshghalDetails, pendingAshghalDetailCount } from '../tenders/enrich_ashghal.js';

(async () => {
  console.log('Bell — Ashghal Tender Scan (Public Works Authority)');
  console.log('Lists (Open/Closed/Archived) + Awarded winners + Prospected projects from ashghal.gov.qa…');
  console.log('This walks the full archive, so it can take several minutes. Safe to re-run.\n');
  try {
    const out = await runTenderScan({ sources: ['ashghal'] });
    const r = out.sources.ashghal || {};
    if (r.error) {
      console.log('  ashghal: ERROR — ' + r.error);
    } else {
      console.log('  ' + (r.scraped || 0).toLocaleString() + ' scraped · ' + (r.inserted || 0).toLocaleString() +
        ' new · ' + (r.updated || 0).toLocaleString() + ' updated · ' + (r.linked || 0).toLocaleString() +
        ' winners linked to companies');
    }

    if (out.sample && out.sample[0]) {
      const s = out.sample[0]; const raw = s.raw || {};
      console.log('\nSample — first tender captured:');
      console.log('  ' + s.source_ref + '  ' + String(s.title || '').slice(0, 70));
      console.log('  Buyer: ' + (s.buyer || '—') + '  ·  Status: ' + s.status + '  ·  Section: ' + (raw.section || '—'));
    }

    if ((r.scraped || 0) === 0) {
      console.log('\n⚠ Nothing scraped. Is the Crawl4AI engine running?');
      console.log('  Run "Install Crawl4AI Engine.command" or "Restart Crawl4AI Engine.command", then try again.');
      console.log('  (The Awarded winner tables also need the local browser — "Install Harvester Browser.command".)');
    } else {
      // Per-tender detail for OPEN tenders (the actionable set) — resumable.
      const pend = await pendingAshghalDetailCount({ scope: 'open' }).catch(() => 0);
      if (pend > 0) {
        console.log('\nFilling detail for ' + pend.toLocaleString() + ' open tenders (bond, document fees, description)…');
        const en = await enrichAshghalDetails({
          scope: 'open',
          onProgress: ({ done, total }) => process.stdout.write('\r  ' + done + '/' + total + '        '),
        });
        console.log('\n  Detail captured for ' + en.enriched.toLocaleString() + ' · ' + en.failed.toLocaleString() + ' without detail');
      }

      console.log('\nSending Ashghal tenders to the live site (app.bell.qa)…');
      const push = await pushTendersToProd();
      if (push.error) console.log('  ⚠ Push failed: ' + push.error + '\n    (Saved locally — open the portal Sync tab → Push to retry.)');
      else if (push.skipped) console.log('  ⚠ ' + push.skipped);
      else console.log('  ✓ Pushed ' + push.pushed.toLocaleString() + ' tenders live. In the portal, filter Tenders by Source → Ashghal.');
    }
  } catch (err) {
    console.error('Scan failed: ' + (err.message || err));
  } finally {
    try { await closeRenderer(); } catch { /* ignore */ }
    process.exit(0);
  }
})();

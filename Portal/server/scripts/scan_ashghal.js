// Standalone Ashghal tender scan — run via "Run Ashghal Scan.command".
//
// Scrapes Ashghal's (Public Works Authority) own e-Tenders + General tender
// LIST pages (Open + Closed) from ashghal.gov.qa, ingests them into the shared
// `tenders` table (source='ashghal'), and publishes to the live site. Needs the
// local Crawl4AI engine (renders the government site).
//
// STAGE 2 (fresh session): the Awarded winner/bidder tables, Prospected
// (upcoming) and Pre-Qualification/EOI pages, plus per-tender detail.

import { runTenderScan } from '../tenders/scrape.js';
import { closeRenderer } from '../enrichment/local/render.js';
import { pushTendersToProd } from '../tenders/push_prod.js';

(async () => {
  console.log('Bell — Ashghal Tender Scan (Public Works Authority)');
  console.log('Scraping Ashghal e-Tenders + General tenders (Open + Closed) from ashghal.gov.qa…\n');
  try {
    const out = await runTenderScan({ sources: ['ashghal'] });
    const r = out.sources.ashghal || {};
    if (r.error) console.log('  ashghal: ERROR — ' + r.error);
    else console.log('  ashghal: ' + r.scraped + ' scraped · ' + r.inserted + ' new · ' + r.updated + ' updated · ' + r.linked + ' linked to companies');

    if (out.sample && out.sample[0]) {
      const s = out.sample[0]; const raw = s.raw || {};
      console.log('\nSample — first tender captured:');
      console.log('  ' + s.source_ref + '  ' + String(s.title || '').slice(0, 72));
      console.log('  Buyer: ' + (s.buyer || '—') + '  ·  Type: ' + (raw.type || '—') + '  ·  Status: ' + s.status);
      console.log('  Published: ' + (s.published_at ? s.published_at.slice(0, 10) : '—') + '  ·  Closing: ' + (s.deadline_at ? s.deadline_at.slice(0, 10) : '—'));
    }

    if ((r.scraped || 0) === 0) {
      console.log('\n⚠ Nothing scraped. Is the Crawl4AI engine running?');
      console.log('  Run "Install Crawl4AI Engine.command" or "Restart Crawl4AI Engine.command", then try again.');
    } else {
      console.log('\nSending tenders to the live site (app.bell.qa)…');
      const push = await pushTendersToProd();
      if (push.error) console.log('  ⚠ Push failed: ' + push.error + '\n    (Saved locally — open the portal Sync tab → Push to retry.)');
      else if (push.skipped) console.log('  ⚠ ' + push.skipped);
      else console.log('  ✓ Pushed ' + push.pushed.toLocaleString() + ' tenders live. Ask Bella "recent Ashghal tenders" to see them.');
    }
  } catch (err) {
    console.error('Scan failed: ' + (err.message || err));
  } finally {
    try { await closeRenderer(); } catch { /* ignore */ }
    process.exit(0);
  }
})();

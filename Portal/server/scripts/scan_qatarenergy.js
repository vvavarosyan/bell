// Standalone QatarEnergy tender scan — run via "Run QatarEnergy Scan.command".
//
// QatarEnergy publishes its tenders through a JSON web service (no HTML scraping,
// no postbacks), so — unlike the Monaqasat/Ashghal scans — this does NOT need the
// Crawl4AI engine or any browser. It's a plain fetch. Captures the open (Latest)
// + upcoming (Future) tenders and all three AWARDED types (Contracts / POs /
// Agreements), each carrying the winning contractor, ingests them
// (source='qatarenergy'), links winners to Bell companies, and publishes live.

import { runTenderScan } from '../tenders/scrape.js';
import { pushTendersToProd } from '../tenders/push_prod.js';

(async () => {
  console.log('Bell — QatarEnergy Tender Scan');
  console.log('Fetching QatarEnergy tenders (open + upcoming + awarded contracts / POs / agreements)…');
  console.log('No Crawl4AI needed — this is a quick web-service fetch.\n');
  try {
    const out = await runTenderScan({ sources: ['qatarenergy'] });
    const r = out.sources.qatarenergy || {};
    if (r.error) {
      console.log('  qatarenergy: ERROR — ' + r.error);
    } else {
      console.log('  ' + (r.scraped || 0).toLocaleString() + ' scraped · ' + (r.inserted || 0).toLocaleString() +
        ' new · ' + (r.updated || 0).toLocaleString() + ' updated · ' + (r.linked || 0).toLocaleString() +
        ' winners linked to companies');
    }

    if (out.sample && out.sample[0]) {
      const s = out.sample[0]; const raw = s.raw || {};
      console.log('\nSample — first tender captured:');
      console.log('  ' + s.source_ref + '  ' + String(s.title || '').slice(0, 66));
      console.log('  Buyer: ' + (s.buyer || '—') + '  ·  Status: ' + s.status + '  ·  Section: ' + (raw.section || '—') +
        (s.award_company_name ? ('  ·  Winner: ' + s.award_company_name) : ''));
    }

    if ((r.scraped || 0) === 0) {
      console.log('\n⚠ Nothing scraped. QatarEnergy\'s tender service may be temporarily unreachable — try again shortly.');
    } else {
      console.log('\nSending QatarEnergy tenders to the live site (app.bell.qa)…');
      const push = await pushTendersToProd();
      if (push.error) console.log('  ⚠ Push failed: ' + push.error + '\n    (Saved locally — open the portal Sync tab → Push to retry.)');
      else if (push.skipped) console.log('  ⚠ ' + push.skipped);
      else console.log('  ✓ Pushed ' + push.pushed.toLocaleString() + ' tenders live. In the portal, filter Tenders by Source → QatarEnergy.');
    }
  } catch (err) {
    console.error('Scan failed: ' + (err.message || err));
  } finally {
    process.exit(0);
  }
})();

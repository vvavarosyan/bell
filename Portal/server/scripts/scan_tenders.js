// Standalone tender scan — run via "Run Tender Scan.command".
//
// Renders + parses the live public tender sources on THIS machine (needs the
// local Crawl4AI engine for the browser session), ingests them into the
// `tenders` table, and fuzzy-links award recipients to Bell companies. The
// signals engine then turns awarded, linked tenders into 'tender' signals.

import { runTenderScan, tenderSources } from '../tenders/scrape.js';
import { closeRenderer } from '../enrichment/local/render.js';

(async () => {
  console.log('Bell — Tender Scan');
  console.log('Sources: ' + tenderSources().join(', '));
  const pages = Number(process.env.BELL_TENDER_PAGES) || 2;
  console.log('Pages per source: ' + pages + '\n');
  try {
    const out = await runTenderScan({ pages });
    console.log('Result:');
    for (const [src, r] of Object.entries(out.sources)) {
      if (r.error) console.log('  ' + src + ': ERROR — ' + r.error);
      else console.log('  ' + src + ': ' + r.scraped + ' scraped · ' + r.inserted + ' new · ' + r.updated + ' updated · ' + r.linked + ' linked to companies');
    }
    console.log('\nTotal: ' + out.total.scraped + ' scraped, ' + out.total.inserted + ' new, ' + out.total.updated + ' updated, ' + out.total.linked + ' linked.');
    if (out.total.scraped === 0) {
      console.log('\n⚠ Nothing scraped. Is the Crawl4AI engine running?');
      console.log('  Run "Install Crawl4AI Engine.command" or "Restart Crawl4AI Engine.command", then try again.');
    }
  } catch (err) {
    console.error('Scan failed: ' + (err.message || err));
  } finally {
    try { await closeRenderer(); } catch { /* ignore */ }
    process.exit(0);
  }
})();

// ONE-TIME repair — run via "Repair Tenders (fix links).command".
//
// The first scrape paired each listing card to a detail page BY INDEX, and the
// two lists drifted, so many tenders were linked to the WRONG detail page (their
// activity codes / contact / contract came from a different tender). The parser
// now pairs by TITLE (verified 20/20 correct on live data). This script:
//   1. Re-scans every card with the corrected pairing (also completes the
//      archive via the hardened page-walk) and upserts by tender number, so the
//      correct detail_id replaces the wrong one — row ids stay stable.
//   2. CLEARS the stale (wrongly-paired) detail fields, so nothing inaccurate is
//      shown — tenders fall back to correct card info until re-enriched.
//   3. Publishes the corrected data to production.
// Fast (~30–45 min, no detail fetching). Afterwards run the Backfill to
// re-capture correct detail (activity codes, contact) — it's resumable.

import { scrapeMonaqasat } from '../tenders/scrape_monaqasat.js';
import { ingestTenders } from '../tenders/ingest.js';
import { pushTendersToProd } from '../tenders/push_prod.js';
import { closeRenderer } from '../enrichment/local/render.js';
import { query } from '../db.js';

(async () => {
  console.log('Bell — Repair Tender Links (Monaqasat)');
  console.log('Re-pairs every tender to its CORRECT detail page (by title) + clears stale detail.\n');
  try {
    console.log('Step 1/3 — re-scanning all cards with the corrected pairing…');
    const rows = await scrapeMonaqasat({ openPages: 60, awardedPages: 1200, details: false });
    if (!rows.length) {
      console.log('\n⚠ Nothing scraped. Is the Crawl4AI engine running?');
      console.log('  Run "Install Crawl4AI Engine.command" or "Restart Crawl4AI Engine.command", then try again.');
      try { await closeRenderer(); } catch { /* ignore */ }
      process.exit(0);
    }
    const linked = rows.filter((r) => r.raw && r.raw.detail_id).length;
    const ing = await ingestTenders(rows);
    console.log(`  ${rows.length} cards · ${ing.inserted} new · ${ing.updated} updated · ${linked}/${rows.length} correctly linked to their detail page`);

    console.log('\nStep 2/3 — clearing stale (wrongly-paired) detail…');
    const cl = await query(
      `UPDATE tenders
          SET raw = raw - 'activities' - 'contact_email' - 'contract_months' - 'contract_days' - 'entity_ref',
              updated_at = now()
        WHERE source = 'monaqasat'`,
    );
    console.log(`  cleared old detail on ${cl.rowCount} tenders — they now show correct card info; full detail re-fills via the Backfill`);

    console.log('\nStep 3/3 — publishing corrected data to the live site (app.bell.qa)…');
    const push = await pushTendersToProd();
    if (push.error) console.log('  ⚠ Push failed: ' + push.error + '\n    (Saved locally — open the portal Sync tab → Push to retry.)');
    else if (push.skipped) console.log('  ⚠ ' + push.skipped);
    else console.log('  ✓ Pushed ' + push.pushed.toLocaleString() + ' corrected tenders live.');

    console.log('\nDone — links + card data are now correct across the archive.');
    console.log('Next: run "Backfill Full Tender Archive.command" to re-capture full detail (activity codes, contact) with the correct pairing. It is resumable.');
  } catch (err) {
    console.error('Repair failed: ' + (err.message || err));
  } finally {
    try { await closeRenderer(); } catch { /* ignore */ }
    process.exit(0);
  }
})();

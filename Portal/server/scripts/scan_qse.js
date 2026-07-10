// Standalone QSE disclosures scan — run via "Run QSE Scan.command".
//
// Captures, for the ~54 QSE-listed companies (qe.com.qa): the newest exchange
// announcements per company (financial results, dividends, board changes, AGMs,
// buybacks…), the financial-statement documents for this year + last year, and
// the exchange's market notices. Everything is a plain fetch — NO browser, NO
// Crawl4AI — so it is safe to run any time, even while an enrich is running.
// Idempotent: re-running never duplicates (each row keys on the exchange's own
// stable id). Ingests locally, links companies conservatively, publishes live.

import { scrapeQse } from '../qse/scrape_qse.js';
import { ingestQseDisclosures, linkQseCompanies, pushQseToProd, qseTableReady } from '../qse/ingest_qse.js';

(async () => {
  console.log('Bell — QSE Disclosures Scan (Qatar Stock Exchange)');
  console.log('Plain web fetch — no browser needed. About 2–3 minutes.\n');
  try {
    if (!(await qseTableReady())) {
      console.log('⚠ The local database does not have the QSE table yet.');
      console.log('  Fix: double-click "Open Bell.qa Portal.command" once (it applies the');
      console.log('  database upgrade on startup), then run this scan again.');
      return;
    }
    const year = new Date().getFullYear();
    const { companies, rows, errors } = await scrapeQse({
      years: [year, year - 1],
      onProgress: (m) => console.log('  ' + m),
    });

    const byType = rows.reduce((a, r) => { a[r.dtype] = (a[r.dtype] || 0) + 1; return a; }, {});
    console.log('\nScraped: ' + rows.length.toLocaleString() + ' rows from ' + companies.length + ' listed companies');
    console.log('  announcements: ' + (byType.news || 0) + ' · financial statements: ' + (byType.financial_statement || 0) + ' · market notices: ' + (byType.market_notice || 0));

    const ing = await ingestQseDisclosures(rows);
    const link = await linkQseCompanies();
    console.log('Saved: ' + ing.inserted + ' new · ' + ing.updated + ' updated · ' + ing.skipped + ' skipped · ' + link.linked + ' newly linked to Bell companies');

    if (rows.length && rows[0]) {
      const s = rows.find((r) => r.dtype === 'news') || rows[0];
      console.log('\nSample — newest announcement captured:');
      console.log('  [' + (s.symbol || '—') + '] ' + String(s.headline || '').slice(0, 90));
      console.log('  Category: ' + (s.category || '—') + '  ·  Published: ' + (s.published_at || '—'));
    }

    if (errors.length) {
      console.log('\n⚠ ' + errors.length + ' fetch problem(s) — first few:');
      for (const e of errors.slice(0, 5)) console.log('    · ' + e);
      console.log('  (Re-run any time; the scan picks up whatever it missed.)');
    }

    if (!rows.length) {
      console.log('\n⚠ Nothing scraped. qe.com.qa may be temporarily unreachable — try again shortly.');
    } else {
      console.log('\nSending QSE disclosures to the live site (app.bell.qa)…');
      const push = await pushQseToProd();
      if (push.error && /unknown_table|not a mirror table/.test(push.error)) console.log('  ⚠ The live site does not have the QSE update yet — everything is saved locally.\n    Deploy first (Push Changes.command, then Open Production Release.command), then re-run this scan to publish.');
      else if (push.error) console.log('  ⚠ Push failed: ' + push.error + '\n    (Saved locally — they will also ride the next full Sync push.)');
      else if (push.skipped) console.log('  ⚠ ' + push.skipped);
      else console.log('  ✓ Pushed ' + push.pushed.toLocaleString() + ' disclosures live. New "Disclosures" signals appear in Signals within ~15 minutes.');
    }
  } catch (err) {
    console.error('Scan failed: ' + (err.message || err));
  } finally {
    process.exit(0);
  }
})();

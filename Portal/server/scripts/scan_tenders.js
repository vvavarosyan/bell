// Standalone tender scan — run via "Run Tender Scan.command".
//
// Renders + parses the live public tender sources on THIS machine (needs the
// local Crawl4AI engine for the browser session), ingests them into the
// `tenders` table, and fuzzy-links award recipients to Bell companies. The
// signals engine then turns awarded, linked tenders into 'tender' signals.

import { runTenderScan, tenderSources } from '../tenders/scrape.js';
import { closeRenderer } from '../enrichment/local/render.js';
import { pushTendersToProd } from '../tenders/push_prod.js';

(async () => {
  console.log('Bell — Tender Scan');
  console.log('Sources: ' + tenderSources().join(', '));
  const awardedPages = process.env.BELL_TENDER_AWARDED_PAGES ? Number(process.env.BELL_TENDER_AWARDED_PAGES) : 15;
  const details = process.env.BELL_TENDER_DETAILS !== '0';
  console.log('Scope: every OPEN tender + the ' + awardedPages + ' most-recent AWARDED pages · detail: ' + (details ? 'on (full)' : 'off (cards only)'));
  console.log('(Recurring/fresh scan — a few minutes. For the FULL awarded history, run "Backfill Full Tender Archive.command".)\n');
  try {
    const out = await runTenderScan({ openPages: 60, awardedPages, details });
    console.log('Result:');
    for (const [src, r] of Object.entries(out.sources)) {
      if (r.error) console.log('  ' + src + ': ERROR — ' + r.error);
      else console.log('  ' + src + ': ' + r.scraped + ' scraped · ' + r.inserted + ' new · ' + r.updated + ' updated · ' + r.linked + ' linked to companies');
    }
    // Show a sample so you can eyeball what was captured before it goes live.
    if (out.sample && out.sample[0]) {
      const s = out.sample[0]; const raw = s.raw || {};
      console.log('\nSample — first tender captured:');
      console.log('  ' + s.source_ref + '  ' + String(s.title || '').slice(0, 72));
      console.log('  Buyer: ' + (s.buyer || '—') + '  ·  Type: ' + (raw.type || '—') + '  ·  Status: ' + s.status);
      console.log('  Published: ' + (s.published_at ? s.published_at.slice(0, 10) : '—') + '  ·  Closing: ' + (s.deadline_at ? s.deadline_at.slice(0, 10) : '—'));
      console.log('  Tender bond: ' + (raw.tender_bond ?? '—') + ' QAR  ·  Docs value: ' + (raw.documents_value ?? '—') + ' QAR');
      console.log('  Activities captured: ' + (raw.activities ? raw.activities.length : 0) + (raw.contact_email ? '  ·  Contact: ' + raw.contact_email : '') + (raw.contract_months ? '  ·  Contract: ' + raw.contract_months + 'mo' : ''));
      if (s.award_company_name) console.log('  Awarded to: ' + s.award_company_name);
      console.log('  Detail page: ' + s.url);
    }
    console.log('\nTotal: ' + out.total.scraped + ' scraped, ' + out.total.inserted + ' new, ' + out.total.updated + ' updated, ' + out.total.linked + ' linked.');
    if (out.total.scraped === 0) {
      console.log('\n⚠ Nothing scraped. Is the Crawl4AI engine running?');
      console.log('  Run "Install Crawl4AI Engine.command" or "Restart Crawl4AI Engine.command", then try again.');
    } else {
      // Publish to the live site so Bella + the Signals in-market score see them.
      console.log('\nSending tenders to the live site (app.bell.qa)…');
      const push = await pushTendersToProd();
      if (push.error) console.log('  ⚠ Push failed: ' + push.error + '\n    (Saved locally — open the portal Sync tab → Push to retry.)');
      else if (push.skipped) console.log('  ⚠ ' + push.skipped + '\n    (Saved locally; run the portal Sync tab → Push to publish them.)');
      else console.log('  ✓ Pushed ' + push.pushed + ' tenders live. Ask Bella "recent Qatar tenders" to see them.');
    }
  } catch (err) {
    console.error('Scan failed: ' + (err.message || err));
  } finally {
    try { await closeRenderer(); } catch { /* ignore */ }
    process.exit(0);
  }
})();

// Standalone tender scan — run via "Run Tender Scan.command".
//
// Renders + parses the live public tender sources on THIS machine (needs the
// local Crawl4AI engine for the browser session), ingests them into the
// `tenders` table, and fuzzy-links award recipients to Bell companies. The
// signals engine then turns awarded, linked tenders into 'tender' signals.

import { runTenderScan, tenderSources } from '../tenders/scrape.js';
import { closeRenderer } from '../enrichment/local/render.js';
import { query } from '../db.js';
import { getKey } from '../keychain.js';

// Mirror the local tenders straight to production (app.bell.qa) using the same
// sync token the data sync uses — so Bella + the Signals in-market score see
// them without a separate Sync-tab step. Safe to run every scan (small table).
async function pushTendersToProd() {
  const token = await getKey('sync-token');
  if (!token) return { skipped: 'no sync token yet (set it once in the portal Sync tab)' };
  const s = await query(`SELECT value FROM settings WHERE key = 'sync_target_url'`).catch(() => ({ rows: [] }));
  const base = String((s.rows[0] && s.rows[0].value) || process.env.BDI_SYNC_TARGET_URL || 'https://app.bell.qa').replace(/\/+$/, '');
  const rows = (await query(`SELECT * FROM tenders ORDER BY id`)).rows;
  if (!rows.length) return { pushed: 0 };
  let pushed = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetch(base + '/api/sync/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ table: 'tenders', mode: 'full', rows: chunk }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); return { error: 'prod HTTP ' + res.status + ' ' + t.slice(0, 140) }; }
    const b = await res.json().catch(() => ({}));
    pushed += b.upserted || 0;
  }
  return { pushed, target: base };
}

(async () => {
  console.log('Bell — Tender Scan');
  console.log('Sources: ' + tenderSources().join(', '));
  const pages = process.env.BELL_TENDER_PAGES ? Number(process.env.BELL_TENDER_PAGES) : undefined;   // undefined → every page
  console.log('Pages per source: ' + (pages || 'all') + ' · detail pages: ' + (process.env.BELL_TENDER_DETAILS === '0' ? 'off (card fields only)' : 'on (full detail)'));
  console.log('(Walking every page and opening each tender for full detail — this can take a few minutes. Please leave the window open.)\n');
  try {
    const out = await runTenderScan({ pages });
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

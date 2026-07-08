// Full tender-archive backfill — run via "Backfill Full Tender Archive.command".
//
// ONE PASS over Monaqasat's entire awarded history (~1,169 pages ≈ 23k tenders)
// plus every open tender, capturing FULL detail (activity codes, procurement
// contact, contract terms) for each. Val chose the one-pass archive 2026-07-05.
//
// Three steps:
//   1. Walk every list page → card fields for all tenders (fast, one-time).
//   2. Open each tender's detail page IN PARALLEL (concurrency pool) and write
//      the detail back. This is the long part (~2–4h) but resumable: it only
//      touches tenders that don't have detail yet, so if it stops (Mac sleeps,
//      Crawl4AI hiccup, you close the window) just run it again — it resumes.
//   3. Push the whole table to production (app.bell.qa).
//
// Needs the local Crawl4AI engine running the whole time.

import { scrapeMonaqasat, ramSafeConcurrency } from '../tenders/scrape_monaqasat.js';
import { ingestTenders } from '../tenders/ingest.js';
import { enrichPendingTenders, pendingDetailCount } from '../tenders/enrich.js';
import { pushTendersToProd } from '../tenders/push_prod.js';
import { closeRenderer } from '../enrichment/local/render.js';

const CONCURRENCY = ramSafeConcurrency(process.env.BELL_TENDER_CONCURRENCY);

function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

(async () => {
  console.log('Bell — Full Tender Archive Backfill');
  console.log('Sweeps ALL of Monaqasat (open + the entire awarded history) with full detail.');
  console.log(`Runs ${CONCURRENCY} detail pages in parallel · resumable (safe to stop & re-run).`);
  console.log('Keep this window open and the Crawl4AI engine running.\n');

  try {
    // ── Step 1: cards for every page (details OFF here — fast) ────────────────
    console.log('Step 1/3 — collecting tender cards from every page…');
    const t1 = Date.now();
    const rows = await scrapeMonaqasat({
      openPages: 60, awardedPages: 1200, details: false,
      onProgress: ({ status, page, cards }) => process.stdout.write(`\r  ${status} list · page ${page} · ${cards.toLocaleString()} tenders so far          `),
    });
    process.stdout.write('\n');
    if (!rows.length) {
      console.log('\n⚠ Nothing scraped. Is the Crawl4AI engine running?');
      console.log('  Run "Install Crawl4AI Engine.command" or "Restart Crawl4AI Engine.command", then try again.');
      try { await closeRenderer(); } catch { /* ignore */ }
      process.exit(0);
    }
    const ing = await ingestTenders(rows);
    console.log(`  ${rows.length} cards · ${ing.inserted} new · ${ing.updated} updated · ${fmtDur((Date.now() - t1) / 1000)}`);
    // Publish the full CARD set now, so the complete count lands on prod fast —
    // even before the long detail pass finishes (and survives an interruption).
    const p1 = await pushTendersToProd();
    if (p1.pushed != null) console.log(`  ✓ Published ${p1.pushed.toLocaleString()} tenders live (cards) — detail fills in next.`);
    else if (p1.skipped) console.log('  ⚠ ' + p1.skipped);

    // ── Step 2: full detail, in parallel, resumable ──────────────────────────
    const pending = await pendingDetailCount('monaqasat');
    console.log(`\nStep 2/3 — opening ${pending.toLocaleString()} tenders for full detail (${CONCURRENCY} at a time)…`);
    const t2 = Date.now();
    const en = await enrichPendingTenders({
      concurrency: CONCURRENCY,
      onProgress: ({ done, total, enriched }) => {
        const elapsed = (Date.now() - t2) / 1000;
        const rate = done / Math.max(elapsed, 1);
        const eta = rate > 0 ? (total - done) / rate : 0;
        const pct = total ? Math.round((done / total) * 100) : 100;
        process.stdout.write(`\r  ${done.toLocaleString()}/${total.toLocaleString()} (${pct}%) · ${enriched.toLocaleString()} detailed · ~${fmtDur(eta)} left     `);
      },
    });
    console.log(`\n  Detail captured for ${en.enriched.toLocaleString()} · ${en.failed.toLocaleString()} without detail · ${en.remaining.toLocaleString()} still pending · ${fmtDur((Date.now() - t2) / 1000)}`);

    // ── Step 3: publish to production ────────────────────────────────────────
    console.log('\nStep 3/3 — publishing to the live site (app.bell.qa)…');
    const push = await pushTendersToProd();
    if (push.error) console.log('  ⚠ Push failed: ' + push.error + '\n    (Saved locally — open the portal Sync tab → Push to retry.)');
    else if (push.skipped) console.log('  ⚠ ' + push.skipped + '\n    (Saved locally; run the portal Sync tab → Push to publish them.)');
    else console.log('  ✓ Pushed ' + push.pushed.toLocaleString() + ' tenders live.');

    if (en.remaining > 0) {
      console.log(`\nNote: ${en.remaining.toLocaleString()} tenders still need detail (site timeouts). Run this again to finish them — it resumes automatically.`);
    } else {
      console.log('\nDone — the full tender archive is captured and live. See it in the portal Tenders tab.');
    }
  } catch (err) {
    console.error('\nBackfill failed: ' + (err.message || err));
    console.error('(Progress is saved — re-running resumes where it left off.)');
  } finally {
    try { await closeRenderer(); } catch { /* ignore */ }
    process.exit(0);
  }
})();

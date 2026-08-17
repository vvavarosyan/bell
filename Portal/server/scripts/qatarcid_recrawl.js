// Re-crawl the QCCI directory (qatarcid.com) with Bell's OWN browser — no Firecrawl credits.
//
// Val, 2026-08-15: "can we use ROG to do this process? to not use Firecrawl credits?" This is
// that. QCCI's data froze on 2026-06-19 because the only reader was a paid Firecrawl run
// (~42k credits per pass); the site 403s plain fetch. A real browser passes the Cloudflare
// challenge (proven interactively) — whether THIS machine's headless engine passes is probed at
// the start of every run rather than assumed, because the Mac's headless Playwright was
// measured BLOCKED (403 twice, 15s settle) while the interactive browser sailed through.
//
//   node scripts/qatarcid_recrawl.js --limit 1000      # the stalest 1,000 listings
//
// ── HOW IT STAYS HONEST ──────────────────────────────────────────────────────────────────────
// • PROBE FIRST. The first 5 pages are the test: if every one comes back unreadable, this
//   machine's browser is being challenged and the run THROWS with that exact message. A blocked
//   night must read as "blocked", never as "ran fine, produced nothing" — the Kahramaa lesson.
// • A page that fails to parse is counted, never emitted. The parser refuses challenge pages
//   outright (the first proving run emitted a company literally named "www.qatarcid.com").
// • Output feeds the ONE existing ingest (ingestSource('QCCI')) by writing the same scan file
//   shape the June Firecrawl run produced. A chunk file covers <60% of the source, so the
//   ingest's own partial-scrape guard skips disappearance reconciliation — nothing gets flagged
//   as vanished just because tonight's chunk did not include it.
// • The June full scan file is backed up ONCE before the first chunk overwrites the _latest
//   name. Nothing is destroyed to make room for fresher data.
//
// Stalest-first ordering makes it self-scheduling: every run refreshes the listings that need
// it most, and a listing refreshed tonight goes to the back of the queue for ~6 weeks.

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { query, pool } from '../db.js';
import { renderPage, rendererAvailable } from '../enrichment/local/render.js';
import { crawl4aiSupports } from '../enrichment/local/crawl4ai.js';
import { parseListing } from '../sources/qatarcid/reader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCANS = path.resolve(__dirname, '..', '..', '..',
  'Data', 'Companies', '1. Data Gathering', 'Other Sources', 'Qatar Chamber', 'scans');
const LATEST = path.join(SCANS, 'qatarcid_companies_latest.json');
const JUNE_BACKUP = path.join(SCANS, 'qatarcid_companies_full_firecrawl_2026-06.json');

const argOf = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) || dflt : dflt;
};
const PROBE = 5;              // pages that decide whether this machine can read the site at all
const DELAY_MS = 2000;        // politeness between page loads — a directory, not a race

export async function recrawlQatarcid({ limit = 1000, log = console.log } = {}) {
  if (!(await rendererAvailable())) {
    throw new Error('no browser engine available on this machine — the site 403s anything less');
  }
  // Cloudflare challenges a plain headless fingerprint here, so this crawl asks for stealth. On
  // the engine box Crawl4AI is a long-lived task: the nightly pull rewrites its Python while the
  // RUNNING process keeps yesterday's code, and an unknown option is accepted and ignored. Say so
  // rather than posting into the void and blaming the site for the empty result.
  const stealthReady = await crawl4aiSupports('stealth');
  if (!stealthReady) {
    log('  ⚠ the Crawl4AI service on this machine predates the stealth option — it will be ignored.');
    log('    Restart the Crawl4AI task so it picks up the updated code, then run this again.');
  }

  // Stalest first. last_seen_at is bumped by the ingest for every record in the file, so a
  // listing crawled tonight naturally rotates to the back of the queue.
  const targets = (await query(
    `SELECT source_url FROM company_sources
      WHERE source = 'QCCI' AND source_url LIKE '%qatarcid.com/listing/%'
      ORDER BY last_seen_at ASC NULLS FIRST LIMIT $1`, [limit])).rows;
  if (!targets.length) { log('  no QCCI listings on file — nothing to crawl'); return { crawled: 0, parsed: 0 }; }
  log(`  ${targets.length} stalest QCCI listings queued (of 41,951 on file)`);

  const records = [];
  let unreadable = 0;
  for (let i = 0; i < targets.length; i++) {
    const url = targets[i].source_url;
    let rec = null;
    try {
      // stealth: Cloudflare challenged the ROG's headless fingerprint on the
      // first overnight probe (2026-08-17) — magic/simulate_user/override_navigator
      // plus the settle finally reaching Crawl4AI is the retry.
      const page = await renderPage(url, { timeoutMs: 60_000, settleMs: 8_000, stealth: true });
      rec = parseListing(page, url);
    } catch { rec = null; }
    if (rec) records.push(rec); else unreadable++;

    // ⚠️ THE PROBE. All of the first 5 unreadable = this machine is being challenged, and 995
    // more attempts would produce 995 more nothings. Throwing (not returning) is deliberate:
    // job_runs must show a red 'error' naming the cause, because "ran fine, produced nothing"
    // is exactly how Kahramaa stayed dead for 14 nights.
    if (i + 1 === PROBE && records.length === 0) {
      throw new Error(
        `Cloudflare is challenging this machine's headless browser (${PROBE}/${PROBE} pages unreadable). ` +
        'The interactive test passed, so the site is crawlable — this engine is not. ' +
        (stealthReady
          ? 'Stealth WAS in effect and did not get through, so the next move is a headed browser, not another retry. '
          : 'The Crawl4AI service here is running code older than the stealth option, so stealth never applied — restart that task and this may pass. ') +
        'Nothing was written; no listing was marked seen.');
    }
    if (i < targets.length - 1) await new Promise((r) => setTimeout(r, DELAY_MS));
    if ((i + 1) % 100 === 0) log(`  … ${i + 1}/${targets.length} read · ${records.length} parsed · ${unreadable} unreadable`);
  }

  log(`  crawl done: ${records.length} parsed · ${unreadable} unreadable of ${targets.length}`);
  if (!records.length) return { crawled: targets.length, parsed: 0, unreadable };

  // Preserve the June Firecrawl full scan once, before the _latest name starts carrying chunks.
  try { await fs.access(JUNE_BACKUP); }
  catch {
    try { await fs.copyFile(LATEST, JUNE_BACKUP); log('  June full scan backed up (one-time).'); }
    catch { /* no existing latest file — nothing to preserve */ }
  }
  await fs.writeFile(LATEST, JSON.stringify(records, null, 1), 'utf8');

  // The ONE ingest path. Its partial-scrape guard sees a chunk (<60% of what QCCI has on file)
  // and skips disappearance reconciliation — correct: absence from a chunk is not absence.
  const { ingestSource } = await import('../ingest/runner.js');
  const out = await ingestSource('QCCI', (m) => log('  ' + m));
  return { crawled: targets.length, parsed: records.length, unreadable, ingest: out };
}

// CLI entry — the .command file and ad-hoc runs land here; the nightly imports recrawlQatarcid.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  recrawlQatarcid({ limit: argOf('--limit', 1000) })
    .then((r) => { console.log('QCCI RECRAWL COMPLETE:', JSON.stringify({ ...r, ingest: undefined })); return pool.end(); })
    .then(() => process.exit(0))
    .catch(async (e) => { console.error('QCCI RECRAWL FAILED: ' + e.message); await pool.end().catch(() => {}); process.exit(1); });
}

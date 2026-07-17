// Fetch Qatar's RECENT laws first — the ones Bell never had (incl. PDPPL).
//
// Why this exists: the Al Meezan id-walk is resumable and wraps, which is right for keeping
// the whole archive fresh, but it walks 1 → 11000 in order. Migration 092 reset the cursor
// to 1 so every stored law would be re-fetched WITH its articles — correct, but it means the
// laws Val actually asked for are LAST in line: PDPPL is id 7121, so from cursor ~170 it is
// ~5 full runs (hours) away, while ids 1-7000 just re-fetch laws we already hold.
//
// The gap is at the TOP of the id space. Al Meezan publishes ~2015-onward laws in ARABIC
// ONLY, and the old crawler was English-only with a 7200 ceiling — so everything from ~2015
// on was silently skipped. That range (7000-11000) is exactly what Bell is missing and what
// modern business questions are about: PDPPL (13/2016), companies, tax, labour, investment.
//
// So: jump the cursor into that range and crawl Al Meezan only. The normal wrap then brings
// it back to id 1 afterwards to backfill articles on the older laws — nothing is lost.
//
//   node server/scripts/fetch_qatar_laws.js            # start at 7000 (default)
//   node server/scripts/fetch_qatar_laws.js --from 8500

import { query } from '../db.js';
import { crawlAlmeezan } from '../knowledge/crawl_almeezan.js';

const argFrom = (() => { const i = process.argv.indexOf('--from'); return i > -1 ? Number(process.argv[i + 1]) : NaN; })();
const START = Number.isFinite(argFrom) ? argFrom : 7000;

(async () => {
  console.log('Bell — fetch Qatar\'s recent laws (Al Meezan)\n');
  const src = (await query(`SELECT * FROM knowledge_sources WHERE name ILIKE '%meezan%' AND active = true`)).rows[0];
  if (!src) { console.log('Al Meezan source not found or inactive.'); process.exit(1); }

  const cur = Number(src.config?.walk_cursor) || 1;
  // Only jump FORWARD into the gap. If a previous run already got past START, resume where
  // it is rather than re-walking ground it just covered.
  if (cur < START) {
    await query(
      `UPDATE knowledge_sources SET config = jsonb_set(coalesce(config,'{}'::jsonb), '{walk_cursor}', to_jsonb($2::int)), updated_at = now() WHERE id = $1`,
      [src.id, START]);
    console.log(`Cursor was at ${cur} (re-walking laws we already have). Jumped to ${START} — the range Bell is missing.`);
  } else {
    console.log(`Resuming at ${cur} (already inside the missing range).`);
  }
  console.log('PDPPL is id 7121. Each run covers ~' + (src.max_pages || 1500) + ' ids and is resumable — close the window any time.\n');

  const fresh = (await query(`SELECT * FROM knowledge_sources WHERE id = $1`, [src.id])).rows[0];
  const stats = await crawlAlmeezan(fresh, { onProgress: (m) => console.log('  ' + m) });

  console.log(`\n→ ${stats.fetched} laws captured (${stats.new} new, ${stats.changed} updated)` +
              `${stats.articles ? ` · ${stats.articles} article sections read` : ''}` +
              ` · ${stats.skipped} ids held no law · ${stats.errors} errors.`);

  const pd = (await query(
    `SELECT title, word_count FROM knowledge_pages WHERE url LIKE '%id=7121%' LIMIT 1`)).rows[0];
  console.log(pd
    ? `\n✅ PDPPL is IN: "${pd.title}" (${pd.word_count} words). Ask Bella about it.`
    : `\n(PDPPL not reached yet — run this again to continue from where it stopped.)`);
  process.exit(0);
})().catch((e) => { console.error('Stopped:', e.message); process.exit(1); });

// One-time repair: move Monaqasat status banners out of tender titles.
//
// The listing scraper stored the card text verbatim, and ~2,069 cards print a
// status line ABOVE the title ("Tender is violation due to delay", "The tender
// has been suspended", + their Arabic twins). Those are STATUS statements, not
// titles — they made the new award blocks read "Tender is violation due to
// delay MAINTENANCE CONTRACT" on a company profile.
//
// This strips ONLY the four verbatim banner strings (measured 2026-08-17: every
// other pre-\n\n line across all 27k titles is a genuine multi-line title) and
// keeps the banner in raw.status_banner — moved, never discarded. Rows whose
// remainder would be shorter than 6 chars (banner over a literal "0") are left
// untouched. updated_at is stamped so the fix rides the next push to prod.
//
//   node scripts/strip_title_banners.js

import { query, pool } from '../db.js';
import { STATUS_BANNERS } from '../tenders/scrape_monaqasat.js';

async function main() {
  let total = 0, skipped = 0;
  for (const banner of STATUS_BANNERS) {
    const r = await query(
      `UPDATE tenders
          SET title = btrim(substring(title FROM ${banner.length + 1})),
              raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('status_banner', $1::text),
              updated_at = now()
        WHERE title LIKE $1 || '%'
          AND length(btrim(substring(title FROM ${banner.length + 1}))) >= 6`,
      [banner]);
    const s = await query(
      `SELECT count(*)::int n FROM tenders
        WHERE title LIKE $1 || '%'
          AND length(btrim(substring(title FROM ${banner.length + 1}))) < 6`,
      [banner]);
    console.log(`"${banner}": ${r.rowCount} titles repaired, ${s.rows[0].n} left (no usable title behind the banner)`);
    total += r.rowCount;
    skipped += s.rows[0].n;
  }
  console.log(`\nDone: ${total} titles repaired, ${skipped} left as-is. Publishes on the next data push.`);
}

main().then(() => pool.end()).then(() => process.exit(0))
  .catch(async (e) => { console.error('Stopped:', e.stack || e.message); await pool.end().catch(() => {}); process.exit(1); });

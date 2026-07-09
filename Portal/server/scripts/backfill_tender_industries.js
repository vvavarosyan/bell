// Backfill tenders.industries[] — run via "Backfill Tender Industries.command".
//
// The authoritative recompute: reads every tender's activity codes / category /
// title and stores its line(s) of business (migration 078), so the Tenders tab
// can show an industry on every card, filter by industry, and offer the same
// "For you" (ICP) view the other Signals tabs have.
//
// Idempotent + resumable: re-running simply recomputes. Pure JS matching, no
// network, no cost. Pushes the result to the live site at the end.

import { query } from '../db.js';
import { tenderIndustries } from '../tenders/match.js';
import { pushTendersToProd } from '../tenders/push_prod.js';

const BATCH = 2000;

(async () => {
  console.log('Bell — Backfill Tender Industries\n');
  try {
    const total = Number((await query(`SELECT count(*)::int n FROM tenders`)).rows[0].n);
    console.log(`${total.toLocaleString()} tenders to classify…\n`);

    let offset = 0, changed = 0, matched = 0, unmatched = 0;
    const dist = new Map();

    while (offset < total) {
      const rows = (await query(
        `SELECT id, title, category, status, raw, industries, primary_industry
           FROM tenders ORDER BY id LIMIT $1 OFFSET $2`, [BATCH, offset])).rows;
      if (!rows.length) break;

      for (const t of rows) {
        const m = tenderIndustries(t);
        if (m.primary) { matched++; dist.set(m.primary, (dist.get(m.primary) || 0) + 1); } else unmatched++;

        const before = JSON.stringify(t.industries || null) + '|' + (t.primary_industry || '');
        const after = JSON.stringify(m.tags.length ? m.tags : null) + '|' + (m.primary || '');
        if (before === after) continue;

        await query(
          `UPDATE tenders SET industries = $2::text[], primary_industry = $3, updated_at = now() WHERE id = $1`,
          [t.id, m.tags.length ? m.tags : null, m.primary]);
        changed++;
      }
      offset += rows.length;
      process.stdout.write(`\r  ${offset.toLocaleString()}/${total.toLocaleString()} · ${changed.toLocaleString()} updated   `);
    }

    console.log(`\n\nClassified:   ${matched.toLocaleString()}`);
    console.log(`Uncategorised:${unmatched.toLocaleString()}   (no activity codes, no usable category, no meaningful title — never guessed)`);
    console.log(`Rows updated: ${changed.toLocaleString()}\n`);

    const openTotal = Number((await query(`SELECT count(*)::int n FROM tenders WHERE status='open'`)).rows[0].n);
    const openMatched = Number((await query(`SELECT count(*)::int n FROM tenders WHERE status='open' AND primary_industry IS NOT NULL`)).rows[0].n);
    const pct = openTotal ? Math.round((openMatched / openTotal) * 100) : 0;
    console.log(`OPEN tenders categorised: ${openMatched.toLocaleString()} / ${openTotal.toLocaleString()}  (${pct}%)`);
    if (openMatched < openTotal) {
      const stragglers = (await query(
        `SELECT source, source_ref, title FROM tenders
          WHERE status='open' AND primary_industry IS NULL ORDER BY id LIMIT 15`)).rows;
      console.log('\nOpen tenders still uncategorised (send these to Claude to extend the matcher):');
      for (const s of stragglers) console.log(`  [${s.source}] ${s.source_ref || '—'} — ${String(s.title).replace(/\s+/g, ' ').slice(0, 90)}`);
    }

    console.log('\nTop industries:');
    for (const [tag, n] of [...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
      console.log(`  ${String(n).padStart(6)}  ${tag}`);
    }

    console.log('\nPublishing to the live site (app.bell.qa)…');
    const push = await pushTendersToProd();
    if (push.error) console.log('  ⚠ Push failed: ' + push.error);
    else if (push.skipped) console.log('  ⚠ ' + push.skipped);
    else console.log('  ✓ Pushed ' + Number(push.pushed || 0).toLocaleString() + ' tenders live.');
  } catch (err) {
    console.error('\nBackfill failed: ' + (err.message || err));
    process.exit(1);
  }
  process.exit(0);
})();

// Complete the Al Meezan law archive in ONE go — loops the resumable law-walk
// until the whole archive has been learned, then extracts entities + publishes.
// Run via "Complete Al Meezan Laws.command". Resumable (close any time; it picks
// up from the saved cursor). Plain fetch, no browser. ~45 min for a full archive.
//
// Do NOT run this at the same time as "Run Qatar Knowledge Scan.command" — both
// walk the same law cursor and would race. Run one at a time.

import { query } from '../db.js';
import { crawlAlmeezan } from '../knowledge/crawl_almeezan.js';
import { backfillEntities } from '../knowledge/crawl.js';
import { pushGisToProd } from '../gis/ingest_gis.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('Bell — Complete Al Meezan law archive');
  console.log('Loops the resumable law-walk until the whole archive is learned. ~45 min. Resumable.\n');
  try {
    const src = (await query(`SELECT * FROM knowledge_sources WHERE crawl_method = 'almeezan' AND active = true ORDER BY id LIMIT 1`)).rows[0];
    if (!src) {
      console.log('⚠ Al Meezan source not found yet.');
      console.log('  Fix: double-click "Open Bell.qa Portal.command" once, then "Run Qatar Knowledge Scan.command" once, then re-run this.');
      return;
    }
    const total = { fetched: 0, new: 0, changed: 0, same: 0, errors: 0, skipped: 0 };
    let round = 0, consecutivePauses = 0, done = false;
    while (!done) {
      round++;
      // re-read the source so we always walk from the freshest saved cursor
      src.config = (await query(`SELECT config FROM knowledge_sources WHERE id = $1`, [src.id])).rows[0].config;
      const s = await crawlAlmeezan(src, { onProgress: (m) => console.log('  ' + m) });
      for (const k of Object.keys(total)) total[k] += s[k] || 0;
      console.log(`  round ${round}: +${s.new} new · +${s.changed} changed · cursor ${s.cursor}${s.done ? '  — FULL ARCHIVE WALKED ✓' : ''}`);
      done = !!s.done;
      if (s.paused) {
        consecutivePauses++;
        if (consecutivePauses >= 5) { console.log('\n⚠ The network kept failing (5 pauses). Stopping — just re-run this command later; it resumes cleanly.'); break; }
        console.log('  (network hiccup — retrying this stretch in a moment)');
        await sleep(4000);
      } else consecutivePauses = 0;
    }

    console.log('\nExtracting entities for any older pages…');
    const filled = await backfillEntities({ onProgress: (m) => console.log('  ' + m) });
    if (filled) console.log(`  entities extracted for ${filled} page(s)`);

    const laws = (await query(
      `SELECT count(*)::int n FROM knowledge_pages p JOIN knowledge_sources s ON s.id = p.source_id
        WHERE p.active AND s.crawl_method = 'almeezan'`)).rows[0].n;
    console.log('\n── Al Meezan ─────────────────────────────');
    console.log('  Laws learned (total):  ' + laws.toLocaleString());
    console.log('  This session:  ' + total.new + ' new · ' + total.changed + ' changed · ' + total.skipped + ' non-law ids skipped · ' + total.errors + ' errors');

    console.log('\nPublishing to the live site…');
    const push = await pushGisToProd();
    console.log('  Prod mirror push:', typeof push === 'object' ? JSON.stringify(push).slice(0, 160) : push);
    console.log('\nDone. Bella + the Qatar Knowledge section now have the full law archive, with citations.');
  } catch (e) {
    console.error('\nStopped:', e.message, '\nJust re-run — it resumes from where it stopped.');
    process.exitCode = 1;
  }
})().then(() => process.exit(process.exitCode || 0));

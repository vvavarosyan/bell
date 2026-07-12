// Qatar Knowledge scan — run via "Run Qatar Knowledge Scan.command".
//
// Crawls every active Qatar knowledge source LOCALLY (plain fetch / Crawl4AI —
// no Firecrawl for the recurring crawl) to learn Qatar's political system,
// ministries, structure and key people, and detects what CHANGED since last time.
// Plain fetch, no browser. Idempotent + safe to re-run (re-crawl updates + flags
// changes). A few minutes per source. Publishes to the live site.

import { query } from '../db.js';
import { crawlSource, knowledgeTablesReady } from '../knowledge/crawl.js';
import { pushGisToProd } from '../gis/ingest_gis.js';   // generic mirror push

(async () => {
  console.log('Bell — Qatar Knowledge scan (learns Qatar from official sources)');
  console.log('Local plain fetch, no browser. A few minutes.\n');
  try {
    if (!(await knowledgeTablesReady())) {
      console.log('⚠ The knowledge tables are not in the database yet.');
      console.log('  Fix: double-click "Open Bell.qa Portal.command" once, then re-run.');
      return;
    }
    const sources = (await query(`SELECT * FROM knowledge_sources WHERE active = true ORDER BY id`)).rows;
    console.log(`Crawling ${sources.length} source(s)…\n`);
    const totals = { fetched: 0, new: 0, changed: 0, same: 0, errors: 0 };
    for (const src of sources) {
      const s = await crawlSource(src, { onProgress: (m) => console.log('  ' + m) });
      console.log(`  ✓ ${src.name}: ${s.fetched} pages · ${s.new} new · ${s.changed} changed · ${s.errors} errors`);
      for (const k of Object.keys(totals)) totals[k] += s[k] || 0;
    }

    const pages = (await query(`SELECT count(*)::int n FROM knowledge_pages`)).rows[0].n;
    const recent = (await query(`SELECT title, kind, source_name FROM knowledge_changes ORDER BY detected_at DESC LIMIT 6`)).rows;
    console.log('\n── Knowledge ─────────────────────────────');
    console.log('  Pages learned (total):  ' + pages.toLocaleString());
    console.log('  This run:  ' + totals.new + ' new · ' + totals.changed + ' changed · ' + totals.fetched + ' fetched');
    if (recent.length) { console.log('  Latest changes:'); for (const c of recent) console.log(`    [${c.kind}] ${(c.title || '').slice(0, 50)} · ${c.source_name}`); }

    console.log('\nPublishing to the live site…');
    const push = await pushGisToProd();
    console.log('  Prod mirror push:', typeof push === 'object' ? JSON.stringify(push).slice(0, 160) : push);
    console.log('\nDone. Bella can now answer Qatar questions from these sources, with citations.');
  } catch (e) {
    console.error('\nStopped:', e.message, '\nJust re-run — it resumes cleanly.');
    process.exitCode = 1;
  }
})().then(() => process.exit(process.exitCode || 0));

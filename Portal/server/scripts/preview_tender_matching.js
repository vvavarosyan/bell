// Tender → industry matching PREVIEW — run via "Preview Tender Matching.command".
//
// READ-ONLY (like check_tender_detail.js): proves #72's activity→industry
// matcher on the REAL local tender corpus BEFORE any signal ships. Prints
// coverage per source, how each match was made (class/division/name/category),
// what stayed UNMATCHED (the curation worklist), 5-digit-code evidence, and the
// exact opportunity signals that would be generated today — so we can eyeball
// correctness against the live sites. Nothing is written.

import { query } from '../db.js';
import { tagsForActivity, tenderIndustries, buildTenderOpportunitySignals, OPEN_TENDER_SELECT_SQL } from '../tenders/match.js';

const pad = (x, n = 8) => String(Number(x).toLocaleString()).padStart(n);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0) + '%';

(async () => {
  console.log('Bell — Tender → Industry Matching Preview (#72)\n');
  try {
    // ── corpus ───────────────────────────────────────────────────────────────
    const bySrc = (await query(`
      SELECT source,
             count(*)::int AS total,
             count(*) FILTER (WHERE status = 'open')::int AS open,
             count(*) FILTER (WHERE jsonb_typeof(raw->'activities')='array' AND jsonb_array_length(raw->'activities')>0)::int AS with_acts,
             count(*) FILTER (WHERE COALESCE(NULLIF(category,''), NULLIF(raw->>'sector','')) IS NOT NULL)::int AS with_cat
        FROM tenders GROUP BY source ORDER BY total DESC`)).rows;
    console.log('Corpus (local DB):');
    for (const r of bySrc) {
      console.log(`  ${r.source.padEnd(12)} total ${pad(r.total)} · open ${pad(r.open, 6)} · with activities ${pad(r.with_acts)} · with category/sector ${pad(r.with_cat)}`);
    }

    // ── matching over EVERY tender that has anything matchable ──────────────
    const all = (await query(`
      SELECT id, source, category, status, raw
        FROM tenders
       WHERE (jsonb_typeof(raw->'activities')='array' AND jsonb_array_length(raw->'activities')>0)
          OR COALESCE(NULLIF(category,''), NULLIF(raw->>'sector','')) IS NOT NULL`)).rows;

    const perSrc = {};        // source → {n, matched}
    const via = { class: 0, division: 0, name: 0, category: 0 };
    const unmatchedActs = new Map();   // "code name" → count
    const unmatchedCats = new Map();
    const industryDist = new Map();
    let fiveDigit = 0; const fiveDigitSamples = [];

    for (const t of all) {
      const s = (perSrc[t.source] ||= { n: 0, matched: 0 });
      s.n++;
      const m = tenderIndustries(t);
      for (const k of Object.keys(via)) via[k] += m.via[k];
      if (m.primary) {
        s.matched++;
        industryDist.set(m.primary, (industryDist.get(m.primary) || 0) + 1);
      }
      for (const a of (t.raw?.activities || [])) {
        const code = String(a.code || '');
        if (/^\d{5}$/.test(code)) {
          fiveDigit++;
          if (fiveDigitSamples.length < 8) fiveDigitSamples.push(`${code} ${String(a.name).slice(0, 70)}`);
        }
        if (!tagsForActivity(a).tags.length) {
          const key = `${code} ${String(a.name).replace(/\s+/g, ' ').slice(0, 80)}`;
          unmatchedActs.set(key, (unmatchedActs.get(key) || 0) + 1);
        }
      }
      const cat = String(t.category || t.raw?.sector || '').trim();
      if (cat && !tenderIndustries({ category: cat, raw: {} }).primary) {
        unmatchedCats.set(cat.slice(0, 60), (unmatchedCats.get(cat.slice(0, 60)) || 0) + 1);
      }
    }

    console.log('\nMatch coverage (tenders with ≥1 mapped industry):');
    for (const [src, s] of Object.entries(perSrc)) {
      console.log(`  ${src.padEnd(12)} ${pad(s.matched)} / ${pad(s.n)}  (${pct(s.matched, s.n)})`);
    }
    console.log(`  matched via — class ${via.class.toLocaleString()} · division ${via.division.toLocaleString()} · name ${via.name.toLocaleString()} · category ${via.category.toLocaleString()}`);
    console.log(`  5-digit activity codes seen: ${fiveDigit.toLocaleString()}${fiveDigit ? '  (ISIC class+check — division-mapped like 6-digit; proven on the 2026-07-09 corpus)' : ''}`);
    for (const s of fiveDigitSamples) console.log('     · ' + s);

    const topUn = [...unmatchedActs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    console.log(`\nUNMATCHED activities (top ${topUn.length} of ${unmatchedActs.size} distinct) — the curation worklist:`);
    for (const [k, n] of topUn) console.log(`  ${String(n).padStart(5)}× ${k}`);
    if (!unmatchedActs.size) console.log('  none 🎉');
    if (unmatchedCats.size) {
      console.log('\nUNMATCHED categories/sectors:');
      for (const [k, n] of [...unmatchedCats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`  ${String(n).padStart(5)}× ${k}`);
    }

    console.log('\nIndustry distribution (primary tag, matched tenders):');
    for (const [tag, n] of [...industryDist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
      console.log(`  ${String(n).padStart(6)}  ${tag}`);
    }

    // ── eyeball samples: recent tenders WITH activities → their mapping ─────
    const samples = (await query(`
      SELECT id, source, source_ref, title, category, raw
        FROM tenders
       WHERE jsonb_typeof(raw->'activities')='array' AND jsonb_array_length(raw->'activities')>0
       ORDER BY COALESCE(published_at, created_at) DESC
       LIMIT 12`)).rows;
    console.log('\nNewest 12 tenders with activities — verify these by eye:');
    for (const t of samples) {
      const m = tenderIndustries(t);
      console.log(`\n  [${t.source}] ${t.source_ref || t.id} — ${String(t.title).replace(/\s+/g, ' ').slice(0, 90)}`);
      for (const a of (t.raw.activities || []).slice(0, 5)) {
        const am = tagsForActivity(a);
        console.log(`     ${a.code} ${String(a.name).slice(0, 70).padEnd(70)} → ${am.tags.join(', ') || '(no match)'} ${am.via ? '[' + am.via + ']' : ''}`);
      }
      console.log(`     ⇒ tender tags: ${m.tags.join(', ') || '(none)'}   primary: ${m.primary || '—'}`);
    }

    // ── the signals that WOULD be generated right now ────────────────────────
    const openRows = (await query(OPEN_TENDER_SELECT_SQL)).rows;
    const sigs = buildTenderOpportunitySignals(openRows);
    console.log(`\nOpportunity signals that would generate today: ${sigs.length} (from ${openRows.length} open tenders in the 21-day window)`);
    const sigDist = new Map();
    for (const s of sigs) sigDist.set(s.industry, (sigDist.get(s.industry) || 0) + 1);
    for (const [tag, n] of [...sigDist.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${tag}`);
    console.log('\nExamples:');
    for (const s of sigs.slice(0, 8)) console.log(`  · ${s.title}\n      ${s.body}`);

    console.log('\nReading this:');
    console.log('  • Coverage should be HIGH for Monaqasat tenders with activities; it rises as the overnight');
    console.log('    re-enrich (detail_v=2) fills more activities in.');
    console.log('  • "UNMATCHED activities" is my curation list — send me this output and I extend the mapper.');
    console.log('  • Check the 12 eyeball samples: does each mapped industry make sense for that tender?');
    console.log('  • Nothing was written — this is a dry-run preview of the #72 signal generator.');
  } catch (err) {
    console.error('Preview failed: ' + (err.message || err));
  } finally {
    process.exit(0);
  }
})();

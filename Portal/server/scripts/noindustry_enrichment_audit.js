// ============================================================================
// No-industry ENRICHMENT diagnostic — read-only
// ----------------------------------------------------------------------------
// Profiles the companies that still have NO industry, to plan enrichment WITHOUT
// guessing. Buckets each by the best available signal:
//   • gmaps-broad  — has a Google Maps category that maps to a broad industry
//                    → a re-derive classifies it NOW (gmaps was just wired in).
//   • gmaps-trade  — has a Google Maps category, but only as a specific trade
//                    → extend LABEL_MAP (from the top list below) for a broad bucket.
//   • website      — no category, but HAS a website → needs a website-read pass.
//   • dark         — no category and no website → hardest (external data later).
// Also lists the top Google Maps categories (to extend the map) and the top
// extra_fields keys still present on dark companies (to find any other signal).
//
// USAGE (from the Portal directory)
//   node server/scripts/noindustry_enrichment_audit.js
//   node server/scripts/noindustry_enrichment_audit.js --top 60
//   node server/scripts/noindustry_enrichment_audit.js --self-test
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapLabelToCanonical, cleanCategoryLabel } from '../lib/industry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH = 1000;

function argInt(flag, dflt) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return dflt;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : dflt;
}

function gmapsLabels(c) {
  const e = c.extra_fields || c.extra || {};
  const arr = [e.gmaps_category];
  if (Array.isArray(e.gmaps_categories)) arr.push(...e.gmaps_categories);
  return arr.map((x) => (x == null ? '' : String(x).trim())).filter(Boolean);
}

// Bucket a company by its best enrichment signal (pure — used by the self-test).
export function bucketOf(c) {
  const gl = gmapsLabels(c);
  const broad = gl.some((l) => mapLabelToCanonical(l).length > 0);
  if (broad) return 'gmaps-broad';
  const trade = gl.some((l) => cleanCategoryLabel(l) != null);
  if (trade) return 'gmaps-trade';
  if (c.website) return 'website';
  return 'dark';
}

async function run() {
  const { query } = await import('../db.js');
  const topN = argInt('--top', 50);
  const B = { 'gmaps-broad': 0, 'gmaps-trade': 0, website: 0, dark: 0 };
  const gcats = new Map();      // raw gmaps category -> count (on gmaps buckets)
  const darkKeys = new Map();   // extra_fields key -> count (on dark + website)
  const samples = { 'gmaps-broad': [], 'gmaps-trade': [], website: [], dark: [] };
  let total = 0, lastId = 0;

  for (;;) {
    const r = await query(
      `SELECT id, name, website, sector, extra_fields
         FROM companies
        WHERE archived = false
          AND (industries IS NULL OR cardinality(industries) = 0)
          AND (industry IS NULL OR industry = '')
          AND id > $1 ORDER BY id LIMIT $2`, [lastId, BATCH]);
    if (!r.rows.length) break;
    lastId = r.rows[r.rows.length - 1].id;

    for (const c of r.rows) {
      total++;
      const bucket = bucketOf(c);
      B[bucket]++;
      if (samples[bucket].length < 8) samples[bucket].push(`${String(c.name || '').slice(0, 38)}`);
      if (bucket === 'gmaps-broad' || bucket === 'gmaps-trade') {
        for (const l of gmapsLabels(c)) { const k = l.slice(0, 60); gcats.set(k, (gcats.get(k) || 0) + 1); }
      } else {
        for (const k of Object.keys(c.extra_fields || {})) darkKeys.set(k, (darkKeys.get(k) || 0) + 1);
      }
    }
  }

  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  const L = [];
  L.push('='.repeat(70));
  L.push('  BELL — NO-INDUSTRY ENRICHMENT DIAGNOSTIC  (read-only)');
  L.push('  ' + new Date().toISOString());
  L.push('='.repeat(70));
  L.push('');
  L.push(`Companies with NO industry: ${total}`);
  L.push('');
  L.push('Best available signal:');
  L.push(`  • Google Maps → broad industry: ${B['gmaps-broad']}  (${pct(B['gmaps-broad'])}%)  → a re-derive classifies these NOW`);
  L.push(`  • Google Maps → trade only:     ${B['gmaps-trade']}  (${pct(B['gmaps-trade'])}%)  → extend LABEL_MAP (top list below)`);
  L.push(`  • Website, no category:         ${B['website']}  (${pct(B['website'])}%)  → needs a website-read pass`);
  L.push(`  • Dark (no category, no site):  ${B['dark']}  (${pct(B['dark'])}%)  → hardest / external data later`);
  L.push('');
  L.push(`Top ${topN} Google Maps categories among these (extend LABEL_MAP to bucket them):`);
  for (const [k, n] of [...gcats.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN)) L.push(`  ${String(n).padStart(6)}  ${k}`);
  if (!gcats.size) L.push('  (none have a Google Maps category)');
  L.push('');
  L.push('Top extra_fields keys on the website/dark companies (other possible signals):');
  for (const [k, n] of [...darkKeys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) L.push(`  ${String(n).padStart(6)}  ${k}`);
  L.push('');
  for (const b of ['gmaps-broad', 'gmaps-trade', 'website', 'dark']) {
    if (samples[b].length) L.push(`sample ${b}: ${samples[b].slice(0, 5).join(' · ')}`);
  }
  L.push('='.repeat(70));
  const text = L.join('\n');
  console.log('\n' + text + '\n');
  try {
    fs.writeFileSync(path.join(__dirname, '..', '..', 'NoIndustry-Enrichment-Audit.txt'), text);
    console.log('Report saved to NoIndustry-Enrichment-Audit.txt');
  } catch (e) { console.log('(could not save report: ' + e.message + ')'); }
}

function selfTest() {
  const cases = [
    ['gmaps broad', { extra_fields: { gmaps_category: 'Car repair shop' } }, 'gmaps-broad'],
    ['gmaps trade-only', { extra_fields: { gmaps_category: 'Dentist' } }, 'gmaps-trade'],
    ['generic gmaps → falls through to website', { website: 'x.qa', extra_fields: { gmaps_category: 'Establishment' } }, 'website'],
    ['website only', { website: 'x.qa', extra_fields: {} }, 'website'],
    ['dark', { extra_fields: {} }, 'dark'],
  ];
  let fail = 0;
  for (const [label, c, want] of cases) {
    const got = bucketOf(c); const ok = got === want;
    if (!ok) fail++; console.log(`  ${ok ? '✓' : '✗'} ${label} → ${got}${ok ? '' : ' (want ' + want + ')'}`);
  }
  console.log(`\nself-test: ${cases.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

const isMain = process.argv[1] && process.argv[1].endsWith('noindustry_enrichment_audit.js');
if (isMain) {
  if (process.argv.includes('--self-test')) selfTest();
  else run().then(() => process.exit(0)).catch((e) => { console.error('audit failed:', e); process.exit(1); });
}

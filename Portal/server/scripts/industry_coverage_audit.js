// ============================================================================
// Industry COVERAGE AUDIT — read-only
// ----------------------------------------------------------------------------
// Answers Val's "no company may be missed" requirement: when a user filters an
// industry (e.g. Healthcare), EVERY company of that industry must appear. A
// company is invisible to industry filters when it has no industry tag at all.
//
// This script measures the gap WITHOUT changing anything and WITHOUT guessing:
//   • how many ACTIVE companies have no industry stored today (missed now);
//   • how many of those a re-derive would classify (just need the backfill);
//   • the residual gap, split into:
//        – has a source-directory label we don't map yet  → FIXABLE (extend map)
//        – no industry signal at all                      → needs enrichment
//   • the TOP unmapped source labels (real category strings) so we can extend
//     server/lib/industry.js precisely — never inventing a classification;
//   • projected per-industry coverage after a re-derive.
//
// USAGE (from the Portal directory)
//   node server/scripts/industry_coverage_audit.js            # full audit
//   node server/scripts/industry_coverage_audit.js --limit N  # sample
//   node server/scripts/industry_coverage_audit.js --top 60   # show N labels
//   node server/scripts/industry_coverage_audit.js --self-test # logic test, no DB
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveIndustries, CANONICAL_INDUSTRIES } from '../lib/industry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH = 1000;

function argInt(flag, dflt) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return dflt;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : dflt;
}

// The raw source-directory / LinkedIn labels we treat as industry signals.
// (Same fields deriveIndustries() reads — kept in sync.)
function rawLabels(c) {
  const e = c.extra_fields || c.extra || {};
  const tags = Array.isArray(e.qstp_sector_tags) ? e.qstp_sector_tags.join(', ') : e.qstp_sector_tags;
  return [
    e.qcci_sub_category, e.qcci_category, c.sector, e.qfz_sectors_raw,
    e.qstp_category, tags, e.qse_sector, e.qse_sector_name,
    e.moci_activity, e.moci_main_activity,
    e.linkedin_industry_v2_taxonomy, e.linkedin_industry,
  ].map((x) => (x == null ? '' : String(x).trim())).filter((x) => x.length > 1);
}

// Pure per-company classification used by both the run and the self-test.
//   status: 'stored'         already has an industry (findable now)
//           'would-fix'      blank now, but a re-derive would classify it
//           'gap-with-label' blank + un-classifiable, but HAS an unmapped label
//           'gap-no-label'   blank + no industry signal at all
export function auditRow(c) {
  const tags = deriveIndustries({
    name: c.name, legal_name: c.legal_name, sector: c.sector,
    description: c.linkedin_description, extra: c.extra_fields || c.extra || {},
  }).tags;
  const industries = c.industries;
  const storedHas = (Array.isArray(industries) && industries.length > 0) ||
                    !!(c.industry && String(c.industry).trim());
  const labels = rawLabels(c);
  let status;
  if (storedHas) status = 'stored';
  else if (tags.length) status = 'would-fix';
  else status = labels.length ? 'gap-with-label' : 'gap-no-label';
  return { tags, storedHas, status, labels };
}

async function run() {
  const { query } = await import('../db.js');
  const limitArg = argInt('--limit', null);
  const topN = argInt('--top', 50);

  let lastId = 0, processed = 0;
  const C = { total: 0, stored: 0, wouldFix: 0, gapWithLabel: 0, gapNoLabel: 0 };
  const dist = new Map();        // canonical industry -> projected count (after re-derive)
  const unmapped = new Map();    // lowercased label -> { n, sample }

  for (;;) {
    const r = await query(
      `SELECT id, name, legal_name, sector, industry, industries, linkedin_description, extra_fields
         FROM companies WHERE archived = false AND id > $1 ORDER BY id LIMIT $2`, [lastId, BATCH]);
    if (!r.rows.length) break;
    lastId = r.rows[r.rows.length - 1].id;

    for (const c of r.rows) {
      C.total++;
      const a = auditRow(c);
      for (const t of a.tags) dist.set(t, (dist.get(t) || 0) + 1);
      if (a.status === 'stored') C.stored++;
      else if (a.status === 'would-fix') C.wouldFix++;
      else if (a.status === 'gap-with-label') {
        C.gapWithLabel++;
        for (const lbl of a.labels) {
          const k = lbl.toLowerCase();
          const e = unmapped.get(k) || { n: 0, sample: lbl };
          e.n++; unmapped.set(k, e);
        }
      } else C.gapNoLabel++;
      processed++;
      if (limitArg && processed >= limitArg) break;
    }
    if (limitArg && processed >= limitArg) break;
  }

  report({ C, dist, unmapped, topN });
}

function report({ C, dist, unmapped, topN }) {
  const pct = (n) => (C.total ? Math.round((n / C.total) * 1000) / 10 : 0);
  const unclassifiedNow = C.wouldFix + C.gapWithLabel + C.gapNoLabel;
  const L = [];
  L.push('='.repeat(70));
  L.push('  BELL — INDUSTRY COVERAGE AUDIT  (read-only)');
  L.push('  ' + new Date().toISOString());
  L.push('='.repeat(70));
  L.push('');
  L.push(`ACTIVE companies scanned:          ${C.total}`);
  L.push('');
  L.push(`Classified today (findable):       ${C.stored}  (${pct(C.stored)}%)`);
  L.push(`UNCLASSIFIED today (missed):       ${unclassifiedNow}  (${pct(unclassifiedNow)}%)`);
  L.push('');
  L.push('Breakdown of the unclassified:');
  L.push(`  • re-derive would classify:      ${C.wouldFix}   → just run the backfill`);
  L.push(`  • only generic labels left:      ${C.gapWithLabel}   → too vague to classify (Services/Industry/…)`);
  L.push(`  • no industry signal at all:     ${C.gapNoLabel}   → needs enrichment`);
  L.push('');
  L.push(`After re-derive + map work, residual TRUE gap (no signal): ${C.gapNoLabel}  (${pct(C.gapNoLabel)}%)`);
  L.push('');
  L.push('Projected coverage per industry (after re-derive) — tag counts:');
  const ds = [...dist.entries()].sort((a, b) => b[1] - a[1]);
  for (const [ind, n] of ds) L.push(`  ${String(n).padStart(7)}  ${ind}`);
  const missing = CANONICAL_INDUSTRIES.filter((c) => !dist.has(c));
  if (missing.length) { L.push(''); L.push('  ⚠ canonical industries with ZERO companies: ' + missing.join(', ')); }
  L.push('');
  L.push(`Top ${topN} GENERIC labels left blank by design (on still-unclassified companies):`);
  L.push('  (too generic to be a real trade — e.g. "Services", "Industry", "Company")');
  const us = [...unmapped.values()].sort((a, b) => b.n - a.n).slice(0, topN);
  if (!us.length) L.push('  (none — every unclassified company has no source signal)');
  for (const e of us) L.push(`  ${String(e.n).padStart(6)}  ${e.sample}`);
  L.push('');
  L.push('='.repeat(70));
  const text = L.join('\n');
  console.log('\n' + text + '\n');
  try {
    const out = path.join(__dirname, '..', '..', 'Industry-Coverage-Audit.txt');
    fs.writeFileSync(out, text);
    console.log('Report saved to: ' + out);
  } catch (e) { console.log('(could not save report: ' + e.message + ')'); }
}

// ---------------------------------------------------------------------------
function selfTest() {
  const cases = [
    { label: 'stored company', row: { name: 'X', industry: 'Banking & Finance', industries: ['Banking & Finance'] }, expect: 'stored' },
    { label: 'QCCI category → would-fix', row: { name: 'QNBN', industry: null, industries: null, extra_fields: { qcci_category: 'Communication Services' } }, expect: 'would-fix' },
    { label: 'name marker → would-fix', row: { name: 'Doha Medical Clinic', industry: null, industries: null, extra_fields: {} }, expect: 'would-fix' },
    { label: 'specific trade label → would-fix (own tag)', row: { name: 'Al Lulu Est', industry: null, industries: null, sector: 'Pearl Diving Services' }, expect: 'would-fix' },
    { label: 'only generic label → gap-with-label', row: { name: 'Gen Est', industry: null, industries: null, sector: 'Services' }, expect: 'gap-with-label' },
    { label: 'no signal → gap-no-label', row: { name: 'ABC Est', industry: null, industries: null, extra_fields: {} }, expect: 'gap-no-label' },
  ];
  let pass = 0, fail = 0;
  for (const c of cases) {
    const got = auditRow(c.row).status;
    const ok = got === c.expect;
    if (ok) pass++; else { fail++; console.log(`  FAIL: ${c.label} → ${got} (expected ${c.expect})`); }
    console.log(`  ${ok ? '✓' : '✗'} ${c.label}  →  ${got}`);
  }
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

const isMain = process.argv[1] && process.argv[1].endsWith('industry_coverage_audit.js');
if (isMain) {
  if (process.argv.includes('--self-test')) selfTest();
  else run().then(() => process.exit(0)).catch((e) => { console.error('audit failed:', e); process.exit(1); });
}

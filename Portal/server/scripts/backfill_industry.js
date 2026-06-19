// ============================================================================
// Industry backfill  (existing data)
// ----------------------------------------------------------------------------
// The companies-list industry filter only catches companies that HAVE an
// `industry` set — and many don't (no LinkedIn match, never harvested). This
// fills the blanks by inferring a canonical industry from the strongest text
// signals already on the row: the company name, LinkedIn industry/specialties,
// the source-directory categories (QCCI / QSTP / QFZ), and any website text.
//
// SAFETY
//   • DRY-RUN by default: nothing is written; it prints how many it WOULD fill
//     and the per-industry distribution. Add  --apply  to write.
//   • Only fills rows whose industry is currently empty — never overwrites an
//     existing (e.g. LinkedIn-sourced) industry.
//   • Leaves a row blank when nothing matches confidently (no wild guesses).
//   • Sets updated_at so the change mirrors to prod on the next sync push.
//
// USAGE (run from the Portal directory)
//   node server/scripts/backfill_industry.js              # preview
//   node server/scripts/backfill_industry.js --apply      # write
//   node server/scripts/backfill_industry.js --limit 2000 # preview a sample
//   node server/scripts/backfill_industry.js --self-test  # accuracy check, no DB
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inferIndustry } from '../enrichment/local/extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH = 1000;

function asText(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map(asText).join(' ');
  if (typeof v === 'object') return Object.values(v).map(asText).join(' ');
  return String(v);
}

// Build the text blob we run the classifier over, from the row's strongest
// industry signals (name first — it's the most reliable in Qatar).
function buildBlob(c) {
  const x = c.extra_fields || {};
  return [
    c.name, c.name, c.legal_name,                       // name weighted (repeated)
    x.linkedin_industry_v2_taxonomy,
    c.linkedin_specialties, c.linkedin_description, c.linkedin_headquarters,
    x.qcci_category, x.qcci_sub_category,
    x.qstp_category, x.qstp_sector_tags,
    x.qfz_sectors_raw,
    x.website_description, x.website_keywords,
  ].map(asText).join('  \n  ');
}

function argInt(flag, dflt) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return dflt;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : dflt;
}

async function run() {
  const { query } = await import('../db.js');
  const apply = process.argv.includes('--apply');
  const limitArg = argInt('--limit', null);

  let lastId = 0, scanned = 0, filled = 0, processed = 0;
  const dist = new Map();
  const samples = [];

  for (;;) {
    const r = await query(
      `SELECT id, name, legal_name, linkedin_description, linkedin_specialties,
              linkedin_headquarters, extra_fields
         FROM companies
        WHERE (industry IS NULL OR btrim(industry) = '') AND id > $1
        ORDER BY id LIMIT $2`, [lastId, BATCH]);
    if (!r.rows.length) break;
    lastId = r.rows[r.rows.length - 1].id;

    for (const c of r.rows) {
      scanned++;
      const ind = inferIndustry(buildBlob(c));
      if (ind) {
        filled++;
        dist.set(ind, (dist.get(ind) || 0) + 1);
        if (samples.length < 30) samples.push(`${ind}  ←  ${String(c.name || '').slice(0, 48)}`);
        if (apply) {
          await query(
            `UPDATE companies SET industry = $2, updated_at = now()
              WHERE id = $1 AND (industry IS NULL OR btrim(industry) = '')`,
            [c.id, String(ind).slice(0, 80)]);
        }
      }
      processed++;
      if (limitArg && processed >= limitArg) break;
    }
    if (limitArg && processed >= limitArg) break;
  }

  report({ apply, scanned, filled, dist, samples });
}

function report({ apply, scanned, filled, dist, samples }) {
  const L = [];
  L.push('='.repeat(64));
  L.push(`  BELL INDUSTRY BACKFILL — ${apply ? 'APPLIED' : 'DRY-RUN'}`);
  L.push(`  ${new Date().toISOString()}`);
  L.push('='.repeat(64));
  L.push('');
  L.push(`Companies with no industry scanned: ${scanned}`);
  L.push(`Would be filled (confident match):  ${filled}  (${scanned ? Math.round(filled / scanned * 100) : 0}%)`);
  L.push(`Left blank (no confident match):    ${scanned - filled}`);
  L.push('');
  L.push('Distribution of the filled industries:');
  for (const [ind, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) {
    L.push(`  ${String(n).padStart(7)}  ${ind}`);
  }
  L.push('');
  if (samples.length) { L.push('Sample classifications (industry ← company name):'); for (const s of samples) L.push('  · ' + s); L.push(''); }
  L.push(apply
    ? 'Applied. Run a sync push so the new industries mirror to production.'
    : 'No changes written. Re-run with  --apply  to fill these in.');
  L.push('='.repeat(64));
  const text = L.join('\n');
  console.log('\n' + text + '\n');
  try {
    const out = path.join(__dirname, '..', '..', `Industry-Backfill-${apply ? 'APPLIED' : 'PREVIEW'}.txt`);
    fs.writeFileSync(out, text);
    console.log('Report saved to: ' + out);
  } catch (e) { console.log('(could not save report: ' + e.message + ')'); }
}

// ---------------------------------------------------------------------------
// Self-test (no DB): eyeball classifier accuracy on realistic Qatar names.
// ---------------------------------------------------------------------------
function selfTest() {
  const names = [
    'Al Faisal Trading & Contracting Co', 'Doha Modern Engineering', 'Qatar Petroleum Services',
    'Gulf Medical Center', 'Al Jazeera Real Estate', 'Doha Bank', 'Qatar Insurance Company',
    'Bin Omran Trading & Telecommunication', 'Salam International Investment', 'Aamal Trading and Distribution',
    'Teyseer Motors', 'Qatar Airways Catering', 'Al Meera Consumer Goods supermarket', 'Milaha Maritime & Logistics',
    'Doha Petroleum Construction', 'Gulf Pharmacy', 'Al Khalij Cleaning Services', 'Qatar Steel Industries',
    'Doha Furniture & Interior Decoration', 'Al Wakra Tailoring & Garments', 'Education Above All academy',
    'Qatar Solar Energy', 'Doha Marble & Chemicals', 'City Center Travel and Tours', 'Al Sraiya Security Services',
    'Woqod Fuel', 'Ali Bin Ali Automotive spare parts', 'Doha Films production', 'Qatar Cool district cooling',
    'Al Jaber Jewellery',
  ];
  let matched = 0;
  console.log('\nIndustry classifier — sample Qatar names:\n');
  for (const n of names) {
    const ind = inferIndustry(n);
    if (ind) matched++;
    console.log(`  ${ind ? '✓' : '·'}  ${(ind || '(none)').padEnd(26)} ${n}`);
  }
  console.log(`\nmatched ${matched}/${names.length} (${Math.round(matched / names.length * 100)}%)`);
  process.exit(0);
}

const isMain = process.argv[1] && process.argv[1].endsWith('backfill_industry.js');
if (isMain) {
  if (process.argv.includes('--self-test')) selfTest();
  else run().then(() => process.exit(0)).catch((e) => { console.error('backfill failed:', e); process.exit(1); });
}

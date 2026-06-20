// ============================================================================
// Industry (re)derivation backfill  — existing data
// ----------------------------------------------------------------------------
// Recomputes each company's PRIMARY industry + the full industry TAGS from its
// reliable signals (source-directory category > LinkedIn > strict name/desc
// inference) via server/lib/industry.js. This both fills blanks AND corrects
// old wrong guesses (e.g. QNBN "Healthcare" → "Telecommunications", since its
// QCCI category is "Communication Services").
//
// SAFETY
//   • DRY-RUN by default — prints how many companies would change + the new
//     distribution. Add  --apply  to write.
//   • Skips any company with industry_locked = true (an admin override).
//   • Only writes rows that actually change (so it doesn't needlessly bump
//     updated_at / re-sync). Never blanks an industry it can't improve.
//   • Sets updated_at on changed rows so they mirror to prod on the next push.
//
// USAGE (from the Portal directory)
//   node server/scripts/backfill_industry.js              # preview
//   node server/scripts/backfill_industry.js --apply      # write
//   node server/scripts/backfill_industry.js --limit 2000 # preview a sample
//   node server/scripts/backfill_industry.js --self-test  # logic test, no DB
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deriveIndustries } from '../lib/industry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH = 1000;

function argInt(flag, dflt) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return dflt;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : dflt;
}

function sameTags(a, b) {
  const x = a || [], y = b || [];
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

// Decide the new {primary, tags} for a company row.
function plan(c) {
  const d = deriveIndustries({
    name: c.name, legal_name: c.legal_name, sector: c.sector,
    description: c.linkedin_description, industry: c.industry, extra: c.extra_fields || {},
  });
  if (d.tags.length) return { primary: d.primary, tags: d.tags };
  // Nothing derivable — keep the existing primary (if any) as a single tag so
  // the filter still works; never blank what we can't improve.
  const cur = (c.industry || '').trim();
  return cur ? { primary: cur, tags: [cur] } : { primary: null, tags: [] };
}

async function run() {
  const { query } = await import('../db.js');
  const apply = process.argv.includes('--apply');
  const limitArg = argInt('--limit', null);

  let lastId = 0, scanned = 0, changed = 0, processed = 0, multi = 0, lockedSkipped = 0;
  const dist = new Map();
  const samples = [];

  for (;;) {
    const r = await query(
      `SELECT id, name, legal_name, sector, industry, industries, industry_locked,
              linkedin_description, extra_fields
         FROM companies WHERE id > $1 ORDER BY id LIMIT $2`, [lastId, BATCH]);
    if (!r.rows.length) break;
    lastId = r.rows[r.rows.length - 1].id;

    for (const c of r.rows) {
      scanned++;
      if (c.industry_locked) { lockedSkipped++; processed++; if (limitArg && processed >= limitArg) break; continue; }
      const { primary, tags } = plan(c);
      const isChange = (primary !== (c.industry || null)) || !sameTags(tags, c.industries);
      if (isChange) {
        changed++;
        if (tags.length >= 2) multi++;
        if (primary) dist.set(primary, (dist.get(primary) || 0) + 1);
        if (samples.length < 30) samples.push(`${(c.industry || '(blank)').slice(0, 22).padEnd(22)} → ${tags.join(' + ') || '(blank)'}   ·   ${String(c.name || '').slice(0, 40)}`);
        if (apply) {
          await query(
            `UPDATE companies SET industry = $2, industries = $3, updated_at = now()
              WHERE id = $1 AND industry_locked = false`,
            [c.id, primary, tags.length ? tags : null]);
        }
      }
      processed++;
      if (limitArg && processed >= limitArg) break;
    }
    if (limitArg && processed >= limitArg) break;
  }

  report({ apply, scanned, changed, multi, lockedSkipped, dist, samples });
}

function report({ apply, scanned, changed, multi, lockedSkipped, dist, samples }) {
  const L = [];
  L.push('='.repeat(66));
  L.push(`  BELL INDUSTRY RE-DERIVATION — ${apply ? 'APPLIED' : 'DRY-RUN'}`);
  L.push(`  ${new Date().toISOString()}`);
  L.push('='.repeat(66));
  L.push('');
  L.push(`Companies scanned:        ${scanned}`);
  L.push(`Would change:             ${changed}  (${scanned ? Math.round(changed / scanned * 100) : 0}%)`);
  L.push(`  …of which multi-industry: ${multi}`);
  L.push(`Skipped (admin-locked):   ${lockedSkipped}`);
  L.push('');
  L.push('New PRIMARY-industry distribution (changed rows):');
  for (const [ind, n] of [...dist.entries()].sort((a, b) => b[1] - a[1])) L.push(`  ${String(n).padStart(7)}  ${ind}`);
  L.push('');
  if (samples.length) { L.push('Sample changes (old primary → new tags · company):'); for (const s of samples) L.push('  · ' + s); L.push(''); }
  L.push(apply ? 'Applied. Run a sync push to mirror the new industries to production.'
               : 'No changes written. Re-run with  --apply  to write them.');
  L.push('='.repeat(66));
  const text = L.join('\n');
  console.log('\n' + text + '\n');
  try {
    const out = path.join(__dirname, '..', '..', `Industry-Rederive-${apply ? 'APPLIED' : 'PREVIEW'}.txt`);
    fs.writeFileSync(out, text);
    console.log('Report saved to: ' + out);
  } catch (e) { console.log('(could not save report: ' + e.message + ')'); }
}

// ---------------------------------------------------------------------------
function selfTest() {
  const cases = [
    { name: 'Qatar National Broadband Network', sector: 'Communication Services', extra_fields: { qcci_sub_category: 'Communication Services' }, expect: 'Telecommunications' },
    { name: 'AR Brand Consulting QFZ LLC', sector: 'Professional and Business Services', extra_fields: { qfz_sectors_raw: 'Professional and Business Services' }, expect: 'Consulting' },
    { name: 'Al Faisal Trading & Contracting Co', sector: 'Trading & Contracting', extra_fields: {}, expectMulti: true },
    { name: 'Doha Bank', sector: null, extra_fields: { linkedin_industry_v2_taxonomy: 'Banking' }, expect: 'Banking & Finance' },
  ];
  let pass = 0, fail = 0;
  for (const c of cases) {
    const { primary, tags } = plan({ ...c, industry: null, industries: null });
    const ok = c.expectMulti ? tags.length >= 2 : primary === c.expect;
    if (ok) pass++; else { fail++; console.log('  FAIL:', c.name, '→', primary, JSON.stringify(tags)); }
    console.log(`  ${ok ? '✓' : '✗'} ${c.name}  →  ${JSON.stringify(tags)}`);
  }
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

const isMain = process.argv[1] && process.argv[1].endsWith('backfill_industry.js');
if (isMain) {
  if (process.argv.includes('--self-test')) selfTest();
  else run().then(() => process.exit(0)).catch((e) => { console.error('backfill failed:', e); process.exit(1); });
}

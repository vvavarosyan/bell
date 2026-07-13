// Assign an industry to companies that have none, from their NAME + any stored
// website/description text — deterministic keyword rules, NO AI (Val 2026-07-13).
// Only assigns when one industry clearly wins; otherwise leaves it blank (never
// guess — Rule 2.1). The value is marked "derived" (extra_fields.industry_derived)
// so it's never confused with a registry-stated industry.
//
// SAFETY: DRY-RUN by default. Add --apply to write. Idempotent (only touches rows
// still missing an industry). Publishes on the next mirror push.
//   Preview:  node server/scripts/backfill_industries.js
//   Apply:    node server/scripts/backfill_industries.js --apply

import { query } from '../db.js';
import { classifyCompany } from '../enrichment/local/industry_classify.js';

const apply = process.argv.includes('--apply');

(async () => {
  console.log(`Bell — derive industry from name + website  (${apply ? 'APPLY — writing' : 'DRY-RUN — preview only'})\n`);
  const rows = (await query(
    `SELECT id, name, extra_fields->>'website_description' AS descr, linkedin_description AS li
       FROM companies
      WHERE (industry IS NULL OR industry='') AND coalesce(archived,false)=false AND is_active=true`)).rows;

  const byInd = {}; let matched = 0; const bySource = { name: 0, website: 0, 'name+website': 0 };
  const toWrite = [];
  for (const r of rows) {
    const c = classifyCompany({ name: r.name, description: `${r.descr || ''} ${r.li || ''}` });
    if (!c) continue;
    matched++; byInd[c.industry] = (byInd[c.industry] || 0) + 1; bySource[c.source] = (bySource[c.source] || 0) + 1;
    toWrite.push({ id: r.id, industry: c.industry, source: c.source, keywords: c.keywords });
  }
  console.log(`No-industry companies: ${rows.length.toLocaleString()}`);
  console.log(`Confident industry found: ${matched.toLocaleString()}  (${(100 * matched / rows.length).toFixed(0)}%) — the rest stay blank`);
  console.log(`  by source: ${Object.entries(bySource).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log('  by industry: ' + Object.entries(byInd).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k} ${v}`).join(' · '));

  if (!apply) { console.log('\nPreview only. Run "Apply Industry Backfill.command" to write.'); process.exit(0); }

  let done = 0;
  for (const w of toWrite) {
    try {
      await query(
        `UPDATE companies SET industry = $2, industries = ARRAY[$2],
           extra_fields = coalesce(extra_fields,'{}'::jsonb) || jsonb_build_object('industry_derived', $3::jsonb),
           updated_at = now()
         WHERE id = $1 AND (industry IS NULL OR industry='')`,
        [w.id, w.industry, JSON.stringify({ source: w.source, keywords: w.keywords, at: new Date().toISOString() })]);
      done++;
      if (done % 500 === 0) console.log(`  … ${done}/${toWrite.length}`);
    } catch (e) { console.log(`  [err] co#${w.id}: ${e.message}`); }
  }
  console.log(`\n→ assigned an industry to ${done.toLocaleString()} companies (marked "derived"). Publishes on the next data push.`);
  process.exit(0);
})().catch((e) => { console.error('Stopped:', e.message); process.exit(1); });

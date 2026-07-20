// Fix derived-industry misfires where a company's NAME decisively contradicts the
// industry it was tagged (QCCI mis-categorisation: a barbershop filed under
// "Investment" → Banking, a dry-cleaner under "Petroleum Services" → Oil & Gas).
// Re-derives ONLY companies whose name carries a decisive consumer-trade signal
// (nameTradeSignal), so genuine Oil/Bank/Agri companies are never touched.
//
// Preview (no flag): shows every before→after, writes nothing.
// Apply (--apply):   writes the corrected industry + industries[], stamps
//                    extra_fields.industry_corrected (old value kept for audit),
//                    and rescores each company (industry is worth 8 Bell-Score pts).
// Idempotent: re-running after Apply reports 0 changes.

import { query } from '../db.js';
import { deriveIndustries, nameTradeSignal, mapLabelToCanonical } from '../lib/industry.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';

const APPLY = process.argv.includes('--apply');
// Wide SQL net; the precise DECISIVE match is nameTradeSignal() in JS below.
const CAND_RX = `name ~* '\\m(barber|salo{1,2}n|laundr|launderette|laundromat|dry ?clean|hair ?cut|haircut|hairdress|pharmac|restaurant|cafeteria|bakery|patisserie|spa)'`;

const eq = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

(async () => {
  const rows = (await query(
    `SELECT id, name, legal_name, sector, industry, industries, extra_fields AS extra
       FROM companies
      WHERE COALESCE(archived, false) = false AND ${CAND_RX}`)).rows;

  const changes = [];
  for (const c of rows) {
    const sig = nameTradeSignal(c.name, c.legal_name);
    if (!sig) continue;                                     // only decisive consumer trades
    // Only touch companies that ACTUALLY carry a contradicting industry today —
    // the reported bug (barbershop→Banking, dry-cleaner→Oil&Gas). Companies that
    // merely lack the trade tag are left for normal re-derivation; this keeps the
    // cleanup surgical and high-confidence (no false vetoes on e.g. "restaurant
    // supplies trading", which carries no incompatible industry).
    const bad = new Set(sig.incompatible);
    const isBad = (t) => bad.has(t) || mapLabelToCanonical(t).some((cc) => bad.has(cc));
    const carriesContradiction = (c.industries || []).some(isBad) || (c.industry && isBad(c.industry));
    if (!carriesContradiction) continue;
    const d = deriveIndustries({ name: c.name, legal_name: c.legal_name, sector: c.sector, extra: c.extra });
    if (!eq(c.industries, d.tags) || c.industry !== d.primary) changes.push({ c, d });
  }

  console.log(`Scanned ${rows.length} candidate names · ${changes.length} companies would be corrected.`);
  console.log('');
  for (const { c, d } of changes.slice(0, 50)) {
    console.log(`  #${c.id}  ${String(c.name).slice(0, 42)}`);
    console.log(`       ${JSON.stringify(c.industries || [])}  →  ${JSON.stringify(d.tags)}`);
  }
  if (changes.length > 50) console.log(`  … and ${changes.length - 50} more.`);

  if (!APPLY) {
    console.log('');
    console.log('Preview only — nothing written. Double-click "Apply Industry Contradiction Fix.command" to correct them.');
    process.exit(0);
  }

  const at = new Date().toISOString();
  let done = 0;
  for (const { c, d } of changes) {
    try {
      await query(
        `UPDATE companies
            SET industry = $2,
                industries = $3::text[],
                extra_fields = coalesce(extra_fields, '{}'::jsonb)
                               || jsonb_build_object('industry_corrected', $4::jsonb)
          WHERE id = $1`,
        [c.id, d.primary, d.tags, JSON.stringify({ from: c.industries || [], reason: 'name-contradiction', at })]);
      await recomputeBellScoreForCompany(c.id);
      done += 1;
      if (done % 25 === 0) console.log(`  … ${done}/${changes.length}`);
    } catch (e) { console.log(`  [err] #${c.id}: ${e.message}`); }
  }
  console.log('');
  console.log(`→ Corrected ${done} companies and rescored them. Publishes on the next data push (ask Claude, or "Push Changes.command").`);
  process.exit(0);
})().catch((e) => { console.error('Stopped:', e.stack || e.message); process.exit(1); });

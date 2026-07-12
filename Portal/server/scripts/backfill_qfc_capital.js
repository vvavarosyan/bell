// Backfill QFC share capital into company_financials — the deterministic,
// source-published financial win (Val 2026-07-12: "cover every public source,
// high-probability only").
//
// The QFC (Qatar Financial Centre) public register prints each firm's
// "Authorised Share Capital" and "Issued Share Capital" verbatim. The directory
// scan already stored them on the company row (extra_fields.qfc_authorised_share_capital
// / qfc_issued_share_capital, e.g. "QAR100,000.00", "$825,000.00", "€329.00",
// or "-" for none). This turns those verbatim strings into structured
// company_financials rows the Intel tab + Bella already render:
//   authorised → metric 'authorized_capital'   issued → metric 'capital'
// confidence 'high' (registry-published), source 'registry:qfc'.
//
// RULE 2.1: only numbers the source printed. A dash / empty value is skipped
// (stays MISSING, never guessed). Currency is kept per-figure and NEVER summed
// across QAR/USD/EUR/GBP. Idempotent: re-running replaces only registry:qfc rows.
//
// Run "Preview QFC Capital.command" first (writes nothing), then
// "Backfill QFC Capital.command" (--apply) once the preview looks right.

import { query } from '../db.js';

const CUR = { 'QAR': 'QAR', 'QR': 'QAR', '$': 'USD', 'US$': 'USD', 'USD': 'USD', '€': 'EUR', 'EUR': 'EUR', '£': 'GBP', 'GBP': 'GBP' };

// "QAR100,000.00" / "$825,000.00" / "€329.00" / "-" → { value_num, currency, value_text } | null
export function parseCapital(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/[0-9]/.test(s)) return null;                       // "-" / empty → MISSING, not guessed
  const m = s.match(/^\s*([^\d.,\s-]+)?\s*([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const tok = (m[1] || '').trim();
  const currency = CUR[tok] || CUR[tok.toUpperCase()] || (tok || null);
  const value_num = Number(m[2].replace(/,/g, ''));
  if (!Number.isFinite(value_num)) return null;
  return { value_num, currency, value_text: s };
}

async function main() {
  const APPLY = process.argv.includes('--apply');
  console.log('Bell — QFC Share Capital backfill' + (APPLY ? '  (APPLY — writing)' : '  (PREVIEW — nothing will be written)'));
  console.log('Source: QFC public register (authorised + issued share capital), already scraped onto each company.\n');

  const r = await query(`
    SELECT id, name,
           extra_fields->>'qfc_authorised_share_capital' AS auth,
           extra_fields->>'qfc_issued_share_capital'     AS issued
      FROM companies
     WHERE extra_fields ? 'qfc_authorised_share_capital'
        OR extra_fields ? 'qfc_issued_share_capital'`);

  const toWrite = [];          // { company_id, metric, value_text, value_num, currency }
  const byCur = {};
  let companiesWithData = 0;
  const samples = [];
  for (const c of r.rows) {
    const a = parseCapital(c.auth);
    const i = parseCapital(c.issued);
    let any = false;
    if (a) { toWrite.push({ company_id: c.id, metric: 'authorized_capital', ...a }); byCur[a.currency] = (byCur[a.currency] || 0) + 1; any = true; }
    if (i) { toWrite.push({ company_id: c.id, metric: 'capital',            ...i }); byCur[i.currency] = (byCur[i.currency] || 0) + 1; any = true; }
    if (any) { companiesWithData++; if (samples.length < 12) samples.push({ name: c.name, auth: c.auth, issued: c.issued, pa: a, pi: i }); }
  }

  console.log(`Companies carrying a QFC capital field: ${r.rows.length.toLocaleString()}`);
  console.log(`Companies with at least one real figure:  ${companiesWithData.toLocaleString()}`);
  console.log(`Financial rows to write:                  ${toWrite.length.toLocaleString()}`);
  console.log('By currency (never summed across):        ' + Object.entries(byCur).map(([k, v]) => `${k}:${v.toLocaleString()}`).join('  '));
  console.log('\nSamples (verbatim → parsed):');
  for (const s of samples) {
    console.log(`  ${(s.name || '').slice(0, 34).padEnd(34)}  auth "${s.auth || '-'}" → ${s.pa ? s.pa.value_num + ' ' + s.pa.currency : 'MISSING'}   |   issued "${s.issued || '-'}" → ${s.pi ? s.pi.value_num + ' ' + s.pi.currency : 'MISSING'}`);
  }

  if (!APPLY) {
    console.log('\nPREVIEW only — nothing written. If the numbers above look right, run "Backfill QFC Capital.command".');
    return;
  }

  // Replace only registry:qfc rows (idempotent; leaves audited/website rows untouched).
  console.log('\nWriting…');
  await query(`DELETE FROM company_financials WHERE source = 'registry:qfc'`);
  let written = 0;
  const B = 500;
  for (let i = 0; i < toWrite.length; i += B) {
    const batch = toWrite.slice(i, i + B);
    const vals = [];
    const params = [];
    batch.forEach((w, j) => {
      const o = j * 5;
      vals.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},'high','registry:qfc')`);
      params.push(w.company_id, w.metric, w.value_text, w.value_num, w.currency);
    });
    await query(
      `INSERT INTO company_financials (company_id, metric, value_text, value_num, currency, confidence, source) VALUES ${vals.join(',')}`,
      params);
    written += batch.length;
  }
  console.log(`Wrote ${written.toLocaleString()} company_financials rows (confidence 'high', source 'registry:qfc').`);

  // Push to the prod mirror now (falls through gracefully if no sync token).
  try {
    const { runPush } = await import('../sync/push.js');
    const res = await runPush({});
    console.log('Prod mirror push:', typeof res === 'object' ? JSON.stringify(res).slice(0, 200) : res);
  } catch (e) {
    console.log('Prod push skipped (' + e.message + ') — the next regular sync push will carry these rows.');
  }
  console.log('\nDone. Open a QFC-registered company in the portal → Intel tab → Financials shows Authorized + Share capital with a green (registry) dot.');
}

main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e); process.exit(1); });

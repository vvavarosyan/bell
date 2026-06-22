// ============================================================================
// Build the curated specific-trade VOCABULARY from real data.
// ----------------------------------------------------------------------------
// Counts every cleaned specific-trade candidate (server/lib/industry.js →
// specificTradesFor) across ACTIVE companies and keeps those appearing on
// >= --min companies (default 20), dropping the long tail of one-off / typo'd
// MOCI activity strings. Writes server/data/trade_vocab.json, which
// deriveIndustries then uses to decide which specific trades become filterable
// industries. Broad canonical industries are unaffected.
//
// USAGE (from the Portal directory)
//   node server/scripts/build_trade_vocabulary.js            # build (min 20)
//   node server/scripts/build_trade_vocabulary.js --min 10   # keep rarer trades
//   node server/scripts/build_trade_vocabulary.js --self-test # logic test, no DB
// After building: re-derive (Backfill Industries) then Push Changes + sync.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { specificTradesFor } from '../lib/industry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH = 1000;

function argInt(flag, dflt) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return dflt;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : dflt;
}

async function run() {
  const { query } = await import('../db.js');
  const MIN = argInt('--min', 20);
  const counts = new Map();
  let lastId = 0, scanned = 0;

  for (;;) {
    const r = await query(
      `SELECT id, name, legal_name, sector, extra_fields
         FROM companies WHERE archived = false AND id > $1 ORDER BY id LIMIT $2`, [lastId, BATCH]);
    if (!r.rows.length) break;
    lastId = r.rows[r.rows.length - 1].id;
    for (const c of r.rows) {
      scanned++;
      for (const t of specificTradesFor({ name: c.name, legal_name: c.legal_name, sector: c.sector, extra: c.extra_fields || {} })) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
  }

  const kept = [...counts.entries()].filter(([, n]) => n >= MIN).sort((a, b) => b[1] - a[1]);
  const vocab = kept.map(([t]) => t).sort((a, b) => a.localeCompare(b));
  const outDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'trade_vocab.json');
  fs.writeFileSync(outFile, JSON.stringify(vocab));

  const L = [];
  L.push('='.repeat(64));
  L.push('  BELL — TRADE VOCABULARY BUILD');
  L.push('  ' + new Date().toISOString());
  L.push('='.repeat(64));
  L.push(`Companies scanned:           ${scanned}`);
  L.push(`Distinct trade candidates:   ${counts.size}`);
  L.push(`KEPT (on >= ${MIN} companies):    ${kept.length}`);
  L.push(`Dropped as one-off noise:    ${counts.size - kept.length}`);
  L.push('');
  L.push('Top kept trades:');
  for (const [t, n] of kept.slice(0, 40)) L.push(`  ${String(n).padStart(6)}  ${t}`);
  L.push('');
  L.push('Wrote ' + vocab.length + ' trades to: ' + outFile);
  L.push('Next: re-derive (Backfill Industries), then Push Changes + sync.');
  L.push('='.repeat(64));
  console.log('\n' + L.join('\n') + '\n');
}

function selfTest() {
  const split = specificTradesFor({ extra: { qfz_sectors_raw: '1. Information And Communication Technologies (Ict) 2. Professional And Business Services' } });
  const broadSyn = specificTradesFor({ sector: 'Trade' });            // → dropped (broad synonym)
  const generic = specificTradesFor({ sector: 'Services' });          // → dropped (generic)
  const real = specificTradesFor({ extra: { qcci_category: 'Car Repair' } });
  const lead = specificTradesFor({ sector: "' Professional And Business Services" });  // leading quote stripped
  const checks = [
    ['QFZ numbered split → 2 parts', split.length === 2],
    ['broad synonym "Trade" dropped', broadSyn.length === 0],
    ['generic "Services" dropped', generic.length === 0],
    ['real trade kept', real.length === 1 && real[0] === 'Car Repair'],
    ['leading quote stripped', lead.length === 1 && lead[0] === 'Professional And Business Services'],
  ];
  let fail = 0;
  for (const [label, ok] of checks) { if (!ok) fail++; console.log(`  ${ok ? '✓' : '✗'} ${label}`); }
  console.log(`\nself-test: ${checks.length - fail} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

const isMain = process.argv[1] && process.argv[1].endsWith('build_trade_vocabulary.js');
if (isMain) {
  if (process.argv.includes('--self-test')) selfTest();
  else run().then(() => process.exit(0)).catch((e) => { console.error('build failed:', e); process.exit(1); });
}

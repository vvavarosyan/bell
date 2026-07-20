// QFC "Doha" city cleanup — Preview (default) / Apply (--apply). Val 2026-07-20.
//
// The old QFC importer stamped city='Doha' on every QFC entity (5,243 rows) even
// though the register states no city. Most really ARE in Doha, so a blanket wipe
// would destroy true values (the inverse Rule-2.1 harm). This clears the guess
// ONLY where NOTHING corroborates Doha:
//   • no geocoded coordinate,
//   • the stored address doesn't mention Doha,
//   • no OTHER source exists for the company, and
//   • no branch/location row places it in Doha.
// Conservative by design — when in doubt it KEEPS the value. (~80 rows qualify,
// e.g. "J and k LLC" whose own address says Lusail, not Doha.) The importer no
// longer writes this guess going forward. Apply pushes to prod itself.

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../db.js';

const APPLY = process.argv.includes('--apply');
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT = join(__dirname, '..', '..', '..', 'QFC Doha City — Preview.tsv');

// Uncorroborated QFC "Doha" rows — the ONLY ones safe to clear.
const WHERE = `
      lower(c.city) = 'doha'
  AND EXISTS (SELECT 1 FROM company_sources s WHERE s.company_id = c.id AND s.source = 'QFC')
  AND c.latitude IS NULL
  AND (c.address IS NULL OR c.address NOT ILIKE '%doha%')
  AND NOT EXISTS (SELECT 1 FROM company_sources s2 WHERE s2.company_id = c.id AND s2.source <> 'QFC')
  AND NOT EXISTS (
        SELECT 1 FROM company_locations l
         WHERE l.company_id = c.id
           AND ( lower(coalesce(l.address,'') || ' ' || coalesce(l.label,'')) LIKE '%doha%'
                 OR l.latitude IS NOT NULL )
      )`;

async function main() {
  const rows = (await query(`SELECT c.id, c.name, c.address FROM companies c WHERE ${WHERE} ORDER BY c.id`)).rows;

  console.log('');
  console.log('QFC "DOHA" CITY CLEANUP — ' + (APPLY ? 'APPLY' : 'PREVIEW (no changes)'));
  console.log('  Uncorroborated QFC rows to clear (city → empty): ' + rows.length);
  console.log('  (All other QFC "Doha" rows are kept — a coordinate, address, other source, or branch confirms Doha.)');
  console.log('');
  console.log('  Sample of what will be cleared:');
  for (const r of rows.slice(0, 15)) console.log('    #' + r.id + '  ' + String(r.name).slice(0, 40) + '  | addr: ' + String(r.address || '').replace(/\s+/g, ' ').slice(0, 34));
  console.log('');

  const lines = ['# id\tname\taddress'];
  for (const r of rows) lines.push(r.id + '\t' + r.name + '\t' + String(r.address || '').replace(/\s+/g, ' '));
  writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');
  console.log('  Full list written to:\n    ' + REPORT);
  console.log('');

  if (!APPLY) {
    console.log('  This was a PREVIEW — nothing changed. To apply, run "Apply QFC Doha City Cleanup.command".');
    return;
  }
  if (!rows.length) { console.log('  Nothing to clear.'); return; }

  const res = await query(`UPDATE companies AS c SET city = NULL, updated_at = now() WHERE ${WHERE}`);
  console.log('  Cleared ' + res.rowCount + ' unconfirmed "Doha" city values.');
  console.log('');
  console.log('  Pushing changes to production...');
  const { runPush } = await import('../sync/push.js');
  await runPush({});
  console.log('  Done — production updated.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.stack || e); process.exit(1); });

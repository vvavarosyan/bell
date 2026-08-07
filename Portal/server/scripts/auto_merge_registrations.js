// Merge companies the REGISTRY itself identifies as one. Preview by default; --apply to write.
//
// Run by "Preview Registry Merge.command" / "Apply Registry Merge.command", and nightly by
// nightly_sweep.js (Val, 2026-07-22: "if CR number is matching let it link automatically").
//
// The rule is narrower than "matching CR number" on purpose — see assembly/auto_merge.js for the
// live counter-examples that make the plain reading unsafe (a kindergarten and a petroleum
// services company share a number across different issuing registers).

import { autoMergeExactRegistrations, findExactRegistrationGroups } from '../assembly/auto_merge.js';
import { pool } from '../db.js';

const APPLY = process.argv.includes('--apply');

(async () => {
  console.log('Bell — Registry Merge' + (APPLY ? '  (APPLYING)' : '  (PREVIEW — nothing will be written)'));
  console.log('');
  console.log('Merges two company records only when the SAME issuing body states the SAME');
  console.log('registration number for both, AND their names match. Branch registrations');
  console.log('(numbers like 42828/2) are never merged — those are linked as branches instead.');
  console.log('');

  const groups = await findExactRegistrationGroups();
  if (!groups.length) {
    console.log('Nothing to merge — no two live companies share a registration.');
    console.log('');
    return;
  }

  const r = await autoMergeExactRegistrations({ apply: APPLY, log: (m) => console.log(m) });

  console.log('');
  console.log('  Registrations held by more than one company : ' + r.groups);
  console.log('  Names agree, safe to merge                  : ' + r.eligible);
  console.log('  Held back because the names differ          : ' + r.held);
  console.log('');
  if (APPLY) {
    console.log('  ✓ MERGED ' + r.merged + ' duplicate record(s)' + (r.failed ? ', ' + r.failed + ' failed' : ''));
    console.log('    Everything the duplicate held — map pins, financials, owners, licences,');
    console.log('    contacts — now sits on the surviving record. Nothing was thrown away.');
    console.log('    Goes live on the next data push.');
  } else {
    console.log('  This preview would merge ' + r.merged + ' duplicate record(s) into ' + r.eligible + ' survivor(s).');
    console.log('  Sample:');
    for (const d of r.done.slice(0, 10)) {
      console.log('    ' + String(d.name).slice(0, 46).padEnd(48) + '#' + d.dup + ' → #' + d.survivor);
    }
    if (r.done.length > 10) console.log('    …and ' + (r.done.length - 10) + ' more.');
    console.log('');
    console.log('  Nothing was written. Double-click "Apply Registry Merge.command" to do it.');
  }
  console.log('');
})()
  .catch((e) => { console.error('Stopped:', e.stack || e.message); process.exitCode = 1; })
  .finally(async () => { try { await pool.end(); } catch { /* ignore */ } });

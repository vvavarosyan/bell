// Repair the engine stage flags after an accidental full re-queue.
// Run via "Preview Engine Flag Repair.command" (dry run) then
// "Apply Engine Flag Repair.command" (writes). REPAIR_APPLY=1 = write.
//
// WHY THIS EXISTS (2026-07-09): POST /api/enrichment/engine/rescan used to do
// `SCOPES[scope] || SCOPES.all`. A browser holding the NEW UI (with the "Re-scan
// tech" button) talking to an OLD server process — which didn't know the 'tech'
// scope yet — silently fell through to `all`, clearing stage7/8/9/10/11_at for
// EVERY active company. Engine 1 (Website Finder) is the only PAID engine
// (Firecrawl search ≈2 credits per website-less company → ~120,000 credits for
// 60k companies). The route now rejects unknown scopes; this repairs the damage.
//
// HOW IT REPAIRS PRECISELY (no guessing): the rescan cleared only `stageN_at`,
// never `stageN_status`. That status column is untouched evidence of what each
// engine already did ('done' / 'no_data' / 'failed'). So we restore `stageN_at`
// ONLY where a status proves the stage really ran, and leave genuinely-unprocessed
// companies pending. Stage 12 (Tech Stack) is NEW and is deliberately left alone
// so Engine 6 scans everything once.

import { query } from '../db.js';

const APPLY = process.env.REPAIR_APPLY === '1';

// stage7/8/9_status are nullable (NULL = never ran); stage10/11_status default 'pending'.
const STAGES = [
  { n: 7,  engine: 'Engine 2 · Website Harvester', ranWhen: `stage7_status  IS NOT NULL AND stage7_status  <> 'pending'` },
  { n: 8,  engine: 'Engine 1 · Website Finder  ⚠ PAID', ranWhen: `stage8_status  IS NOT NULL AND stage8_status  <> 'pending'` },
  { n: 9,  engine: 'Engine 3 · Network Mapper', ranWhen: `stage9_status  IS NOT NULL AND stage9_status  <> 'pending'` },
  { n: 10, engine: 'Engine 4 · Email Finder',   ranWhen: `stage10_status IS NOT NULL AND stage10_status <> 'pending'` },
  { n: 11, engine: 'Engine 5 · Company Facts',  ranWhen: `stage11_status IS NOT NULL AND stage11_status <> 'pending'` },
];

// Restore to a timestamp in the past so a future genuine re-scan still treats
// these as "oldest first"; the exact original time is unrecoverable.
const RESTORE_AT = `now() - interval '30 days'`;
const ACTIVE = `COALESCE(archived,false)=false AND is_active IS NOT false`;

const pad = (x) => String(Number(x).toLocaleString()).padStart(9);

(async () => {
  console.log(`Bell — Engine Flag Repair  [${APPLY ? 'APPLY — writing' : 'PREVIEW — nothing will change'}]\n`);
  try {
    let totalRestore = 0, totalStillPending = 0;
    for (const s of STAGES) {
      const restorable = Number((await query(
        `SELECT count(*)::int n FROM companies WHERE ${ACTIVE} AND stage${s.n}_at IS NULL AND (${s.ranWhen})`)).rows[0].n);
      const genuinelyNew = Number((await query(
        `SELECT count(*)::int n FROM companies WHERE ${ACTIVE} AND stage${s.n}_at IS NULL AND NOT (${s.ranWhen})`)).rows[0].n);
      totalRestore += restorable; totalStillPending += genuinelyNew;

      console.log(`Stage ${String(s.n).padEnd(2)} ${s.engine}`);
      console.log(`   restore (already ran, flag lost): ${pad(restorable)}`);
      console.log(`   leave pending (never ran):        ${pad(genuinelyNew)}`);

      if (APPLY && restorable > 0) {
        const r = await query(
          `UPDATE companies SET stage${s.n}_at = ${RESTORE_AT}
            WHERE ${ACTIVE} AND stage${s.n}_at IS NULL AND (${s.ranWhen})`);
        console.log(`   ✓ restored ${Number(r.rowCount || 0).toLocaleString()}`);
      }
      console.log();
    }

    console.log('─'.repeat(64));
    console.log(`Total flags to restore:      ${pad(totalRestore)}`);
    console.log(`Total left genuinely pending:${pad(totalStillPending)}`);
    console.log('\nStage 12 (Engine 6 · Tech Stack) is intentionally NOT restored — it is a');
    console.log('new engine and should fingerprint every website once.');

    if (!APPLY) {
      console.log('\nThis was a PREVIEW. Nothing changed.');
      console.log('If the numbers look right, run "Apply Engine Flag Repair.command".');
    } else {
      console.log('\n✓ Repair applied. Re-run "Diagnose Bell Engines.command" to confirm:');
      console.log('  Engine 1 "to do" should drop to the genuinely-new count (near 0),');
      console.log('  and Engine 6 should still show every website to scan.');
    }
  } catch (err) {
    console.error('Repair failed: ' + (err.message || err));
    process.exit(1);
  }
  process.exit(0);
})();

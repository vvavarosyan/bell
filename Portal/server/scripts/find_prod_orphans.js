// Which rows does production still hold that Bell has deleted?
//
// ⚠️ THE GAP THIS CLOSES. Production is a strict id-mirror of the engine box, but a hard delete
// only reaches it through a `sync_deletions` tombstone — production itself has ZERO delete
// triggers. Any bulk DELETE that forgets its tombstone leaves the row alive on production
// FOREVER, still being served to customers, while every count on the engine box looks healthy.
//
// The mismatch is easy to notice (/api/sync/count) and used to be impossible to act on, because
// nothing could say WHICH ids differed. A 260-row orphan set in company_tech sat unresolved for
// exactly that reason. This walks both sides by id and names them.
//
// READ-ONLY by default: it reports. Pass --apply to write the missing tombstones, which is what
// actually removes the rows on the next push.
//
//   node scripts/find_prod_orphans.js                     # every mirrored table, report only
//   node scripts/find_prod_orphans.js --table people      # one table
//   node scripts/find_prod_orphans.js --apply             # write the tombstones

import { query, pool } from '../db.js';
import { getKey } from '../keychain.js';
import { MIRROR_TABLES } from '../sync/tables.js';

// ⚠️ PRODUCTION ORIGINATES SOME ROWS, AND THIS TOOL NEARLY DELETED THEM.
// The premise "a row on prod that is not on the engine box is a deletion that failed to
// propagate" is FALSE for one id band. sync/pull.js: research jobs started on bell.qa execute on
// Railway and write NEW companies and people straight into the prod database, with ids from a
// reserved HIGH band (migration 0017). A reverse pull, which runs just before each push, brings
// them down. Between creation and that pull they exist ONLY on production — which is exactly the
// shape this tool was built to hunt.
//
// The first run flagged 7 such people (ids 2000040084-2000040090) as strays. Tombstoning them
// would have destroyed real research output that had never reached the engine box, permanently,
// and the reverse pull would have had nothing left to fetch.
//
// So the high band is never an orphan. It is reported separately, because a high-band row sitting
// on prod for a long time means the reverse PULL is failing — a real problem, with the opposite
// fix.
const HIGH_BASE = 2000000000;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const ONE = (() => { const i = args.indexOf('--table'); return i >= 0 ? args[i + 1] : null; })();
// Tables to leave alone this run. Used by the Apply command to hold back the one bucket that
// needs judgement rather than a rule — see HELD below.
const EXCEPT = new Set(args.reduce((acc, a, i) => (a === '--except' ? [...acc, args[i + 1]] : acc), []));
const PAGE = 50000;

const n = (v) => Number(v || 0).toLocaleString();

async function prodIds(base, token, table) {
  const ids = new Set();
  let after = 0;
  for (;;) {
    const url = `${base}/api/sync/ids?table=${encodeURIComponent(table)}&after=${after}&limit=${PAGE}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${table}: production answered ${r.status} — is the deploy live?`);
    const j = await r.json();
    for (const id of j.ids) ids.add(Number(id));
    if (!j.ids.length || j.next_after == null) break;
    after = j.next_after;
  }
  return ids;
}

(async () => {
  const token = await getKey('sync-token');
  if (!token) { console.error('No sync token configured.'); process.exit(1); }
  const base = process.env.BDI_PROD_URL || 'https://app.bell.qa';

  const tables = (ONE ? MIRROR_TABLES.filter((t) => t.name === ONE) : MIRROR_TABLES)
    .filter((t) => !EXCEPT.has(t.name));
  for (const skipped of EXCEPT) console.log(`  (holding back ${skipped} — not touched this run)`);
  if (!tables.length) { console.error(`Not a mirrored table: ${ONE}`); process.exit(1); }

  console.log('');
  console.log(`Comparing ${tables.length} mirrored table(s) against ${base}`);
  console.log(APPLY ? 'MODE: APPLY — missing tombstones will be written.' : 'MODE: report only (add --apply to fix).');
  console.log('');

  let totalOrphans = 0;
  for (const { name, syncWhere } of tables) {
    let local, prod;
    try {
      // ⚠️ A FILTERED TABLE IS NOT A BEHIND TABLE. company_relationships mirrors only high/medium
      // confidence non-competitor rows (syncWhere in sync/tables.js), so 216,538 local rows are
      // deliberately absent from production. Comparing raw counts called that "awaiting the next
      // push", which is exactly the kind of false alarm that trains you to ignore a report.
      // The filter is applied to the local side so both sides mean the same thing.
      local = new Set((await query(
        `SELECT id FROM ${name}` + (syncWhere ? ` WHERE ${syncWhere}` : '')
      )).rows.map((r) => Number(r.id)));
      prod = await prodIds(base, token, name);
    } catch (err) {
      console.log(`  ${name.padEnd(26)} skipped — ${err.message}`);
      continue;
    }

    // Rows production holds that the engine box does not.
    // ⚠️ For a filtered table this ALSO catches rows that stopped qualifying — a relationship
    // downgraded to 'low' confidence is withdrawn from production the same way a deletion is.
    const missing = [...prod].filter((id) => !local.has(id));
    // Split off the band production creates for itself — see the note at the top of this file.
    const orphans = missing.filter((id) => id < HIGH_BASE);
    const research = missing.filter((id) => id >= HIGH_BASE);
    if (research.length) {
      console.log(`  ${name.padEnd(26)} ↩ ${n(research.length)} row(s) CREATED ON PRODUCTION by research, not yet pulled down`);
      console.log(`      ids: ${research.slice(0, 8).join(', ')}${research.length > 8 ? ` … +${research.length - 8} more` : ''}`);
      console.log('      These are NOT strays and are never removed. If they persist, the reverse pull is failing.');
    }
    // The other direction is NOT a defect — those are simply rows the next push will carry.
    const pending = [...local].filter((id) => !prod.has(id)).length;

    if (!orphans.length) {
      console.log(`  ${name.padEnd(26)} ✓ ${n(local.size)} rows` +
        (syncWhere ? ' (filtered mirror)' : '') +
        (pending ? `  (${n(pending)} awaiting the next push)` : ''));
      continue;
    }
    totalOrphans += orphans.length;
    console.log(`  ${name.padEnd(26)} ⚠ ${n(orphans.length)} row(s) on production that Bell has deleted` +
      (syncWhere ? ' or withdrawn' : ''));
    console.log(`      ids: ${orphans.slice(0, 12).join(', ')}${orphans.length > 12 ? ` … +${orphans.length - 12} more` : ''}`);

    if (APPLY) {
      // A tombstone per orphan. The push's own deletion pass is what actually removes them —
      // nothing is deleted from here directly, and the push clears each tombstone once applied.
      //
      // NOT EXISTS rather than ON CONFLICT: sync_deletions has no unique constraint (migration
      // 016 — it is an append-only queue), so ON CONFLICT would dedupe nothing and a second run
      // before the next push would queue every id twice.
      const r = await query(
        `INSERT INTO sync_deletions (table_name, row_id)
         SELECT $1, x FROM unnest($2::bigint[]) AS x
          WHERE NOT EXISTS (
            SELECT 1 FROM sync_deletions d WHERE d.table_name = $1 AND d.row_id = x)
         RETURNING id`, [name, orphans]);
      console.log(`      → ${n(r.rowCount)} tombstone(s) written. They clear on the next push.`);
    }
  }

  console.log('');
  if (!totalOrphans) {
    console.log('  Production holds nothing Bell has deleted. The mirror is clean.');
  } else if (APPLY) {
    console.log(`  ${n(totalOrphans)} tombstone(s) queued. Run a push to remove them from production.`);
  } else {
    console.log(`  ${n(totalOrphans)} orphan row(s) found. Re-run with --apply to queue their removal.`);
  }
  console.log('');
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(0);
})();

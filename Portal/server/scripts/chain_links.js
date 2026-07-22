// Chain links (Tier 1) — link registry-stated branch registrations to their parent.
//
// Qatar's registry numbers a firm's branch registrations with a /n suffix on the base CR
// (42828, 42828/2, 42828/3). Linking the /n records under the bare-base record via
// parent_company_id is recording the registry's own statement — NOT a name match, NOT a
// guess. Every record keeps its own registration, status and history; one UPDATE to NULL
// per row undoes everything.
//
// Gates (each from a measured trap — see enrichment/chain_link.js):
//   MOCI/QCCI source required both ends (QFC/CRA licence numbers collide with CR bases),
//   bare-base parent must exist and be unique, existing different links never overwritten.
//
// Preview by default; writes only with --apply.

import { query, pool } from '../db.js';
import { findRegistryChains } from '../enrichment/chain_link.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';

const apply = process.argv.includes('--apply');
const trunc = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

async function main() {
  console.log('');
  console.log('BELL — CHAIN LINKS (registry-stated branches)' + (apply ? '   (APPLYING)' : '   (PREVIEW — nothing is written)'));
  console.log('==========================================================');
  console.log('');

  const { link, review } = await findRegistryChains();
  const total = link.reduce((n, g) => n + g.members.length, 0);
  console.log(`${link.length} firms with registry-numbered branch registrations → ${total} branch link(s) to write.`);
  console.log('Each branch stays its own registered company — it only gains a "part of" tie.');
  console.log('');
  for (const g of link.slice(0, 12)) {
    console.log(`  ${trunc(g.parent.name, 44)}  (CR ${g.base})`);
    for (const m of g.members.slice(0, 4)) console.log(`     ← #${m.id} ${trunc(m.name, 40)}  (${m.reg})`);
    if (g.members.length > 4) console.log(`     …and ${g.members.length - 4} more`);
  }
  if (link.length > 12) console.log(`  …and ${link.length - 12} more firms`);
  console.log('');
  console.log(`${review.length} group(s) held back (no bare-base parent, ambiguous base, or a source gate) — not touched.`);
  console.log('');

  if (!apply) {
    console.log('PREVIEW ONLY — nothing was written.');
    console.log('Double-click "Apply Chain Links.command" to write the links.');
    console.log('');
    return;
  }

  const client = await pool.connect();
  let written = 0;
  const touched = new Set();
  try {
    await client.query('BEGIN');
    // Re-derive under the transaction — never act on a stale preview.
    const live = await findRegistryChains();
    const liveTotal = live.link.reduce((n, g) => n + g.members.length, 0);
    if (liveTotal !== total) {
      await client.query('ROLLBACK');
      console.log(`STOPPED: the set changed since the preview (${total} → ${liveTotal}). Re-run Preview, then Apply.`);
      console.log('');
      return;
    }
    for (const g of live.link) {
      for (const m of g.members) {
        // Guarded UPDATE: only writes when still unlinked-or-same, still active.
        const r = await client.query(`
          UPDATE companies SET parent_company_id = $2, updated_at = now()
           WHERE id = $1 AND COALESCE(archived,false) = false
             AND (parent_company_id IS NULL OR parent_company_id = $2)`, [m.id, g.parent.id]);
        written += r.rowCount;
        if (r.rowCount) { touched.add(Number(m.id)); touched.add(Number(g.parent.id)); }
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Stopped, nothing written:', e.message);
    console.log('');
    return;
  } finally { client.release(); }

  for (const id of touched) await recomputeBellScoreForCompany(id).catch(() => {});
  console.log(`Linked ${written} branch registration(s) to their parent firm.`);
  console.log('They publish to the live site on the next data push. Undo any single link by');
  console.log('asking Claude — it is one field set back to empty, nothing else changed.');
  console.log('');
}

main().then(() => process.exit(0)).catch((e) => { console.error('Stopped:', e.stack || e.message); process.exit(1); });

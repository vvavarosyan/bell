// Branch model — Preview (default) / Apply (--apply). Val 2026-07-20.
//
// PREVIEW: shows every proposed change, writes the full list to a file, touches
//   NOTHING. Safe to run any time.
// APPLY: collapses each MoPH facility shell into a LOCATION of its one registered
//   parent, then archives the shell (reversibly — extra_fields.branch_collapsed_into
//   records the parent, so it can be undone). Also parent-LINKS any free-zone legal
//   branch to its sibling (non-destructive). Idempotent: re-running skips done rows.
//   Ends by pushing the changes to production itself.
//
// Why archive the shells: one real operator (e.g. DOC Medical Center) was
// fragmented into a pile of empty facility rows. That made the map cluttered and
// let the outreach machine email one operator up to 5×. Collapsing fixes both and
// gives the operator a clean "Locations (N)" list.

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, withTransaction } from '../db.js';
import { findMophCollapse, findLegalBranchLinks } from '../enrichment/branch_link.js';

const APPLY = process.argv.includes('--apply');
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const REPORT = join(REPO_ROOT, 'Branch Model — Preview.tsv');

// Strip the parent's name from the front of the shell name to get a clean location
// label ("DOC Medical Center Lusail Branch" → "Lusail Branch"). Falls back to the
// full shell name when the raw prefix doesn't line up (punctuation/legal-form diffs).
function labelFor(shellName, parentName) {
  const s = String(shellName || '').trim();
  const p = String(parentName || '').trim();
  if (p && s.toLowerCase().startsWith(p.toLowerCase())) {
    const tail = s.slice(p.length).replace(/^[\s\-,–—:]+/, '').trim();
    if (tail) return tail;
  }
  return s;
}

async function main() {
  const { groups: moph, skipped } = await findMophCollapse();
  const legal = await findLegalBranchLinks();

  const parents = new Set(moph.map((m) => m.parent_id));
  console.log('');
  console.log('BRANCH MODEL — ' + (APPLY ? 'APPLY' : 'PREVIEW (no changes)'));
  console.log('  MoPH facility shells to collapse : ' + moph.length + '  (into ' + parents.size + ' registered parents)');
  console.log('  Free-zone legal branches to link : ' + legal.length);
  console.log('  Skipped (generic parent name, left as separate companies): ' + skipped.length);
  console.log('');

  // Top clusters — the operators that were fragmented the most.
  const byParent = new Map();
  for (const m of moph) {
    if (!byParent.has(m.parent_id)) byParent.set(m.parent_id, { name: m.parent_name, shells: [] });
    byParent.get(m.parent_id).shells.push(m.shell_name);
  }
  const top = [...byParent.values()].sort((a, b) => b.shells.length - a.shells.length).slice(0, 15);
  console.log('  Biggest clusters (parent ← facility count):');
  for (const t of top) console.log('    ' + String(t.shells.length).padStart(3) + '  ' + String(t.name).slice(0, 46));
  console.log('');

  // Full report to a file so Val can eyeball every single group before Apply.
  const lines = ['# action\tshell_id\tshell_name\t→\tparent_id\tparent_name'];
  for (const m of moph) lines.push('collapse\t' + m.shell_id + '\t' + m.shell_name + '\t→\t' + m.parent_id + '\t' + m.parent_name);
  for (const l of legal) lines.push('link\t' + l.branch_id + '\t' + l.branch_name + '\t→\t' + l.parent_id + '\t' + l.parent_name);
  for (const s of skipped) lines.push('skipped-generic\t' + s.shell_id + '\t' + s.shell_name + '\t→\t' + s.parent_id + '\t' + s.parent_name);
  writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');
  console.log('  Full list written to:\n    ' + REPORT);
  console.log('');

  if (!APPLY) {
    console.log('  This was a PREVIEW — nothing changed. To apply, run "Apply Branch Model.command".');
    return;
  }
  if (moph.length === 0 && legal.length === 0) {
    console.log('  Nothing to apply.');
    return;
  }

  let collapsed = 0, linked = 0;
  const touchedParents = new Set();

  await withTransaction(async (client) => {
    for (const m of moph) {
      const label = labelFor(m.shell_name, m.parent_name);
      // Preserve the shell's location as a location of the parent — but ONLY when
      // it actually carries an address or coordinates (most facility shells are
      // empty; the branch addresses arrive later from the Reharvest run). The
      // dedupe index is (company_id, lower(address)), so ON CONFLICT keeps this
      // idempotent and collision-free.
      await client.query(
        `INSERT INTO company_locations (company_id, label, address, latitude, longitude, is_primary, source, raw, created_at, updated_at)
         SELECT $1, $2, btrim(COALESCE(s.address,'')), s.latitude, s.longitude, false, 'branch_collapse',
                jsonb_build_object('collapsed_from', s.id, 'shell_name', s.name), now(), now()
           FROM companies s
          WHERE s.id = $3
            AND (btrim(COALESCE(s.address,'')) <> '' OR s.latitude IS NOT NULL)
         ON CONFLICT (company_id, lower(address)) DO NOTHING`,
        [m.parent_id, label, m.shell_id]
      );
      // Archive the shell + point it at its parent. Guarded so re-runs skip it.
      const r = await client.query(
        `UPDATE companies
            SET parent_company_id = $1,
                archived = true,
                archived_at = now(),
                archive_reason = 'branch_collapsed',
                extra_fields = COALESCE(extra_fields,'{}'::jsonb)
                               || jsonb_build_object('branch_collapsed_into', $1::bigint, 'branch_collapsed_at', now()),
                updated_at = now()
          WHERE id = $2 AND parent_company_id IS NULL AND COALESCE(archived,false) = false`,
        [m.parent_id, m.shell_id]
      );
      if (r.rowCount > 0) { collapsed++; touchedParents.add(m.parent_id); }
    }

    for (const l of legal) {
      const r = await client.query(
        `UPDATE companies SET parent_company_id = $1, updated_at = now()
          WHERE id = $2 AND parent_company_id IS NULL`,
        [l.parent_id, l.branch_id]
      );
      if (r.rowCount > 0) { linked++; touchedParents.add(l.parent_id); }
    }

    // Bump each parent's watermark so its new location set re-syncs to prod.
    if (touchedParents.size) {
      await client.query(`UPDATE companies SET updated_at = now() WHERE id = ANY($1::bigint[])`, [[...touchedParents]]);
    }
  });

  console.log('  Collapsed ' + collapsed + ' facility shells into ' + touchedParents.size + ' parents.');
  console.log('  Linked ' + linked + ' legal branches.');
  console.log('');
  console.log('  Pushing changes to production...');
  const { runPush } = await import('../sync/push.js');
  await runPush({});
  console.log('  Done — production updated.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.stack || e); process.exit(1); });

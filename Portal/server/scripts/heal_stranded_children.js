// Rows left behind by merges that ran BEFORE the merge learned to carry them.
// ----------------------------------------------------------------------------
// mergeCompanies() re-parented only sources, contacts, person links and jobs until 2026-08-06.
// Everything else kept pointing at the archived duplicate, so those facts vanished from the
// surviving company: its map pins, financials, owners, partners and licences.
//
// This moves them onto the survivor using canonical_id — the merge already recorded where each
// duplicate went, so nothing is guessed. Same per-table rules as the merge itself: the four
// tables with no unique key move wholesale; tech and registrations move only what the survivor
// does not already hold.
//
// Preview by default; writes only with --apply. Idempotent — a second run finds nothing.

import { query } from '../db.js';

const apply = process.argv.includes('--apply');

// ⚠️ EVERY UPDATE HERE MUST SET updated_at = now(), and that is not cosmetic. NONE of these six
// tables has a touch trigger, and `updated_at` IS the sync watermark. The first run moved 6,517
// rows and left their timestamps untouched, so the incremental push selected ZERO of them and
// production kept pointing every one at the company that had been merged away — a repair that
// reported success locally and changed nothing customers can see. Verified after the fact: newest
// company_registrations.updated_at was 12:13 against a 16:00 watermark.
// Follow a chain to its final survivor. The merge flattens canonical_id, but a row written
// between two merges can still point one hop short.
const SURVIVOR = `
  WITH RECURSIVE hop(from_id, to_id, depth) AS (
    SELECT id, canonical_id, 1 FROM companies WHERE canonical_id IS NOT NULL
    UNION ALL
    SELECT h.from_id, c.canonical_id, h.depth + 1
      FROM hop h JOIN companies c ON c.id = h.to_id
     WHERE c.canonical_id IS NOT NULL AND h.depth < 10)
  SELECT from_id, to_id FROM (
    SELECT from_id, to_id, row_number() OVER (PARTITION BY from_id ORDER BY depth DESC) rn FROM hop) x
   WHERE rn = 1`;

const PLAIN = ['company_locations', 'company_financials', 'company_shareholders', 'company_partnerships'];

async function count(table) {
  const r = await query(`
    SELECT count(*)::int c FROM ${table} t
      JOIN companies co ON co.id = t.company_id
     WHERE co.canonical_id IS NOT NULL AND co.canonical_id <> t.company_id`);
  return r.rows[0].c;
}

async function main() {
  console.log('');
  console.log('BELL — RECONNECT DATA LEFT BEHIND BY OLD MERGES'
    + (apply ? '   (APPLYING)' : '   (PREVIEW — nothing written)'));
  console.log('==========================================================\n');

  const tables = [...PLAIN, 'company_tech', 'company_registrations'];
  const before = {};
  for (const t of tables) { before[t] = await count(t); console.log('  ' + t.padEnd(26) + String(before[t]).padStart(7) + ' row(s) stranded'); }
  // Awarded tenders and branch links are counted here too — the preview must show everything the
  // Apply will touch, or the click is uninformed. These two are NOT child tables of the same shape:
  // tenders reference the winner via award_company_id, and a branch references its parent via
  // companies.parent_company_id. Both were missed by mergeCompanies entirely.
  const strandedTenders = Number((await query(`
    SELECT count(*)::int n FROM tenders t JOIN companies c ON c.id = t.award_company_id
     WHERE c.canonical_id IS NOT NULL`)).rows[0].n);
  console.log('  ' + 'awarded tenders'.padEnd(26) + String(strandedTenders).padStart(7) + ' row(s) stranded');
  const strandedParents = Number((await query(`
    SELECT count(*)::int n FROM companies b JOIN companies c ON c.id = b.parent_company_id
     WHERE c.canonical_id IS NOT NULL`)).rows[0].n);
  console.log('  ' + 'branch links'.padEnd(26) + String(strandedParents).padStart(7) + ' row(s) stranded');

  // RELATIONSHIPS — the table every completeness pass missed until 2026-08-13. Either endpoint
  // can point at a merged-away company, and 61 of the 367 measured describe an edge BETWEEN two
  // records that merged into one — re-pointing those would make a company partner of itself.
  const strandedRels = Number((await query(`
    SELECT count(*)::int n FROM company_relationships cr
     WHERE EXISTS (SELECT 1 FROM companies c WHERE c.id IN (cr.source_company_id, cr.target_company_id)
                     AND c.canonical_id IS NOT NULL)`)).rows[0].n);
  console.log('  ' + 'relationships'.padEnd(26) + String(strandedRels).padStart(7) + ' row(s) stranded');
  const strandedOsm = Number((await query(`
    SELECT count(*)::int n FROM osm_places o JOIN companies c ON c.id = o.matched_company_id
     WHERE c.canonical_id IS NOT NULL`)).rows[0].n);
  console.log('  ' + 'map places (OSM)'.padEnd(26) + String(strandedOsm).padStart(7) + ' row(s) stranded');

  const total = Object.values(before).reduce((a, b) => a + b, 0) + strandedTenders + strandedParents
    + strandedRels + strandedOsm;
  console.log('  ' + 'TOTAL'.padEnd(26) + String(total).padStart(7));

  if (!total) { console.log('\nNothing to reconnect.\n'); return; }
  if (!apply) {
    console.log('\nThese belong to companies that were merged away; the surviving record cannot');
    console.log('see them today. PREVIEW ONLY — double-click "Apply Stranded Data Repair.command".\n');
    return;
  }

  let moved = 0;
  for (const t of PLAIN) {
    const r = await query(`
      WITH s AS (${SURVIVOR})
      UPDATE ${t} t SET company_id = s.to_id, updated_at = now()
        FROM s WHERE t.company_id = s.from_id AND s.to_id <> t.company_id`);
    console.log('  moved ' + String(r.rowCount).padStart(6) + '  ' + t);
    moved += r.rowCount;
  }
  // tech — UNIQUE (company_id, tech)
  const tech = await query(`
    WITH s AS (${SURVIVOR})
    UPDATE company_tech t SET company_id = s.to_id, updated_at = now()
      FROM s WHERE t.company_id = s.from_id AND s.to_id <> t.company_id
        AND NOT EXISTS (SELECT 1 FROM company_tech k WHERE k.company_id = s.to_id AND k.tech = t.tech)`);
  console.log('  moved ' + String(tech.rowCount).padStart(6) + '  company_tech');
  moved += tech.rowCount;
  // registrations — UNIQUE (company_id, body, registration_type, number)
  const reg = await query(`
    WITH s AS (${SURVIVOR})
    UPDATE company_registrations r SET company_id = s.to_id, updated_at = now()
      FROM s WHERE r.company_id = s.from_id AND s.to_id <> r.company_id
        AND NOT EXISTS (SELECT 1 FROM company_registrations k
                         WHERE k.company_id = s.to_id AND k.body = r.body
                           AND k.registration_type = r.registration_type AND k.number = r.number)`);
  console.log('  moved ' + String(reg.rowCount).padStart(6) + '  company_registrations');
  moved += reg.rowCount;

  // AWARDED TENDERS — the table mergeCompanies never re-parented at all, so every award on a
  // merged-away record was invisible. Measured 2026-08-09: 5,162 tenders across 342 companies.
  // No unique key on award_company_id, so a plain UPDATE cannot collide; updated_at is stamped
  // because `tenders` is mirrored and the watermark is what publishes the correction.
  const tw = await query(`
    WITH s AS (${SURVIVOR})
    UPDATE tenders t SET award_company_id = s.to_id, updated_at = now()
      FROM s WHERE t.award_company_id = s.from_id`);
  if (tw.rowCount) console.log('  moved ' + String(tw.rowCount).padStart(6) + '  awarded tenders (award winner)');
  moved += tw.rowCount;

  // BRANCH LINKS pointing at a merged-away parent — the "one organized view" quietly broken.
  const bp = await query(`
    WITH s AS (${SURVIVOR})
    UPDATE companies c SET parent_company_id = s.to_id, updated_at = now()
      FROM s WHERE c.parent_company_id = s.from_id AND c.id <> s.to_id`);
  if (bp.rowCount) console.log('  moved ' + String(bp.rowCount).padStart(6) + '  branch links (parent company)');
  moved += bp.rowCount;

  // RELATIONSHIPS — same rules as the merge itself (assembly/dedup.js), in the same order.
  // 1. Edges whose two endpoints resolve to the SAME survivor are self-loops-in-waiting: an edge
  //    from a record to itself states nothing. Deleted WITH tombstones — the table is mirrored.
  const loops = await query(`
    WITH s AS (${SURVIVOR}),
    gone AS (
      DELETE FROM company_relationships cr
       USING (SELECT cr2.id
                FROM company_relationships cr2
                LEFT JOIN s ss ON ss.from_id = cr2.source_company_id
                LEFT JOIN s st ON st.from_id = cr2.target_company_id
               WHERE (ss.from_id IS NOT NULL OR st.from_id IS NOT NULL)
                 AND COALESCE(ss.to_id, cr2.source_company_id) = COALESCE(st.to_id, cr2.target_company_id)) bad
       WHERE cr.id = bad.id
      RETURNING cr.id)
    INSERT INTO sync_deletions (table_name, row_id) SELECT 'company_relationships', id FROM gone`);
  if (loops.rowCount) console.log('  removed ' + String(loops.rowCount).padStart(4) + '  relationships that would have made a company its own partner (tombstoned)');
  // 2. Outgoing edges move to the survivor unless it already claims the same edge —
  //    uq_company_relationships_edge is (source_company_id, relation_type, lower(btrim(target_name))).
  const relSrc = await query(`
    WITH s AS (${SURVIVOR})
    UPDATE company_relationships r SET source_company_id = s.to_id, updated_at = now()
      FROM s WHERE r.source_company_id = s.from_id
        AND NOT EXISTS (SELECT 1 FROM company_relationships k
                         WHERE k.source_company_id = s.to_id AND k.relation_type = r.relation_type
                           AND lower(btrim(k.target_name)) = lower(btrim(r.target_name)))`);
  if (relSrc.rowCount) console.log('  moved ' + String(relSrc.rowCount).padStart(6) + '  relationships (outgoing)');
  moved += relSrc.rowCount;
  //    Colliding leftovers: the survivor's own copy of the edge wins; the duplicate's is withdrawn.
  const relDup = await query(`
    WITH s AS (${SURVIVOR}),
    gone AS (
      DELETE FROM company_relationships cr USING s
       WHERE cr.source_company_id = s.from_id
      RETURNING cr.id)
    INSERT INTO sync_deletions (table_name, row_id) SELECT 'company_relationships', id FROM gone`);
  if (relDup.rowCount) console.log('  removed ' + String(relDup.rowCount).padStart(4) + '  relationships the survivor already stated (tombstoned)');
  // 3. Incoming edges carry no unique key — plain touch-and-move.
  const relTgt = await query(`
    WITH s AS (${SURVIVOR})
    UPDATE company_relationships r SET target_company_id = s.to_id, updated_at = now()
      FROM s WHERE r.target_company_id = s.from_id`);
  if (relTgt.rowCount) console.log('  moved ' + String(relTgt.rowCount).padStart(6) + '  relationships (incoming)');
  moved += relTgt.rowCount;

  // 4. Edges that ALREADY point at themselves — 305 measured 2026-08-13, written by an engine
  //    long before merges were involved. An edge from a company to itself states nothing,
  //    whatever put it there. Tombstoned: the table is mirrored and prod holds them too.
  const selfLoops = await query(`
    WITH gone AS (
      DELETE FROM company_relationships WHERE source_company_id = target_company_id RETURNING id)
    INSERT INTO sync_deletions (table_name, row_id) SELECT 'company_relationships', id FROM gone`);
  if (selfLoops.rowCount) console.log('  removed ' + String(selfLoops.rowCount).padStart(4) + '  edges that pointed a company at itself (tombstoned)');

  // OSM map places — no unique key on matched_company_id; mirrored, so the watermark is stamped.
  const osm = await query(`
    WITH s AS (${SURVIVOR})
    UPDATE osm_places o SET matched_company_id = s.to_id, updated_at = now()
      FROM s WHERE o.matched_company_id = s.from_id`);
  if (osm.rowCount) console.log('  moved ' + String(osm.rowCount).padStart(6) + '  map places (OSM)');
  moved += osm.rowCount;

  console.log(`\nReconnected ${moved.toLocaleString()} row(s) to the company that survived the merge.`);
  console.log('Rows still left are exact duplicates the survivor already holds — nothing lost.');
  console.log('Publishes to the live site on the next data push.\n');
}
main().then(() => process.exit(0)).catch((e) => { console.error('Stopped:', e.stack || e.message); process.exit(1); });

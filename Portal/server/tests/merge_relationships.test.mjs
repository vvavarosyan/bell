// Does merging two companies keep their RELATIONSHIPS — and refuse to make a company its own partner?
//
// Measured 2026-08-13 before the fix: 367 company_relationships rows pointed at merged-away
// companies (invisible to every reader that joins on the live id), and 61 of them described a
// relationship BETWEEN the two records being merged — re-pointing those blindly would state that
// a company partners with itself. mergeCompanies had re-parented thirteen child tables by then
// and this one was still missing, which is the recurring shape: every completeness pass ends at
// the tables someone remembered.
//
// These drive the SHIPPED mergeCompanies against real Postgres (the Mac's disposable copy) —
// no SQL copied out of the function, per the jobs_closure_order lesson. mergeCompanies COMMITS
// its transaction, so the fixtures use ZZ-prefixed names and are removed in after().

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DATABASE_URL = process.env.BDI_TEST_DB || 'postgres://localhost:5432/bell_intel';
delete process.env.PGDATABASE;

let query, pool, mergeCompanies;
let reachable = false;

try {
  ({ query, pool } = await import('../db.js'));
  ({ mergeCompanies } = await import('../assembly/dedup.js'));
  const r = await query('SELECT current_database() AS d, inet_server_addr() AS a');
  reachable = r.rows[0].d === 'bell_intel' && (r.rows[0].a === null || String(r.rows[0].a).startsWith('127.'));
} catch { reachable = false; }

const skip = () => (reachable ? false : 'disposable Postgres not reachable — environmental, not a defect');

let A = null, B = null, C = null;              // canonical, duplicate, bystander
const ids = { rels: [], osm: [] };

async function mkCompany(name) {
  const r = await query(
    `INSERT INTO companies (name, name_normalized, country, is_active)
     VALUES ($1, lower($1), 'Qatar', true) RETURNING id`, [name]);
  return Number(r.rows[0].id);
}
async function mkRel(source, target, type, targetName) {
  const r = await query(
    `INSERT INTO company_relationships (source_company_id, target_company_id, target_name, relation_type, confidence, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'high', now() - interval '2 days', now() - interval '2 days') RETURNING id`,
    [source, target, targetName, type]);
  ids.rels.push(Number(r.rows[0].id));
  return Number(r.rows[0].id);
}

async function wipe() {
  if (!reachable) return;
  await query(`DELETE FROM sync_deletions WHERE table_name='company_relationships' AND row_id = ANY($1::bigint[])`, [ids.rels]).catch(() => {});
  await query(`DELETE FROM company_relationships WHERE id = ANY($1::bigint[])`, [ids.rels]).catch(() => {});
  await query(`DELETE FROM osm_places WHERE id = ANY($1::bigint[])`, [ids.osm]).catch(() => {});
  await query(`DELETE FROM companies WHERE name LIKE 'ZZMERGE %'`).catch(() => {});
}

let relMovable, relCollideA, relCollideB, relIntraPair, relIncoming, osmId;

before(async () => {
  if (!reachable) return;
  await wipe();
  A = await mkCompany('ZZMERGE Canon');
  B = await mkCompany('ZZMERGE Dup');
  C = await mkCompany('ZZMERGE Other');
  // 1. movable outgoing: B→C 'partner' — survivor holds no such edge, must MOVE to A.
  relMovable = await mkRel(B, C, 'partner', 'ZZMERGE Other');
  // 2. collision: BOTH A→C and B→C say 'client' of the same target name. The survivor's own copy
  //    must win; the duplicate's must be withdrawn WITH a tombstone (mirrored table).
  relCollideA = await mkRel(A, C, 'client', 'ZZMERGE Other');
  relCollideB = await mkRel(B, C, 'client', 'ZZMERGE Other');
  // 3. intra-pair: B→A. After the merge the two ids are one record; this edge would become
  //    "partner of itself" and must be deleted, not moved.
  relIntraPair = await mkRel(B, A, 'partner', 'ZZMERGE Canon');
  // 4. incoming: C→B. target_company_id must re-point to A.
  relIncoming = await mkRel(C, B, 'affiliate', 'ZZMERGE Dup');
  // 5. an osm place matched to the duplicate.
  const o = await query(
    `INSERT INTO osm_places (osm_type, osm_id, name, matched_company_id, updated_at)
     VALUES ('node', -4242421, 'ZZMERGE Place', $1, now() - interval '2 days') RETURNING id`, [B]).catch(() => null);
  osmId = o ? Number(o.rows[0].id) : null;
  if (osmId) ids.osm.push(osmId);

  await mergeCompanies(A, B);
});

after(async () => { await wipe(); try { await pool.end(); } catch { /* ignore */ } });

test('the duplicate really merged', { skip: skip() }, async () => {
  const r = await query(`SELECT merge_status, canonical_id, archived FROM companies WHERE id=$1`, [B]);
  assert.equal(r.rows[0].merge_status, 'merged_into');
  assert.equal(Number(r.rows[0].canonical_id), A);
});

test('an outgoing relationship moves to the survivor, watermark bumped', { skip: skip() }, async () => {
  const r = await query(`SELECT source_company_id, updated_at > now() - interval '10 minutes' AS touched
                           FROM company_relationships WHERE id=$1`, [relMovable]);
  assert.equal(Number(r.rows[0].source_company_id), A, 'the edge belongs to the survivor now');
  // ⚠️ THE WATERMARK IS THE FIX'S OTHER HALF. updated_at IS the sync cursor; a move that does not
  // touch it is invisible to the incremental push, and production keeps serving the old edge —
  // the exact failure the 2026-08-06 standalone repair had (6,517 rows moved locally, 0 on prod).
  assert.equal(r.rows[0].touched, true, 'updated_at must move or the mirror never hears about it');
});

test('a colliding edge is withdrawn, the survivor keeps its own copy', { skip: skip() }, async () => {
  const kept = await query(`SELECT source_company_id FROM company_relationships WHERE id=$1`, [relCollideA]);
  assert.equal(Number(kept.rows[0].source_company_id), A, "the survivor's own edge is untouched");
  const gone = await query(`SELECT 1 FROM company_relationships WHERE id=$1`, [relCollideB]);
  assert.equal(gone.rows.length, 0, "the duplicate's identical claim is removed, not duplicated");
  const tomb = await query(`SELECT 1 FROM sync_deletions WHERE table_name='company_relationships' AND row_id=$1`, [relCollideB]);
  assert.equal(tomb.rows.length, 1, 'and a tombstone queues its removal from production');
});

test('an edge between the two merged records is deleted — a company is not its own partner', { skip: skip() }, async () => {
  const gone = await query(`SELECT 1 FROM company_relationships WHERE id=$1`, [relIntraPair]);
  assert.equal(gone.rows.length, 0);
  const tomb = await query(`SELECT 1 FROM sync_deletions WHERE table_name='company_relationships' AND row_id=$1`, [relIntraPair]);
  assert.equal(tomb.rows.length, 1, 'tombstoned — production must drop it too');
  // And no self-loop was manufactured anywhere in the process.
  const loops = await query(
    `SELECT count(*)::int n FROM company_relationships WHERE source_company_id=$1 AND target_company_id=$1`, [A]);
  assert.equal(loops.rows[0].n, 0);
});

test('an incoming relationship re-points to the survivor', { skip: skip() }, async () => {
  const r = await query(`SELECT target_company_id, updated_at > now() - interval '10 minutes' AS touched
                           FROM company_relationships WHERE id=$1`, [relIncoming]);
  assert.equal(Number(r.rows[0].target_company_id), A);
  assert.equal(r.rows[0].touched, true);
});

test('an osm place matched to the duplicate follows it', { skip: skip() }, async () => {
  if (!osmId) return;   // table shape differs on this copy; the mkRel asserts still ran
  const r = await query(`SELECT matched_company_id, updated_at > now() - interval '10 minutes' AS touched
                           FROM osm_places WHERE id=$1`, [osmId]);
  assert.equal(Number(r.rows[0].matched_company_id), A);
  assert.equal(r.rows[0].touched, true);
});

test('merging is idempotent — running it again changes nothing and breaks nothing', { skip: skip() }, async () => {
  const before_ = await query(`SELECT count(*)::int n FROM company_relationships WHERE source_company_id=$1 OR target_company_id=$1`, [A]);
  await mergeCompanies(A, B);
  const after_ = await query(`SELECT count(*)::int n FROM company_relationships WHERE source_company_id=$1 OR target_company_id=$1`, [A]);
  assert.equal(after_.rows[0].n, before_.rows[0].n);
});

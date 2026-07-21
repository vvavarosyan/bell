// Location merge — collapse a bare-coordinate row into the row that states the real address.
//
// WHY SO NARROW. Several richer matchers were designed and then killed by adversarial review:
//   • the landmark bridge (nearest surveyed building name appears in another row's address) —
//     good evidence, but it pairs neighbours in the same tower. Proposal-only, never automatic.
//   • text-normalized duplicate collapse — the normalizer strips Arabic to an empty string, so
//     three genuinely different sites up to 53 km apart collided. It also destroyed a verified
//     qars-exact geocode. Rejected outright.
//   • the INWANI zone/street/building triple as a join key — 0 of 537 bare rows carry one. Dead.
// What survives is not an inference at all: two rows holding BYTE-IDENTICAL stored coordinates
// are the same parsed value written twice by the pipeline. No distance threshold, nothing a
// later session can quietly loosen.
//
// The real repair is in harvester.js, which no longer mints these rows. This is the one-time
// mop-up of what it already wrote — without the harvester guard, deleting them is a treadmill:
// the next harvest re-inserts them under a new id (proven live).
//
// Preview by default; writes only with --apply.

import { query, pool } from '../db.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';

const apply = process.argv.includes('--apply');
const trunc = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

// A row whose address IS its own coordinate (or a Plus Code) — it states a point, not a place.
const BARE = String.raw`^\s*-?[0-9]{1,3}\.[0-9]+\s*,\s*-?[0-9]{1,3}\.[0-9]+\s*$`;
const PLUS = String.raw`^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}([[:space:]]|$)`;

const PAIRS_SQL = `
  SELECT d.id AS drop_id, k.id AS keep_id, d.company_id, c.name AS company_name,
         k.address AS keep_address, k.label AS keep_label, d.label AS drop_label,
         d.source AS drop_source, d.source_url AS drop_source_url,
         d.geocode_status AS drop_geocode_status, d.latitude, d.longitude
    FROM company_locations d
    JOIN company_locations k
      ON k.company_id = d.company_id AND k.id <> d.id
     AND k.latitude = d.latitude AND k.longitude = d.longitude     -- EXACT, not proximity
    JOIN companies c ON c.id = d.company_id
   WHERE d.latitude IS NOT NULL AND d.longitude IS NOT NULL
     AND (btrim(d.address) ~ $1 OR btrim(d.address) ~* $2)          -- loser states only a point
     AND k.address IS NOT NULL
     AND btrim(k.address) !~ $1 AND btrim(k.address) !~* $2         -- winner states a real place
     -- QARS returns ONE point per BUILDING, so a whole tower shares a coordinate (60 companies
     -- sit on Ooredoo Tower's point; one clinic has six address strings on one point). Merging
     -- into an arbitrary one of those is a coin flip. Never remove this exclusion.
     AND COALESCE(k.geocode_method,'') NOT LIKE 'qars%'
   ORDER BY d.company_id, d.id`;

async function findPairs() {
  return (await query(PAIRS_SQL, [BARE, PLUS])).rows;
}

async function main() {
  console.log('');
  console.log('BELL — LOCATION MERGE' + (apply ? '   (APPLYING)' : '   (PREVIEW — nothing is written)'));
  console.log('==========================================================');
  console.log('');

  const pairs = await findPairs();
  console.log(`${pairs.length} row(s) state only a coordinate that another row already states with a real address.`);
  console.log('');
  for (const p of pairs) {
    console.log(`  #${p.company_id} ${trunc(p.company_name, 42)}`);
    console.log(`     drop id=${p.drop_id}  "${trunc(p.drop_label, 16)}"  ${p.latitude}, ${p.longitude}`);
    console.log(`     keep id=${p.keep_id}  "${trunc(p.keep_label, 16)}"  ${trunc(p.keep_address, 52)}`);
  }
  if (!pairs.length) console.log('  Nothing to merge — the harvester guard is holding.');
  console.log('');
  console.log('The kept row gains the dropped row\'s provenance under raw.merged_from, so nothing');
  console.log('is lost silently. Map pins do not change: both rows sat on the same point.');
  console.log('');

  if (!apply) {
    console.log('PREVIEW ONLY — nothing was written.');
    console.log('Double-click "Apply Location Merge.command" to make these changes.');
    console.log('');
    return;
  }

  // The table grows while long harvests run, so re-derive inside the transaction and refuse if
  // the world moved — never act on a stale preview.
  const client = await pool.connect();
  let merged = 0;
  const touched = new Set();
  try {
    await client.query('BEGIN');
    const live = (await client.query(PAIRS_SQL, [BARE, PLUS])).rows;
    if (live.length !== pairs.length) {
      await client.query('ROLLBACK');
      console.log(`STOPPED: the set changed since the preview (${pairs.length} → ${live.length}).`);
      console.log('A harvest is probably still running. Re-run the Preview, then Apply again.');
      console.log('');
      return;
    }
    for (const p of live) {
      // Keep the loser's provenance on the survivor BEFORE deleting it.
      await client.query(`
        UPDATE company_locations
           SET raw = COALESCE(raw, '{}'::jsonb) || jsonb_build_object('merged_from',
                 COALESCE(raw->'merged_from', '[]'::jsonb) || jsonb_build_object(
                   'id', $2::bigint, 'label', $3::text, 'source', $4::text,
                   'source_url', $5::text, 'geocode_status', $6::text, 'at', now()::text)),
               created_at = LEAST(created_at, (SELECT created_at FROM company_locations WHERE id = $2)),
               updated_at = now()
         WHERE id = $1`,
        [p.keep_id, p.drop_id, p.drop_label, p.drop_source, p.drop_source_url, p.drop_geocode_status]);

      // company_locations has NO delete trigger — the tombstone MUST be written before the
      // delete or production keeps the row forever (this exact trap cost a recovery pass).
      await client.query(
        `INSERT INTO sync_deletions (table_name, row_id) VALUES ('company_locations', $1)`, [p.drop_id]);
      await client.query(`DELETE FROM company_locations WHERE id = $1`, [p.drop_id]);
      merged += 1;
      touched.add(p.company_id);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Stopped, nothing written:', e.message);
    console.log('');
    return;
  } finally { client.release(); }

  for (const id of touched) await recomputeBellScoreForCompany(id).catch(() => {});
  console.log(`Merged ${merged} row(s) across ${touched.size} compan${touched.size === 1 ? 'y' : 'ies'}.`);
  console.log('Deletions are tombstoned, so the next data push removes them from the live site too.');
  console.log('');
}

main().then(() => process.exit(0)).catch((e) => { console.error('Stopped:', e.stack || e.message); process.exit(1); });

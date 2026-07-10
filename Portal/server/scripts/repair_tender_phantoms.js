// Repair PHANTOM Monaqasat tenders minted by the old card splitter.
// Run via "Preview Tender Phantom Repair.command" (dry run) then
// "Apply Tender Phantom Repair.command" (writes). PHANTOM_APPLY=1 = write.
//
// WHY THIS EXISTS (found live 2026-07-10): Monaqasat card titles routinely
// EMBED an internal committee ref mid-title, e.g.
//   "General Supply of Gifts for KAHRAMAA Department's Events - LTC-2417/2025 - Materials Department"
// The old splitter treated every NNNN/YYYY as a new card, so each embedded ref
// minted a PHANTOM tender: fake source_ref (2417/2025), fragment title
// ("- Materials Department"), no detail link — while the REAL card (3445/2026)
// lost its title tail and every field after the split point. A phantom could
// even collide with a REAL tender sharing that ref and stomp its title/status
// (seen live: awarded 2247/2024). The splitter is fixed (line-anchored split in
// scrape_monaqasat.js); this script removes the phantom rows already in the DB.
//
// HOW IT DETECTS PRECISELY (no guessing — re-derives the split from data):
// a row R is a phantom iff some OTHER row H's title EMBEDS R.source_ref and the
// text of H's title immediately AFTER that ref equals R's title (that is
// exactly what the buggy split produced), AND R has no detail link AND no
// captured activities. Rows healed by a re-scan (real title restored) stop
// matching automatically, so this is safe to re-run any time.
//
// ⚠️ ORDER MATTERS: run a scan with the FIXED parser first (Run Tender
// Scan.command for open tenders, or Backfill Full Tender Archive.command for
// the whole archive) so host titles are healed to their full form — the
// detector proves a phantom against its host's FULL title. Phantoms whose host
// is still truncated are reported as "awaiting host heal", never deleted.
//
// Deletions are mirrored to prod: sync_deletions tombstones are written first,
// then pushed via POST /api/sync/delete (same endpoint the normal sync push
// drains). If the push fails, the tombstones stay and the next regular push
// applies them.

import { query } from '../db.js';
import { getKey } from '../keychain.js';

const APPLY = process.env.PHANTOM_APPLY === '1';

export const PHANTOM_SCAN_SQL = `
  SELECT id, source_ref, status, title,
         (jsonb_typeof(raw->'detail_id') = 'string' AND btrim(raw->>'detail_id') <> '') AS linked,
         (jsonb_typeof(raw->'activities') = 'array' AND jsonb_array_length(raw->'activities') > 0) AS has_acts
    FROM tenders
   WHERE source = 'monaqasat'
   ORDER BY id`;

// Order-preserving light normalisation: lowercase, every punctuation/space run
// becomes one space. Keeps digits so refs stay findable inside titles.
export const lite = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim();

/**
 * Pure detector. rows = [{id, source_ref, status, title, linked, has_acts}].
 * Returns { phantoms: [{row, host}], awaiting: [rows…] }.
 *  - phantoms: proven (host title embeds row's ref and the host title's text
 *    right after that ref starts with the row's whole title).
 *  - awaiting: fragment-looking rows (leading "-", unlinked, no activities)
 *    that found NO host yet — likely phantoms whose host title is still
 *    truncated; report only, never delete.
 */
export function findPhantoms(rows) {
  const phantoms = [];
  const awaiting = [];
  for (const r of rows) {
    if (r.linked || r.has_acts) continue;             // paired/enriched rows are real
    const frag = lite(r.title);
    if (frag.length < 10) continue;                   // too small to prove
    const refLite = lite(r.source_ref);               // "2417/2025" → "2417 2025"
    let host = null;
    for (const h of rows) {
      if (h.id === r.id) continue;
      const ht = lite(h.title);
      const at = ht.indexOf(refLite);
      if (at === -1) continue;
      if (lite(h.source_ref) === refLite) continue;   // host's own ref, not an embed
      const tail = ht.slice(at + refLite.length).trim();
      // The buggy split made the phantom title = host title's tail after the
      // ref (both were cut at the same field label), so tail === frag exactly.
      // startsWith is accepted ONLY when the longer side shows evidence of the
      // 400-char title cap (≥390 lite chars) — otherwise "Contract 123/2024
      // Maintenance Works" + a real row titled "Maintenance" would false-match.
      const capped = Math.max(tail.length, frag.length) >= 390;
      if (tail.length >= 10 && (tail === frag || (capped && (tail.startsWith(frag) || frag.startsWith(tail))))) { host = h; break; }
    }
    if (host) phantoms.push({ row: r, host });
    else if (/^\s*-/.test(String(r.title || ''))) awaiting.push(r);
  }
  return { phantoms, awaiting };
}

async function pushDeletionsToProd(ids) {
  const token = await getKey('sync-token');
  if (!token) return { skipped: 'no sync token — tombstones stay, next regular push applies them' };
  const s = await query(`SELECT value FROM settings WHERE key = 'sync_target_url'`).catch(() => ({ rows: [] }));
  const base = String((s.rows[0] && s.rows[0].value) || process.env.BDI_SYNC_TARGET_URL || 'https://app.bell.qa').replace(/\/+$/, '');
  const res = await fetch(base + '/api/sync/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ table: 'tenders', ids }),
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); return { error: 'prod HTTP ' + res.status + ' ' + t.slice(0, 140) }; }
  return await res.json().catch(() => ({}));
}

const short = (s, n = 58) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

async function main() {
  console.log(`Bell — Tender Phantom Repair (${APPLY ? '⚠️ APPLY — will delete' : 'PREVIEW, read-only'})\n`);

  const rows = (await query(PHANTOM_SCAN_SQL)).rows;
  console.log(`${rows.length.toLocaleString()} Monaqasat tenders scanned.\n`);

  const { phantoms, awaiting } = findPhantoms(rows);

  if (!phantoms.length) {
    console.log('✓ No provable phantom tenders found.');
  } else {
    console.log(`PROVEN PHANTOMS: ${phantoms.length} (each ref exists only embedded inside its host's title)\n`);
    for (const { row, host } of phantoms) {
      console.log(`  ✗ #${row.id}  ${row.source_ref}  [${row.status}]  "${short(row.title)}"`);
      console.log(`       └ host ${host.source_ref}: "${short(host.title, 76)}"`);
    }
  }
  if (awaiting.length) {
    console.log(`\nAWAITING HOST HEAL (fragment-looking, no host title matched yet — NOT touched): ${awaiting.length}`);
    for (const r of awaiting.slice(0, 20)) console.log(`  ? #${r.id}  ${r.source_ref}  [${r.status}]  "${short(r.title)}"`);
    console.log('  → run "Backfill Full Tender Archive.command" (heals archive titles), then re-run this repair.');
  }

  if (!APPLY) {
    console.log(`\nPREVIEW ONLY — nothing changed. Run "Apply Tender Phantom Repair.command" to delete the ${phantoms.length} proven phantom(s).`);
    return;
  }
  if (!phantoms.length) return;

  const ids = phantoms.map((p) => p.row.id);
  let stones = 0;
  for (const id of ids) {
    await query(`INSERT INTO sync_deletions (table_name, row_id) VALUES ('tenders', $1)`, [id])
      .then(() => { stones++; })
      .catch((e) => console.warn(`  tombstone insert failed for ${id} — ${e.message}`));
  }
  const del = await query(`DELETE FROM tenders WHERE id = ANY($1::bigint[])`, [ids]);
  console.log(`\nDeleted locally: ${del.rowCount} phantom tender(s) (${stones} tombstones written).`);

  const push = await pushDeletionsToProd(ids);
  if (push && Number.isFinite(push.deleted)) {
    console.log(`Prod mirror: deleted ${push.deleted}.`);
    await query(
      `DELETE FROM sync_deletions WHERE table_name = 'tenders' AND row_id = ANY($1::bigint[])`, [ids]
    ).catch(() => {});
  } else {
    console.log(`Prod mirror: ${JSON.stringify(push)} — tombstones kept; the next regular sync push applies them.`);
  }
  console.log('\nNEXT: re-run "Backfill Tender Industries.command" so open-tender categorisation reflects the cleanup.');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
}

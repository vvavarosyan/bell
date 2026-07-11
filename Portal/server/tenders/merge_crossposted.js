// Merge cross-posted tenders (Val's decision 2026-07-12: "merge and mention
// both sources"). Kahramaa publishes some of its tenders on the central
// Monaqasat portal too; its rows carry the exchange's own cross-reference
// (raw.monaqasat_number = "YYYY/NNNN", the mirror of Monaqasat's source_ref
// "NNNN/YYYY"). Both rows describe ONE real tender, so the list showed it
// twice (~90 pairs measured 2026-07-12).
//
// Merge direction: the MONAQASAT row is canonical (it carries the detail
// enrichment — activities, contacts, "As published" fields, industries). The
// Kahramaa row's own facts fold INTO it:
//   · award data (winner/amount/awarded_at) fills gaps — Kahramaa publishes
//     winners, Monaqasat hides them; an 'awarded' status upgrades the row.
//   · deadline fills a NULL only (COALESCE — never overwrite a stated date).
//   · the whole Kahramaa raw payload lands under raw.kahramaa (verbatim, with
//     its source_ref + url), and raw.sources = ['monaqasat','kahramaa'] powers
//     the drawer's "published on both" line.
// Then the Kahramaa row is deleted — tombstone first, local delete, prod
// delete via /api/sync/delete (repair_tender_phantoms.js pattern; a failed
// push leaves tombstones for the next regular sync).
//
// Idempotent + pipeline-safe: runs after every ingest batch (ingest.js), so a
// re-scan that recreates the Kahramaa row simply re-merges it in the same run.

import { query } from '../db.js';
import { getKey } from '../keychain.js';
import { packRaw } from './raw.js';

// "YYYY/NNNN" (Kahramaa's cross-ref) ↔ Monaqasat's "NNNN/YYYY".
export const CROSSPOST_PAIRS_SQL = `
  SELECT k.id AS k_id, m.id AS m_id
    FROM tenders k
    JOIN tenders m
      ON m.source = 'monaqasat'
     AND m.source_ref = split_part(k.raw->>'monaqasat_number', '/', 2) || '/' || split_part(k.raw->>'monaqasat_number', '/', 1)
   WHERE k.source = 'kahramaa'
     AND (k.raw->>'monaqasat_number') ~ '^[0-9]{4}/[0-9]+$'`;

/** Pure: build the canonical row's update from the pair (exported for tests). */
export function mergedFields(m, k) {
  const kRaw = { ...(k.raw || {}) };
  delete kRaw.monaqasat_number;   // it IS the link — redundant inside the payload
  return {
    status: (k.status === 'awarded' && m.status !== 'awarded') ? 'awarded' : m.status,
    award_company_name: m.award_company_name || k.award_company_name || null,
    award_company_id: m.award_company_id || k.award_company_id || null,
    value_amount: m.value_amount ?? k.value_amount ?? null,
    awarded_at: m.awarded_at || k.awarded_at || null,
    deadline_at: m.deadline_at || k.deadline_at || null,
    raw: {
      ...(m.raw || {}),
      sources: ['monaqasat', 'kahramaa'],
      kahramaa: { ...kRaw, source_ref: k.source_ref, url: k.url || null },
    },
  };
}

async function pushDeletionsToProd(ids) {
  const token = await getKey('sync-token');
  if (!token || !ids.length) return { skipped: true };
  const s = await query(`SELECT value FROM settings WHERE key = 'sync_target_url'`).catch(() => ({ rows: [] }));
  const base = String((s.rows[0] && s.rows[0].value) || process.env.BDI_SYNC_TARGET_URL || 'https://app.bell.qa').replace(/\/+$/, '');
  const res = await fetch(base + '/api/sync/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ table: 'tenders', ids }),
  }).catch(() => null);
  if (!res || !res.ok) return { failed: true };   // tombstones remain — next sync drains them
  await query(`DELETE FROM sync_deletions WHERE table_name = 'tenders' AND row_id = ANY($1::bigint[])`, [ids]).catch(() => {});
  return { deleted: ids.length };
}

/**
 * Merge every cross-posted pair. Safe to call after any ingest; ~90 pairs on
 * first run, then only what a re-scan recreates.
 * @returns {{ merged: number, deleted_on_prod: boolean }}
 */
export async function mergeCrossPostedTenders() {
  const pairs = (await query(CROSSPOST_PAIRS_SQL)).rows;
  if (!pairs.length) return { merged: 0, deleted_on_prod: false };

  const deletedIds = [];
  for (const { k_id, m_id } of pairs) {
    try {
      const rows = (await query(`SELECT * FROM tenders WHERE id = ANY($1::bigint[])`, [[k_id, m_id]])).rows;
      const m = rows.find((r) => Number(r.id) === Number(m_id));
      const k = rows.find((r) => Number(r.id) === Number(k_id));
      if (!m || !k) continue;
      const f = mergedFields(m, k);
      const packed = packRaw(f.raw);
      if (!packed) { console.error('[merge] raw too large for tender', m_id, '— pair left unmerged'); continue; }
      // Tombstone BEFORE the local delete, so a crash between the two still
      // propagates the deletion on the next sync.
      await query(`INSERT INTO sync_deletions (table_name, row_id) VALUES ('tenders', $1)`, [k_id]);
      await query(
        `UPDATE tenders SET status = $2, award_company_name = $3, award_company_id = $4,
                value_amount = $5, awarded_at = $6, deadline_at = $7, raw = $8::jsonb, updated_at = now()
          WHERE id = $1`,
        [m_id, f.status, f.award_company_name, f.award_company_id, f.value_amount, f.awarded_at, f.deadline_at, packed],
      );
      await query(`DELETE FROM tenders WHERE id = $1`, [k_id]);
      deletedIds.push(Number(k_id));
    } catch (err) {
      console.error('[merge] pair', k_id, '→', m_id, 'failed:', err.message);
    }
  }

  const prod = await pushDeletionsToProd(deletedIds);
  return { merged: deletedIds.length, deleted_on_prod: !prod.failed && !prod.skipped };
}

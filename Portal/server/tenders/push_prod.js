// Mirror the local `tenders` table straight to production (app.bell.qa) using
// the data-sync token — so Bella + the Signals in-market score see them without
// a separate Sync-tab step. Safe to call after any scan/backfill (full mode,
// small table). Shared by scan_tenders.js and backfill_tenders.js.

import { query } from '../db.js';
import { getKey } from '../keychain.js';

export async function pushTendersToProd() {
  const token = await getKey('sync-token');
  if (!token) return { skipped: 'no sync token yet (set it once in the portal Sync tab)' };
  const s = await query(`SELECT value FROM settings WHERE key = 'sync_target_url'`).catch(() => ({ rows: [] }));
  const base = String((s.rows[0] && s.rows[0].value) || process.env.BDI_SYNC_TARGET_URL || 'https://app.bell.qa').replace(/\/+$/, '');
  const rows = (await query(`SELECT * FROM tenders ORDER BY id`)).rows;
  if (!rows.length) return { pushed: 0, target: base };
  let pushed = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetch(base + '/api/sync/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ table: 'tenders', mode: 'full', rows: chunk }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); return { error: 'prod HTTP ' + res.status + ' ' + t.slice(0, 140) }; }
    const b = await res.json().catch(() => ({}));
    pushed += b.upserted || 0;
  }
  return { pushed, target: base };
}

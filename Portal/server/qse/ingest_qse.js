// QSE disclosures — ingest + company linking + prod push. DB side of the C1
// pipeline (scrape_qse.js is the pure fetch/parse side; sql.js holds the exact
// SQL so the PGlite test can run it against the real migration files).

import { query } from '../db.js';
import { getKey } from '../keychain.js';
import { QSE_UPSERT_SQL, QSE_LINK_EXACT_SQL, QSE_LINK_PREFIX_SQL } from './sql.js';

const DTYPES = new Set(['news', 'financial_statement', 'market_notice']);

/** Migration 079 applies only at Portal boot — tell the scan script plainly
 *  instead of letting every row fail with the same cryptic error. */
export async function qseTableReady() {
  const r = await query(`SELECT to_regclass('public.qse_disclosures') IS NOT NULL AS ok`).catch(() => ({ rows: [{ ok: false }] }));
  return !!r.rows[0].ok;
}

// raw stays tiny by design (ids + year/quarter — the text lives in real
// columns), but guard the jsonb write anyway: an unserializable or oversized
// raw is dropped whole, never sliced (CLAUDE.md 2.4 — sliced JSON is invalid
// jsonb and the row would be lost silently).
function safeRaw(raw) {
  if (!raw) return null;
  try {
    const s = JSON.stringify(raw);
    return s.length <= 20_000 ? s : null;
  } catch { return null; }
}

/**
 * Upsert scraped disclosure rows. Idempotent on source_uid.
 * @returns {{ inserted: number, updated: number, skipped: number }}
 */
export async function ingestQseDisclosures(rows) {
  let inserted = 0, updated = 0, skipped = 0;
  for (const r of rows || []) {
    if (!r || !DTYPES.has(r.dtype) || !r.source_uid || !r.headline) { skipped++; continue; }
    try {
      const res = await query(QSE_UPSERT_SQL, [
        r.source_uid, r.dtype, r.symbol ?? null, r.company_name ?? null, r.category ?? null,
        r.headline, r.summary ?? null, r.body ?? null, r.url ?? null, r.published_at ?? null,
        safeRaw(r.raw),
      ]);
      if (res.rows[0]?.is_insert) inserted++; else updated++;
    } catch (err) {
      skipped++;
      console.error('[qse] upsert failed:', r.source_uid, err.message);
    }
  }
  return { inserted, updated, skipped };
}

/**
 * Link disclosures to Bell companies — conservative, two passes (exact
 * normalized equality, then unique-prefix for legal-suffix variants).
 * Never guesses: ambiguous or short names stay unlinked.
 */
export async function linkQseCompanies() {
  const exact = await query(QSE_LINK_EXACT_SQL);
  const prefix = await query(QSE_LINK_PREFIX_SQL);
  return { linked: (exact.rowCount || 0) + (prefix.rowCount || 0) };
}

/**
 * Mirror the local qse_disclosures table to production — same shape as
 * tenders/push_prod.js. Small table (≈ a few thousand rows), full push.
 */
export async function pushQseToProd() {
  const token = await getKey('sync-token');
  if (!token) return { skipped: 'no sync token yet (set it once in the portal Sync tab)' };
  const s = await query(`SELECT value FROM settings WHERE key = 'sync_target_url'`).catch(() => ({ rows: [] }));
  const base = String((s.rows[0] && s.rows[0].value) || process.env.BDI_SYNC_TARGET_URL || 'https://app.bell.qa').replace(/\/+$/, '');
  const rows = (await query(`SELECT * FROM qse_disclosures ORDER BY id`)).rows;
  if (!rows.length) return { pushed: 0, target: base };
  let pushed = 0;
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    const res = await fetch(base + '/api/sync/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ table: 'qse_disclosures', mode: 'full', rows: chunk }),
    });
    if (!res.ok) { const t = await res.text().catch(() => ''); return { error: 'prod HTTP ' + res.status + ' ' + t.slice(0, 140) }; }
    const b = await res.json().catch(() => ({}));
    pushed += b.upserted || 0;
  }
  return { pushed, target: base };
}

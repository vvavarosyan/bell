// Resumable Kahramaa per-tender detail enrichment (Val's fix request
// 2026-07-12: "all details from sources must be captured and used").
// ----------------------------------------------------------------------------
// Each tender's Details page (/Business/Pages/TenderDetails.aspx?ItemId=<Id>,
// the Id captured into raw.km_id at scan time) is SERVER-RENDERED plain HTML —
// a label/value table with 17 rows (verified live 2026-07-12): Tender Name,
// Type, both tender numbers, Status, Department, Purchased At, Start/End
// Purchase Date, Fees, Bid Bond (+ validity days), Submitted At, Submission
// Closing Date, Offer Validity, the full Description, and Notes.
//
// Everything is captured VERBATIM into raw.fields (page order — the drawer's
// "As published" block); Description also lands in raw.description. The
// SUBMISSION CLOSING DATE is the true bid deadline (the list's EndDate is the
// document-PURCHASE end), so it replaces deadline_at when the page states it —
// same source, more precise field.

import { query } from '../db.js';
import { packRaw } from './raw.js';

export const KM_DETAIL_V = 1;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const CONCURRENCY = 4;

// ── pure parsing (exported for tests) ───────────────────────────────────────

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&#x?([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, _.includes('x') || _.includes('X') ? 16 : 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function cellText(htmlCell) {
  const BR = '\u0000';   // escape sequence, never a literal control byte in source
  return unescapeHtml(
    String(htmlCell || '')
      .replace(/<br\s*\/?>/gi, BR)
      .replace(/<\/(p|div|li|ul)>/gi, BR)
      .replace(/<[^>]+>/g, ' '),
  )
    .split(BR).map((part) => part.replace(/\s+/g, ' ').trim()).join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Parse a TenderDetails.aspx page's label/value table verbatim, page order.
 * Real <td> cells only (<td …><label>L:</label></td><td …><span>V</span></td>);
 * blanks dropped — the source stated nothing, so Bell states nothing.
 */
export function kmDetailFields(html) {
  const out = [];
  const re = /<td[^>]*>\s*<label>([^<]+?):?\s*<\/label>\s*<\/td>\s*<td[^>]*>\s*<span>([\s\S]*?)<\/span>\s*<\/td>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const label = unescapeHtml(m[1]).trim();
    const value = cellText(m[2]);
    if (!label || !value) continue;
    out.push({ label: label.slice(0, 120), value: value.slice(0, 8000) });
  }
  return out;
}

const fieldOf = (fields, rx) => (fields || []).find((f) => rx.test(f.label))?.value || null;

/** '16-08-2026 12:00 PM' | '16-08-2026 12:30:00' (dd-mm-yyyy, +03) → ISO. */
export function parseKmDateTime(s) {
  const m = String(s || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?)?$/i);
  if (!m) return null;
  let h = m[4] !== undefined ? Number(m[4]) : 0;
  const min = m[5] !== undefined ? Number(m[5]) : 0;
  if (m[6]) {
    const pm = m[6].toUpperCase() === 'PM';
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
  }
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:00+03:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** The page's own view of the tender (deadline + status + description). */
export function kmDetailSummary(fields) {
  const closing = parseKmDateTime(fieldOf(fields, /^Submission Closing Date$/i));
  const statusText = (fieldOf(fields, /^Status$/i) || '').toLowerCase();
  // The source's Status label lags reality (old tenders still say "Open");
  // its own Submission Closing Date is the truth: past deadline = closed.
  let status = null;
  if (statusText === 'open') status = (closing && closing < new Date().toISOString()) ? 'closed' : 'open';
  else if (statusText) status = 'closed';
  return { closing, status, description: fieldOf(fields, /^Description$/i) };
}

// ── fetching ────────────────────────────────────────────────────────────────

async function fetchPage(url, timeoutMs = 25_000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
      if (!res.ok) { if (attempt) return null; continue; }
      return await res.text();
    } catch {
      if (attempt) return null;
      await new Promise((r) => setTimeout(r, 800));
    } finally {
      clearTimeout(to);
    }
  }
  return null;
}

const PENDING = `source = 'kahramaa'
  AND jsonb_typeof(raw -> 'km_id') = 'string' AND btrim(raw ->> 'km_id') <> ''
  AND COALESCE(NULLIF(raw->>'km_detail_v', '')::int, 0) < ${KM_DETAIL_V}`;

export async function pendingKahramaaDetailCount() {
  const r = await query(`SELECT count(*)::int AS n FROM tenders WHERE ${PENDING}`);
  return r.rows[0].n;
}

/**
 * Enrich pending Kahramaa tenders with their Details-page content, newest
 * first. Resumable; also corrects `status` and `deadline_at` from the page's
 * own Submission Closing Date. Award rows have no km_id — they keep their
 * awarded status and winner data untouched.
 */
export async function enrichKahramaaDetails({ limit = null, onProgress = null } = {}) {
  const progress = (m) => { try { onProgress?.(m); } catch { /* never break the run */ } };
  const rows = (await query(
    `SELECT id, status, raw FROM tenders WHERE ${PENDING}
      ORDER BY published_at DESC NULLS LAST, id DESC ${limit ? `LIMIT ${Number(limit)}` : ''}`,
  )).rows;
  let enriched = 0, failed = 0, done = 0;

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const row = rows.shift();
      if (!row) return;
      try {
        const html = await fetchPage(`https://www.km.qa/Business/Pages/TenderDetails.aspx?ItemId=${encodeURIComponent(row.raw.km_id)}`);
        if (!html) { failed++; continue; }                    // stays pending — retried next run
        const fields = kmDetailFields(html);
        if (!fields.length) { failed++; continue; }
        const { closing, status, description } = kmDetailSummary(fields);
        const work = { ...(row.raw || {}) };
        work.fields = fields;
        if (description) work.description = description;
        work.km_detail_v = KM_DETAIL_V;
        const packed = packRaw(work);
        if (!packed) { failed++; continue; }
        await query(
          `UPDATE tenders SET raw = $2::jsonb,
                  deadline_at = COALESCE($3, deadline_at),
                  status = COALESCE($4, status),
                  url = $5,
                  updated_at = now()
            WHERE id = $1`,
          [row.id, packed, closing, row.status === 'awarded' ? null : status,
           `https://www.km.qa/Business/Pages/TenderDetails.aspx?ItemId=${row.raw.km_id}`],
        );
        enriched++;
      } catch (err) {
        failed++;
        console.error('[km-detail] tender', row.id, err.message);
      } finally {
        done++;
        if (done % 100 === 0) progress(`  ${done} detail pages fetched · ${enriched} enriched`);
        await new Promise((r) => setTimeout(r, 250));
      }
    }
  });
  await Promise.all(workers);
  return { enriched, failed };
}

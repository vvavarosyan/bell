// Monaqasat AWARD REPORTS — who actually won, for how much, and who they beat.
// ----------------------------------------------------------------------------
// For eleven months Bell recorded "awarded" on 21,066 Monaqasat tenders and knew the winner on
// three of them, because scrape_monaqasat.js carried the note "Monaqasat does NOT publish the
// winning supplier". THAT WAS WRONG. Every awarded row on
//   /TendersOnlineServices/AwardedTenders/{page}
// links a sibling page
//   /TendersOnlineServices/TenderCompaniesDetails/{id}
// which is a plain-fetch HTML page (no browser needed) carrying FOUR tables:
//
//   0  label/value tender metadata — Tender number, Ministry, Awarded Date, Awarded Amount…
//   1  THE WINNER   — Company name | Commercial Registration Number | Approved Value |
//                     Financial Result | Approved Items
//   2  PARTICIPANTS — Company name | Commercial Registration Number
//   3  THE BIDS     — Company name | CR | Proposal amount | Local Value Ratio | Financial
//                     Result | Notes        ← every rival's price AND their ICV percentage
//
// Table 3 is the part no competitor surfaces: the losing bids and their in-country-value
// ratios. Verified live 2026-08-05 on tenders 4905/2022 (ALMOHANNADI, QAR 105,763,640.26,
// beating 11 bidders incl. QUALITY CONSTRUCTION at 163,458,762.07 / ICV 43.80) and 4002/2026
// (Ali Bin Ali Medical, QAR 7,650,732.00, ICV 18.89).
//
// PARSING DOCTRINE (§2.2 — this file exists because a positional parser once corrupted prod):
//   • Tables are identified by their HEADER SIGNATURE, never by index. The same page can carry
//     a different table count, and an unrecognised header is SKIPPED rather than guessed at.
//   • A data row is read by ALIGNING TO ITS OWN HEADER by name, never by column position — the
//     header prints 5-6 labels and real rows can carry fewer cells.
//   • The CR cell frequently holds TWO numbers ("71717 | 107026") and sometimes one ("15").
//     Both are kept verbatim; the split is only used for matching.
//   • Anything the page does not state stays null. No inferred currency, no derived totals.

const cellText = (h) => String(h)
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&#x?[0-9a-fA-F]+;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Every <table> as an array of rows, each row an array of cell strings. */
export function reportTables(html) {
  const clean = String(html || '').replace(/<!--[\s\S]*?-->/g, ' ');   // Ashghal lesson: strip comments first
  const out = [];
  for (const t of clean.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const rows = [...t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
      .map((r) => [...r[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => cellText(c[1])))
      .filter((r) => r.length);
    if (rows.length) out.push(rows);
  }
  return out;
}

const norm = (s) => String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

/** Align a data row to its own header by NAME. Missing cells stay undefined, never shifted. */
function byHeader(header, row) {
  const o = {};
  for (let i = 0; i < header.length; i++) {
    const k = norm(header[i]);
    if (k) o[k] = row[i] != null ? String(row[i]).trim() : '';
  }
  return o;
}

/** "105,763,640.26 QAR" → { amount: 105763640.26, currency: 'QAR' }; "" → nulls. */
export function parseMoney(s) {
  const t = String(s || '').trim();
  if (!t) return { amount: null, currency: null };
  const cur = (t.match(/\b(QAR|USD|EUR|QR)\b/i) || [])[1] || null;
  const num = t.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  if (!/\d/.test(num)) return { amount: null, currency: cur ? cur.toUpperCase() : null };
  const v = Number(num);
  return { amount: Number.isFinite(v) ? v : null, currency: cur ? (cur.toUpperCase() === 'QR' ? 'QAR' : cur.toUpperCase()) : null };
}

/** "43.80" → 43.8 ; "" → null. Rule 2.1: never turn a blank into a zero. */
function parseRatio(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const v = Number(t.replace(/[^\d.]/g, ''));
  return Number.isFinite(v) ? v : null;
}

/**
 * "71717 | 107026" → ['71717','107026'] ; "15" → ['15'] ; "" → [].
 * QFC / QSTP / free-zone firms state a LICENCE number instead of a CR, e.g. Boston Consulting
 * Group's cell reads "QFC/00332 | 00332" (proven live). A digits-only filter silently threw
 * that identifier away — kept verbatim now, prefix and all, because Bell must not discard
 * something the source states. ⚠️ A licence number is NOT a CR: they occupy different
 * namespaces and can collide numerically (the chain-link matcher learned this the hard way),
 * so a caller matching against companies must compare like with like.
 */
export function splitRegistrations(s) {
  return String(s || '')
    .split('|')
    .map((x) => x.trim())
    .filter((x) => /^\d+$/.test(x) || /^(QFC|QSTP|QFZ|QFCRA)\s*\/\s*[\w-]+$/i.test(x))
    .map((x) => x.replace(/\s*\/\s*/, '/').toUpperCase().replace(/^(\d+)$/, '$1'));
}

/** Just the plain commercial-registration numbers — safe to compare to companies CR fields. */
export function crNumbersOnly(s) {
  return splitRegistrations(s).filter((x) => /^\d+$/.test(x));
}

const company = (o) => ({
  name: (o['company name'] || '').trim() || null,
  registration_raw: (o['commercial registration number'] || '').trim() || null,
  registrations: splitRegistrations(o['commercial registration number']),
});

/**
 * Parse one TenderCompaniesDetails page.
 * Returns { tender_number, ministry, subject, awarded_at, awarded_amount, currency,
 *           winner, participants[], bids[] } — every field null/[] when the page omits it.
 */
export function parseAwardReport(html) {
  const out = {
    tender_number: null, ministry: null, subject: null, tender_type: null,
    entity_ref: null, awarded_at: null, awarded_amount: null, currency: null,
    winner: null, participants: [], bids: [],
  };
  if (!html) return out;

  for (const rows of reportTables(html)) {
    const header = rows[0] || [];
    const h = header.map(norm);
    const isCompanyTable = h[0] === 'company name';

    if (isCompanyTable && h.includes('approved value')) {
      // TABLE 1 — the winner. One data row in every page observed; if a page ever carries
      // more (a split award), keep the first and record the rest as bids rather than
      // silently dropping them.
      const r = rows[1];
      if (r) {
        const o = byHeader(header, r);
        const money = parseMoney(o['approved value']);
        out.winner = {
          ...company(o),
          approved_value: money.amount,
          currency: money.currency,
          financial_result: (o['financial result'] || '').trim() || null,
          approved_items: (o['approved items'] || '').trim() || null,
        };
      }
    } else if (isCompanyTable && h.includes('proposal amount')) {
      // TABLE 3 — every bid, with its Local Value Ratio (the ICV percentage).
      for (const r of rows.slice(1)) {
        const o = byHeader(header, r);
        const c = company(o);
        if (!c.name) continue;
        const money = parseMoney(o['proposal amount']);
        out.bids.push({
          ...c,
          proposal_amount: money.amount,
          currency: money.currency,
          local_value_ratio: parseRatio(o['local value ratio']),
          financial_result: (o['financial result'] || '').trim() || null,
          notes: (o['notes'] || '').trim() || null,
        });
      }
    } else if (isCompanyTable && h.length === 2 && h.includes('commercial registration number')) {
      // TABLE 2 — participants (name + CR only).
      for (const r of rows.slice(1)) {
        const c = company(byHeader(header, r));
        if (c.name) out.participants.push(c);
      }
    } else {
      // TABLE 0 — label/value metadata. Rows carry PAIRS: [label, value, label, value].
      // A 2-cell row is one pair. Odd shapes are skipped, never guessed.
      for (const r of rows) {
        for (let i = 0; i + 1 < r.length; i += 2) {
          const k = norm(r[i]);
          const v = String(r[i + 1] || '').trim();
          if (!k || !v) continue;
          if (k === 'tender number' && !out.tender_number) out.tender_number = v;
          else if (k === 'ministry' && !out.ministry) out.ministry = v;
          else if (k === 'tender subject' && !out.subject) out.subject = v;
          else if (k === 'tender type' && !out.tender_type) out.tender_type = v;
          else if (k === 'tender number at ministry' && !out.entity_ref) out.entity_ref = v;
          else if (k === 'awarded date' && !out.awarded_at) out.awarded_at = v;
          else if (k === 'awarded amount' && out.awarded_amount == null) {
            const m = parseMoney(v);
            out.awarded_amount = m.amount;
            out.currency = out.currency || m.currency || 'QAR';   // header says "(QAR)"
          }
        }
      }
    }
  }
  return out;
}

/** dd/mm/yyyy → ISO date, or null. Monaqasat prints day-first. */
export function parseAwardDate(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

export const AWARD_REPORT_URL = (id) =>
  `https://monaqasat.mof.gov.qa/TendersOnlineServices/TenderCompaniesDetails/${id}`;

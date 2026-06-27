// Dependency-free CSV reader (RFC-4180): handles quoted fields, embedded commas,
// quotes ("" escape), CRLF/LF, and a leading UTF-8 BOM. Returns rows as arrays of
// cells; the caller maps header → object.

/** Parse CSV text → array of rows, each an array of string cells. */
export function parseCsvRows(text) {
  const s = String(text || '').replace(/^﻿/, '');   // strip BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = s.length;

  const endField = () => { row.push(field); field = ''; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  while (i < n) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }   // escaped quote
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { endField(); i++; continue; }
    if (ch === '\r') { i++; continue; }                  // ignore CR (CRLF handled by LF)
    if (ch === '\n') { endRow(); i++; continue; }
    field += ch; i++;
  }
  // Flush trailing field/row (unless the file ended on a clean newline with no
  // pending data).
  if (field.length > 0 || row.length > 0) endRow();
  return rows;
}

/**
 * Parse CSV text → { headers, records } where records are objects keyed by the
 * (trimmed, lower-cased) header. Blank rows are skipped. `maxRows` caps how many
 * data rows are returned (defense against huge uploads).
 */
export function parseCsv(text, { maxRows = 100000 } = {}) {
  const rows = parseCsvRows(text);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map((h) => String(h || '').trim());
  const keys = headers.map((h) => h.toLowerCase());
  const records = [];
  for (let r = 1; r < rows.length && records.length < maxRows; r++) {
    const cells = rows[r];
    // Skip fully-empty lines.
    if (cells.every((c) => String(c || '').trim() === '')) continue;
    const obj = {};
    for (let c = 0; c < keys.length; c++) obj[keys[c]] = (cells[c] ?? '').trim();
    records.push(obj);
  }
  return { headers, records };
}

// Common header aliases → our canonical field names. Lets us auto-map most CSVs
// (LinkedIn exports, HubSpot, generic) without forcing the user to map columns.
const ALIASES = {
  name:         ['name', 'full name', 'full_name', 'contact name', 'fullname', 'person'],
  email:        ['email', 'email address', 'e-mail', 'work email', 'email_address'],
  phone:        ['phone', 'phone number', 'mobile', 'telephone', 'tel', 'phone_number'],
  company_name: ['company', 'company name', 'organization', 'organisation', 'account', 'employer', 'company_name'],
  title:        ['title', 'job title', 'position', 'role', 'headline', 'job_title'],
  website:      ['website', 'web', 'url', 'domain', 'company website', 'site'],
  city:         ['city', 'town', 'location'],
  country:      ['country', 'nation'],
  notes:        ['notes', 'note', 'comment', 'comments', 'description'],
};

/** Map a raw CSV record (lower-cased keys) to our canonical import fields. */
export function mapImportRecord(rec) {
  const out = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    for (const nm of names) {
      if (rec[nm] !== undefined && rec[nm] !== '') { out[field] = rec[nm]; break; }
    }
  }
  return out;
}

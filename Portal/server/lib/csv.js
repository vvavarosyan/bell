// Tiny, dependency-free CSV writer (RFC-4180-ish).
// Quotes any field containing a comma, quote, or newline; doubles inner quotes.
// A leading BOM is added so Excel opens UTF-8 (Arabic names) correctly.

function cell(v) {
  if (v === null || v === undefined) return '';
  let s = String(v);
  // Neutralize spreadsheet formula injection (=, +, -, @ leading chars).
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/**
 * Build a CSV string.
 *   rows    — array of objects
 *   columns — array of { key, label } (label is the header; key indexes the row)
 * Returns a UTF-8 string with a BOM.
 */
export function toCsv(rows, columns) {
  const header = columns.map((c) => cell(c.label)).join(',');
  const body = (rows || []).map((r) => columns.map((c) => cell(r[c.key])).join(',')).join('\r\n');
  return '﻿' + header + (body ? '\r\n' + body : '') + '\r\n';
}

/** Safe-ish filename slug for the Content-Disposition header. */
export function slugFilename(s) {
  return String(s || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'export';
}

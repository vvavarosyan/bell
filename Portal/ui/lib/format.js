// Friendly rendering of arbitrary field values (strings, numbers, arrays,
// objects) for the detail drawers. Replaces raw JSON "black boxes" with
// human-readable chips / lines, and shows a dash for empty values.

import { html } from './html.js';

const DASH = html`<span class="muted">—</span>`;

const isUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s.trim());

// Numbers get thousands separators — EXCEPT 4-digit year-like integers (a
// founded year should read "2018", not "2,018").
export function fmtNumber(n) {
  if (Number.isInteger(n) && n >= 1000 && n <= 9999) return String(n);
  return Number(n).toLocaleString();
}

// True for null/undefined/'', empty arrays, and empty objects (after dropping
// LinkedIn recipe-metadata keys like $type/$recipeTypes).
export function isEmptyValue(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v).filter(k => !k.startsWith('$')).length === 0;
  return false;
}

function chips(arr) {
  return html`<span class="val-chips">${arr.map((x, i) => html`<span class="val-chip" key=${i}>${String(x)}</span>`)}</span>`;
}

// One address/location object → a clean single line.
function locationLine(o) {
  const parts = [o.line1, o.line2, o.city || o.localizedName, o.geographicArea, o.postalCode, o.country]
    .map(x => (x == null ? '' : String(x).trim())).filter(Boolean);
  const seen = new Set();
  const uniq = parts.filter(p => { const k = p.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const tag = o.headquarter ? 'HQ' : (o.description || null);
  const addr = uniq.join(', ');
  return (tag ? tag + (addr ? ' — ' : '') : '') + addr;
}

const looksLikeLocation = (o) =>
  o && typeof o === 'object' && (o.city != null || o.line1 != null || o.country != null || o.headquarter !== undefined || o.localizedName != null);

// An object whose every value is a boolean, e.g. {"Credit cards": true}.
const isBoolObj = (o) => o && typeof o === 'object' && !Array.isArray(o) &&
  Object.keys(o).length > 0 && Object.values(o).every(v => typeof v === 'boolean');
const truthyKeys = (o) => Object.entries(o).filter(([, v]) => v === true).map(([k]) => k);

export function formatValue(value) {
  if (value === null || value === undefined) return DASH;

  if (typeof value === 'boolean') {
    return value ? html`<span class="pill active">Yes</span>` : html`<span class="pill inactive">No</span>`;
  }
  if (typeof value === 'number') return fmtNumber(value);

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return DASH;
    if (isUrl(s)) return html`<a class="url-btn" href=${s} target="_blank" rel="noreferrer" title=${s}>Open ↗</a>`;
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { try { return new Date(s).toLocaleString(); } catch {} }
    return s;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return DASH;
    // Google-features style: [{"Credit cards":true}, …] → the enabled labels.
    if (value.every(isBoolObj)) {
      const keys = value.flatMap(truthyKeys);
      return keys.length ? chips(keys) : DASH;
    }
    if (value.every(x => typeof x === 'string' || typeof x === 'number')) return chips(value);
    if (value.every(x => x && typeof x === 'object')) {
      const lines = value.map(o => looksLikeLocation(o)
        ? locationLine(o)
        : Object.entries(o).filter(([k, v]) => !k.startsWith('$') && v != null && v !== '').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', '));
      const clean = lines.filter(Boolean);
      return clean.length ? html`<div class="val-lines">${clean.map((l, i) => html`<div key=${i}>${l}</div>`)}</div>` : DASH;
    }
    return chips(value.map(x => (typeof x === 'object' ? JSON.stringify(x) : String(x))));
  }

  if (typeof value === 'object') {
    // Drop LinkedIn recipe metadata ($type, $recipeTypes, …) and empties.
    const entries = Object.entries(value).filter(([k, v]) => !k.startsWith('$') && v != null && v !== '');
    if (entries.length === 0) return DASH;
    // {start, end} → "51 - 200"
    if (value.start != null && value.end != null && entries.length <= 2) return `${value.start} - ${value.end}`;
    // A single meaningful key (e.g. {year: 2018}) → just the value.
    if (entries.length === 1) return formatValue(entries[0][1]);
    // Otherwise "key: <formatted value>" lines (recurses for nested features).
    return html`<div class="val-lines">${entries.map(([k, v]) => html`
      <div key=${k}><span class="muted">${k.replace(/_/g, ' ')}:</span> ${formatValue(v)}</div>`)}</div>`;
  }

  return String(value);
}

// A compact line of source-with-record-id badges used under company names.
// Strips internal prefixes ("moci-cr:", "qfc:", "qstp:") so we just show the
// human-friendly reg #.

import { html } from '../lib/html.js';

const COLORS = {
  QFC:  { bg: '#1c2c52', text: '#8bb0ff', border: '#3a5ec1' },
  QFZ:  { bg: '#2c1c52', text: '#c5a3ff', border: '#6e4cc1' },
  MOCI: { bg: '#3a2812', text: '#ffc594', border: '#a36422' },
  QSTP: { bg: '#173322', text: '#9fefb8', border: '#2f8a5a' },
};

function prettyId(source, recordId) {
  if (!recordId) return '';
  const s = String(recordId);
  // moci-cr:65895  → CR-65895
  // moci-cp:78132  → CP-78132
  if (s.startsWith('moci-cr:')) return 'CR-' + s.slice('moci-cr:'.length);
  if (s.startsWith('moci-cp:')) return 'CP-' + s.slice('moci-cp:'.length);
  if (s.startsWith('qfc:'))     return s.slice('qfc:'.length);
  if (s.startsWith('qstp:'))    return '#' + s.slice('qstp:'.length);
  if (s.startsWith('qfz:'))     return '';   // QFZ uses slug, not useful as a number
  return s;
}

/**
 * @param records  Array<{source, record_id}> — provenance per source
 * @param max      Optional cap on how many badges to render. When truncated,
 *                 a small "+N" pill appears in place of the rest so the row
 *                 stays one line (the full list lives in the detail drawer).
 *                 Default: render all.
 */
export function SourceRecordsLine({ records, max }) {
  if (!records || records.length === 0) return null;
  // Pick the most informative single record first when capped: prefer ones
  // with a non-empty prettyId (QFZ uses a slug so its prettyId is ''). This
  // keeps the row badge meaningful even when a company is in QFZ + something else.
  const ordered = (max && max < records.length)
    ? [...records].sort((a, b) => {
        const aHas = prettyId(a.source, a.record_id) ? 1 : 0;
        const bHas = prettyId(b.source, b.record_id) ? 1 : 0;
        return bHas - aHas;
      })
    : records;
  const shown   = (max && max < ordered.length) ? ordered.slice(0, max) : ordered;
  const hidden  = ordered.length - shown.length;

  return html`<div class="source-records-line">
    ${shown.map((r, i) => {
      const c = COLORS[r.source] || { bg: '#1c2030', text: '#8a93a6', border: '#2b2f3d' };
      const id = prettyId(r.source, r.record_id);
      const style = {
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        padding: '1px 6px',
        fontSize: '10px', fontWeight: 600,
        borderRadius: '3px',
        background: c.bg, color: c.text,
        border: '1px solid ' + c.border,
        letterSpacing: '.3px',
        marginRight: '4px',
      };
      return html`<span key=${i} style=${style}>
        <span>${r.source}</span>
        ${id ? html`<span style=${{ fontWeight: 400, opacity: .85 }}>${id}</span>` : null}
      </span>`;
    })}
    ${hidden > 0 ? html`<span
      title=${`Also in ${ordered.slice(max).map(r => r.source).join(', ')} — see detail panel`}
      style=${{
        display: 'inline-flex', alignItems: 'center',
        padding: '1px 6px',
        fontSize: '10px', fontWeight: 600,
        borderRadius: '3px',
        background: '#1c2030', color: '#8a93a6',
        border: '1px solid #2b2f3d',
        letterSpacing: '.3px',
      }}>+${hidden}</span>` : null}
  </div>`;
}

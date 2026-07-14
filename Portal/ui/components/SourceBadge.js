// Color-coded source badge(s). Renders one badge per source a company appears
// in. Compact form for the grid; full form for the detail panel.

import { html } from '../lib/html.js';

// Each source gets its own hue + label color so admins can scan quickly.
const COLORS = {
  QFC:  { bg: '#1c2c52', text: '#7ea8ff', border: '#3a5ec1' },  // blue
  QFZ:  { bg: '#2c1c52', text: '#b78bff', border: '#6e4cc1' },  // purple
  MOCI: { bg: '#3a2812', text: '#ffb774', border: '#a36422' },  // amber/orange
  QSTP: { bg: '#173322', text: '#7be3a8', border: '#2f8a5a' },  // green
  QSE:  { bg: '#0f3340', text: '#6fe0ee', border: '#2f7f93' },  // teal/cyan
  QCCI: { bg: '#3a1230', text: '#ff9ad6', border: '#a3327f' },  // magenta/pink
  MoPH: { bg: '#10302a', text: '#5fe3c0', border: '#2c8a73' },  // emerald/health
  Tasmu:{ bg: '#33240f', text: '#ffcf8a', border: '#9a6e2a' },  // gold/digital
  LinkedIn: { bg: '#13243f', text: '#7cb8ff', border: '#2b5da3' },  // linkedin blue (people)
  manual:   { bg: '#2a2233', text: '#c9a8e6', border: '#5a4470' },  // manual entries
};
const FALLBACK = { bg: '#1c2030', text: '#8a93a6', border: '#2b2f3d' };

// Full source names — shown on hover over a badge.
export const SOURCE_NAMES = {
  QFC:  'Qatar Financial Centre',
  QFZ:  'Qatar Free Zones',
  MOCI: 'Ministry of Commerce & Industry',
  QSTP: 'Qatar Science & Technology Park',
  QSE:  'Qatar Stock Exchange',
  QCCI: 'Qatar Chamber — Commercial & Industrial Directory',
  MoPH: 'Ministry of Public Health — Healthcare Facilities (DHP)',
  Tasmu: 'Tasmu Digital Valley — Qatar Digital Directory (MCIT)',
  LinkedIn: 'LinkedIn',
  manual: 'Manually added',
};

export function SourceBadge({ source, compact = false }) {
  const c = COLORS[source] || FALLBACK;
  const style = {
    display: 'inline-block',
    padding: compact ? '1px 6px' : '2px 8px',
    fontSize: compact ? '10px' : '11px',
    fontWeight: 600,
    borderRadius: '4px',
    background: c.bg,
    color: c.text,
    border: '1px solid ' + c.border,
    letterSpacing: '.3px',
    cursor: 'default',
  };
  return html`<span style=${style} title=${SOURCE_NAMES[source] || source}>${source}</span>`;
}

const fmtAsOf = (d) => { try { return new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return null; } };

// An honest freshness + provenance line: which official source Bell read a record from,
// and when it last confirmed the record there ("as of" = last_seen_at). It never claims a
// re-verification Bell didn't do (Rule 2.1) — it states the source and the date, which is
// exactly what Bell knows. This is the feature that makes Bell's real edge (fresh, direct
// from official Qatar sources) legible, versus resellers' decaying second-hand files.
//   sources: array of {source, last_seen_at, first_seen_at} (full) OR of source-name strings.
//   sourceName / date: alternatively pass a single source label + ISO date (e.g. for a tender).
export function FreshnessStamp({ sources, sourceName, date, prefix = 'Direct from', dateLabel = 'as of', fallbackLabel = 'official Qatar sources', style = {} }) {
  let names = [];
  let asOf = date || null;
  if (sources && sources.length) {
    names = [...new Set(sources.map((s) => (typeof s === 'string' ? s : s && s.source)).filter(Boolean))];
    const dates = sources.map((s) => (s && typeof s === 'object' ? (s.last_seen_at || s.first_seen_at) : null)).filter(Boolean);
    if (!asOf && dates.length) asOf = dates.slice().sort().pop();
  } else if (sourceName) {
    names = [sourceName];
  }
  if (!names.length && !asOf) return null;
  const when = asOf ? fmtAsOf(asOf) : null;
  const label = names.length === 1 ? (SOURCE_NAMES[names[0]] || names[0]) : fallbackLabel;
  const title = 'Bell reads this directly from the official source. "As of" is the date Bell last confirmed the record there — not a resold third-party file.';
  const em = { color: 'var(--text, #cfd4de)' };
  // Build the line as ONE string so htm renders a single text child (no keyed-array
  // warning), then emphasise the source + date spans around it.
  const parts = [
    html`<span key="p">${prefix} </span>`,
    html`<span key="l" style=${em}>${label}</span>`,
  ];
  if (when) parts.push(html`<span key="d"> · ${dateLabel} <span style=${em}>${when}</span></span>`);
  return html`<div title=${title} style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text-muted, #8a93a6)', ...style }}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style=${{ flexShrink: 0 }} aria-hidden="true">
      <path d="M12 2.5l7 3v5.5c0 4.6-3 8.3-7 9.5-4-1.2-7-4.9-7-9.5V5.5l7-3z" fill="none" stroke="#4ea87a" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="M8.7 12.2l2.2 2.2 4.4-4.6" stroke="#4ea87a" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
    <span>${parts}</span>
  </div>`;
}

/** Render a group of badges for a company.sources array. */
export function SourceBadges({ sources, compact = true }) {
  if (!sources || sources.length === 0) {
    return html`<span class="muted small">—</span>`;
  }
  return html`<span style=${{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
    ${sources.map(s => html`<${SourceBadge} key=${s} source=${s} compact=${compact} />`)}
  </span>`;
}

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

/** Render a group of badges for a company.sources array. */
export function SourceBadges({ sources, compact = true }) {
  if (!sources || sources.length === 0) {
    return html`<span class="muted small">—</span>`;
  }
  return html`<span style=${{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap' }}>
    ${sources.map(s => html`<${SourceBadge} key=${s} source=${s} compact=${compact} />`)}
  </span>`;
}

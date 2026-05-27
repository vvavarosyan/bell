// Auto-picked chart for one dataset. Fetches /datasets/:id/chart and renders.
//
// Design principles (refresh 2):
//   • One accent color (no gradients on data)
//   • Monospace for every number, sans for every label
//   • Generous whitespace; the chart breathes
//   • Visible hierarchy: large primary value, smaller deltas
//   • No animation. Quiet, analytical, Bloomberg-leaning.

import { useEffect, useState } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

const ACCENT     = 'rgb(139 176 255)';      // single accent for all chart data
const ACCENT_DIM = 'rgba(139, 176, 255, 0.32)';
const GRID       = 'rgba(255, 255, 255, 0.05)';
const TEXT       = 'rgb(220 226 240)';
const TEXT_DIM   = 'rgb(140 154 178)';
const TEXT_FAINT = 'rgb(95 108 130)';

export function DatasetChart({ datasetId, syncedCount }) {
  const [plan, setPlan]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        const r = await api.openDataChart(datasetId);
        if (alive) setPlan(r);
      } catch { if (alive) setPlan({ chart_type: 'none', reason: 'load_failed' }); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [datasetId, syncedCount]);

  if (loading) return html`<div style=${{ color: TEXT_DIM, fontSize: '11.5px' }}>Computing chart…</div>`;
  if (!plan || plan.chart_type === 'none') return null;

  if (plan.chart_type === 'time_series') return html`<${TimeSeries} plan=${plan} />`;
  if (plan.chart_type === 'category_bar') return html`<${CategoryBar} plan=${plan} />`;
  if (plan.chart_type === 'stat_strip')   return html`<${StatStrip} plan=${plan} />`;
  return null;
}

// ---------------------------------------------------------------------------
// Time series — clean line + dots, monochrome
// ---------------------------------------------------------------------------
function TimeSeries({ plan }) {
  const points = plan.points || [];
  if (points.length < 2) return null;

  const W = 880;
  const H = 280;
  const pad = { t: 32, r: 32, b: 38, l: 56 };
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;

  const values = points.map(p => p.n);
  const maxN = Math.max(...values, 1);
  // Round max up to a "nice" number so the top tick reads cleanly
  const niceMax = niceCeil(maxN);

  const xStep = innerW / (points.length - 1);
  const xFor  = (i) => pad.l + i * xStep;
  const yFor  = (n) => pad.t + innerH - (n / niceMax) * innerH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xFor(i).toFixed(1)} ${yFor(p.n).toFixed(1)}`).join(' ');

  // Smart tick formatter
  const fmt = (d) => {
    const dt = new Date(d);
    if (plan.bucket === 'year') return dt.getUTCFullYear();
    if (plan.bucket === 'day')  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return dt.toLocaleDateString(undefined, { year: '2-digit', month: 'short' });
  };

  // X-axis: pick ~6 evenly-spaced ticks
  const xTickEvery = Math.max(1, Math.ceil(points.length / 6));
  // Y-axis: 4 gridlines including baseline + max
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(p => Math.round((1 - p) * niceMax));

  // Latest + delta
  const latest = points[points.length - 1].n;
  const previous = points.length > 1 ? points[points.length - 2].n : null;
  const delta = previous !== null ? latest - previous : null;
  const deltaPct = (delta !== null && previous > 0) ? (delta / previous) * 100 : null;

  return html`<${ChartFrame}
    title=${`${labelize(plan.field)} over time`}
    subtitle=${`${plan.record_count.toLocaleString()} records · grouped by ${plan.bucket} · ${plan.points.length} buckets`}
    extra=${html`<div style=${{ textAlign: 'right' }}>
      <div style=${{ fontSize: '10px', color: TEXT_FAINT, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>Latest</div>
      <div style=${{
        fontSize: '22px', color: TEXT, marginTop: '2px',
        fontFamily: 'ui-monospace, monospace', fontVariantNumeric: 'tabular-nums',
        fontWeight: 600, lineHeight: 1,
      }}>${latest.toLocaleString()}</div>
      ${delta !== null ? html`<div style=${{
        marginTop: '3px',
        fontSize: '10.5px',
        color: delta === 0 ? TEXT_DIM : (delta > 0 ? 'var(--green)' : 'var(--red)'),
        fontFamily: 'ui-monospace, monospace',
        fontVariantNumeric: 'tabular-nums',
      }}>${delta > 0 ? '+' : ''}${delta.toLocaleString()}${deltaPct !== null && Number.isFinite(deltaPct) ? ` (${deltaPct > 0 ? '+' : ''}${deltaPct.toFixed(1)}%)` : ''}</div>` : null}
    </div>`}
  >
    <svg viewBox=${`0 0 ${W} ${H}`} preserveAspectRatio="none" style=${{ width: '100%', height: 'auto', display: 'block' }}>
      <!-- gridlines -->
      ${yTicks.map((v, i) => {
        const y = pad.t + (i / (yTicks.length - 1)) * innerH;
        return html`<g key=${i}>
          <line x1=${pad.l} y1=${y.toFixed(1)} x2=${pad.l + innerW} y2=${y.toFixed(1)} stroke=${GRID} stroke-width="1" />
          <text x=${pad.l - 12} y=${(y + 4).toFixed(1)} fill=${TEXT_FAINT} font-size="10.5"
            text-anchor="end" font-family="ui-monospace, monospace">${v.toLocaleString()}</text>
        </g>`;
      })}

      <!-- the line -->
      <path d=${linePath} fill="none" stroke=${ACCENT} stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" />

      <!-- dots at each point -->
      ${points.map((p, i) => html`<circle key=${i}
        cx=${xFor(i)} cy=${yFor(p.n)} r="2.2"
        fill="#0e1322" stroke=${ACCENT} stroke-width="1.4"
      />`)}

      <!-- end marker — slightly larger -->
      <circle cx=${xFor(points.length - 1)} cy=${yFor(latest)} r="3.4"
        fill=${ACCENT} stroke="#0e1322" stroke-width="2" />

      <!-- x-axis labels -->
      ${points.map((p, i) => {
        if (i % xTickEvery !== 0 && i !== points.length - 1) return null;
        return html`<text key=${i}
          x=${xFor(i)} y=${H - 14}
          fill=${TEXT_FAINT} font-size="10.5" text-anchor="middle"
          font-family="ui-monospace, monospace"
        >${fmt(p.at)}</text>`;
      })}
    </svg>
  <//>`;
}

// ---------------------------------------------------------------------------
// Category bar chart — flat horizontal bars, monospace values right-aligned
// ---------------------------------------------------------------------------
function CategoryBar({ plan }) {
  const bars = plan.bars || [];
  if (bars.length === 0) return null;
  const maxN = Math.max(...bars.map(b => b.n), 1);
  const total = bars.reduce((s, b) => s + b.n, 0);

  return html`<${ChartFrame}
    title=${`Distribution by ${labelize(plan.field)}`}
    subtitle=${`Top ${bars.length} of ${plan.cardinality.toLocaleString()} unique values · ${total.toLocaleString()} records covered`}
  >
    <div style=${{ display: 'flex', flexDirection: 'column', padding: '4px 0' }}>
      ${bars.map((b, i) => {
        const pct = (b.n / maxN) * 100;
        const totalPct = total > 0 ? (b.n / total) * 100 : 0;
        // First bar is fully accented; rest fade slightly for visual hierarchy
        const opacity = i === 0 ? 0.55 : Math.max(0.18, 0.5 - i * 0.025);
        return html`<div key=${i} style=${{
          display: 'grid',
          gridTemplateColumns: 'minmax(160px, 1.4fr) 1fr auto',
          alignItems: 'center', gap: '14px',
          padding: '9px 0',
          borderBottom: i === bars.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.03)',
        }}>
          <div style=${{
            color: TEXT, fontSize: '12px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title=${b.label}>${b.label || '—'}</div>
          <div style=${{
            position: 'relative', height: '7px',
            background: 'rgba(255,255,255,0.025)',
            borderRadius: '2px',
            overflow: 'hidden',
          }}>
            <div style=${{
              position: 'absolute', left: 0, top: 0, bottom: 0,
              width: pct + '%',
              background: ACCENT,
              opacity,
              borderRadius: '2px',
            }}></div>
          </div>
          <div style=${{
            display: 'flex', alignItems: 'baseline', gap: '8px',
            justifyContent: 'flex-end',
            minWidth: '110px',
            fontFamily: 'ui-monospace, monospace',
            fontVariantNumeric: 'tabular-nums',
          }}>
            <span style=${{ fontSize: '13px', color: TEXT, fontWeight: 600 }}>${b.n.toLocaleString()}</span>
            <span style=${{ fontSize: '10.5px', color: TEXT_FAINT }}>${totalPct.toFixed(1)}%</span>
          </div>
        </div>`;
      })}
    </div>
  <//>`;
}

// ---------------------------------------------------------------------------
// Stat strip — calmer, with mini range bar for each field
// ---------------------------------------------------------------------------
function StatStrip({ plan }) {
  const stats = plan.stats || [];
  if (stats.length === 0) return null;
  return html`<${ChartFrame}
    title="Numeric summary"
    subtitle=${`${stats.length} field${stats.length === 1 ? '' : 's'} · computed across all synced records`}
  >
    <div style=${{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: '10px',
    }}>
      ${stats.map((s, i) => html`<${StatCell} key=${i} s=${s} />`)}
    </div>
  <//>`;
}

function StatCell({ s }) {
  const range = (s.max ?? 0) - (s.min ?? 0);
  const meanPct = (range > 0 && s.mean !== null && s.min !== null)
    ? ((s.mean - s.min) / range) * 100 : 50;
  return html`<div style=${{
    padding: '12px 14px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
  }}>
    <div style=${{
      fontSize: '10.5px', color: TEXT_FAINT,
      textTransform: 'uppercase', letterSpacing: '0.08em',
      fontWeight: 700, marginBottom: '8px',
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    }} title=${s.label}>${s.label || s.field}</div>

    <!-- big mean value -->
    <div style=${{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
      <span style=${{
        fontSize: '22px', fontWeight: 600, color: TEXT,
        fontFamily: 'ui-monospace, monospace',
        fontVariantNumeric: 'tabular-nums', lineHeight: 1,
      }}>${formatNumber(s.mean)}</span>
      <span style=${{ fontSize: '10px', color: TEXT_FAINT, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>mean</span>
    </div>

    <!-- range bar (min ↔ mean ↔ max) -->
    ${(s.min !== null && s.max !== null && s.min !== s.max) ? html`<div style=${{
      position: 'relative',
      height: '4px',
      background: 'rgba(255,255,255,0.04)',
      borderRadius: '2px',
      margin: '12px 0 8px',
    }}>
      <div style=${{
        position: 'absolute',
        left: Math.max(0, Math.min(98, meanPct)) + '%',
        top: '-3px', bottom: '-3px', width: '2px',
        background: ACCENT,
        borderRadius: '1px',
      }}></div>
    </div>` : html`<div style=${{ height: '8px' }}></div>`}

    <div style=${{
      display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
      gap: '6px',
      fontFamily: 'ui-monospace, monospace',
      fontVariantNumeric: 'tabular-nums',
      fontSize: '10.5px',
    }}>
      ${[
        { k: 'min',   v: s.min   },
        { k: 'max',   v: s.max   },
        { k: 'count', v: s.count },
      ].map(row => html`<div key=${row.k}>
        <div style=${{ color: TEXT_FAINT, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, fontSize: '9px' }}>${row.k}</div>
        <div style=${{ color: TEXT, marginTop: '2px' }}>${formatNumber(row.v)}</div>
      </div>`)}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
function ChartFrame({ title, subtitle, extra, children }) {
  return html`<div style=${{
    padding: '20px 22px',
    background: 'rgba(255,255,255,0.012)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
  }}>
    <div style=${{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      gap: '16px', marginBottom: '18px',
    }}>
      <div>
        <div style=${{
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em',
          color: TEXT_FAINT, fontWeight: 700,
        }}>Auto chart</div>
        <div style=${{ fontSize: '14px', color: TEXT, fontWeight: 600, marginTop: '3px' }}>${title}</div>
        ${subtitle ? html`<div style=${{ fontSize: '11px', color: TEXT_DIM, marginTop: '3px' }}>${subtitle}</div>` : null}
      </div>
      ${extra || null}
    </div>
    ${children}
  </div>`;
}

function labelize(name) {
  if (!name) return 'value';
  return String(name).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function formatNumber(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + 'B';
  if (Math.abs(n) >= 1_000_000)     return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 10_000)        return (n / 1_000).toFixed(1) + 'K';
  if (Number.isInteger(n))          return n.toLocaleString();
  return n.toFixed(2);
}

// Round up to a "nice" number for axis ticks (e.g. 87 → 100, 234 → 250).
function niceCeil(n) {
  if (n <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / mag;
  let nice;
  if      (f <= 1)   nice = 1;
  else if (f <= 2)   nice = 2;
  else if (f <= 2.5) nice = 2.5;
  else if (f <= 5)   nice = 5;
  else               nice = 10;
  return nice * mag;
}

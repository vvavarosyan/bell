// Market Feed centerpiece (Phase B, Val 2026-07-02): the live intelligence
// network — every news source visibly streaming into Bell's brain, which
// processes (categorizes, scores, links) and emits YOUR feed. Pure SVG + SMIL
// pulses, no libraries; sources + counts come live from /api/feed/sources.

import { html } from '../lib/html.js';

const W = 720, H = 200;
const HUB = { x: 430, y: 100 };
const OUT = { x: 660, y: 100 };

export function FeedSourcesNetwork({ sources = [], scanning = false }) {
  if (!sources.length) return null;
  const shown = sources.slice(0, 7);
  const extra = sources.length - shown.length;
  const step = Math.min(24, (H - 40) / Math.max(shown.length - 1, 1));
  const y0 = HUB.y - ((shown.length - 1) * step) / 2;

  const path = (y) => {
    const x1 = 168, midX = (x1 + HUB.x - 30) / 2;
    return `M ${x1} ${y} C ${midX} ${y}, ${midX} ${HUB.y}, ${HUB.x - 30} ${HUB.y}`;
  };

  return html`
    <div style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '12px 14px 6px', marginBottom: '14px' }}>
      <div style=${{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '2px' }}>
        <span style=${{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.12em', color: 'var(--text-dim)', fontWeight: 700 }}>Live intelligence network</span>
        <span style=${{ fontSize: '11px', color: 'var(--text-dim)' }}>${sources.length} sources · monitored continuously</span>
      </div>
      <svg viewBox=${`0 0 ${W} ${H}`} style=${{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="News sources flowing into Bell Data Intelligence">
        <defs>
          <radialGradient id="fsnGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stop-color="#5b8cff" stop-opacity="0.35" />
            <stop offset="100%" stop-color="#5b8cff" stop-opacity="0" />
          </radialGradient>
        </defs>

        ${shown.map((s, i) => {
          const y = y0 + i * step;
          const d = path(y);
          return html`
            <g key=${s.name}>
              <circle cx="160" cy=${y} r="3" fill="#5b8cff" opacity="0.85" />
              <text x="152" y=${y + 3.5} text-anchor="end" font-size="11" fill="var(--text-muted, #c2cadc)">
                ${s.name.length > 18 ? s.name.slice(0, 17) + '…' : s.name}
                <tspan fill="var(--text-dim, #9ca5b9)" font-size="9.5">${s.items_7d ? `  ${Number(s.items_7d).toLocaleString()}/wk` : ''}</tspan>
              </text>
              <path d=${d} fill="none" stroke="#5b8cff" stroke-opacity="0.22" stroke-width="1.2" />
              <circle r="2.4" fill="#a5c3ff">
                <animateMotion dur=${(3.4 + (i % 5) * 0.55).toFixed(2) + 's'} begin=${(i * 0.45).toFixed(2) + 's'} repeatCount="indefinite" path=${d} />
                <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.12;0.85;1" dur=${(3.4 + (i % 5) * 0.55).toFixed(2) + 's'} begin=${(i * 0.45).toFixed(2) + 's'} repeatCount="indefinite" />
              </circle>
            </g>`;
        })}
        ${extra > 0 ? html`<text x="152" y=${y0 + shown.length * step + 4} text-anchor="end" font-size="10" fill="var(--text-dim, #9ca5b9)">+${extra} more sources</text>` : null}

        <!-- Bell hub -->
        <circle cx=${HUB.x} cy=${HUB.y} r="52" fill="url(#fsnGlow)" />
        <circle cx=${HUB.x} cy=${HUB.y} r="26" fill="none" stroke="#5b8cff" stroke-opacity="0.5">
          <animate attributeName="r" values="26;36;26" dur="3s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" values="0.5;0;0.5" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx=${HUB.x} cy=${HUB.y} r="25" fill="#131829" stroke="#5b8cff" stroke-width="1.6" />
        <text x=${HUB.x} y=${HUB.y + 4} text-anchor="middle" font-size="12" font-weight="700" fill="#ebf0ff" letter-spacing="1.5">BELL</text>
        <text x=${HUB.x} y=${HUB.y + 44} text-anchor="middle" font-size="9.5" fill="var(--text-dim, #9ca5b9)">
          ${scanning ? 'scanning · summarizing · linking' : 'categorizing · scoring · linking to records'}
        </text>

        <!-- Output stream → the user's feed -->
        <path d=${`M ${HUB.x + 30} ${HUB.y} L ${OUT.x - 44} ${OUT.y}`} fill="none" stroke="#5b8cff" stroke-opacity="0.35" stroke-width="1.6" />
        ${[0, 1, 2].map((k) => html`
          <circle key=${k} r="2.8" fill="#a5c3ff">
            <animateMotion dur="1.8s" begin=${(k * 0.6).toFixed(1) + 's'} repeatCount="indefinite" path=${`M ${HUB.x + 30} ${HUB.y} L ${OUT.x - 44} ${OUT.y}`} />
          </circle>`)}
        <g>
          <circle cx=${OUT.x} cy=${OUT.y} r="20" fill="#131829" stroke="var(--border, #323a54)" stroke-width="1.2" />
          <text x=${OUT.x} y=${OUT.y - 1} text-anchor="middle" font-size="8.5" fill="var(--text-muted, #c2cadc)">YOUR</text>
          <text x=${OUT.x} y=${OUT.y + 9} text-anchor="middle" font-size="8.5" fill="var(--text-muted, #c2cadc)">FEED</text>
        </g>
      </svg>
    </div>`;
}

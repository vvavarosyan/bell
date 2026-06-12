// Bell Score chip — 0–100 data-completeness score with a colored bar.
import { html } from '../lib/html.js';

export function BellScore({ score }) {
  const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  const color = s >= 75 ? 'var(--green)' : s >= 45 ? 'var(--amber)' : 'var(--red)';
  return html`<span class="bell-score" title=${`Bell Score ${s}/100 — how complete this record's data is`}>
    <span class="bell-score-bar"><span style=${{ width: s + '%', background: color }}></span></span>
    <span class="bell-score-num" style=${{ color }}>${s}</span>
  </span>`;
}

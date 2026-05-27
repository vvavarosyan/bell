// Six dots representing enrichment stages 1-6 for a row.
import { html } from '../lib/html.js';

const LABELS = ['LinkedIn Discovery', 'LinkedIn Profile', 'Employees', 'Jobs', 'Google Maps', 'Website Contacts'];

export function StageBar({ row }) {
  const dots = [];
  for (let i = 1; i <= 6; i++) {
    const status = row['stage' + i + '_status'] || 'pending';
    const at = row['stage' + i + '_at'];
    const tip = `Stage ${i} — ${LABELS[i-1]}: ${status}${at ? ' @ ' + formatDate(at) : ''}`;
    dots.push(html`<span class="stage-dot ${status}" title=${tip} key=${i}></span>`);
  }
  return html`<span class="stage-bar">${dots}</span>`;
}

function formatDate(s) {
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

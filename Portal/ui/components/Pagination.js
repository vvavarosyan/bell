import { html } from '../lib/html.js';

export function Pagination({ total, limit, offset, onChange }) {
  const page  = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));
  const go = (p) => onChange(Math.max(0, (Math.min(Math.max(p,1), pages) - 1) * limit));
  return html`
    <span class="count">${total.toLocaleString()} rows · page ${page} / ${pages}</span>
    <button onClick=${() => go(1)}      disabled=${page <= 1}>« First</button>
    <button onClick=${() => go(page-1)} disabled=${page <= 1}>‹ Prev</button>
    <button onClick=${() => go(page+1)} disabled=${page >= pages}>Next ›</button>
    <button onClick=${() => go(pages)}  disabled=${page >= pages}>Last »</button>
  `;
}

// Advanced filter panel for the Companies list — an in-flow slide-down panel
// (lives inside the data area, between the sidebar and the drawer) with faceted
// filters: a searchable industry multi-select, plus status / source / size /
// completeness / location / founded year / Bell score. The parent owns the
// committed `value`; this edits a draft and commits on Apply.

import { useState } from 'react';
import { html } from '../lib/html.js';

const STATUS_OPTS = ['active', 'inactive', 'suspended', 'withdrawn', 'in_liquidation', 'frozen', 'deregistered', 'not_licensed', 'unknown'];
const SOURCE_OPTS = ['QFC', 'QFZ', 'MOCI', 'QSTP', 'QSE', 'QCCI', 'MoPH', 'Tasmu'];
const EMP_OPTS    = ['1-10', '11-50', '51-200', '201-1000', '1001-5000', '5000+'];
const COMPLETE    = [['hasEmail', 'Email'], ['hasPhone', 'Phone'], ['hasLinkedin', 'LinkedIn'], ['hasPeople', 'People']];
const WEBSITE_OPTS = [['has', 'Has website'], ['none', 'No website']];

export const EMPTY_FILTERS = {
  industries: [], statuses: [], sources: [], empBuckets: [],
  city: '', foundedMin: '', foundedMax: '', scoreMin: '', website: '',
  hasEmail: false, hasPhone: false, hasLinkedin: false, hasPeople: false,
};

export function countActiveFilters(f) {
  if (!f) return 0;
  return f.industries.length + f.statuses.length + f.sources.length + f.empBuckets.length
    + (String(f.city).trim() ? 1 : 0) + (f.foundedMin ? 1 : 0) + (f.foundedMax ? 1 : 0) + (f.scoreMin ? 1 : 0)
    + (f.website ? 1 : 0)
    + COMPLETE.reduce((n, [k]) => n + (f[k] ? 1 : 0), 0);
}

const chip = (active, label, onClick) => html`
  <button type="button" class=${'filter-chip' + (active ? ' on' : '')} onClick=${onClick}>${label}</button>`;

// Searchable multi-select used for the (long) industry list.
function IndustryPicker({ options, selected, onToggle }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ql = q.trim().toLowerCase();
  const filtered = ql ? options.filter((o) => o.industry.toLowerCase().includes(ql)) : options;
  return html`
    <div class="bdi-ms">
      <button type="button" class="bdi-ms-trigger" onClick=${() => setOpen((o) => !o)}>
        <span>${selected.length ? `${selected.length} selected` : 'Select industries…'}</span>
        <span class="bdi-ms-caret">${open ? '▴' : '▾'}</span>
      </button>
      ${open ? html`
        <div class="bdi-ms-panel">
          <input class="bdi-ms-search" type="text" placeholder="Search industries…" value=${q} onChange=${(e) => setQ(e.target.value)} />
          <div class="bdi-ms-list">
            ${filtered.length === 0 ? html`<div class="muted small" style=${{ padding: '8px' }}>No match.</div>` : null}
            ${filtered.map((o) => {
              const on = selected.includes(o.industry);
              return html`<label class=${'bdi-ms-opt' + (on ? ' on' : '')} key=${o.industry}>
                <input type="checkbox" checked=${on} onChange=${() => onToggle(o.industry)} />
                <span>${o.industry}</span>${o.n ? html`<span class="bdi-ms-n">${o.n}</span>` : null}
              </label>`;
            })}
          </div>
        </div>` : null}
      ${selected.length ? html`<div class="bdi-ms-chips">
        ${selected.map((s) => html`<span class="bdi-ms-chip" key=${s}>${s}<button type="button" onClick=${() => onToggle(s)}>×</button></span>`)}
      </div>` : null}
    </div>`;
}

export function CompanyFilters({ value, industries = [], onApply, onClose }) {
  const [d, setD] = useState(() => ({ ...EMPTY_FILTERS, ...(value || {}) }));
  const toggle = (key, v) => setD((s) => ({ ...s, [key]: s[key].includes(v) ? s[key].filter((x) => x !== v) : [...s[key], v] }));
  const set = (key, v) => setD((s) => ({ ...s, [key]: v }));
  const num = (key, ph) => html`<input class="bdi-filter-input" type="number" placeholder=${ph} value=${d[key]} onChange=${(e) => set(key, e.target.value)} style=${{ width: '82px' }} />`;
  const sec = (label, body, full = false) => html`<div class="bdi-filter-sec" style=${full ? { gridColumn: '1 / -1' } : null}>
    <div class="bdi-filter-label">${label}</div>${body}</div>`;

  return html`
    <div class="bdi-filter-drop">
      <div class="bdi-filter-head">
        <strong>Filters</strong>
        <span class="spacer"></span>
        <button class="bdi-filter-clear" onClick=${() => setD({ ...EMPTY_FILTERS })}>Clear all</button>
        <button class="bdi-filter-x" onClick=${onClose} title="Close">✕</button>
      </div>
      <div class="bdi-filter-body">
        <div class="bdi-filter-grid">
          ${sec('Industry', html`<${IndustryPicker} options=${industries} selected=${d.industries} onToggle=${(v) => toggle('industries', v)} />`, true)}
          ${sec('Status', html`<div class="bdi-chiprow">${STATUS_OPTS.map((s) => chip(d.statuses.includes(s), s, () => toggle('statuses', s)))}</div>`)}
          ${sec('Source', html`<div class="bdi-chiprow">${SOURCE_OPTS.map((s) => chip(d.sources.includes(s), s, () => toggle('sources', s)))}</div>`)}
          ${sec('Employee size', html`<div class="bdi-chiprow">${EMP_OPTS.map((s) => chip(d.empBuckets.includes(s), s, () => toggle('empBuckets', s)))}</div>`)}
          ${sec('Website', html`<div class="bdi-chiprow">${WEBSITE_OPTS.map(([k, label]) => chip(d.website === k, label, () => set('website', d.website === k ? '' : k)))}</div>`)}
          ${sec('Has data', html`<div class="bdi-chiprow">${COMPLETE.map(([k, label]) => chip(d[k], label, () => set(k, !d[k])))}</div>`)}
          ${sec('Location', html`<input class="bdi-filter-input" type="text" placeholder="City…" value=${d.city} onChange=${(e) => set('city', e.target.value)} style=${{ width: '160px' }} />`)}
          ${sec('Founded year', html`<div style=${{ display: 'flex', alignItems: 'center', gap: '6px' }}>${num('foundedMin', 'from')}<span class="muted">–</span>${num('foundedMax', 'to')}</div>`)}
          ${sec('Min Bell score', html`${num('scoreMin', '0–100')}`)}
        </div>
      </div>
      <div class="bdi-filter-foot">
        <button class="bdi-filter-cancel" onClick=${onClose}>Cancel</button>
        <button class="bdi-filter-apply" onClick=${() => { onApply(d); onClose(); }}>Apply filters</button>
      </div>
    </div>`;
}

// Advanced filter panel for the Companies list. A popover of structured filters
// (industry tags, status, source, employee size, completeness, location, founded
// year, Bell score) — the kind of faceted filtering serious B2B directories use.
// The parent owns the committed `value`; this edits a draft and commits on Apply.

import { useState } from 'react';
import { html } from '../lib/html.js';

const STATUS_OPTS = ['active', 'inactive', 'suspended', 'withdrawn', 'in_liquidation', 'frozen', 'deregistered', 'not_licensed', 'unknown'];
const SOURCE_OPTS = ['QFC', 'QFZ', 'MOCI', 'QSTP', 'QSE', 'QCCI', 'MoPH', 'Tasmu'];
const EMP_OPTS    = ['1-10', '11-50', '51-200', '201-1000', '1001-5000', '5000+'];
const COMPLETE    = [['hasWebsite', 'Website'], ['hasEmail', 'Email'], ['hasPhone', 'Phone'], ['hasLinkedin', 'LinkedIn'], ['hasPeople', 'People']];

export const EMPTY_FILTERS = {
  industries: [], statuses: [], sources: [], empBuckets: [],
  city: '', foundedMin: '', foundedMax: '', scoreMin: '',
  hasWebsite: false, hasEmail: false, hasPhone: false, hasLinkedin: false, hasPeople: false,
};

export function countActiveFilters(f) {
  if (!f) return 0;
  return f.industries.length + f.statuses.length + f.sources.length + f.empBuckets.length
    + (String(f.city).trim() ? 1 : 0) + (f.foundedMin ? 1 : 0) + (f.foundedMax ? 1 : 0) + (f.scoreMin ? 1 : 0)
    + COMPLETE.reduce((n, [k]) => n + (f[k] ? 1 : 0), 0);
}

const chip = (active, label, onClick) => html`
  <button onClick=${onClick} class="filter-chip" style=${{
    padding: '4px 10px', borderRadius: '999px', fontSize: '11.5px', cursor: 'pointer',
    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? '#fff' : 'var(--text-muted)',
  }}>${label}</button>`;

export function CompanyFilters({ value, industries = [], onApply, onClose }) {
  const [d, setD] = useState(() => ({ ...EMPTY_FILTERS, ...(value || {}) }));
  const toggle = (key, v) => setD((s) => ({ ...s, [key]: s[key].includes(v) ? s[key].filter((x) => x !== v) : [...s[key], v] }));
  const set = (key, v) => setD((s) => ({ ...s, [key]: v }));

  const section = (title, body) => html`
    <div style=${{ marginBottom: '14px' }}>
      <div style=${{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, color: 'var(--text-dim)', marginBottom: '7px' }}>${title}</div>
      ${body}
    </div>`;

  const num = (key, ph) => html`<input type="number" placeholder=${ph} value=${d[key]} onChange=${(e) => set(key, e.target.value)}
    style=${{ width: '84px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', borderRadius: '6px', fontSize: '12px' }} />`;

  return html`
    <div onClick=${onClose} style=${{ position: 'fixed', inset: 0, zIndex: 80 }}>
      <div onClick=${(e) => e.stopPropagation()} style=${{
        position: 'absolute', top: '54px', left: '12px', width: 'min(560px, 94vw)', maxHeight: '78vh', overflowY: 'auto',
        background: 'linear-gradient(180deg, #141a2b, #0f1422)', border: '1px solid var(--border)', borderRadius: '12px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.55)', padding: '16px 18px',
      }}>
        <div style=${{ display: 'flex', alignItems: 'center', marginBottom: '14px' }}>
          <strong style=${{ fontSize: '14px' }}>Filters</strong>
          <span style=${{ flex: 1 }}></span>
          <button class="linkbtn" onClick=${() => setD({ ...EMPTY_FILTERS })}
            style=${{ fontSize: '11.5px', color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer', marginRight: '6px' }}>Clear all</button>
          <button onClick=${onClose} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', width: '26px', height: '26px', borderRadius: '6px', cursor: 'pointer' }}>✕</button>
        </div>

        ${section('Industry', html`<div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '132px', overflowY: 'auto' }}>
          ${industries.length === 0 ? html`<span class="muted small">No industries yet.</span>` : null}
          ${industries.map((i) => chip(d.industries.includes(i.industry), `${i.industry}${i.n ? ` (${i.n})` : ''}`, () => toggle('industries', i.industry)))}
        </div>`)}

        ${section('Status', html`<div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          ${STATUS_OPTS.map((s) => chip(d.statuses.includes(s), s, () => toggle('statuses', s)))}
        </div>`)}

        ${section('Source', html`<div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          ${SOURCE_OPTS.map((s) => chip(d.sources.includes(s), s, () => toggle('sources', s)))}
        </div>`)}

        ${section('Employee size', html`<div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          ${EMP_OPTS.map((s) => chip(d.empBuckets.includes(s), s, () => toggle('empBuckets', s)))}
        </div>`)}

        ${section('Has data', html`<div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          ${COMPLETE.map(([k, label]) => chip(d[k], label, () => set(k, !d[k])))}
        </div>`)}

        <div style=${{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          ${section('Location', html`<input type="text" placeholder="City…" value=${d.city} onChange=${(e) => set('city', e.target.value)}
            style=${{ width: '150px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 9px', borderRadius: '6px', fontSize: '12px' }} />`)}
          ${section('Founded year', html`<div style=${{ display: 'flex', alignItems: 'center', gap: '6px' }}>${num('foundedMin', 'from')}<span class="muted">–</span>${num('foundedMax', 'to')}</div>`)}
          ${section('Min Bell score', html`${num('scoreMin', '0–100')}`)}
        </div>

        <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px', position: 'sticky', bottom: '-16px', paddingTop: '10px', background: 'linear-gradient(180deg, transparent, #0f1422 40%)' }}>
          <button onClick=${onClose} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
          <button onClick=${() => { onApply(d); onClose(); }} style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 18px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Apply filters</button>
        </div>
      </div>
    </div>`;
}

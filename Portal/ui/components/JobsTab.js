// Jobs — list + advanced filters + a full side drawer per job (A2, Val
// 2026-07-02): company shows its NAME only (no BIN), status reflects the
// EFFECTIVE activity computed server-side (expired postings show as expired
// even before the engine re-scan flips them), and every job opens a
// CompanyDetail-style drawer with the complete posting.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';
import { EditableCell } from './EditableCell.js';
import { Pagination } from './Pagination.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const fmtSalary = (j) => {
  if (j.salary_min == null && j.salary_max == null) return null;
  const n = (v) => Number(v).toLocaleString();
  const range = j.salary_min != null && j.salary_max != null ? `${n(j.salary_min)}–${n(j.salary_max)}`
    : j.salary_min != null ? `from ${n(j.salary_min)}` : `up to ${n(j.salary_max)}`;
  return `${range} ${j.salary_currency || ''}${j.salary_period ? ' / ' + String(j.salary_period).replace('ly', '') : ''}`.trim();
};
const nice = (s) => (s ? String(s).replace(/_/g, ' ') : '—');

export function JobsTab({ mode = 'local-admin' } = {}) {
  const isUser = mode === 'user';
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [type, setType] = useState('');
  const [workplace, setWorkplace] = useState('');
  const [seniority, setSeniority] = useState('');
  const [postedWithin, setPostedWithin] = useState('');
  const [options, setOptions] = useState({ types: [], workplaces: [], seniorities: [] });
  const [loading, setLoading] = useState(false);
  const [openedId, setOpenedId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);   // Filters panel (Val 2026-07-12, like Companies)

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (q.trim())      params.q = q.trim();
      if (activeFilter)  params.is_active = activeFilter;
      if (type)          params.type = type;
      if (workplace)     params.workplace = workplace;
      if (seniority)     params.seniority = seniority;
      if (postedWithin)  params.posted_within_days = postedWithin;
      const r = await api.jobs(params);
      setRows(r.rows); setTotal(r.total);
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [limit, offset, q, activeFilter, type, workplace, seniority, postedWithin]);

  useEffect(() => { load(); }, [load]);

  // Filter dropdown options — loaded once (distinct values from the data).
  useEffect(() => {
    let dead = false;
    api.jobFilters().then((o) => { if (!dead) setOptions(o); }).catch(() => { /* keep empty options */ });
    return () => { dead = true; };
  }, []);

  // Auto-open the first row so the drawer is never empty.
  useEffect(() => {
    if (!openedId && rows.length > 0) setOpenedId(rows[0].id);
  }, [rows, openedId]);

  const update = async (id, field, value) => {
    try {
      const { job } = await api.updateJob(id, { [field]: value });
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...job } : r));
      toast('Saved');
    } catch (err) { toast('Save failed: ' + err.message, 'error'); }
  };

  const sel = (value, onChange, opts, allLabel) => html`
    <select value=${value} onChange=${e => { onChange(e.target.value); setOffset(0); }}>
      <option value="">${allLabel}</option>
      ${opts.map((o) => html`<option key=${o.v ?? o} value=${o.v ?? o}>${o.label ?? nice(o)}</option>`)}
    </select>`;

  const jobsFilterCount = (type ? 1 : 0) + (workplace ? 1 : 0) + (seniority ? 1 : 0) + (postedWithin ? 1 : 0) + (activeFilter ? 1 : 0);
  const secF = (label, body) => html`<div class="bdi-filter-sec"><div class="bdi-filter-label">${label}</div>${body}</div>`;

  return html`
    <div class="grid-toolbar">
      <input type="text" placeholder="Search title, company, location, description…"
        value=${q} onChange=${e => { setQ(e.target.value); setOffset(0); }}
        style=${{ minWidth: '170px', flex: '0 1 230px' }} />
      <button
        class=${'toolbar-toggle' + (jobsFilterCount > 0 || showFilters ? ' accent' : '')}
        onClick=${() => setShowFilters(v => !v)}
        title="Filters — type, workplace, seniority, date posted, status"
        style=${{ whiteSpace: 'nowrap' }}
      >☰ Filters${jobsFilterCount > 0 ? ` · ${jobsFilterCount}` : ''}</button>
      ${loading ? html`<span class="count">loading…</span>` : html`<${Pagination} total=${total} limit=${limit} offset=${offset} onChange=${setOffset} />`}
      <span class="spacer"></span>
      <button onClick=${load}>Refresh</button>
    </div>

    <div class="grid-pane">
      ${showFilters ? html`<div class="bdi-filter-anchor">
        <div class="bdi-filter-drop">
          <div class="bdi-filter-head"><strong>Filters</strong><span class="spacer"></span>
            <button class="bdi-filter-clear" onClick=${() => { setType(''); setWorkplace(''); setSeniority(''); setPostedWithin(''); setActiveFilter(''); setOffset(0); }}>Clear all</button>
            <button class="bdi-filter-x" onClick=${() => setShowFilters(false)} title="Close">✕</button>
          </div>
          <div class="bdi-filter-body"><div class="bdi-filter-grid">
            ${secF('Type', sel(type, setType, options.types, 'All types'))}
            ${secF('Workplace', sel(workplace, setWorkplace, options.workplaces, 'Any workplace'))}
            ${secF('Seniority', sel(seniority, setSeniority, options.seniorities, 'Any seniority'))}
            ${secF('Date posted', sel(postedWithin, setPostedWithin, [
              { v: '7', label: 'Last 7 days' }, { v: '30', label: 'Last 30 days' }, { v: '90', label: 'Last 90 days' },
            ], 'Any date'))}
            ${secF('Status', sel(activeFilter, setActiveFilter, [
              { v: 'true', label: 'Active only' }, { v: 'false', label: 'Expired only' },
            ], 'All jobs'))}
          </div></div>
        </div>
      </div>` : null}
      <div class="grid-wrap">
        <table class="grid">
          <thead>
            <tr>
              <th>Title</th>
              <th>Company</th>
              <th>Location</th>
              <th>Type</th>
              <th>Posted</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 && !loading ? html`<tr><td colSpan="6" class="empty">No jobs match. Jobs appear after Stage 4 enrichment (job postings).</td></tr>` : null}
            ${rows.map(r => html`
              <tr key=${r.id}
                class=${openedId === r.id ? 'opened' : ''}
                onClick=${(e) => {
                  const tag = (e.target?.tagName || '').toLowerCase();
                  if (tag === 'input' || tag === 'button' || tag === 'a') return;
                  setOpenedId(r.id);
                }}>
                <${EditableCell} value=${r.title} readOnly=${isUser} onSave=${(v) => update(r.id, 'title', v)}
                  formatter=${(t) => html`
                    <div class="name-cell">
                      <div class="name-cell-main">${t || '—'}</div>
                      ${r.seniority_level ? html`<div class="muted small">${nice(r.seniority_level)}</div>` : null}
                    </div>`} />
                <td>
                  ${r.company_id ? html`
                    <a onClick=${(e) => { e.preventDefault(); e.stopPropagation(); navigateTo('companies', r.company_id); }}
                       href="#" title="Open the company profile"
                       style=${{ color: 'var(--accent-bright, #a5c3ff)', textDecoration: 'none', cursor: 'pointer' }}>${r.company_name || '—'}</a>`
                    : (r.company_name || '—')}
                </td>
                <${EditableCell} value=${r.location_text} readOnly=${isUser} onSave=${(v) => update(r.id, 'location_text', v)} />
                <td>${nice(r.employment_type)}${r.workplace_type ? html`<span class="muted small"> · ${nice(r.workplace_type)}</span>` : null}</td>
                <td>${fmtDate(r.posted_at)}</td>
                <td><span class=${'pill ' + (r.effective_active ? 'active' : 'inactive')}>${r.effective_active ? 'active' : 'expired'}</span></td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>

      <${JobDetail} jobId=${openedId} isUser=${isUser} />
    </div>
  `;
}

// ── Job drawer ──────────────────────────────────────────────────────────────
// Side panel with the COMPLETE posting: role facts, compensation, lifecycle,
// full description, and the link to the original posting.
function JobDetail({ jobId, isUser = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!jobId) { setData(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api.job(jobId);
        if (!cancelled) setData(r.job);
      } catch (err) {
        if (!cancelled) toast('Load failed: ' + err.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [jobId]);

  if (!jobId) {
    return html`<aside class="detail-side empty-state"><div class="muted small">Select a job on the left to see the full posting.</div></aside>`;
  }
  if (loading || !data) {
    return html`<aside class="detail-side"><div class="empty">Loading posting…</div></aside>`;
  }

  const j = data;
  const salary = fmtSalary(j);
  const fact = (label, value) => (value == null || value === '' || value === '—')
    ? null
    : html`<div style=${{ display: 'flex', gap: '10px', padding: '5px 0', fontSize: '12.5px', borderBottom: '1px solid var(--border)' }}>
        <span style=${{ color: 'var(--text-muted)', minWidth: '110px', flexShrink: 0 }}>${label}</span>
        <span style=${{ minWidth: 0 }}>${value}</span>
      </div>`;

  return html`
    <aside class="detail-side">
      <div style=${{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style=${{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <div style=${{ minWidth: 0, flex: 1 }}>
            <div style=${{ fontSize: '15px', fontWeight: 700, lineHeight: 1.35 }}>${j.title || '—'}</div>
            ${j.company_id ? html`
              <a onClick=${(e) => { e.preventDefault(); navigateTo('companies', j.company_id); }} href="#"
                 style=${{ fontSize: '12.5px', color: 'var(--accent-bright, #a5c3ff)', textDecoration: 'none', cursor: 'pointer' }}>
                ${j.company_name || 'View company'}${j.company_city ? html`<span class="muted"> · ${j.company_city}</span>` : null}
              </a>` : html`<span class="muted small">${j.company_name || ''}</span>`}
          </div>
          <span class=${'pill ' + (j.effective_active ? 'active' : 'inactive')}>${j.effective_active ? 'active' : 'expired'}</span>
        </div>
      </div>

      <div style=${{ padding: '12px 18px', overflowY: 'auto', flex: 1 }}>
        ${fact('Location', j.location_text)}
        ${fact('Workplace', j.workplace_type ? nice(j.workplace_type) : null)}
        ${fact('Type', j.employment_type ? nice(j.employment_type) : null)}
        ${fact('Seniority', j.seniority_level ? nice(j.seniority_level) : null)}
        ${fact('Salary', salary)}
        ${fact('Posted', fmtDate(j.posted_at))}
        ${fact('Expires', j.expires_at ? fmtDate(j.expires_at) : null)}
        ${fact('Applicants', j.applicant_count != null ? Number(j.applicant_count).toLocaleString() : null)}
        ${Array.isArray(j.job_function) && j.job_function.length ? fact('Function', j.job_function.join(', ')) : null}
        ${Array.isArray(j.industries) && j.industries.length ? fact('Industries', j.industries.join(', ')) : null}
        ${j.jin ? fact('Bell ref', j.jin) : null}

        ${j.description ? html`
          <div style=${{ marginTop: '16px' }}>
            <div style=${{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '8px' }}>Description</div>
            <div style=${{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>${j.description}</div>
          </div>` : html`<div class="muted small" style=${{ marginTop: '16px' }}>No description captured for this posting.</div>`}

        ${j.linkedin_job_url ? html`
          <div style=${{ marginTop: '18px', paddingBottom: '8px' }}>
            <a href=${j.linkedin_job_url} target="_blank" rel="noopener noreferrer"
               style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', color: 'var(--accent-bright, #a5c3ff)', textDecoration: 'none' }}>
              View original posting ↗
            </a>
          </div>` : null}
      </div>
    </aside>
  `;
}

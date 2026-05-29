import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { EditableCell } from './EditableCell.js';
import { Pagination } from './Pagination.js';

export function JobsTab({ mode = 'local-admin' } = {}) {
  const isUser = mode === 'user';
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [activeFilter, setActiveFilter] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (q.trim())     params.q = q.trim();
      if (activeFilter) params.is_active = activeFilter;
      const r = await api.jobs(params);
      setRows(r.rows); setTotal(r.total);
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [limit, offset, q, activeFilter]);

  useEffect(() => { load(); }, [load]);

  const update = async (id, field, value) => {
    try {
      const { job } = await api.updateJob(id, { [field]: value });
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...job } : r));
      toast('Saved');
    } catch (err) { toast('Save failed: ' + err.message, 'error'); }
  };

  return html`
    <div class="grid-toolbar">
      <input type="text" placeholder="Search title, location..."
        value=${q} onChange=${e => { setQ(e.target.value); setOffset(0); }} />
      <select value=${activeFilter} onChange=${e => { setActiveFilter(e.target.value); setOffset(0); }}>
        <option value="">All jobs</option>
        <option value="true">Active only</option>
        <option value="false">Expired only</option>
      </select>
      ${loading ? html`<span class="count">loading…</span>` : html`<${Pagination} total=${total} limit=${limit} offset=${offset} onChange=${setOffset} />`}
      <span class="spacer"></span>
      <button onClick=${load}>Refresh</button>
    </div>

    <div class="grid-wrap">
      <table class="grid">
        <thead>
          <tr>
            <th>Title</th>
            <th>Company</th>
            <th>Location</th>
            <th>Type</th>
            <th>Posted</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 && !loading ? html`<tr><td colSpan="6" class="empty">No jobs yet. Jobs appear after Stage 4 enrichment (LinkedIn job postings).</td></tr>` : null}
          ${rows.map(r => html`
            <tr key=${r.id}>
              <${EditableCell} value=${r.title} readOnly=${isUser} onSave=${(v) => update(r.id, 'title', v)} />
              <td>${r.company_name || '—'}${r.company_bin ? html` <span class="bin">${r.company_bin}</span>` : null}</td>
              <${EditableCell} value=${r.location_text} readOnly=${isUser} onSave=${(v) => update(r.id, 'location_text', v)} />
              <td>${r.employment_type || '—'}</td>
              <td>${r.posted_at ? new Date(r.posted_at).toLocaleDateString() : '—'}</td>
              <td><span class=${'pill ' + (r.is_active ? 'active' : 'inactive')}>${r.is_active ? 'active' : 'expired'}</span></td>
            </tr>
          `)}
        </tbody>
      </table>
    </div>
  `;
}

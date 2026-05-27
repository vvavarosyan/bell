import { useState, useEffect, useCallback, useMemo } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { EditableCell } from './EditableCell.js';
import { Pagination } from './Pagination.js';
import { PersonDetail } from './PersonDetail.js';
import { JobLogPanel } from './JobLogPanel.js';
import { ContactIcons } from './ContactIcons.js';

export function PeopleTab() {
  const [archiveMode, setArchiveMode] = useState('active');
  const archivedMode = archiveMode === 'archived';
  const [rows, setRows]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [limit]                 = useState(100);
  const [offset, setOffset]     = useState(0);
  const [q, setQ]               = useState('');
  const [loading, setLoading]   = useState(false);
  const [openedId, setOpenedId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [activeJob, setActiveJob] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { limit, offset, archived: archivedMode ? 'true' : 'false' };
      if (q.trim()) params.q = q.trim();
      const r = await api.people(params);
      setRows(r.rows);
      setTotal(r.total);
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [limit, offset, q, archivedMode]);

  useEffect(() => { load(); }, [load]);

  // Auto-open first row when nothing's selected
  useEffect(() => {
    if (!openedId && rows.length > 0) setOpenedId(rows[0].id);
  }, [rows, openedId]);

  // Cross-tab navigation: if user clicks a person from elsewhere, the URL hash
  // becomes "#people:<id>". Pick that up and open the person.
  useEffect(() => {
    const checkHash = () => {
      const h = window.location.hash || '';
      const m = h.match(/^#?people:(\d+)/);
      if (m) {
        const id = Number(m[1]);
        setOpenedId(id);
        // Refresh in case the person was just added
        load({ silent: true });
        window.location.hash = 'people';
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [load]);

  const update = async (id, field, value) => {
    try {
      const { person } = await api.updatePerson(id, { [field]: value });
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...person } : r));
      toast('Saved');
    } catch (err) { toast('Save failed: ' + err.message, 'error'); }
  };

  // Clear selection when filters change
  useEffect(() => { setSelected(new Set()); }, [q, offset]);

  const visibleIds = useMemo(() => rows.map(r => r.id), [rows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));

  const toggleRow = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setOpenedId(id);
  };
  const togglePage = () => setSelected(prev => {
    const next = new Set(prev);
    if (allVisibleSelected) for (const id of visibleIds) next.delete(id);
    else for (const id of visibleIds) next.add(id);
    return next;
  });
  const clearSelection = () => setSelected(new Set());

  const runDeepEnrich = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const r = await api.deepEnrichPeople(ids);
      setActiveJob({ id: r.job_id, title: `Deep-enrich · ${ids.length}` });
      toast(`Deep-enrich started for ${ids.length} ${ids.length === 1 ? 'person' : 'people'}`);
    } catch (err) { toast(err.message, 'error'); }
  };

  // Refresh while a deep-enrich job runs so photos/emails appear live
  useEffect(() => {
    if (!activeJob) return;
    const t = setInterval(() => load({ silent: true }), 3000);
    return () => clearInterval(t);
  }, [activeJob, load]);

  const toggleArchiveView = () => {
    const next = archivedMode ? 'active' : 'archived';
    setArchiveMode(next); setOffset(0); setSelected(new Set()); setOpenedId(null);
  };

  return html`
    <div class="grid-toolbar">
      <input
        type="text" placeholder=${archivedMode ? "Search archived people..." : "Search name, LinkedIn URL, email..."}
        value=${q} onChange=${e => { setQ(e.target.value); setOffset(0); }}
      />
      ${loading ? html`<span class="count">loading…</span>` : html`<${Pagination} total=${total} limit=${limit} offset=${offset} onChange=${setOffset} />`}
      <span class="spacer"></span>
      <button onClick=${load}>Refresh</button>
      <button class="toolbar-toggle" onClick=${toggleArchiveView} title=${archivedMode ? 'Back to active people' : 'See archived people'}>
        ${archivedMode ? 'View Active' : 'View Archived'}
      </button>
    </div>

    ${selected.size > 0 ? html`
      <div class="bulk-bar">
        <strong>${selected.size}</strong>&nbsp;selected
        <span class="muted small"> · deep-enrich pulls photo, email, full experience per profile · $0.01 each</span>
        <span class="spacer"></span>
        <button class="accent" onClick=${runDeepEnrich}>Deep Enrich ▶</button>
        <button onClick=${clearSelection}>Clear</button>
      </div>
    ` : null}

    <div class="grid-pane">
      <div class="grid-wrap">
        <table class="grid">
          <colgroup>
            <col style=${{width:'30px'}} />
            <col style=${{width:'38px'}} />
            <col style=${{width:'220px'}} />
            <col />
            <col style=${{width:'140px'}} />
          </colgroup>
          <thead>
            <tr>
              <th class="pick">
                <input type="checkbox" checked=${allVisibleSelected} onChange=${togglePage} />
              </th>
              <th></th>
              <th>Name</th>
              <th>Headline</th>
              <th>Contacts</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 && !loading ? html`<tr><td colSpan="5" class="empty">No people yet. They appear after Stage 3 (LinkedIn employees) enrichment.</td></tr>` : null}
            ${rows.map(r => html`
              <tr
                key=${r.id}
                class=${(selected.has(r.id) ? 'selected ' : '') + (openedId === r.id ? 'opened' : '')}
                onClick=${(e) => {
                  const tag = (e.target?.tagName || '').toLowerCase();
                  if (tag === 'input' || tag === 'button' || tag === 'a' || tag === 'svg' || tag === 'path' || tag === 'circle' || tag === 'rect') return;
                  setOpenedId(r.id);
                }}
              >
                <td class="pick">
                  <input type="checkbox" checked=${selected.has(r.id)} onChange=${() => toggleRow(r.id)} />
                </td>
                <td><${PhotoCell} person=${r} /></td>
                <${EditableCell} value=${r.full_name} onSave=${(v) => update(r.id, 'full_name', v)} />
                <${EditableCell} value=${r.headline}  onSave=${(v) => update(r.id, 'headline', v)} />
                <td><${ContactIcons} company=${r} /></td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>

      <${PersonDetail}
        personId=${openedId}
        onMutated=${load}
      />
    </div>

    ${activeJob ? html`<${JobLogPanel}
      title=${activeJob.title}
      jobId=${activeJob.id}
      kind="enrichment"
      onClose=${() => setActiveJob(null)}
      onComplete=${() => load()}
    />` : null}
  `;
}

function PhotoCell({ person }) {
  const url = person?.profile_picture_url;
  if (url) {
    return html`<img src=${url} class="company-logo" style=${{width:'24px',height:'24px'}} alt="" loading="lazy" />`;
  }
  const initial = (person?.full_name || '?').trim().charAt(0).toUpperCase() || '?';
  let h = 0;
  for (const ch of String(person?.full_name || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(h) % 360;
  return html`<span class="company-logo placeholder"
    style=${{width:'24px', height:'24px', background:`hsl(${hue}, 45%, 35%)`, fontSize:'12px'}}
  >${initial}</span>`;
}

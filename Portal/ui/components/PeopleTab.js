import { useState, useEffect, useCallback, useMemo } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { currentRoute } from '../lib/router.js';
import { EditableCell } from './EditableCell.js';
import { Pagination } from './Pagination.js';
import { PersonDetail } from './PersonDetail.js';
import { JobLogPanel } from './JobLogPanel.js';
import { ContactIcons } from './ContactIcons.js';
import { SourceBadges } from './SourceBadge.js';
import { BellScore } from './BellScore.js';

export function PeopleTab({ mode = 'local-admin' } = {}) {
  const isUser = mode === 'user';   // customers reveal contacts instead of editing internals
  const [archiveMode, setArchiveMode] = useState('active');
  const archivedMode = archiveMode === 'archived';
  const [rows, setRows]         = useState([]);
  const [total, setTotal]       = useState(0);
  const [limit]                 = useState(100);
  const [offset, setOffset]     = useState(0);
  const [q, setQ]               = useState('');
  const [source, setSource]     = useState('');        // '' | 'MoPH' | 'LinkedIn' | 'manual'
  const [company, setCompany]   = useState('');        // employer name text filter
  const [employment, setEmployment] = useState('');   // '' | 'with' | 'without'
  const [loading, setLoading]   = useState(false);
  const [openedId, setOpenedId] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [activeJob, setActiveJob] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { limit, offset, archived: archivedMode ? 'true' : 'false' };
      if (q.trim()) params.q = q.trim();
      if (source) params.source = source;
      if (company.trim()) params.company = company.trim();
      if (employment) params.employment = employment;
      const r = await api.people(params);
      setRows(r.rows);
      setTotal(r.total);
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [limit, offset, q, source, company, archivedMode, employment]);

  useEffect(() => { load(); }, [load]);

  // Auto-open first row when nothing's selected
  useEffect(() => {
    if (!openedId && rows.length > 0) setOpenedId(rows[0].id);
  }, [rows, openedId]);

  // Cross-tab navigation: opening a person from elsewhere routes to
  // /people?id=<id>; pick that up and open the person.
  useEffect(() => {
    const checkRoute = () => {
      const { tab, id } = currentRoute();
      if (tab === 'people' && id) {
        setOpenedId(id);
        load({ silent: true });   // in case the person was just added
      }
    };
    checkRoute();
    window.addEventListener('bdi:navigate', checkRoute);
    window.addEventListener('popstate', checkRoute);
    return () => {
      window.removeEventListener('bdi:navigate', checkRoute);
      window.removeEventListener('popstate', checkRoute);
    };
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

  const revealRow = async (id) => {
    try {
      const res = await api.revealPerson(id);
      if (res.insufficient) { toast('Not enough credits to reveal', 'error'); return; }
      window.dispatchEvent(new Event('bdi:credits-changed'));
      setRows(prev => prev.map(r => r.id === id
        ? { ...r, revealed_by_tenant: true, email: res.person?.email ?? r.email, phone: res.person?.phone ?? r.phone }
        : r));
      toast('Contact revealed');
      load({ silent: true });
    } catch (err) {
      toast(/insufficient/i.test(err.message) ? 'Not enough credits to reveal' : 'Reveal failed: ' + err.message, 'error');
    }
  };

  const runBulkReveal = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const r = await api.revealPeopleBulk(ids);
      window.dispatchEvent(new Event('bdi:credits-changed'));
      if (r.unlimited) toast(`Revealed ${r.revealed} ${r.revealed === 1 ? 'person' : 'people'}`);
      else toast(`Revealed ${r.revealed} · ${r.already} already unlocked · ${r.insufficient} need more credits`,
                 r.insufficient > 0 ? 'error' : 'success');
      clearSelection();
      load({ silent: true });
    } catch (err) { toast('Reveal failed: ' + err.message, 'error'); }
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
        type="text" placeholder=${archivedMode ? "Search archived people..." : "Search name, email, specialty, license..."}
        value=${q} onChange=${e => { setQ(e.target.value); setOffset(0); }}
      />
      <input
        type="text" placeholder="Employer company…"
        value=${company} onChange=${e => { setCompany(e.target.value); setOffset(0); }}
      />
      <select
        title="Filter by source"
        value=${source}
        onChange=${e => { setSource(e.target.value); setOffset(0); }}
      >
        <option value="">All sources</option>
        <option value="MoPH">MoPH</option>
        <option value="LinkedIn">LinkedIn</option>
        <option value="manual">Manual</option>
      </select>
      <select
        title="Filter by employment links"
        value=${employment}
        onChange=${e => { setEmployment(e.target.value); setOffset(0); }}
      >
        <option value="">All people</option>
        <option value="with">Has employment link</option>
        <option value="without">No employment link</option>
      </select>
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
        <button class="accent" onClick=${runBulkReveal} title="Reveal contact details · 1 credit each (already-revealed are free)">Reveal contacts ▶</button>
        <button class="accent" onClick=${runDeepEnrich}>Deep Enrich ▶</button>
        <button onClick=${clearSelection}>Clear</button>
      </div>
    ` : null}

    <div class="grid-pane">
      <div class="grid-wrap">
        <table class="grid">
          <colgroup>
            <col style=${{width:'30px'}} />
            <col style=${{width:'34px'}} />
            <col style=${{width:'200px'}} />
            <col style=${{width:'230px'}} />
            <col style=${{width:'122px'}} />
            <col style=${{width:'58px'}} />
            <col style=${{width:'96px'}} />
            <col style=${{width:'auto'}} />
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
              <th>Score</th>
              <th>${isUser ? 'Reveal' : ''}</th>
              <th class="flex"></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 && !loading ? html`<tr><td colSpan="8" class="empty">No people yet. They appear after Stage 3 (LinkedIn employees) enrichment.</td></tr>` : null}
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
                <${EditableCell}
                  value=${r.full_name}
                  readOnly=${isUser}
                  onSave=${(v) => update(r.id, 'full_name', v)}
                  formatter=${(name) => html`
                    <div class="name-cell">
                      <div class="name-cell-main">${name || html`<span style=${{color:'var(--text-dim)'}}>—</span>`}</div>
                      ${r.current_company ? html`<div class="muted small" style=${{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'100%'}}>${r.current_company}</div>` : null}
                    </div>
                  `}
                />
                <${EditableCell} value=${r.headline}  readOnly=${isUser} onSave=${(v) => update(r.id, 'headline', v)} />
                <td><${ContactIcons} company=${r} showWebsite=${false} /></td>
                <td class="bellscore"><${BellScore} score=${r.bell_score} bar=${false} /></td>
                <td class="stages-cell">${isUser
                  ? (r.revealed_by_tenant
                      ? html`<span class="revealed-badge">✓ revealed</span>`
                      : html`<button class="reveal-btn" onClick=${(e) => { e.stopPropagation(); revealRow(r.id); }}>Reveal · 1</button>`)
                  : null}</td>
                <td class="flex"></td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>

      <${PersonDetail}
        personId=${openedId}
        onMutated=${load}
        isUser=${isUser}
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

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function PhotoCell({ person }) {
  // The photo URL is ADMIN-ONLY (the API strips it for customers, who get
  // initials). When present, show the photo layered over the initials base so
  // an expired LinkedIn URL falls back to initials.
  const url = person?.profile_picture_url;
  const init = initialsOf(person?.full_name);
  let h = 0;
  for (const ch of String(person?.full_name || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(h) % 360;
  const phStyle = { width:'24px', height:'24px', background:`hsl(${hue}, 45%, 35%)`, fontSize: init.length > 1 ? '9px' : '12px' };
  if (!url) return html`<span class="company-logo placeholder" style=${phStyle}>${init}</span>`;
  return html`<span style=${{position:'relative', display:'inline-block', width:'24px', height:'24px', verticalAlign:'middle'}}>
    <span class="company-logo placeholder" style=${{...phStyle, position:'absolute', inset:0}}>${init}</span>
    <img src=${url} class="company-logo" style=${{position:'absolute', inset:0, width:'24px', height:'24px'}} alt="" loading="lazy" referrerpolicy="no-referrer" onError=${(e) => { e.currentTarget.style.display = 'none'; }} />
  </span>`;
}

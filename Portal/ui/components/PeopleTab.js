import { useState, useEffect, useCallback, useMemo } from 'react';
import { PeopleLockedBanner } from './PeopleLockedBanner.js';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { currentRoute } from '../lib/router.js';
import { BELLA_ACTION_EVENT, takePending } from '../lib/bellaBus.js';
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
  const [emailStatus, setEmailStatus] = useState(''); // '' | verified | pattern | matched | has | none
  const [addedAfter, setAddedAfter]   = useState(''); // 'YYYY-MM-DD'
  const [addedBefore, setAddedBefore] = useState('');
  const [loading, setLoading]   = useState(false);
  const [openedId, setOpenedId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);   // Filters panel (Val 2026-07-12, like Companies)
  const [selected, setSelected] = useState(() => new Set());
  const [activeJob, setActiveJob] = useState(null);
  const [locked, setLocked]     = useState(false);   // PEOPLE PUBLIC LOCKDOWN (server-driven)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { limit, offset, archived: archivedMode ? 'true' : 'false' };
      if (q.trim()) params.q = q.trim();
      if (source) params.source = source;
      if (company.trim()) params.company = company.trim();
      if (employment) params.employment = employment;
      if (emailStatus) params.email_status = emailStatus;
      if (addedAfter) params.added_after = addedAfter;
      if (addedBefore) params.added_before = addedBefore;
      const r = await api.people(params);
      setLocked(!!r.locked);
      setRows(r.rows);
      setTotal(r.total);
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [limit, offset, q, source, company, archivedMode, employment, emailStatus, addedAfter, addedBefore]);

  useEffect(() => { load(); }, [load]);

  // On page change, jump the list back to the top (don't keep the prior scroll).
  useEffect(() => {
    const el = document.querySelector('.grid-wrap');
    if (el) el.scrollTop = 0;
  }, [offset]);

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

  // Bella filters this grid (show_people): stashed just before navigation here,
  // and fired live when we're already mounted.
  useEffect(() => {
    const apply = (a) => {
      if (!a || a.type !== 'show_people') return;
      setQ(a.q || '');
      setCompany(a.company || '');
      setOffset(0);
    };
    apply(takePending('show_people'));
    const onAction = (e) => { if (e.detail && e.detail.type === 'show_people') apply(e.detail); };
    window.addEventListener(BELLA_ACTION_EVENT, onAction);
    return () => window.removeEventListener(BELLA_ACTION_EVENT, onAction);
  }, []);

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

  // ── PEOPLE PUBLIC LOCKDOWN ── the server returned locked:true (customer
  // account): show the banner + honest total instead of the grid. NOTE: this
  // early return sits BELOW every hook in this component (page-blank rule).
  if (locked) {
    return html`
      <div style=${{ padding: '18px 24px' }}>
        <div style=${{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <h2 style=${{ margin: 0, fontSize: '17px' }}>People</h2>
          <span class="muted small">${Number(total).toLocaleString()} records</span>
        </div>
        <${PeopleLockedBanner} count=${total} />
      </div>
    `;
  }

  const peopleFilterCount = (company.trim() ? 1 : 0) + (source ? 1 : 0) + (employment ? 1 : 0)
    + (emailStatus ? 1 : 0) + (addedAfter ? 1 : 0) + (addedBefore ? 1 : 0);

  return html`
    <div class="grid-toolbar">
      <input
        type="text" placeholder=${archivedMode ? "Search archived people..." : "Search name, email, specialty…"}
        value=${q} onChange=${e => { setQ(e.target.value); setOffset(0); }}
        style=${{ minWidth: '160px', flex: '0 1 200px' }}
      />
      <button
        class=${'toolbar-toggle' + (peopleFilterCount > 0 || showFilters ? ' accent' : '')}
        onClick=${() => setShowFilters(v => !v)}
        title="Filters — employer, source, employment, email status, date added"
        style=${{ whiteSpace: 'nowrap' }}
      >☰ Filters${peopleFilterCount > 0 ? ` · ${peopleFilterCount}` : ''}</button>
      ${loading ? html`<span class="count">loading…</span>` : html`<${Pagination} total=${total} limit=${limit} offset=${offset} onChange=${setOffset} />`}
      <span class="spacer"></span>
      <button onClick=${load}>Refresh</button>
      <button class="toolbar-toggle" onClick=${toggleArchiveView} title=${archivedMode ? 'Back to active people' : 'See archived people'}>
        ${archivedMode ? 'View Active' : 'View Archived'}
      </button>
    </div>

    ${showFilters ? html`<div class="bdi-filter-inline">
      <div class="bdi-filter-drop">
        <div class="bdi-filter-head"><strong>Filters</strong><span class="spacer"></span>
          <button class="bdi-filter-clear" onClick=${() => { setCompany(''); setSource(''); setEmployment(''); setEmailStatus(''); setAddedAfter(''); setAddedBefore(''); setOffset(0); }}>Clear all</button>
          <button class="bdi-filter-x" onClick=${() => setShowFilters(false)} title="Close">✕</button>
        </div>
        <div class="bdi-filter-body"><div class="bdi-filter-grid">
          <div class="bdi-filter-sec"><div class="bdi-filter-label">Employer</div>
            <input class="bdi-filter-input" type="text" placeholder="Company…" value=${company} onChange=${e => { setCompany(e.target.value); setOffset(0); }} style=${{ width: '180px' }} /></div>
          <div class="bdi-filter-sec"><div class="bdi-filter-label">Source</div>
            <select class="bdi-filter-input" value=${source} onChange=${e => { setSource(e.target.value); setOffset(0); }}>
              <option value="">All sources</option><option value="MoPH">MoPH</option><option value="LinkedIn">LinkedIn</option><option value="MadeInQatar">Made in Qatar</option><option value="QFCRA">QFCRA</option><option value="manual">Manual</option>
            </select></div>
          <div class="bdi-filter-sec"><div class="bdi-filter-label">Employment</div>
            <select class="bdi-filter-input" value=${employment} onChange=${e => { setEmployment(e.target.value); setOffset(0); }}>
              <option value="">All people</option><option value="with">Has employment link</option><option value="without">No employment link</option>
            </select></div>
          ${!isUser ? html`
          <div class="bdi-filter-sec"><div class="bdi-filter-label">Email status</div>
            <select class="bdi-filter-input" value=${emailStatus} onChange=${e => { setEmailStatus(e.target.value); setOffset(0); }}>
              <option value="">Any</option><option value="verified">Verified</option><option value="pattern">Verified (pattern)</option><option value="matched">Matched from page</option><option value="has">Has any email</option><option value="none">No email</option>
            </select></div>
          <div class="bdi-filter-sec"><div class="bdi-filter-label">Added after</div>
            <input class="bdi-filter-input" type="date" value=${addedAfter} onChange=${e => { setAddedAfter(e.target.value); setOffset(0); }} /></div>
          <div class="bdi-filter-sec"><div class="bdi-filter-label">Added before</div>
            <input class="bdi-filter-input" type="date" value=${addedBefore} onChange=${e => { setAddedBefore(e.target.value); setOffset(0); }} /></div>` : null}
        </div></div>
      </div>
    </div>` : null}

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
            <col style=${{width:'220px'}} />
            <col style=${{width:'142px'}} />
            <col style=${{width:'62px'}} />
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
                <${EditableCell}
                  value=${r.headline}
                  readOnly=${isUser}
                  onSave=${(v) => update(r.id, 'headline', v)}
                  formatter=${(h) => h
                    ? h
                    : (r.current_title
                        ? html`<span class="muted" title="Current role (no headline set)">${r.current_title}</span>`
                        : html`<span style=${{color:'var(--text-dim)'}}>—</span>`)}
                />
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
        onDeleted=${() => { setOpenedId(null); load(); }}
        isUser=${isUser}
        isLocalEngine=${mode === 'local-admin'}
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

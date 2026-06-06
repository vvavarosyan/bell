import { useState, useEffect, useCallback, useMemo } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { currentRoute } from '../lib/router.js';
import { EditableCell } from './EditableCell.js';
import { StageBar } from './StageBadge.js';
import { Pagination } from './Pagination.js';
import { JobLogPanel } from './JobLogPanel.js';
import { CompanyDetail } from './CompanyDetail.js';
import { CompanyLogo } from './CompanyLogo.js';
import { SourceRecordsLine } from './SourceRecordsLine.js';
import { ContactIcons } from './ContactIcons.js';

const STATUS_OPTIONS = ['', 'active', 'inactive', 'suspended', 'withdrawn', 'in_liquidation', 'frozen', 'deregistered', 'not_licensed', 'unknown'];
const SOURCE_OPTIONS = ['', 'QFC', 'QFZ', 'MOCI', 'QSTP', 'QSE', 'QCCI'];

// Friendly names + descriptions for each enrichment stage. The tooltip text
// shows on hover (via the native `title` attribute) so admin can see what
// each numbered button actually does without guessing.
const STAGE_INFO = {
  1: {
    short: 'LinkedIn Discovery',
    desc:  'Stage 1 — Firecrawl searches the web for each company\'s LinkedIn page and validates it against the company name. Self-healing: rejects and replaces previously-saved URLs that don\'t match.',
  },
  2: {
    short: 'LinkedIn Company Profile',
    desc:  'Stage 2 — Apify scrapes the LinkedIn page found in Stage 1: description, follower count, logo, headquarters, specialties, similar companies. Requires a valid LinkedIn URL.',
  },
  3: {
    short: 'LinkedIn Employees',
    desc:  'Stage 3 — Apify pulls every public employee profile from the company\'s LinkedIn, populating the People table and the org-chart view. Requires a valid LinkedIn URL.',
  },
  4: {
    short: 'LinkedIn Jobs',
    desc:  'Stage 4 — Apify scrapes the company\'s LinkedIn Jobs board, populating the Jobs table with open postings. Requires a valid LinkedIn URL.',
  },
  5: {
    short: 'Google Maps',
    desc:  'Stage 5 — Apify Google Maps actor finds the company\'s business listing: address, website, phone, hours, rating, reviews, photos. Runs in parallel with Stage 1.',
  },
  6: {
    short: 'Website Contacts',
    desc:  'Stage 6 — Firecrawl scrapes the company website (if known from Stage 2 or 5) for email addresses, phone numbers, and contact pages.',
  },
};
const FULL_ENRICHMENT_TOOLTIP =
  'Run all 6 stages in dependency order: Stage 1 + Stage 5 in parallel first, then Stages 2/3/4 once a LinkedIn URL is found, then Stage 6 once a website is known. Companies without LinkedIn after Stage 1 skip 2/3/4 to save credits.';

/** archivedMode=false → Active tab, true → Archived tab (initial state only). */
export function CompaniesTab({ archivedMode: initialArchived = false, mode = 'local-admin' } = {}) {
  const isUser = mode === 'user';   // customers don't see pipeline stages
  const isLocalEngine = mode === 'local-admin';   // reconciliation/review is local-only
  // view: 'active' | 'archived' | 'review'
  const [archiveMode, setArchiveMode] = useState(initialArchived ? 'archived' : 'active');
  const archivedMode = archiveMode === 'archived';
  const reviewMode = archiveMode === 'review';
  const [reviewCount, setReviewCount] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [activeJob, setActiveJob] = useState(null);
  const [openedId, setOpenedId] = useState(null);   // company shown in the side panel

  // load() is intentionally NOT a dependency of openedId — clicking a row
  // should never refetch the table. The silent flag is used for background
  // refreshes during enrichment so the pagination doesn't flicker.
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { limit, offset };
      if (reviewMode) params.review = 'true';
      else            params.archived = archivedMode ? 'true' : 'false';
      if (q.trim())     params.q = q.trim();
      if (status)       params.status = status;
      if (sourceFilter) params.source = sourceFilter;
      const r = await api.companies(params);
      setRows(r.rows);
      setTotal(r.total);
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [limit, offset, q, status, sourceFilter, archivedMode, reviewMode]);

  // Keep a live count of the review queue for the tab badge (local engine only).
  const refreshReviewCount = useCallback(async () => {
    if (!isLocalEngine) return;
    try {
      const r = await api.companies({ review: 'true', limit: 1 });
      setReviewCount(r.total || 0);
    } catch { /* non-fatal */ }
  }, [isLocalEngine]);
  useEffect(() => { refreshReviewCount(); }, [refreshReviewCount, rows]);

  useEffect(() => { load(); }, [load]);

  // Auto-open the first row once after every load if nothing's selected.
  useEffect(() => {
    if (!openedId && rows.length > 0) setOpenedId(rows[0].id);
  }, [rows, openedId]);

  // Background refresh while an enrichment/scrape job is running. Silent so
  // the pagination + "loading…" indicator stay calm.
  useEffect(() => {
    if (!activeJob) return;
    const t = setInterval(() => load({ silent: true }), 2500);
    return () => clearInterval(t);
  }, [activeJob, load]);

  useEffect(() => { setSelected(new Set()); setOffset(0); setOpenedId(null); }, [archiveMode]);

  // Also clear selection whenever the user changes search/filters/page —
  // selection is per visible context, not a global running set.
  useEffect(() => { setSelected(new Set()); }, [q, status, sourceFilter, offset]);

  // Cross-tab navigation. Opening a company from elsewhere routes to
  // /companies?id=<id>; we pick that up here and open it in the drawer.
  useEffect(() => {
    const checkRoute = () => {
      const { tab, id } = currentRoute();
      if (tab === 'companies' && id) setOpenedId(id);
    };
    checkRoute();
    window.addEventListener('bdi:navigate', checkRoute);
    window.addEventListener('popstate', checkRoute);
    return () => {
      window.removeEventListener('bdi:navigate', checkRoute);
      window.removeEventListener('popstate', checkRoute);
    };
  }, []);

  const update = async (id, field, value) => {
    try {
      const { company } = await api.updateCompany(id, { [field]: value });
      setRows(prev => prev.map(r => r.id === id ? { ...r, ...company } : r));
      toast('Saved');
    } catch (err) { toast('Save failed: ' + err.message, 'error'); }
  };

  const visibleIds = useMemo(() => rows.map(r => r.id), [rows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));

  const toggleRow = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    // Also open this row in the drawer so the user immediately sees what they
    // just touched. The drawer always reflects the last-interacted row.
    setOpenedId(id);
  };
  const togglePage = () => setSelected(prev => {
    const next = new Set(prev);
    if (allVisibleSelected) for (const id of visibleIds) next.delete(id);
    else for (const id of visibleIds) next.add(id);
    return next;
  });
  const clearSelection = () => setSelected(new Set());

  const runBulkReveal = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const r = await api.revealCompaniesBulk(ids);
      window.dispatchEvent(new Event('bdi:credits-changed'));
      if (r.unlimited) toast(`Revealed ${r.revealed} ${r.revealed === 1 ? 'company' : 'companies'}`);
      else toast(`Revealed ${r.revealed} · ${r.already} already unlocked · ${r.insufficient} need more credits`,
                 r.insufficient > 0 ? 'error' : 'success');
      clearSelection();
      load({ silent: true });
    } catch (err) { toast('Reveal failed: ' + err.message, 'error'); }
  };

  const revealRow = async (id) => {
    try {
      const res = await api.revealCompany(id);
      if (res.insufficient) { toast('Not enough credits to reveal', 'error'); return; }
      window.dispatchEvent(new Event('bdi:credits-changed'));
      // Reflect immediately (no refresh): flip the row + drop in the revealed values.
      setRows(prev => prev.map(r => r.id === id
        ? { ...r, revealed_by_tenant: true, email: res.company?.email ?? r.email, phone: res.company?.phone ?? r.phone }
        : r));
      toast('Contact revealed');
      load({ silent: true });
    } catch (err) {
      toast(/insufficient/i.test(err.message) ? 'Not enough credits to reveal' : 'Reveal failed: ' + err.message, 'error');
    }
  };

  const runEnrich = async ({ mode, stage }) => {
    if (archivedMode) {
      toast('Archived companies cannot be enriched', 'error');
      return;
    }
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      const r = await api.runEnrichment({ mode, stage, company_ids: ids });
      const title = mode === 'full' ? `Full Enrichment · ${ids.length}` : `Stage ${stage} · ${ids.length}`;
      setActiveJob({ id: r.job_id, title });
      toast(`${title} started`);
    } catch (err) { toast(err.message, 'error'); }
  };

  const toggleArchiveView = () => {
    const next = archivedMode ? 'active' : 'archived';
    setArchiveMode(next); setOffset(0); setSelected(new Set()); setOpenedId(null);
  };

  return html`
    <div class="grid-toolbar">
      <input
        type="text"
        placeholder=${archivedMode ? "Search archived companies..." : "Search name, legal name, registration #..."}
        value=${q}
        onChange=${e => { setQ(e.target.value); setOffset(0); }}
      />
      <select value=${status} onChange=${e => { setStatus(e.target.value); setOffset(0); }}>
        ${STATUS_OPTIONS.map(s => html`<option key=${s} value=${s}>${s ? s : 'All statuses'}</option>`)}
      </select>
      <select value=${sourceFilter} onChange=${e => { setSourceFilter(e.target.value); setOffset(0); }}>
        ${SOURCE_OPTIONS.map(s => html`<option key=${s} value=${s}>${s ? s : 'All sources'}</option>`)}
      </select>
      ${loading ? html`<span class="count">loading…</span>` : html`<${Pagination} total=${total} limit=${limit} offset=${offset} onChange=${setOffset} />`}
      <span class="spacer"></span>
      <button onClick=${load}>Refresh</button>
      <div class="seg-toggle" style=${{ display: 'inline-flex', gap: '4px' }}>
        ${[
          { key: 'active',   label: 'Active' },
          { key: 'archived', label: 'Archived' },
          // Review queue is a local-engine reconciliation surface only.
          ...(isLocalEngine ? [{ key: 'review', label: reviewCount > 0 ? `Review (${reviewCount})` : 'Review' }] : []),
        ].map(t => html`
          <button
            key=${t.key}
            class=${'toolbar-toggle' + (archiveMode === t.key ? ' accent' : '')}
            onClick=${() => { setArchiveMode(t.key); setOffset(0); setSelected(new Set()); setOpenedId(null); }}
            title=${t.key === 'review' ? 'Companies that disappeared from a non-QFZ source — decide per company' : ''}
          >${t.label}</button>
        `)}
      </div>
    </div>

    ${selected.size > 0 ? html`
      <div class="bulk-bar">
        <strong>${selected.size}</strong>&nbsp;selected
        ${archivedMode
          ? html`<span class="muted small"> · archived companies cannot be enriched</span>`
          : html`<span class="muted small"> · click a button to enrich them all</span>`}
        <span class="spacer"></span>
        ${!archivedMode ? html`
          ${[1, 2, 3, 4, 5, 6].map(n => {
            const info = STAGE_INFO[n];
            return html`
              <button
                key=${n}
                onClick=${() => runEnrich({ mode: 'stage', stage: n })}
                title=${info?.desc || `Run stage ${n} on the selected companies.`}
              >
                Stage ${n}
              </button>
            `;
          })}
          <button
            class="accent"
            onClick=${() => runEnrich({ mode: 'full' })}
            title=${FULL_ENRICHMENT_TOOLTIP}
          >
            Full Enrichment ▶
          </button>
        ` : null}
        <button class="accent" onClick=${runBulkReveal} title="Reveal contact details · 1 credit each (already-revealed are free)">Reveal contacts ▶</button>
        <button onClick=${clearSelection}>Clear</button>
      </div>
    ` : null}

    <div class="grid-pane">
      <div class="grid-wrap">
        <table class="grid">
          <colgroup>
            <col class="pick" />
            <col class="logo" />
            <col class="name" />
            <col class="industry" />
            <col class="city" />
            <col class="employees" />
            <col class="contacts" />
            <col class="bellscore" />
            <col class="stages" />
          </colgroup>
          <thead>
            <tr>
              <th class="pick">
                <input
                  type="checkbox"
                  checked=${allVisibleSelected}
                  onChange=${togglePage}
                />
              </th>
              <th class="logo-col"></th>
              <th>Name</th>
              <th>Industry</th>
              <th>City</th>
              <th>Employees</th>
              <th>Contacts</th>
              <th>Bell Score</th>
              <th>${isUser ? 'Reveal' : 'Stages'}</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 && !loading ? html`<tr><td colSpan="9" class="empty">${reviewMode ? 'Nothing to review — no companies have disappeared from a directory.' : archivedMode ? 'No archived companies.' : 'No active companies yet.'}</td></tr>` : null}
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
                <td class="logo-col"><${CompanyLogo} company=${r} size=${22} /></td>
                <${EditableCell}
                  value=${r.name}
                  readOnly=${isUser}
                  onSave=${(v) => update(r.id, 'name', v)}
                  formatter=${(name) => html`
                    <div class="name-cell">
                      <div class="name-cell-main">${name || html`<span style=${{color:'var(--text-dim)'}}>—</span>`}</div>
                      <${SourceRecordsLine} records=${r.source_records} max=${1} />
                    </div>
                  `}
                />
                <${EditableCell} value=${r.industry} readOnly=${isUser} onSave=${(v) => update(r.id, 'industry', v)} />
                <${EditableCell} value=${r.city}     readOnly=${isUser} onSave=${(v) => update(r.id, 'city', v)} />
                <td class="employees">
                  ${r.employee_count != null
                    ? r.employee_count.toLocaleString()
                    : (r.employee_count_range || html`<span class="muted">—</span>`)}
                </td>
                <td><${ContactIcons} company=${r} /></td>
                <td class="bellscore"><span class="muted">—</span></td>
                <td>${isUser
                  ? (r.revealed_by_tenant
                      ? html`<span class="revealed-badge">✓ revealed</span>`
                      : html`<button class="reveal-btn" onClick=${(e) => { e.stopPropagation(); revealRow(r.id); }}>Reveal · 1</button>`)
                  : html`<${StageBar} row=${r} />`}</td>
              </tr>
            `)}
          </tbody>
        </table>
      </div>

      <${CompanyDetail}
        companyId=${openedId}
        onMutated=${load}
        onDeleted=${() => { setOpenedId(null); load(); }}
        canHardDelete=${mode === 'local-admin'}
        isLocalEngine=${mode === 'local-admin'}
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

export function ArchivedCompaniesTab({ mode = 'local-admin' } = {}) {
  return html`<${CompaniesTab} archivedMode=${true} mode=${mode} />`;
}

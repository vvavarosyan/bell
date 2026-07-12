import { useState, useEffect, useCallback, useMemo } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { currentRoute } from '../lib/router.js';
import { BELLA_ACTION_EVENT, takePending } from '../lib/bellaBus.js';
import { EditableCell } from './EditableCell.js';
import { StageBar } from './StageBadge.js';
import { Pagination } from './Pagination.js';
import { JobLogPanel } from './JobLogPanel.js';
import { CompanyDetail } from './CompanyDetail.js';
import { CompanyLogo } from './CompanyLogo.js';
import { SourceRecordsLine } from './SourceRecordsLine.js';
import { ContactIcons } from './ContactIcons.js';
import { BellScore } from './BellScore.js';
import { CompanyFilters, EMPTY_FILTERS, countActiveFilters } from './CompanyFilters.js';

const STATUS_OPTIONS = ['', 'active', 'inactive', 'suspended', 'withdrawn', 'in_liquidation', 'frozen', 'deregistered', 'not_licensed', 'unknown'];
const SOURCE_OPTIONS = ['', 'QFC', 'QFZ', 'MOCI', 'QSTP', 'QSE', 'QCCI', 'MoPH', 'Tasmu', 'CRA', 'MadeInQatar', 'QFCRA'];

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
  7: {
    short: 'Engine 2 · Harvest Site',
    desc:  'Local Engine 2 — Website Harvester (Bell\'s own engine, no Firecrawl/Apify, $0). Crawls the company website + its contact/about/team/partners pages for emails, phones, socials, address, logo, team people, and partner companies. Renders JavaScript sites. Idempotent — safe to re-run.',
  },
  8: {
    short: 'Engine 1 · Find Website',
    desc:  'Local Engine 1 — Website Finder (Bell\'s own engine, $0). Finds the official website for companies that have none: guesses domains from the company name, then falls back to a headless web search; only saves a site that verifies against the name. Run this before Engine 2.',
  },
  9: {
    short: 'Engine 3 · Map Network',
    desc:  'Local Engine 3 — Network Mapper (Bell\'s own engine, $0). Maps each company\'s business network: partners & clients (from its partner pages + outbound logo links), affiliates / parent / subsidiary (from about-page text), and competitors (same-industry Qatar companies + a web search). New companies are routed by country — confirmed-Qatar auto-enters Bell, non-Qatar goes to the International holding pen, uncertain goes to pending approval. Run after Engine 2.',
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
  const [sweepSize, setSweepSize] = useState(100);
  const [finderAudit, setFinderAudit] = useState(null);   // {totals,wrong,empty} | null
  const [auditing, setAuditing] = useState(false);
  const [limit] = useState(100);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [industries, setIndustries] = useState([]);
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
      if (q.trim())   params.q = q.trim();
      const f = filters;
      if (f.industries.length) params.industries = f.industries.join(',');
      if (f.statuses.length)   params.statuses   = f.statuses.join(',');
      if (f.sources.length)    params.sources    = f.sources.join(',');
      if (f.empBuckets.length) params.emp_buckets = f.empBuckets.join(',');
      if (String(f.city).trim()) params.city = f.city.trim();
      // Company age (years) → founded-year range: older = founded earlier.
      // "at least ageMin years old" ⇒ founded on/before thisYear−ageMin (founded_max);
      // "at most ageMax years old" ⇒ founded on/after thisYear−ageMax (founded_min).
      const thisYear = new Date().getFullYear();
      if (f.ageMin) params.founded_max = thisYear - Number(f.ageMin);
      if (f.ageMax) params.founded_min = thisYear - Number(f.ageMax);
      if (f.scoreMin)   params.score_min   = f.scoreMin;
      if (f.capitalMinQar) params.capital_min_qar = f.capitalMinQar;
      if (f.capitalMaxQar) params.capital_max_qar = f.capitalMaxQar;
      if (f.website === 'has')  params.has_website = '1';
      else if (f.website === 'none') params.has_website = '0';
      if (f.hasEmail)    params.has_email    = '1';
      if (f.hasPhone)    params.has_phone    = '1';
      if (f.hasLinkedin) params.has_linkedin = '1';
      if (f.hasPeople)   params.has_people   = '1';
      const r = await api.companies(params);
      setRows(r.rows);
      setTotal(r.total);
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [limit, offset, q, filters, archivedMode, reviewMode]);

  // Keep a live count of the review queue for the tab badge (local engine only).
  const refreshReviewCount = useCallback(async () => {
    if (!isLocalEngine) return;
    try {
      const r = await api.companies({ review: 'true', limit: 1 });
      setReviewCount(r.total || 0);
    } catch { /* non-fatal */ }
  }, [isLocalEngine]);
  useEffect(() => { refreshReviewCount(); }, [refreshReviewCount, rows]);

  // Live status of the always-on Continuous Enrichment Engine (local engine only).
  const [engineStatus, setEngineStatus] = useState(null);
  useEffect(() => {
    if (!isLocalEngine) return undefined;
    let dead = false;
    const tick = async () => { try { const s = await api.enrichmentEngineStatus(); if (!dead) setEngineStatus(s); } catch { /* non-fatal */ } };
    tick();
    const t = setInterval(tick, 20000);
    return () => { dead = true; clearInterval(t); };
  }, [isLocalEngine]);

  useEffect(() => { load(); }, [load]);

  // On page change, jump the list back to the top (don't keep the prior scroll).
  useEffect(() => {
    const el = document.querySelector('.grid-wrap');
    if (el) el.scrollTop = 0;
  }, [offset]);

  // Industry filter options (distinct industries, most-common first).
  useEffect(() => { api.companyIndustries().then(r => setIndustries(r.rows || [])).catch(() => {}); }, []);

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
  useEffect(() => { setSelected(new Set()); }, [q, filters, offset]);

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

  // Bella filters this grid. She stashes a show_companies action just before
  // navigating here (picked up on mount) and also fires it live when we're
  // already mounted.
  useEffect(() => {
    const apply = (a) => {
      if (!a || a.type !== 'show_companies') return;
      setArchiveMode('active');
      setQ(a.q || '');
      setFilters({ ...EMPTY_FILTERS, ...(a.filters || {}) });
      setOffset(0);
    };
    apply(takePending('show_companies'));
    const onAction = (e) => { if (e.detail && e.detail.type === 'show_companies') apply(e.detail); };
    window.addEventListener(BELLA_ACTION_EVENT, onAction);
    return () => window.removeEventListener(BELLA_ACTION_EVENT, onAction);
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
      const title = mode === 'full'  ? `Full Enrichment · ${ids.length}`
                  : mode === 'local' ? `Engines 1–3 · ${ids.length}`
                  : `Stage ${stage} · ${ids.length}`;
      setActiveJob({ id: r.job_id, title });
      toast(`${title} started`);
    } catch (err) { toast(err.message, 'error'); }
  };

  const runSweep = async () => {
    try {
      const r = await api.runHarvestSweep(sweepSize);
      setActiveJob({ id: r.job_id, title: `Harvest Sweep · ${sweepSize}` });
      toast(`Harvest Sweep started (batch ${sweepSize})`);
    } catch (err) { toast(err.message, 'error'); }
  };

  const runAudit = async () => {
    setAuditing(true);
    try {
      const a = await api.finderAudit();
      setFinderAudit(a);
      if (a.totals.wrong === 0 && a.totals.empty === 0) toast('No bad website finds — all clean ✓');
    } catch (err) { toast('Audit failed: ' + err.message, 'error'); }
    finally { setAuditing(false); }
  };

  const runCleanup = async (buckets) => {
    const t = finderAudit?.totals || {};
    const n = buckets.includes('empty') ? (t.wrong + t.empty) : t.wrong;
    const c = buckets.includes('empty') ? (t.wrong_contacts + t.empty_contacts) : t.wrong_contacts;
    const p = buckets.includes('empty') ? (t.wrong_people + t.empty_people) : t.wrong_people;
    if (!window.confirm(`Purge ${n} website find(s)?\nThis clears their website and removes ${c} harvested contact(s) and ${p} harvested person(s). The companies go back into the find queue. This cannot be undone.`)) return;
    try {
      const r = await api.finderCleanup(buckets);
      setActiveJob({ id: r.job_id, title: 'Finder cleanup' });
      setFinderAudit(null);
      toast('Cleanup started');
    } catch (err) { toast(err.message, 'error'); }
  };

  const toggleArchiveView = () => {
    const next = archivedMode ? 'active' : 'archived';
    setArchiveMode(next); setOffset(0); setSelected(new Set()); setOpenedId(null);
  };

  const activeFilterCount = countActiveFilters(filters);

  return html`
    <div class="grid-toolbar">
      <input
        type="text"
        placeholder=${archivedMode ? "Search archived companies..." : "Search name, legal name, registration #..."}
        value=${q}
        onChange=${e => { setQ(e.target.value); setOffset(0); }}
      />
      <button
        class=${'toolbar-toggle' + (activeFilterCount > 0 || showFilters ? ' accent' : '')}
        onClick=${() => setShowFilters(v => !v)}
        title="Advanced filters — industry, status, source, size, completeness, location, score"
        style=${{ whiteSpace: 'nowrap' }}
      >☰ Filters${activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}</button>
      ${loading ? html`<span class="count">loading…</span>` : html`<${Pagination} total=${total} limit=${limit} offset=${offset} onChange=${setOffset} />`}
      <span class="spacer"></span>
      ${isLocalEngine && !isUser && archiveMode === 'active' ? html`
        <div class="sweep-group" style=${{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}
             title="Find websites (Stage 8) then harvest them (Stage 7) for the most-incomplete companies — local, $0. Run repeatedly to advance through the database.">
          <select value=${sweepSize} onChange=${e => setSweepSize(Number(e.target.value))}>
            ${[25, 50, 100, 250, 500].map(n => html`<option key=${n} value=${n}>${n}</option>`)}
          </select>
          <button class="accent" onClick=${runSweep}>Harvest stale ▶</button>
          <button onClick=${runAudit} disabled=${auditing} title="Re-validate every website the Finder saved and show which are wrong or empty, before purging.">${auditing ? 'Auditing…' : 'Audit finds'}</button>
        </div>
      ` : null}
      ${isLocalEngine && engineStatus ? html`
        <span title=${engineStatus.alive ? ('Always-on engine running. Last beat ' + (engineStatus.heartbeat?.updated_at ? new Date(engineStatus.heartbeat.updated_at).toLocaleTimeString() : '—') + '. Found ' + (engineStatus.heartbeat?.found_total || 0) + ', harvested ' + (engineStatus.heartbeat?.harvested_total || 0) + ', mapped ' + (engineStatus.heartbeat?.mapped_total || 0) + ' this run.') : (engineStatus.installed ? 'Engine installed but no recent heartbeat — check it is running.' : 'Always-on engine not running. Double-click "Install Always-On Engine.command".')}
          style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '999px', padding: '3px 10px' }}>
          <span style=${{ width: '8px', height: '8px', borderRadius: '50%', background: engineStatus.alive ? '#22c55e' : (engineStatus.installed ? '#f59e0b' : '#64748b'), animation: engineStatus.alive ? 'feedpulse 1.8s infinite' : 'none' }}></span>
          ${engineStatus.alive ? 'Engine live' : engineStatus.installed ? 'Engine idle' : 'Engine off'}
          ${engineStatus.alive && engineStatus.heartbeat ? html`<span style=${{ color: 'var(--text-dim)' }}>· ${Number(engineStatus.heartbeat.find_left ?? 0).toLocaleString()} to find · ${Number(engineStatus.heartbeat.harvest_left ?? 0).toLocaleString()} to harvest</span>` : null}
        </span>
      ` : null}
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

    ${activeFilterCount > 0 ? html`
      <div class="filter-chips" style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px', margin: '8px 0 0', alignItems: 'center' }}>
        ${buildChips(filters, setFilters, setOffset)}
        <button onClick=${() => { setFilters(EMPTY_FILTERS); setOffset(0); }}
          style=${{ fontSize: '11px', color: 'var(--text-dim)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>Clear all</button>
      </div>
    ` : null}

    ${finderAudit ? html`
      <div class="audit-panel" style=${{ margin: '8px 0', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface-2, rgba(0,0,0,0.03))' }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <strong>Finder audit</strong>
          <span class="muted small">${finderAudit.totals.found} found · <span style=${{ color: 'var(--red)' }}>${finderAudit.totals.wrong} wrong</span> · <span style=${{ color: 'var(--amber)' }}>${finderAudit.totals.empty} empty</span> · ${finderAudit.totals.ok} ok</span>
          <span class="spacer" style=${{ flex: 1 }}></span>
          ${finderAudit.totals.wrong > 0 ? html`<button class="danger" onClick=${() => runCleanup(['wrong'])}>Purge ${finderAudit.totals.wrong} wrong (−${finderAudit.totals.wrong_contacts}c/−${finderAudit.totals.wrong_people}ppl)</button>` : null}
          ${(finderAudit.totals.wrong + finderAudit.totals.empty) > 0 ? html`<button onClick=${() => runCleanup(['wrong', 'empty'])}>Purge wrong + empty (${finderAudit.totals.wrong + finderAudit.totals.empty})</button>` : null}
          <button class="ghost" onClick=${() => setFinderAudit(null)}>Dismiss</button>
        </div>
        ${finderAudit.wrong.length ? html`<div class="muted small" style=${{ marginTop: '6px' }}>Wrong e.g.: ${finderAudit.wrong.slice(0, 6).map(w => `${w.name} → ${w.website}`).join(' · ')}${finderAudit.wrong.length > 6 ? ' …' : ''}</div>` : null}
      </div>
    ` : null}

    ${selected.size > 0 ? html`
      <div class="bulk-bar">
        <strong>${selected.size}</strong>&nbsp;selected
        ${archivedMode
          ? html`<span class="muted small"> · archived companies cannot be enriched</span>`
          : html`<span class="muted small"> · click a button to enrich them all</span>`}
        <span class="spacer"></span>
        ${!archivedMode && !isUser ? html`
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
          ${isLocalEngine ? html`
            <span class="bulk-divider" style=${{ opacity: 0.4, margin: '0 2px' }}>│</span>
            <button class="accent" onClick=${() => runEnrich({ mode: 'local' })} title="Run all three local engines on the selected companies, in order: Engine 1 (Find Website) → Engine 2 (Harvest Site) → Engine 3 (Map Network). $0, idempotent.">Engines 1–3 ▶</button>
            <button class="accent" onClick=${() => runEnrich({ mode: 'stage', stage: 8 })} title=${STAGE_INFO[8]?.desc}>${STAGE_INFO[8].short} ▶</button>
            <button class="accent" onClick=${() => runEnrich({ mode: 'stage', stage: 7 })} title=${STAGE_INFO[7]?.desc}>${STAGE_INFO[7].short} ▶</button>
            <button class="accent" onClick=${() => runEnrich({ mode: 'stage', stage: 9 })} title=${STAGE_INFO[9]?.desc}>${STAGE_INFO[9].short} ▶</button>
          ` : null}
        ` : null}
        <button class="accent" onClick=${runBulkReveal} title="Reveal contact details · 1 credit each (already-revealed are free)">Reveal contacts ▶</button>
        <button onClick=${clearSelection}>Clear</button>
      </div>
    ` : null}

    ${archivedMode ? html`<div class="view-banner archived-banner">📦 Archived companies — these are <strong>not active</strong> and are kept for reference only.</div>` : null}
    ${reviewMode ? html`<div class="view-banner review-banner">⚠ Review queue — companies that disappeared from a source and need a decision.</div>` : null}

    <div class="grid-pane">
      ${showFilters ? html`<div class="bdi-filter-anchor">
        <${CompanyFilters}
          value=${filters}
          industries=${industries}
          onApply=${(f) => { setFilters(f); setOffset(0); }}
          onClose=${() => setShowFilters(false)}
        />
      </div>` : null}
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
            <col class="flex" />
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
              <th>Score</th>
              <th>${isUser ? 'Reveal' : 'Stages'}</th>
              <th class="flex"></th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0 && !loading ? html`<tr><td colSpan="10" class="empty">${reviewMode ? 'Nothing to review — no companies have disappeared from a directory.' : archivedMode ? 'No archived companies.' : 'No active companies yet.'}</td></tr>` : null}
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
                <td class="bellscore"><${BellScore} score=${r.bell_score} bar=${false} /></td>
                <td class="stages-cell">${isUser
                  ? (r.revealed_by_tenant
                      ? html`<span class="revealed-badge">✓ revealed</span>`
                      : html`<button class="reveal-btn" onClick=${(e) => { e.stopPropagation(); revealRow(r.id); }}>Reveal · 1</button>`)
                  : html`<${StageBar} row=${r} />`}</td>
                <td class="flex"></td>
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

// Active-filter chips shown under the toolbar (each removable; plus Clear all).
function chipEl(label, onRemove) {
  return html`<span style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 9px', borderRadius: '999px', border: '1px solid var(--border)', background: 'rgba(255,255,255,0.05)', fontSize: '11px', color: 'var(--text-muted)' }}>
    ${label}
    <button onClick=${onRemove} title="Remove" style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '13px', lineHeight: 1, padding: 0 }}>×</button>
  </span>`;
}
function buildChips(f, setFilters, setOffset) {
  const out = [];
  const after = () => setOffset(0);
  const rmFromArr = (key, v) => () => { setFilters((s) => ({ ...s, [key]: s[key].filter((x) => x !== v) })); after(); };
  const clearKey = (key, empty) => () => { setFilters((s) => ({ ...s, [key]: empty })); after(); };
  for (const v of f.industries) out.push(chipEl(v, rmFromArr('industries', v)));
  for (const v of f.statuses)   out.push(chipEl('status: ' + v, rmFromArr('statuses', v)));
  for (const v of f.sources)    out.push(chipEl('source: ' + v, rmFromArr('sources', v)));
  for (const v of f.empBuckets) out.push(chipEl(v + ' emp', rmFromArr('empBuckets', v)));
  if (String(f.city).trim()) out.push(chipEl('city: ' + f.city, clearKey('city', '')));
  if (f.ageMin) out.push(chipEl('age ≥ ' + f.ageMin + 'y', clearKey('ageMin', '')));
  if (f.ageMax) out.push(chipEl('age ≤ ' + f.ageMax + 'y', clearKey('ageMax', '')));
  if (f.capitalMinQar) out.push(chipEl('capital ≥ QAR ' + Number(f.capitalMinQar).toLocaleString(), clearKey('capitalMinQar', '')));
  if (f.capitalMaxQar) out.push(chipEl('capital ≤ QAR ' + Number(f.capitalMaxQar).toLocaleString(), clearKey('capitalMaxQar', '')));
  if (f.scoreMin)   out.push(chipEl('score ≥ ' + f.scoreMin, clearKey('scoreMin', '')));
  for (const [k, label] of [['hasWebsite', 'has website'], ['hasEmail', 'has email'], ['hasPhone', 'has phone'], ['hasLinkedin', 'has LinkedIn'], ['hasPeople', 'has people']]) {
    if (f[k]) out.push(chipEl(label, clearKey(k, false)));
  }
  return out;
}

export function ArchivedCompaniesTab({ mode = 'local-admin' } = {}) {
  return html`<${CompaniesTab} archivedMode=${true} mode=${mode} />`;
}

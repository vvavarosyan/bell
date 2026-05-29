// Deep Data tab — Qatar Open Data (data.gov.qa) catalog viewer + sync UI.
//
// Layout:
//   ┌─ Header strip: stats + last sync + manual sync button ───────┐
//   ├─ Filter bar: search · theme · publisher · sync status ───────┤
//   ├─ Dataset grid (paginated) ───────────────────────────────────┤
//   ├─ Recent sync activity (collapsible) ─────────────────────────┘
//   └─ Dataset detail drawer (when a card is opened)

import { useCallback, useEffect, useMemo, useState } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { DatasetDetail } from './DatasetDetail.js';

const PAGE_SIZE = 60;

const LAYOUT_KEY = 'bdi.deep-data.layout';

export function DeepDataTab({ mode = 'local-admin' } = {}) {
  const isUser = mode === 'user';   // customers browse datasets; no sync/admin tools
  const [stats,    setStats]    = useState(null);
  const [rows,     setRows]     = useState([]);
  const [total,    setTotal]    = useState(0);
  const [offset,   setOffset]   = useState(0);
  const [q,        setQ]        = useState('');
  const [theme,    setTheme]    = useState('');
  const [publisher,setPublisher]= useState('');
  const [syncStatus, setSyncStatus] = useState('');
  const [loading,  setLoading]  = useState(true);
  const [openedId, setOpenedId] = useState(null);
  const [busy,     setBusy]     = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  // 'grid' (default) | 'list'. Persisted across reloads.
  const [layout,   setLayout]   = useState(() => {
    try { return localStorage.getItem(LAYOUT_KEY) || 'grid'; }
    catch { return 'grid'; }
  });
  useEffect(() => {
    try { localStorage.setItem(LAYOUT_KEY, layout); } catch {}
  }, [layout]);

  const loadStats = useCallback(async ({ silent = false } = {}) => {
    try { setStats(await api.openDataStats()); }
    catch (err) { if (!silent) toast('Stats failed: ' + err.message, 'error'); }
  }, []);

  const loadRows = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { limit: PAGE_SIZE, offset };
      if (q.trim())     params.q         = q.trim();
      if (theme)        params.theme     = theme;
      if (publisher)    params.publisher = publisher;
      if (syncStatus)   params.sync_status = syncStatus;
      const r = await api.openDataDatasets(params);
      setRows(r.rows || []);
      setTotal(r.total || 0);
    } catch (err) { if (!silent) toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [offset, q, theme, publisher, syncStatus]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadRows(); }, [loadRows]);

  // Background poll every 8s so users see the catalog grow during seed and
  // see status flip from running→done after manual refresh.
  useEffect(() => {
    const t = setInterval(() => { loadStats({ silent: true }); loadRows({ silent: true }); }, 8000);
    return () => clearInterval(t);
  }, [loadStats, loadRows]);

  // Reset offset when filters change
  useEffect(() => { setOffset(0); }, [q, theme, publisher, syncStatus]);

  const triggerSync = async (kind) => {
    if (busy) return;
    setBusy(true);
    try {
      if (kind === 'catalog')      { await api.openDataSyncCatalog(); toast('Catalog sync started'); }
      else if (kind === 'records') { await api.openDataSyncRecords(); toast('Records sync started — this can take a while'); }
      loadStats(); loadRows();
    } catch (err) {
      toast(err.message?.includes('busy') ? 'A sync is already running' : ('Sync failed: ' + err.message), 'error');
    } finally { setBusy(false); }
  };

  return html`
    <div style=${{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>

      ${!isUser ? html`
        <${HeaderStrip} stats=${stats} busy=${busy}
          onSyncRecords=${() => triggerSync('records')}
          onSyncCatalog=${() => triggerSync('catalog')}
          onToggleRuns=${() => setShowRuns(s => !s)}
          showRuns=${showRuns}
        />
        ${showRuns ? html`<${RecentRuns} runs=${stats?.recent_runs || []} />` : null}
      ` : null}

      ${isUser ? html`
        <div style=${{ display: 'flex', gap: '22px', alignItems: 'baseline', margin: '4px 2px 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
          <span><b style=${{ color: 'var(--text)', fontSize: '15px' }}>${(stats?.total_datasets || 0).toLocaleString()}</b> datasets</span>
          <span><b style=${{ color: 'var(--text)', fontSize: '15px' }}>${formatBig(stats?.total_records)}</b> records</span>
        </div>
      ` : null}

      <${FilterBar}
        q=${q} setQ=${setQ}
        theme=${theme} setTheme=${setTheme}
        publisher=${publisher} setPublisher=${setPublisher}
        syncStatus=${syncStatus} setSyncStatus=${setSyncStatus}
        themes=${stats?.themes || []} publishers=${stats?.publishers || []}
        total=${total}
        offset=${offset} setOffset=${setOffset}
        layout=${layout} setLayout=${setLayout}
        isUser=${isUser}
      />

      ${loading ? html`<div style=${{ color: 'var(--text-dim)', textAlign: 'center', padding: '60px 0', fontSize: '12px' }}>Loading…</div>` :
        rows.length === 0 ? html`<${EmptyState} hasFilters=${!!(q || theme || publisher || syncStatus)} />` :
        layout === 'list' ? html`<${DatasetListView} rows=${rows} onOpen=${(id) => setOpenedId(id)} />` : html`
        <div style=${{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
          gap: '12px',
        }}>
          ${rows.map(r => html`<${DatasetCard} key=${r.id} ds=${r} onOpen=${() => setOpenedId(r.dataset_id)} />`)}
        </div>
      `}

      ${openedId ? html`<${DatasetDetail}
        datasetId=${openedId}
        onClose=${() => setOpenedId(null)}
        onChange=${() => { loadStats(); loadRows({ silent: true }); }}
        isUser=${isUser}
      />` : null}
    </div>
  `;
}

// ---------------------------------------------------------------------------
// HeaderStrip — stats + last sync + sync buttons
// ---------------------------------------------------------------------------
function HeaderStrip({ stats, busy, onSyncRecords, onSyncCatalog, onToggleRuns, showRuns }) {
  const lastRun = stats?.recent_runs?.[0];
  const lastRecordsRun = stats?.recent_runs?.find(r => r.kind === 'records' || r.kind === 'seed');
  const schedulerActive = !!stats?.scheduler?.active;
  const next = stats?.scheduler?.next_daily_at ? new Date(stats.scheduler.next_daily_at) : null;

  return html`<div style=${{
    background: 'linear-gradient(180deg, rgba(19,24,41,.92) 0%, rgba(13,18,35,.92) 100%)',
    border: '1px solid var(--border)',
    borderRadius: '14px',
    padding: '16px 18px',
    marginBottom: '14px',
  }}>
    <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
      <span style=${{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        <span style=${{
          width: '7px', height: '7px', borderRadius: '50%',
          background: schedulerActive ? 'var(--amber)' : 'var(--accent-bright)',
          animation: 'pulse 2.4s infinite',
        }}></span>
        <span style=${{
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em',
          color: 'var(--text-dim)', fontWeight: 700,
        }}>data.gov.qa · live</span>
      </span>
      <span style=${{ flex: 1 }}></span>
      <button
        onClick=${onSyncCatalog}
        disabled=${busy}
        title="Refresh the dataset list from data.gov.qa (no record downloads). ~13 API calls, a few seconds."
        style=${btnSecondary(busy)}
      >Refresh catalog</button>
      <button
        onClick=${onSyncRecords}
        disabled=${busy}
        title="Re-sync all datasets whose source data has changed since our last successful sync. Can take 5-15 min."
        style=${btnPrimary(busy)}
      >Refresh records ▶</button>
    </div>

    <div style=${{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
      gap: '10px',
    }}>
      ${[
        { label: 'Datasets',         value: (stats?.total_datasets || 0).toLocaleString() },
        { label: 'Total records',    value: formatBig(stats?.total_records) },
        { label: 'Synced',           value: (stats?.synced || 0).toLocaleString(), color: 'var(--green)' },
        { label: 'Pending / Running',value: ((stats?.pending || 0) + (stats?.running || 0)).toLocaleString(), color: 'var(--amber)' },
        { label: 'Failed',           value: (stats?.failed || 0).toLocaleString(), color: stats?.failed > 0 ? 'var(--red)' : 'var(--text-dim)' },
        { label: 'New this week',    value: (stats?.new_last_7d || 0).toLocaleString() },
      ].map(k => html`<div key=${k.label} style=${{
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
      }}>
        <div style=${{
          fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.08em',
          color: 'var(--text-dim)', fontWeight: 700,
        }}>${k.label}</div>
        <div style=${{
          fontSize: '15px', fontWeight: 600,
          color: k.color || 'var(--text)',
          marginTop: '2px', fontVariantNumeric: 'tabular-nums',
        }}>${k.value}</div>
      </div>`)}
    </div>

    <div style=${{
      marginTop: '12px',
      display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
      fontSize: '11px', color: 'var(--text-muted)',
    }}>
      <span>
        Last update: <strong style=${{ color: 'var(--text)' }}>
          ${lastRecordsRun ? relTime(lastRecordsRun.completed_at || lastRecordsRun.started_at) : 'never'}
        </strong>
        ${lastRecordsRun ? html` (<span style=${{
          color: lastRecordsRun.status === 'completed' ? 'var(--green)' :
                 lastRecordsRun.status === 'failed'    ? 'var(--red)' :
                 lastRecordsRun.status === 'running'   ? 'var(--amber)' :
                 'var(--text-dim)',
        }}>${lastRecordsRun.status}</span>${lastRecordsRun.new_records ? `, +${lastRecordsRun.new_records.toLocaleString()} rows` : ''})` : null}
      </span>
      ${next ? html`<span>·</span><span>Next auto-sync: <strong style=${{ color: 'var(--text)' }}>${next.toLocaleString()}</strong></span>` : null}
      ${schedulerActive ? html`<span>·</span><span style=${{ color: 'var(--amber)' }}>Sync running…</span>` : null}
      <span style=${{ flex: 1 }}></span>
      <button onClick=${onToggleRuns} style=${{
        background: 'transparent', border: '1px solid var(--border)',
        color: 'var(--text-muted)', padding: '4px 10px', borderRadius: '5px',
        fontSize: '10.5px', cursor: 'pointer',
      }}>${showRuns ? 'Hide' : 'Show'} sync activity</button>
    </div>
  </div>`;
}

function RecentRuns({ runs }) {
  if (!runs || runs.length === 0) {
    return html`<div style=${{
      background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border)',
      borderRadius: '10px', padding: '14px', marginBottom: '14px',
      fontSize: '12px', color: 'var(--text-dim)',
    }}>No sync activity recorded yet.</div>`;
  }
  return html`<div style=${{
    background: 'rgba(255,255,255,0.015)', border: '1px solid var(--border)',
    borderRadius: '10px', padding: '8px 4px', marginBottom: '14px',
  }}>
    ${runs.map(r => html`<div key=${r.id} style=${{
      display: 'grid', gridTemplateColumns: '80px 1fr 110px 110px',
      alignItems: 'center', gap: '12px',
      padding: '7px 14px', fontSize: '11.5px',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <span style=${{ fontFamily: 'ui-monospace, monospace', fontSize: '10.5px',
        color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>${r.kind}</span>
      <span style=${{ color: 'var(--text)' }}>
        ${r.dataset_id_text || (r.kind === 'catalog' ? 'Catalog refresh' : `${(r.new_datasets || 0) + (r.updated_datasets || 0)} datasets touched, ${(r.new_records || 0).toLocaleString()} new rows`)}
        ${r.error_message ? html`<div style=${{ fontSize: '10.5px', color: 'var(--red)', marginTop: '2px' }}>${r.error_message}</div>` : null}
      </span>
      <span style=${{
        fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700,
        color: r.status === 'completed' ? 'var(--green)' :
               r.status === 'failed'    ? 'var(--red)' :
               r.status === 'running'   ? 'var(--amber)' :
               'var(--text-dim)',
      }}>${r.status}</span>
      <span style=${{ color: 'var(--text-dim)', textAlign: 'right' }}>${relTime(r.started_at)}</span>
    </div>`)}
  </div>`;
}

// ---------------------------------------------------------------------------
// FilterBar
// ---------------------------------------------------------------------------
function FilterBar({ q, setQ, theme, setTheme, publisher, setPublisher, syncStatus, setSyncStatus,
                    themes, publishers, total, offset, setOffset, layout, setLayout, isUser = false }) {
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd   = Math.min(offset + PAGE_SIZE, total);
  return html`<div style=${{
    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '14px',
  }}>
    <input
      type="text"
      placeholder="Search title, description, or dataset id…"
      value=${q}
      onChange=${(e) => setQ(e.target.value)}
      style=${{
        flex: 1, minWidth: '220px',
        padding: '8px 12px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        color: 'var(--text)', fontSize: '12.5px',
      }}
    />
    <select value=${theme} onChange=${(e) => setTheme(e.target.value)} style=${selectStyle}>
      <option value="">All industries</option>
      ${themes.map(t => html`<option key=${t.theme} value=${t.theme}>${t.theme} (${t.n})</option>`)}
    </select>
    <select value=${publisher} onChange=${(e) => setPublisher(e.target.value)} style=${selectStyle}>
      <option value="">All sources</option>
      ${publishers.map(p => html`<option key=${p.publisher} value=${p.publisher}>${p.publisher} (${p.n})</option>`)}
    </select>
    ${!isUser ? html`
      <select value=${syncStatus} onChange=${(e) => setSyncStatus(e.target.value)} style=${selectStyle}>
        <option value="">All sync states</option>
        <option value="done">Synced</option>
        <option value="pending">Pending</option>
        <option value="running">Running</option>
        <option value="failed">Failed</option>
        <option value="no_data">No data</option>
      </select>
    ` : null}

    <!-- Layout toggle -->
    <div style=${{
      display: 'inline-flex',
      border: '1px solid var(--border)',
      borderRadius: '7px',
      overflow: 'hidden',
    }}>
      <button onClick=${() => setLayout('grid')} title="Grid view" style=${layoutToggleBtn(layout === 'grid')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
          <rect x="1.5"  y="1.5" width="5" height="5" rx="1" />
          <rect x="9.5"  y="1.5" width="5" height="5" rx="1" />
          <rect x="1.5"  y="9.5" width="5" height="5" rx="1" />
          <rect x="9.5"  y="9.5" width="5" height="5" rx="1" />
        </svg>
      </button>
      <button onClick=${() => setLayout('list')} title="List view" style=${layoutToggleBtn(layout === 'list')}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">
          <line x1="2" y1="4"  x2="14" y2="4" />
          <line x1="2" y1="8"  x2="14" y2="8" />
          <line x1="2" y1="12" x2="14" y2="12" />
        </svg>
      </button>
    </div>

    <div style=${{ flexBasis: '100%', height: 0 }}></div>
    <div style=${{ fontSize: '11px', color: 'var(--text-dim)' }}>
      ${total > 0 ? `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${total.toLocaleString()}` : '0 results'}
    </div>
    <span style=${{ flex: 1 }}></span>
    <button onClick=${() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled=${offset === 0} style=${pagerStyle(offset === 0)}>‹ Prev</button>
    <button onClick=${() => setOffset(offset + PAGE_SIZE)} disabled=${offset + PAGE_SIZE >= total} style=${pagerStyle(offset + PAGE_SIZE >= total)}>Next ›</button>
  </div>`;
}

function layoutToggleBtn(active) {
  return {
    padding: '6px 9px',
    background: active ? 'rgba(91,140,255,0.18)' : 'transparent',
    color: active ? 'var(--accent-bright)' : 'var(--text-muted)',
    border: 'none',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
}

// ---------------------------------------------------------------------------
// DatasetListView — compact table-like layout for the catalog
// ---------------------------------------------------------------------------
function DatasetListView({ rows, onOpen }) {
  return html`<div style=${{
    border: '1px solid var(--border)',
    borderRadius: '10px',
    overflow: 'hidden',
    background: 'rgba(19,24,41,0.7)',
  }}>
    <!-- header row -->
    <div style=${{
      display: 'grid',
      gridTemplateColumns: 'minmax(220px, 2.4fr) minmax(120px, 1fr) minmax(120px, 0.9fr) 100px 120px 130px',
      alignItems: 'center',
      gap: '12px',
      padding: '10px 14px',
      background: 'rgba(255,255,255,0.025)',
      borderBottom: '1px solid var(--border)',
      fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--text-dim)', fontWeight: 700,
    }}>
      <span>Dataset</span>
      <span>Source</span>
      <span>Industry</span>
      <span style=${{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>Rows</span>
      <span>Status</span>
      <span style=${{ textAlign: 'right' }}>Updated</span>
    </div>

    <!-- body rows -->
    ${rows.map((ds, i) => html`<div
      key=${ds.id}
      onClick=${() => onOpen(ds.dataset_id)}
      onMouseEnter=${(e) => { e.currentTarget.style.background = 'rgba(91,140,255,0.05)'; }}
      onMouseLeave=${(e) => { e.currentTarget.style.background = i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent'; }}
      style=${{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 2.4fr) minmax(120px, 1fr) minmax(120px, 0.9fr) 100px 120px 130px',
        alignItems: 'center',
        gap: '12px',
        padding: '11px 14px',
        background: i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: 'pointer',
        fontSize: '12.5px',
        transition: 'background .1s ease',
      }}
    >
      <div style=${{
        color: 'var(--text)', fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title=${ds.title}>${ds.title}</div>
      <div style=${{
        color: 'var(--text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title=${ds.publisher || ''}>${ds.publisher || '—'}</div>
      <div style=${{
        color: 'var(--text-muted)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }} title=${ds.theme || ''}>${ds.theme || '—'}</div>
      <div style=${{
        color: 'var(--text)',
        fontFamily: 'ui-monospace, monospace',
        fontVariantNumeric: 'tabular-nums',
        textAlign: 'right',
      }}>${(ds.our_last_record_count || ds.record_count || 0).toLocaleString()}</div>
      <div>
        <${StatusBadge} status=${ds.our_record_sync_status} />
      </div>
      <div style=${{
        color: 'var(--text-dim)', textAlign: 'right', fontSize: '11px',
      }}>${ds.source_modified_at ? relTime(ds.source_modified_at) : '—'}</div>
    </div>`)}
  </div>`;
}

function StatusBadge({ status }) {
  const META = {
    done:    { label: 'Synced',   color: 'var(--green)' },
    running: { label: 'Syncing',  color: 'var(--amber)' },
    pending: { label: 'Pending',  color: 'var(--text-dim)' },
    failed:  { label: 'Failed',   color: 'var(--red)' },
    no_data: { label: 'No data',  color: 'var(--text-dim)' },
  }[status] || { label: status || '—', color: 'var(--text-dim)' };
  return html`<span style=${{
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '2px 7px',
    fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
    borderRadius: '999px',
    color: META.color,
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
  }}>
    <span style=${{ width: '5px', height: '5px', borderRadius: '50%', background: META.color }}></span>
    ${META.label}
  </span>`;
}

// ---------------------------------------------------------------------------
// DatasetCard
// ---------------------------------------------------------------------------
function DatasetCard({ ds, onOpen }) {
  const STATUS = {
    done:    { label: 'Synced',   color: 'var(--green)' },
    running: { label: 'Syncing',  color: 'var(--amber)' },
    pending: { label: 'Pending',  color: 'var(--text-dim)' },
    failed:  { label: 'Failed',   color: 'var(--red)' },
    no_data: { label: 'No data',  color: 'var(--text-dim)' },
  }[ds.our_record_sync_status] || { label: ds.our_record_sync_status, color: 'var(--text-dim)' };

  return html`<div onClick=${onOpen} style=${{
    padding: '14px',
    background: 'linear-gradient(180deg, rgba(19,24,41,.94) 0%, rgba(13,18,35,.94) 100%)',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    cursor: 'pointer',
    minHeight: '170px',
    display: 'flex', flexDirection: 'column',
    transition: 'border-color .15s ease, transform .15s ease',
  }} onMouseEnter=${(e) => { e.currentTarget.style.borderColor = 'rgba(91,140,255,0.45)'; }}
     onMouseLeave=${(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}>

    <!-- header -->
    <div style=${{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '6px' }}>
      ${ds.theme ? html`<span style=${{
        fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--accent-bright)', fontWeight: 700,
      }}>${ds.theme}</span>` : html`<span></span>`}
      <span style=${{
        display: 'inline-flex', alignItems: 'center', gap: '5px',
        padding: '2px 7px',
        fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
        borderRadius: '999px',
        color: STATUS.color,
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style=${{ width: '5px', height: '5px', borderRadius: '50%', background: STATUS.color }}></span>
        ${STATUS.label}
      </span>
    </div>

    <!-- title -->
    <div style=${{
      fontSize: '13px', color: 'var(--text)', fontWeight: 600, lineHeight: 1.35,
      marginBottom: '6px',
      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    }}>${ds.title}</div>

    <!-- publisher -->
    ${ds.publisher ? html`<div style=${{
      fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px',
      display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    }}>${ds.publisher}</div>` : null}

    <!-- description -->
    ${ds.description ? html`<div style=${{
      fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.45,
      flex: 1,
      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
    }}>${stripHtml(ds.description)}</div>` : html`<div style=${{ flex: 1 }}></div>`}

    <!-- footer -->
    <div style=${{
      marginTop: '10px', paddingTop: '8px',
      borderTop: '1px solid rgba(255,255,255,.06)',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      fontSize: '10.5px', color: 'var(--text-dim)',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span>${(ds.our_last_record_count || ds.record_count || 0).toLocaleString()} rows</span>
      <span>${ds.source_modified_at ? `Updated ${relTime(ds.source_modified_at)}` : 'No timestamp'}</span>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
function EmptyState({ hasFilters }) {
  return html`<div style=${{
    padding: '60px 24px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    background: 'rgba(255,255,255,0.015)',
    border: '1px dashed var(--border)',
    borderRadius: '12px',
    fontSize: '13px',
  }}>
    ${hasFilters
      ? html`<div>No datasets match your filters.<br /><span style=${{ color: 'var(--text-dim)', fontSize: '11.5px' }}>Try clearing the search or filters above.</span></div>`
      : html`<div>No datasets synced yet.<br /><span style=${{ color: 'var(--text-dim)', fontSize: '11.5px' }}>The scheduler is seeding in the background. This panel refreshes every 8 seconds.</span></div>`}
  </div>`;
}

// ---------------------------------------------------------------------------
// Style helpers (inline so we don't pollute styles.css with one-tab stuff)
// ---------------------------------------------------------------------------
const selectStyle = {
  padding: '8px 10px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  color: 'var(--text)',
  fontSize: '12px',
  minWidth: '140px',
};
function pagerStyle(disabled) {
  return {
    padding: '6px 12px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--border)',
    borderRadius: '6px',
    color: disabled ? 'var(--text-dim)' : 'var(--text-muted)',
    fontSize: '11.5px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}
function btnPrimary(disabled) {
  return {
    background: disabled ? 'rgba(91,140,255,0.35)' : 'var(--accent)',
    border: '1px solid ' + (disabled ? 'var(--border)' : 'var(--accent)'),
    color: '#fff',
    padding: '7px 14px', borderRadius: '7px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px', fontWeight: 600,
    boxShadow: disabled ? 'none' : '0 4px 12px rgba(91,140,255,0.3)',
  };
}
function btnSecondary(disabled) {
  return {
    background: 'transparent',
    border: '1px solid var(--border)',
    color: disabled ? 'var(--text-dim)' : 'var(--text-muted)',
    padding: '7px 14px', borderRadius: '7px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: '12px', fontWeight: 500,
  };
}

// ---------------------------------------------------------------------------
function formatBig(n) {
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v < 10_000_000 ? 1 : 0).replace(/\.0$/, '') + 'M';
  if (v >= 10_000)    return (v / 1_000).toFixed(0) + 'K';
  if (v >= 1_000)     return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return v.toLocaleString();
}
function relTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
function stripHtml(s) {
  if (!s) return '';
  return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

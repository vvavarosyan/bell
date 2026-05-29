// Right-side drawer for a single Qatar Open Data dataset. Shows:
//   • Title, description (rich), publisher, themes, modified date
//   • Field schema (columns + types)
//   • Sample of locally-synced records as a table
//   • Recent sync runs for this dataset
//   • Manual "Re-sync now" button
//   • Links to data.gov.qa source page + chart/map builders

import { useCallback, useEffect, useMemo, useState } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { RecordsTable } from './RecordsTable.js';

export function DatasetDetail({ datasetId, onClose, onChange, isUser = false }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try { setData(await api.openDataDataset(datasetId)); }
    catch (err) { if (!silent) toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [datasetId]);

  useEffect(() => { load(); }, [load]);

  // While a sync is running for this dataset, poll faster.
  useEffect(() => {
    const status = data?.dataset?.our_record_sync_status;
    if (status !== 'running') return;
    const t = setInterval(() => load({ silent: true }), 4000);
    return () => clearInterval(t);
  }, [data?.dataset?.our_record_sync_status, load]);

  const onResync = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await api.openDataSyncOne(datasetId);
      toast('Re-sync started');
      load({ silent: true });
      onChange && onChange();
    } catch (err) {
      toast(err.message?.includes('busy') ? 'A sync is already running' : ('Re-sync failed: ' + err.message), 'error');
    } finally { setBusy(false); }
  };

  const ds = data?.dataset;
  const sample = data?.sample_records || [];
  const runs   = data?.recent_runs    || [];

  return html`
    <div onClick=${onClose} style=${{
      position: 'fixed', inset: 0, zIndex: 90,
      background: 'rgba(6,9,17,0.55)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick=${(e) => e.stopPropagation()} style=${{
        width: 'min(900px, 96vw)', height: '100%',
        background: 'linear-gradient(180deg, #131826 0%, #0e1322 100%)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-24px 0 64px rgba(0,0,0,0.5)',
        overflowY: 'auto',
      }}>
        <!-- Header -->
        <div style=${{
          position: 'sticky', top: 0, zIndex: 2,
          padding: '14px 22px',
          background: 'linear-gradient(180deg, #131826 0%, rgba(19,24,38,0.94) 100%)',
          backdropFilter: 'blur(6px)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
        }}>
          <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span style=${{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Dataset</span>
            <span style=${{ fontFamily: 'ui-monospace, monospace', fontSize: '11.5px', color: 'var(--text-dim)' }}>${datasetId}</span>
          </div>
          <button onClick=${onClose} style=${{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', width: '28px', height: '28px',
            borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
          }}>✕</button>
        </div>

        <div style=${{ padding: '20px 24px' }}>
          ${loading ? html`<div style=${{ color: 'var(--text-dim)', fontSize: '12px' }}>Loading…</div>` :
            !ds ? html`<div style=${{ color: 'var(--text-dim)', fontSize: '12px' }}>Dataset not found.</div>` : html`

            <!-- Title block -->
            <div style=${{ marginBottom: '20px' }}>
              ${ds.theme ? html`<div style=${{
                fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em',
                color: 'var(--accent-bright)', fontWeight: 700, marginBottom: '6px',
              }}>${ds.theme}</div>` : null}
              <h2 style=${{ margin: '0 0 10px', fontSize: '20px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>
                ${ds.title}
              </h2>
              ${ds.publisher ? html`<div style=${{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Source: <strong style=${{ color: 'var(--text)' }}>${ds.publisher}</strong>
              </div>` : null}
            </div>

            <!-- Action row — admin only (re-sync, source page, chart/map builders) -->
            ${!isUser ? html`
            <div style=${{
              display: 'flex', gap: '8px', flexWrap: 'wrap',
              marginBottom: '20px',
            }}>
              <button onClick=${onResync} disabled=${busy || ds.our_record_sync_status === 'running'} style=${{
                background: (busy || ds.our_record_sync_status === 'running') ? 'rgba(91,140,255,0.35)' : 'var(--accent)',
                border: '1px solid ' + ((busy || ds.our_record_sync_status === 'running') ? 'var(--border)' : 'var(--accent)'),
                color: '#fff', padding: '7px 14px', borderRadius: '7px',
                cursor: (busy || ds.our_record_sync_status === 'running') ? 'not-allowed' : 'pointer',
                fontSize: '12px', fontWeight: 600,
              }}>${ds.our_record_sync_status === 'running' ? 'Syncing…' : 'Re-sync now'}</button>
              <a href=${`https://www.data.gov.qa/explore/dataset/${encodeURIComponent(ds.dataset_id)}/`} target="_blank" rel="noopener noreferrer" style=${linkBtn}>
                Source page ↗
              </a>
              <a href=${`https://www.data.gov.qa/explore/dataset/${encodeURIComponent(ds.dataset_id)}/analyze/`} target="_blank" rel="noopener noreferrer" style=${linkBtn}>
                Chart builder ↗
              </a>
              <a href=${`https://www.data.gov.qa/explore/dataset/${encodeURIComponent(ds.dataset_id)}/map/`} target="_blank" rel="noopener noreferrer" style=${linkBtn}>
                Map builder ↗
              </a>
            </div>
            ` : null}

            <!-- Stats grid -->
            <div style=${{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px',
              marginBottom: '18px',
            }}>
              ${[
                { label: 'Rows synced',  value: (ds.our_last_record_count || 0).toLocaleString() },
                { label: 'Sync status',  value: ds.our_record_sync_status, color: statusColor(ds.our_record_sync_status) },
                { label: 'Source updated', value: ds.source_modified_at ? relTime(ds.source_modified_at) : '—' },
                { label: 'Our last sync', value: ds.our_last_record_sync_at ? relTime(ds.our_last_record_sync_at) : 'never' },
              ].map(k => html`<div key=${k.label} style=${cellBox}>
                <div style=${cellLabel}>${k.label}</div>
                <div style=${{ ...cellValue, color: k.color || 'var(--text)' }}>${k.value || '—'}</div>
              </div>`)}
            </div>

            ${ds.our_record_sync_error ? html`<div style=${{
              padding: '12px',
              background: 'rgba(232,142,168,0.08)',
              border: '1px solid rgba(232,142,168,0.32)',
              borderRadius: '8px',
              fontSize: '12px', color: 'rgb(232 142 168)',
              marginBottom: '18px',
            }}>
              <div style=${{ fontWeight: 700, marginBottom: '4px' }}>Last sync error</div>
              <div style=${{ color: 'var(--text-muted)' }}>${ds.our_record_sync_error}</div>
            </div>` : null}

            <!-- Description -->
            ${ds.description ? html`<${Section} title="Description">
              <div style=${{
                fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.6,
              }} dangerouslySetInnerHTML=${{ __html: ds.description }}></div>
            <//>` : null}

            <!-- Industries + keywords -->
            ${(ds.themes?.length || ds.keywords?.length) ? html`<${Section} title="Industries & keywords">
              <div style=${{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                ${(ds.themes || []).map((t, i) => html`<span key=${'t' + i} style=${chip('rgb(91 140 255)')}>${t}</span>`)}
                ${(ds.keywords || []).map((t, i) => html`<span key=${'k' + i} style=${chip('rgb(165 195 255)')}>${t}</span>`)}
              </div>
            <//>` : null}

            <!-- Schema -->
            ${(ds.fields_schema?.length || 0) > 0 ? html`<${Section} title=${`Columns (${ds.fields_schema.length})`}>
              <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '6px' }}>
                ${ds.fields_schema.map((f, i) => html`<div key=${i} style=${{
                  padding: '7px 10px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                }}>
                  <div style=${{ color: 'var(--text)', fontFamily: 'ui-monospace, monospace' }}>${f.name}</div>
                  <div style=${{ color: 'var(--text-dim)', fontSize: '10.5px', marginTop: '2px' }}>
                    <span style=${{ color: 'var(--accent-bright)' }}>${f.type || '—'}</span>
                    ${f.label && f.label !== f.name ? html` · ${f.label}` : null}
                  </div>
                </div>`)}
              </div>
            <//>` : null}

            <!-- Records — full paginated + sortable table -->
            ${ds.our_last_record_count > 0 ? html`<${Section} title=${`Records (${(ds.our_last_record_count || 0).toLocaleString()})`}>
              <${RecordsTable}
                datasetId=${datasetId}
                schema=${ds.fields_schema || []}
                totalSynced=${ds.our_last_record_count}
              />
            <//>` : html`<${Section} title="Records">
              <div style=${{ color: 'var(--text-dim)', fontSize: '12px' }}>No records synced yet for this dataset.</div>
            <//>`}

            <!-- Sync history -->
            ${runs.length > 0 ? html`<${Section} title="Sync activity">
              <div style=${{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                ${runs.map(r => html`<div key=${r.id} style=${{
                  display: 'grid', gridTemplateColumns: '80px 1fr 110px 100px',
                  alignItems: 'center', gap: '12px',
                  padding: '7px 10px',
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  fontSize: '11.5px',
                }}>
                  <span style=${{ fontFamily: 'ui-monospace, monospace', fontSize: '10.5px',
                    color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
                  }}>${r.kind}</span>
                  <span style=${{ color: 'var(--text-muted)' }}>
                    ${r.new_records ? `+${r.new_records.toLocaleString()} rows` : '—'}
                    ${r.bytes_downloaded ? ` · ${formatBytes(r.bytes_downloaded)}` : ''}
                    ${r.error_message ? html`<div style=${{ fontSize: '10.5px', color: 'var(--red)', marginTop: '2px' }}>${r.error_message}</div>` : null}
                  </span>
                  <span style=${{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: statusColor(r.status) }}>
                    ${r.status}
                  </span>
                  <span style=${{ color: 'var(--text-dim)', textAlign: 'right' }}>${relTime(r.started_at)}</span>
                </div>`)}
              </div>
            <//>` : null}
          `}
        </div>
      </div>
    </div>
  `;
}

function Section({ title, children }) {
  return html`<div style=${{ marginBottom: '22px' }}>
    <div style=${{
      fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--text-dim)', fontWeight: 700, marginBottom: '8px',
    }}>${title}</div>
    ${children}
  </div>`;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const cellBox = {
  padding: '8px 12px',
  background: 'rgba(255,255,255,0.02)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
};
const cellLabel = {
  fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-dim)', fontWeight: 700,
};
const cellValue = {
  fontSize: '14px', fontWeight: 600, marginTop: '2px',
};
const linkBtn = {
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
  padding: '7px 12px', borderRadius: '7px',
  fontSize: '11.5px', fontWeight: 500,
  textDecoration: 'none',
};
function chip(color) {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    fontSize: '10.5px',
    color, background: color.replace('rgb', 'rgba').replace(')', ' / 0.12)'),
    border: '1px solid ' + color.replace('rgb', 'rgba').replace(')', ' / 0.32)'),
    borderRadius: '999px',
  };
}
function statusColor(s) {
  return s === 'done'    ? 'var(--green)' :
         s === 'failed'  ? 'var(--red)' :
         s === 'running' ? 'var(--amber)' :
         'var(--text-dim)';
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
function formatBytes(b) {
  if (!b) return '0 B';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB';
  return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}
function formatCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 120);
  return String(v);
}

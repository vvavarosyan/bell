// Records table for a Qatar Open Data dataset.
//
// UX goals (refresh 2):
//   • No mandatory horizontal scroll — show ~6 important columns by default
//   • Click a row → expand inline showing EVERY field as a key/value list
//   • Optional "Show all columns" toggle for power users who want the wide table
//   • Sortable column headers, debounced search, pagination
//   • Sticky header so context never scrolls away

import { useCallback, useEffect, useMemo, useState } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

const PAGE_SIZES = [25, 50, 100, 250];

// Types we hide from the default column set (visually noisy / unwieldy)
const NOISY_TYPES  = new Set(['geo_shape', 'file', 'image']);
// Types we deprioritize from the default column set (still shown if there's room)
const VERBOSE_TYPES = new Set(['geo_point_2d']);

const DEFAULT_VISIBLE = 6;

export function RecordsTable({ datasetId, schema /*, totalSynced */ }) {
  const [rows,    setRows]    = useState([]);
  const [total,   setTotal]   = useState(0);
  const [offset,  setOffset]  = useState(0);
  const [limit,   setLimit]   = useState(50);
  const [sort,    setSort]    = useState(null);
  const [dir,     setDir]     = useState('asc');
  const [q,       setQ]       = useState('');
  const [qLive,   setQLive]   = useState('');
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());

  // All columns from the schema (or first record's keys as fallback)
  const allCols = useMemo(() => {
    if (Array.isArray(schema) && schema.length) {
      return schema.map(f => ({
        name:  f.name,
        type:  f.type || 'text',
        label: f.label || f.name,
      })).filter(c => c.name);
    }
    if (rows[0]) {
      return Object.keys(rows[0].data || {}).map(k => ({ name: k, type: 'text', label: k }));
    }
    return [];
  }, [schema, rows]);

  // Default visible columns — first N from schema, skipping noisy types,
  // pushing verbose types to the end.
  const visibleCols = useMemo(() => {
    if (showAll) return allCols;
    const cleaned = allCols.filter(c => !NOISY_TYPES.has(c.type));
    const primary = cleaned.filter(c => !VERBOSE_TYPES.has(c.type));
    const secondary = cleaned.filter(c => VERBOSE_TYPES.has(c.type));
    return [...primary, ...secondary].slice(0, DEFAULT_VISIBLE);
  }, [allCols, showAll]);

  const hiddenColumnCount = allCols.length - visibleCols.length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit, offset };
      if (sort) { params.sort = sort; params.dir = dir; }
      if (qLive.trim()) params.q = qLive.trim();
      const r = await api.openDataRecords(datasetId, params);
      setRows(r.rows || []);
      setTotal(r.total || 0);
      setExpanded(new Set()); // collapse all on page/filter change
    } catch { /* leave previous rows in place */ }
    finally { setLoading(false); }
  }, [datasetId, limit, offset, sort, dir, qLive]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOffset(0); }, [limit, sort, dir, qLive]);

  useEffect(() => {
    const t = setTimeout(() => setQLive(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const toggleSort = (colName) => {
    if (sort === colName) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(colName); setDir('asc'); }
  };

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd   = Math.min(offset + limit, total);

  return html`<div>
    <!-- Toolbar -->
    <div style=${{
      display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
      marginBottom: '10px',
    }}>
      <input
        type="text"
        placeholder="Search this dataset…"
        value=${q}
        onChange=${(e) => setQ(e.target.value)}
        style=${{
          flex: 1, minWidth: '180px',
          padding: '7px 10px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid var(--border)',
          borderRadius: '7px',
          color: 'var(--text)', fontSize: '12px',
        }}
      />
      <select value=${limit} onChange=${(e) => setLimit(Number(e.target.value))} style=${selectStyle}>
        ${PAGE_SIZES.map(n => html`<option key=${n} value=${n}>${n} per page</option>`)}
      </select>
      ${hiddenColumnCount > 0 ? html`<button
        onClick=${() => setShowAll(s => !s)}
        title=${showAll ? 'Show only the most useful columns' : `Reveal ${hiddenColumnCount} more columns (causes horizontal scroll)`}
        style=${{
          padding: '7px 12px',
          background: showAll ? 'rgba(91,140,255,0.14)' : 'rgba(255,255,255,0.02)',
          border: '1px solid ' + (showAll ? 'rgba(91,140,255,0.4)' : 'var(--border)'),
          borderRadius: '7px',
          color: showAll ? 'var(--accent-bright)' : 'var(--text-muted)',
          fontSize: '11.5px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >${showAll ? `Showing all ${allCols.length} columns` : `+${hiddenColumnCount} more columns`}</button>` : null}
      <div style=${{
        fontSize: '11px', color: 'var(--text-dim)',
        fontFamily: 'ui-monospace, monospace',
        fontVariantNumeric: 'tabular-nums',
      }}>
        ${total > 0 ? `${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${total.toLocaleString()}` : '0 records'}
      </div>
      <span style=${{ flex: 1 }}></span>
      <button onClick=${() => setOffset(Math.max(0, offset - limit))} disabled=${offset === 0} style=${pagerStyle(offset === 0)}>‹</button>
      <button onClick=${() => setOffset(offset + limit)} disabled=${offset + limit >= total} style=${pagerStyle(offset + limit >= total)}>›</button>
    </div>

    <!-- Tip -->
    ${!showAll && allCols.length > 0 ? html`<div style=${{
      fontSize: '10.5px', color: 'var(--text-dim)', marginBottom: '8px',
    }}>Click any row to see all ${allCols.length} field${allCols.length === 1 ? '' : 's'} for that record.</div>` : null}

    <!-- Table -->
    <div style=${{
      border: '1px solid var(--border)',
      borderRadius: '8px',
      overflowX: showAll ? 'auto' : 'hidden',
      overflowY: 'auto',
      maxHeight: '560px',
      background: 'rgba(255,255,255,0.012)',
    }}>
      ${loading && rows.length === 0 ? html`<div style=${{
        padding: '30px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px',
      }}>Loading records…</div>` :
        rows.length === 0 ? html`<div style=${{
          padding: '30px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '12px',
        }}>No records match.</div>` : html`
        <table style=${{
          width: '100%', borderCollapse: 'collapse',
          fontSize: '12px',
          opacity: loading ? 0.6 : 1, transition: 'opacity .15s',
          tableLayout: showAll ? 'auto' : 'fixed',
        }}>
          <thead>
            <tr>
              <!-- expand chevron column -->
              <th style=${{
                position: 'sticky', top: 0, zIndex: 2,
                background: '#131826',
                width: '32px',
                padding: '9px 6px 9px 12px',
                borderBottom: '1px solid var(--border)',
              }}></th>
              ${visibleCols.map(c => {
                const active = sort === c.name;
                const numeric = c.type === 'int' || c.type === 'double' || c.type === 'long';
                return html`<th key=${c.name} onClick=${() => toggleSort(c.name)} style=${{
                  position: 'sticky', top: 0, zIndex: 2,
                  background: '#131826',
                  color: active ? 'var(--accent-bright)' : 'var(--text-muted)',
                  textAlign: numeric ? 'right' : 'left',
                  padding: '9px 12px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
                  fontWeight: 700,
                  cursor: 'pointer', userSelect: 'none',
                  whiteSpace: 'nowrap',
                }} title=${`Sort by ${c.label}`}>
                  <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis' }}>${c.name}</span>
                  <span style=${{ marginLeft: '4px', color: active ? 'var(--accent-bright)' : 'var(--text-dim)', fontSize: '8px', opacity: active ? 1 : 0.45 }}>
                    ${active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
                  </span>
                </th>`;
              })}
            </tr>
          </thead>
          <tbody>
            ${rows.flatMap((r, i) => {
              const data = r.data || {};
              const isOpen = expanded.has(r.id);
              const main = html`<tr key=${r.id} onClick=${() => toggleExpand(r.id)} style=${{
                background: isOpen ? 'rgba(91,140,255,0.06)' : (i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent'),
                cursor: 'pointer',
                transition: 'background .1s',
              }}
              onMouseEnter=${(e) => { if (!isOpen) e.currentTarget.style.background = 'rgba(91,140,255,0.04)'; }}
              onMouseLeave=${(e) => { if (!isOpen) e.currentTarget.style.background = i % 2 ? 'rgba(255,255,255,0.012)' : 'transparent'; }}
              >
                <td style=${{
                  padding: '8px 6px 8px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  color: isOpen ? 'var(--accent-bright)' : 'var(--text-dim)',
                  fontSize: '11px',
                  textAlign: 'center',
                  fontFamily: 'ui-monospace, monospace',
                  transition: 'transform .15s, color .1s',
                }}>${isOpen ? '▾' : '▸'}</td>
                ${visibleCols.map(c => {
                  const v = data[c.name];
                  const numeric = c.type === 'int' || c.type === 'double' || c.type === 'long';
                  return html`<td key=${c.name} style=${{
                    padding: '8px 12px',
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    color: 'var(--text)',
                    textAlign: numeric ? 'right' : 'left',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    fontVariantNumeric: numeric ? 'tabular-nums' : 'normal',
                    fontFamily: numeric ? 'ui-monospace, monospace' : 'inherit',
                  }} title=${formatCell(v)}>${formatCell(v)}</td>`;
                })}
              </tr>`;

              if (!isOpen) return [main];

              // Expanded row — show every field as key/value
              const expandedRow = html`<tr key=${r.id + '-x'} style=${{
                background: 'rgba(91,140,255,0.025)',
              }}>
                <td></td>
                <td colSpan=${visibleCols.length} style=${{
                  padding: '8px 16px 18px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                }}>
                  <${RecordDetail} data=${data} schema=${allCols} recordId=${r.record_id} syncedAt=${r.our_synced_at} />
                </td>
              </tr>`;
              return [main, expandedRow];
            })}
          </tbody>
        </table>
      `}
    </div>

    <!-- Bottom pager -->
    ${total > limit ? html`<div style=${{
      display: 'flex', alignItems: 'center', gap: '8px',
      marginTop: '8px', justifyContent: 'flex-end',
      fontSize: '11px', color: 'var(--text-dim)',
      fontFamily: 'ui-monospace, monospace',
    }}>
      <span>${pageStart.toLocaleString()}–${pageEnd.toLocaleString()} of ${total.toLocaleString()}</span>
      <button onClick=${() => setOffset(0)} disabled=${offset === 0} style=${pagerStyle(offset === 0)}>« First</button>
      <button onClick=${() => setOffset(Math.max(0, offset - limit))} disabled=${offset === 0} style=${pagerStyle(offset === 0)}>‹ Prev</button>
      <button onClick=${() => setOffset(offset + limit)} disabled=${offset + limit >= total} style=${pagerStyle(offset + limit >= total)}>Next ›</button>
      <button onClick=${() => setOffset(Math.max(0, Math.floor((total - 1) / limit) * limit))} disabled=${offset + limit >= total} style=${pagerStyle(offset + limit >= total)}>Last »</button>
    </div>` : null}
  </div>`;
}

// ---------------------------------------------------------------------------
// RecordDetail — clean key/value list of every field in one record
// ---------------------------------------------------------------------------
function RecordDetail({ data, schema, recordId, syncedAt }) {
  // Order: schema field order, then any leftover keys not in schema
  const schemaNames = schema.map(c => c.name);
  const leftover = Object.keys(data || {}).filter(k => !schemaNames.includes(k));
  const allKeys = [...schemaNames, ...leftover];

  return html`<div>
    ${recordId || syncedAt ? html`<div style=${{
      display: 'flex', gap: '14px', alignItems: 'baseline',
      marginBottom: '12px',
      fontSize: '10.5px', color: 'var(--text-dim)',
      fontFamily: 'ui-monospace, monospace',
    }}>
      ${recordId ? html`<span>ID: <span style=${{ color: 'var(--text-muted)' }}>${recordId}</span></span>` : null}
      ${syncedAt ? html`<span>Synced: <span style=${{ color: 'var(--text-muted)' }}>${new Date(syncedAt).toLocaleString()}</span></span>` : null}
    </div>` : null}

    <div style=${{
      display: 'grid',
      gridTemplateColumns: 'minmax(140px, 220px) 1fr',
      rowGap: '4px',
      columnGap: '18px',
      fontSize: '11.5px',
    }}>
      ${allKeys.map(k => {
        const v = data[k];
        const schemaCol = schema.find(c => c.name === k);
        const isObject = v && typeof v === 'object';
        return html`<div key=${k} style=${{ display: 'contents' }}>
          <div style=${{
            color: 'var(--text-dim)',
            fontFamily: 'ui-monospace, monospace',
            padding: '5px 0',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title=${schemaCol?.label || k}>
            ${k}
            ${schemaCol?.type ? html`<span style=${{ marginLeft: '6px', color: 'var(--text-faint, #5a6b88)', fontSize: '9.5px' }}>${schemaCol.type}</span>` : null}
          </div>
          <div style=${{
            color: v === null || v === undefined || v === '' ? 'var(--text-dim)' : 'var(--text)',
            padding: '5px 0',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
            wordBreak: 'break-word',
            fontFamily: isObject ? 'ui-monospace, monospace' : 'inherit',
            fontSize: isObject ? '10.5px' : '11.5px',
            lineHeight: 1.5,
          }}>
            ${v === null || v === undefined || v === '' ? '—' :
              isObject ? html`<pre style=${{ margin: 0, whiteSpace: 'pre-wrap' }}>${JSON.stringify(v, null, 2)}</pre>` :
              isUrl(v) ? html`<a href=${v} target="_blank" rel="noopener noreferrer" style=${{ color: 'var(--accent-bright)', textDecoration: 'none' }}>${v} ↗</a>` :
              String(v)}
          </div>
        </div>`;
      })}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
const selectStyle = {
  padding: '7px 10px',
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  borderRadius: '7px',
  color: 'var(--text)',
  fontSize: '11.5px',
};
function pagerStyle(disabled) {
  return {
    padding: '5px 10px',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid var(--border)',
    borderRadius: '5px',
    color: disabled ? 'var(--text-dim)' : 'var(--text-muted)',
    fontSize: '11px',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
  };
}
function formatCell(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 140);
  return String(v);
}
function isUrl(v) {
  if (typeof v !== 'string') return false;
  return /^https?:\/\//i.test(v);
}

// TENDERS — Qatar public procurement (Monaqasat first; Ashghal + QatarEnergy
// next). Browse / filter / inspect every tender Bell has scraped, with a
// live "are these synced to app.bell.qa?" indicator (the local engine compares
// its own row count to production's). Open tenders are the actionable, biddable
// set; awarded tenders are the historical record + activity-code matching pool.
//
// All hooks live at the top (page-blank rule) — loading/empty render inside the
// single return.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { navigateTo } from '../lib/router.js';

const PAGE = 30;
const STATUS_META = {
  open:      { label: 'Open',      color: '#22c55e' },
  awarded:   { label: 'Awarded',   color: '#5b8cff' },
  cancelled: { label: 'Cancelled', color: '#9ca5b9' },
};
const SOURCE_LABEL = { monaqasat: 'Monaqasat', ashghal: 'Ashghal', qatarenergy: 'QatarEnergy', kahramaa: 'Kahramaa', qse: 'QSE', manual: 'Manual' };

function fmtDate(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return '—'; } }
function fmtVal(n, cur) { if (n == null) return null; const v = Number(n); if (!Number.isFinite(v) || v <= 0) return null; return (cur || 'QAR') + ' ' + v.toLocaleString(); }
const srcLabel = (s) => SOURCE_LABEL[s] || (s ? s[0].toUpperCase() + s.slice(1) : '—');

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status || '—', color: '#9ca5b9' };
  return html`<span style=${{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: m.color, background: m.color + '1f', border: '1px solid ' + m.color + '55', borderRadius: '999px', padding: '2px 9px', whiteSpace: 'nowrap' }}>${m.label}</span>`;
}

export function TendersTab() {
  const [filters, setFilters] = useState({ status: '', source: '', buyer: '', year: '', q: '' });
  const [qInput, setQInput] = useState('');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState({ sources: [], buyers: [], years: [], statuses: [] });
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sync, setSync] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = { limit: PAGE, offset };
      for (const k of ['status', 'source', 'buyer', 'year', 'q']) if (filters[k]) q[k] = filters[k];
      const r = await api.tenders(q);
      setRows(r.rows || []); setTotal(r.total || 0);
    } catch { setRows([]); setTotal(0); }
    finally { setLoading(false); }
  }, [filters, offset]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => { api.tenderFacets().then(setFacets).catch(() => {}); }, []);

  const loadSync = useCallback(() => {
    setSyncing(true);
    api.tenderSyncStatus().then(setSync).catch(() => setSync(null)).finally(() => setSyncing(false));
  }, []);
  useEffect(() => { loadSync(); }, [loadSync]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => { setOffset(0); setFilters((f) => ({ ...f, q: qInput.trim() })); }, 400);
    return () => clearTimeout(t);
  }, [qInput]);

  const setFilter = (patch) => { setOffset(0); setFilters((f) => ({ ...f, ...patch })); };

  const openDetail = useCallback((id) => {
    setSelected(id); setDetailLoading(true); setDetail(null);
    api.tenderItem(id).then((r) => setDetail(r.tender)).catch(() => {}).finally(() => setDetailLoading(false));
  }, []);
  const closeDetail = () => { setSelected(null); setDetail(null); };

  const statusCount = (s) => { const row = (facets.statuses || []).find((x) => x.status === s); return row ? row.n : 0; };
  const allCount = (facets.statuses || []).reduce((a, x) => a + (x.n || 0), 0);

  const chip = (on, label, onClick, color) => html`
    <button onClick=${onClick} style=${{
      background: on ? (color ? color + '22' : 'var(--accent)') : 'var(--bg-elev-2, rgba(255,255,255,0.04))',
      border: '1px solid ' + (on ? (color || 'var(--accent)') : 'var(--border)'),
      color: on ? (color || '#fff') : 'var(--text-muted)',
      borderRadius: '999px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    }}>${label}</button>`;

  const selectStyle = { background: 'var(--bg-elev)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '6px 8px', fontSize: '12.5px', maxWidth: '190px' };

  // Sync chip text
  const syncChip = (() => {
    if (!sync) return null;
    const has = sync.prod != null;
    const ok = sync.synced;
    const color = !has ? 'var(--text-muted)' : ok ? '#22c55e' : 'var(--yellow, #f5c84c)';
    const label = has
      ? `Local ${sync.local.toLocaleString()} · Live ${sync.prod.toLocaleString()} ${ok ? '✓ synced' : '⚠ push pending'}`
      : `${sync.local.toLocaleString()} local` + (sync.error === 'no_sync_token' ? ' · set sync token to compare' : '');
    return html`<button onClick=${loadSync} title="Compare local vs app.bell.qa · click to re-check"
      style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elev)', border: '1px solid ' + (has && !ok ? 'var(--yellow, #f5c84c)' : 'var(--border)'), color, borderRadius: '999px', padding: '4px 11px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>
      <span style=${{ width: '7px', height: '7px', borderRadius: '50%', background: color, opacity: syncing ? 0.4 : 1 }}></span>${label}
    </button>`;
  })();

  return html`
    <div class="page-fill"><div class="page-scroll">

      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '4px 0 12px' }}>
        <h2 style=${{ margin: 0, fontSize: '17px' }}>Tenders</h2>
        <span class="muted small">Qatar public procurement · Bell tracks it continuously</span>
        <span style=${{ flex: 1 }}></span>
        ${syncChip}
      </div>

      <!-- filters -->
      <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }}>
        ${chip(filters.status === '', `All${allCount ? ' · ' + allCount.toLocaleString() : ''}`, () => setFilter({ status: '' }))}
        ${chip(filters.status === 'open', `Open${statusCount('open') ? ' · ' + statusCount('open').toLocaleString() : ''}`, () => setFilter({ status: 'open' }), STATUS_META.open.color)}
        ${chip(filters.status === 'awarded', `Awarded${statusCount('awarded') ? ' · ' + statusCount('awarded').toLocaleString() : ''}`, () => setFilter({ status: 'awarded' }), STATUS_META.awarded.color)}
        <span style=${{ flex: 1 }}></span>
        <input value=${qInput} onInput=${(e) => setQInput(e.target.value)} placeholder="Search title, buyer, ref…"
          style=${{ ...selectStyle, maxWidth: '230px', minWidth: '160px' }} />
      </div>
      <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
        ${(facets.sources || []).length > 1 ? html`
          <select value=${filters.source} onChange=${(e) => setFilter({ source: e.target.value })} style=${selectStyle}>
            <option value="">All sources</option>
            ${facets.sources.map((s) => html`<option key=${s.source} value=${s.source}>${srcLabel(s.source)} (${s.n})</option>`)}
          </select>` : null}
        <select value=${filters.buyer} onChange=${(e) => setFilter({ buyer: e.target.value })} style=${selectStyle}>
          <option value="">All buyers</option>
          ${(facets.buyers || []).map((b) => html`<option key=${b.buyer} value=${b.buyer}>${b.buyer.length > 34 ? b.buyer.slice(0, 33) + '…' : b.buyer} (${b.n})</option>`)}
        </select>
        <select value=${filters.year} onChange=${(e) => setFilter({ year: e.target.value })} style=${selectStyle}>
          <option value="">All years</option>
          ${(facets.years || []).map((y) => html`<option key=${y} value=${y}>${y}</option>`)}
        </select>
        ${(filters.source || filters.buyer || filters.year || filters.q) ? html`
          <button onClick=${() => { setQInput(''); setFilter({ source: '', buyer: '', year: '', q: '' }); }}
            style=${{ background: 'transparent', border: 'none', color: 'var(--accent-bright, #a5c3ff)', fontSize: '12px', cursor: 'pointer' }}>Clear</button>` : null}
      </div>

      <div class="muted small" style=${{ marginBottom: '10px' }}>
        ${loading ? 'Loading…' : `${total.toLocaleString()} tender${total === 1 ? '' : 's'}${filters.status || filters.source || filters.buyer || filters.year || filters.q ? ' match your filters' : ''}`}
      </div>

      <!-- list -->
      ${loading && !rows.length ? html`<div class="empty">Loading tenders…</div>`
        : rows.length === 0 ? html`<div class="empty">No tenders match. ${allCount === 0 ? 'Run "Run Tender Scan.command" on the local engine to pull them in.' : 'Try clearing a filter.'}</div>`
        : rows.map((t) => html`
          <div key=${t.id} onClick=${() => openDetail(t.id)}
            style=${{ border: '1px solid ' + (selected === t.id ? 'var(--accent)' : 'var(--border)'), borderRadius: '12px', background: 'var(--bg-elev)', padding: '12px 14px', marginBottom: '9px', cursor: 'pointer', transition: 'border-color .15s' }}>
            <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
              <span style=${{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--text-dim, #9ca5b9)' }}>${srcLabel(t.source)}</span>
              ${t.source_ref ? html`<span class="muted small">#${t.source_ref}</span>` : null}
              <span style=${{ flex: 1 }}></span>
              ${!t.has_detail ? html`<span class="muted small" title="Full detail (activity codes, contact) is still being backfilled" style=${{ opacity: 0.7 }}>detail pending</span>` : null}
              <${StatusBadge} status=${t.status} />
            </div>
            <div style=${{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>${t.title}</div>
            <div class="muted small" style=${{ marginTop: '5px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              ${t.buyer ? html`<span>🏛 ${t.buyer}</span>` : null}
              <span>${t.status === 'awarded' ? 'Awarded' : 'Published'} ${fmtDate(t.awarded_at || t.published_at)}</span>
              ${t.status === 'open' && t.deadline_at ? html`<span>Closes ${fmtDate(t.deadline_at)}</span>` : null}
              ${fmtVal(t.value_amount, t.currency) ? html`<span>${fmtVal(t.value_amount, t.currency)}</span>` : null}
              ${t.award_company_id ? html`<span style=${{ color: 'var(--accent-bright, #a5c3ff)' }}>↳ linked company</span>` : null}
            </div>
          </div>`)}

      <!-- pagination -->
      ${total > PAGE ? html`
        <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginTop: '14px' }}>
          <button disabled=${offset === 0} onClick=${() => setOffset(Math.max(0, offset - PAGE))}
            style=${{ background: 'var(--bg-elev)', border: '1px solid var(--border)', color: offset === 0 ? 'var(--text-muted)' : 'var(--text)', borderRadius: '8px', padding: '6px 14px', fontSize: '12.5px', cursor: offset === 0 ? 'default' : 'pointer' }}>← Prev</button>
          <span class="muted small">${(offset + 1).toLocaleString()}–${Math.min(offset + PAGE, total).toLocaleString()} of ${total.toLocaleString()}</span>
          <button disabled=${offset + PAGE >= total} onClick=${() => setOffset(offset + PAGE)}
            style=${{ background: 'var(--bg-elev)', border: '1px solid var(--border)', color: offset + PAGE >= total ? 'var(--text-muted)' : 'var(--text)', borderRadius: '8px', padding: '6px 14px', fontSize: '12.5px', cursor: offset + PAGE >= total ? 'default' : 'pointer' }}>Next →</button>
        </div>` : null}

      <!-- detail drawer -->
      ${selected != null ? html`
        <div onClick=${closeDetail} style=${{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60 }}></div>
        <div style=${{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(460px, 94vw)', background: 'var(--bg, #14161f)', borderLeft: '1px solid var(--border)', zIndex: 61, overflowY: 'auto', padding: '18px 20px', boxShadow: '-8px 0 30px rgba(0,0,0,0.3)' }}>
          <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style=${{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-dim, #9ca5b9)' }}>${detail ? srcLabel(detail.source) : ''}</span>
            ${detail ? html`<${StatusBadge} status=${detail.status} />` : null}
            <span style=${{ flex: 1 }}></span>
            <button onClick=${closeDetail} style=${{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '20px', cursor: 'pointer', lineHeight: 1 }}>×</button>
          </div>
          ${detailLoading ? html`<div class="empty">Loading…</div>` : !detail ? html`<div class="empty">Couldn't load this tender.</div>` : (() => {
            const raw = detail.raw || {};
            const line = (label, val) => val == null || val === '' ? null : html`<div style=${{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '12.5px' }}>
              <span class="muted" style=${{ flex: '0 0 130px' }}>${label}</span><span style=${{ flex: 1, color: 'var(--text)' }}>${val}</span></div>`;
            return html`
              <div style=${{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.35, marginBottom: '12px' }}>${detail.title}</div>
              ${detail.source_ref ? html`<div class="muted small" style=${{ marginBottom: '12px' }}>Reference #${detail.source_ref}${raw.entity_ref ? ' · buyer ref ' + raw.entity_ref : ''}</div>` : null}
              ${line('Buyer', detail.buyer)}
              ${line('Type', raw.type)}
              ${line('Sector', raw.sector)}
              ${line(detail.status === 'awarded' ? 'Awarded' : 'Published', fmtDate(detail.awarded_at || detail.published_at))}
              ${line('Closing date', detail.deadline_at ? fmtDate(detail.deadline_at) : null)}
              ${line('Tender bond', fmtVal(raw.tender_bond, 'QAR'))}
              ${line('Documents value', fmtVal(raw.documents_value, 'QAR'))}
              ${line('Contract duration', raw.contract_months ? raw.contract_months + ' months' : null)}
              ${line('Procurement contact', raw.contact_email ? html`<a href=${'mailto:' + raw.contact_email} style=${{ color: 'var(--accent-bright, #a5c3ff)' }}>${raw.contact_email}</a>` : null)}
              ${detail.award_company_name ? line('Awarded to', detail.award_company_id
                ? html`<button onClick=${() => navigateTo('companies', detail.award_company_id)} style=${{ background: 'transparent', border: 'none', padding: 0, color: 'var(--accent-bright, #a5c3ff)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>${detail.award_company_name} →</button>`
                : detail.award_company_name) : null}

              ${Array.isArray(raw.activities) && raw.activities.length ? html`
                <div style=${{ marginTop: '16px' }}>
                  <div style=${{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text)', marginBottom: '7px' }}>Activity codes · ${raw.activities.length}</div>
                  ${raw.activities.map((a, i) => html`<div key=${i} style=${{ display: 'flex', gap: '9px', padding: '4px 0', fontSize: '12px' }}>
                    <span class="muted" style=${{ flex: '0 0 62px', fontVariantNumeric: 'tabular-nums' }}>${a.code || ''}</span>
                    <span style=${{ flex: 1, color: 'var(--text)' }}>${a.name || ''}</span></div>`)}
                  <div class="muted small" style=${{ marginTop: '6px' }}>These map tenders to Bell companies in the same line of business.</div>
                </div>` : null}

              ${detail.url ? html`<div style=${{ marginTop: '18px' }}>
                <a href=${detail.url} target="_blank" rel="noopener noreferrer"
                  style=${{ display: 'inline-block', background: 'var(--accent)', color: '#fff', borderRadius: '8px', padding: '8px 16px', fontSize: '12.5px', fontWeight: 600, textDecoration: 'none' }}>Open on ${srcLabel(detail.source)} ↗</a>
              </div>` : null}`;
          })()}
        </div>` : null}

    </div></div>`;
}

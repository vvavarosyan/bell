// Real Estate — Qatar property market + physical geography (Val 2026-07-12).
// Three views: Market stats (prices by area, where rising/falling, trends),
// Buildings (named GIS landmarks with address/photo), and Transactions (the
// Weekly Real Estate Sales Bulletin). Every figure is source-stated (Rule 2.1);
// the Map layer is added separately. Hooks live at the top of each component.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { Pagination } from './Pagination.js';
import { navigateTo } from '../lib/router.js';

const SUBTABS = [['stats', 'Market stats'], ['buildings', 'Buildings'], ['transactions', 'Transactions']];

function compactQar(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (v >= 1e9) return 'QAR ' + (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return 'QAR ' + (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return 'QAR ' + (v / 1e3).toFixed(0) + 'K';
  return 'QAR ' + v.toLocaleString();
}
const perSqm = (n) => n == null ? '—' : Number(n).toLocaleString() + ' /m²';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

export function RealEstateTab() {
  const [sub, setSub] = useState('stats');
  return html`
    <div class="page-fill"><div class="page-scroll">
      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '4px 0 12px' }}>
        <h2 style=${{ margin: 0, fontSize: '17px' }}>Real Estate</h2>
        <span class="muted small">Qatar property market + geography · sourced from the official sales bulletin and Qatar GIS</span>
      </div>
      <div class="filt-bar">
        <span class="filt-label">View</span>
        <div class="pilltabs">
          ${SUBTABS.map(([id, label]) => html`<button key=${id} class=${'pilltab' + (sub === id ? ' active' : '')} onClick=${() => setSub(id)}>${label}</button>`)}
        </div>
      </div>
      ${sub === 'stats' ? html`<${StatsView} />`
        : sub === 'buildings' ? html`<${BuildingsView} />`
        : html`<${TransactionsView} />`}
      <div class="muted small" style=${{ marginTop: '14px', opacity: 0.7 }}>Looking for the map? Every Real Estate layer — prices, buildings and land parcels — now lives on the <b>Map</b> section (toggle them under “Real estate”).</div>
    </div></div>`;
}

// ---------------------------------------------------------------- Market stats
function StatsView() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let dead = false;
    api.realEstateStats().then((s) => { if (!dead) { setStats(s); setLoading(false); } }).catch(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, []);

  if (loading) return html`<div class="empty">Loading the property market…</div>`;
  if (!stats || !stats.overall || !stats.overall.deals) return html`<div class="empty">No real-estate data yet — run “Run Qatar GIS Scan.command”.</div>`;

  const o = stats.overall;
  const maxSqm = Math.max(1, ...(stats.byDistrict || []).map((d) => d.avg_sqm || 0));
  const months = [...(stats.monthly || [])].reverse().slice(-12);
  const maxMonth = Math.max(1, ...months.map((m) => m.avg_sqm || 0));

  const kpi = (label, value, sub) => html`
    <div style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '13px 15px', minWidth: 0 }}>
      <div style=${{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>${value}</div>
      <div class="muted small" style=${{ marginTop: '2px' }}>${label}</div>
      ${sub ? html`<div class="muted small" style=${{ opacity: 0.7, marginTop: '1px' }}>${sub}</div>` : null}
    </div>`;

  const moverRow = (m, up) => html`
    <div key=${m.district_name} style=${{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span style=${{ flex: 1, minWidth: 0, fontSize: '12.5px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${m.district_name}</span>
      <span class="muted small">${Number(m.recent_sqm).toLocaleString()} /m²</span>
      <span style=${{ fontSize: '12px', fontWeight: 700, color: up ? '#6fcf97' : '#ef6f6f', minWidth: '48px', textAlign: 'right' }}>${m.pct_change > 0 ? '+' : ''}${m.pct_change}%</span>
    </div>`;

  const card = (title, body, note) => html`
    <div style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '14px 16px' }}>
      <div style=${{ fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '10px' }}>${title}</div>
      ${body}
      ${note ? html`<div class="muted small" style=${{ marginTop: '8px', opacity: 0.7 }}>${note}</div>` : null}
    </div>`;

  return html`
    <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px', marginBottom: '16px' }}>
      ${kpi('Transactions', Number(o.deals).toLocaleString(), fmtDate(o.oldest) + ' – ' + fmtDate(o.newest))}
      ${kpi('Total value', compactQar(o.total_value), 'registered sales')}
      ${kpi('Avg price', Number(o.avg_sqm).toLocaleString() + ' /m²', 'QAR per square metre')}
      ${kpi('Buildings', Number(stats.buildings?.total || 0).toLocaleString(), (stats.buildings?.categories || 0) + ' categories')}
      ${kpi('Areas', Number(stats.geo?.districts || 0).toLocaleString() + ' districts', (stats.geo?.zones || 0) + ' zones · ' + (stats.geo?.municipalities || 0) + ' municipalities')}
      ${stats.land?.plots ? kpi('Land parcels', Number(stats.land.plots).toLocaleString(), Number(stats.land.area_km2).toLocaleString() + ' km² of land') : null}
    </div>

    <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '16px' }}>
      ${card('Where prices are rising', html`<div>${(stats.risers || []).map((m) => moverRow(m, true))}</div>`, 'avg QAR/m², last 6 months vs the 6 before')}
      ${card('Where prices are falling', html`<div>${(stats.fallers || []).map((m) => moverRow(m, false))}</div>`, 'avg QAR/m², last 6 months vs the 6 before')}
    </div>

    ${card('Price trend — avg QAR/m² by month (last 12)', html`
      <div style=${{ display: 'flex', alignItems: 'flex-end', gap: '4px', height: '90px' }}>
        ${months.map((m) => html`
          <div key=${m.month} title=${m.month + ' · ' + Number(m.avg_sqm).toLocaleString() + ' QAR/m² · ' + m.deals + ' deals'}
            style=${{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', minWidth: 0 }}>
            <div style=${{ width: '100%', height: (10 + 78 * (m.avg_sqm / maxMonth)) + 'px', background: 'linear-gradient(180deg,#5b8cff,rgba(91,140,255,0.25))', borderRadius: '3px 3px 0 0' }}></div>
            <span class="muted" style=${{ fontSize: '8px' }}>${m.month.slice(2)}</span>
          </div>`)}
      </div>`)}

    <div style=${{ height: '12px' }}></div>
    ${card('Busiest areas — avg price + volume', html`
      <div>${(stats.byDistrict || []).slice(0, 15).map((d) => html`
        <div key=${d.district_name} style=${{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
          <span style=${{ width: '150px', flexShrink: 0, fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${d.district_name}</span>
          <div style=${{ flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '4px', height: '9px', minWidth: '40px' }}>
            <div style=${{ width: (100 * d.avg_sqm / maxSqm) + '%', height: '100%', background: '#5b8cff', borderRadius: '4px' }}></div>
          </div>
          <span class="muted small" style=${{ width: '90px', textAlign: 'right' }}>${Number(d.avg_sqm).toLocaleString()} /m²</span>
          <span class="muted small" style=${{ width: '64px', textAlign: 'right', opacity: 0.7 }}>${Number(d.deals).toLocaleString()} deals</span>
        </div>`)}</div>`)}

    ${stats.land?.landuse?.length ? html`
      <div style=${{ height: '12px' }}></div>
      ${card('Land use — how Qatar\'s land is designated', html`
        <div>${stats.land.landuse.map((u) => html`
          <div key=${u.use} style=${{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
            <span style=${{ width: '150px', flexShrink: 0, fontSize: '12px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${u.use}</span>
            <span class="muted small" style=${{ flex: 1 }}>${Number(u.areas).toLocaleString()} areas</span>
            <span class="muted small" style=${{ width: '90px', textAlign: 'right' }}>${Number(u.area_km2).toLocaleString()} km²</span>
          </div>`)}</div>`, 'Zoning as published by Qatar GIS; unrecognised codes shown verbatim')}` : null}

    <div class="muted small" style=${{ marginTop: '14px', lineHeight: 1.5 }}>
      Every figure is a sum/average of values published in Qatar’s Weekly Real Estate Sales Bulletin + Qatar GIS — no estimates. Transaction parties are anonymized by the source and are never linked to companies.
    </div>`;
}

// ------------------------------------------------------------------- Buildings
function BuildingsView() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [cats, setCats] = useState([]);
  const [loading, setLoading] = useState(true);
  const PAGE = 24;

  useEffect(() => { api.realEstateBuildingCategories().then((r) => setCats(r.rows || [])).catch(() => {}); }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE, offset };
      if (q.trim()) params.q = q.trim();
      if (category) params.category = category;
      const r = await api.realEstateBuildings(params);
      setRows(r.rows || []); setTotal(r.total || 0);
    } catch { /* keep */ } finally { setLoading(false); }
  }, [offset, q, category]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOffset(0); }, [q, category]);

  return html`
    <div class="filt-bar">
      <input class="bdi-filter-input" type="text" placeholder="Search building, district, street…" value=${q}
        onInput=${(e) => setQ(e.target.value)} style=${{ minWidth: '240px' }} />
      <div class="pilltabs">
        <button class=${'pilltab' + (category === '' ? ' active' : '')} onClick=${() => setCategory('')}>All</button>
        ${cats.slice(0, 8).map((c) => html`<button key=${c.category} class=${'pilltab' + (category === c.category ? ' active' : '')} onClick=${() => setCategory(category === c.category ? '' : c.category)}>${c.category}<span class="ct">${c.n.toLocaleString()}</span></button>`)}
      </div>
    </div>
    ${loading ? html`<div class="empty">Loading buildings…</div>` :
      rows.length === 0 ? html`<div class="empty">No buildings match.</div>` : html`
      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
        ${rows.map((b) => html`
          <div key=${b.id} style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            ${b.photo_url ? html`<div style=${{ height: '110px', backgroundImage: `url(${b.photo_url})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundColor: 'rgba(255,255,255,0.03)' }}></div>` : null}
            <div style=${{ padding: '11px 13px', flex: 1 }}>
              <div style=${{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>${b.ename}</div>
              ${b.category ? html`<div style=${{ display: 'inline-block', marginTop: '5px', fontSize: '9.5px', fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#5b8cff', background: 'rgba(91,140,255,0.12)', borderRadius: '4px', padding: '1px 6px' }}>${b.subcategory_name || b.category}</div>` : null}
              <div class="muted small" style=${{ marginTop: '7px', lineHeight: 1.5 }}>
                ${[b.street_ename, b.district_ename].filter(Boolean).join(' · ') || '—'}
                ${b.zone_no ? html`<span> · Zone ${b.zone_no}</span>` : null}
              </div>
              ${b.phone ? html`<div class="muted small" style=${{ marginTop: '3px', opacity: 0.75 }}>☎ ${b.phone}${b.pobox_no ? ` · P.O. ${b.pobox_no}` : ''}</div>` : null}
              ${b.company_id && b.company_name ? html`
                <button onClick=${() => navigateTo('companies', b.company_id)}
                  style=${{ marginTop: '8px', background: 'rgba(111,207,151,0.12)', border: '1px solid rgba(111,207,151,0.3)', borderRadius: '7px', padding: '4px 8px', color: '#6fcf97', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer', width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title=${'Open ' + b.company_name}>🏢 ${b.company_name} →</button>` : null}
            </div>
          </div>`)}
      </div>
      <div class="feed-pager"><${Pagination} total=${total} limit=${PAGE} offset=${offset} onChange=${setOffset} /></div>`}`;
}

// ---------------------------------------------------------------- Transactions
function TransactionsView() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [district, setDistrict] = useState('');
  const [loading, setLoading] = useState(true);
  const PAGE = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: PAGE, offset };
      if (district.trim()) params.district = district.trim();
      const r = await api.realEstateTx(params);
      setRows(r.rows || []); setTotal(r.total || 0);
    } catch { /* keep */ } finally { setLoading(false); }
  }, [offset, district]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOffset(0); }, [district]);

  return html`
    <div class="filt-bar">
      <input class="bdi-filter-input" type="text" placeholder="Filter by district…" value=${district}
        onInput=${(e) => setDistrict(e.target.value)} style=${{ minWidth: '220px' }} />
      ${!loading ? html`<span class="muted small">${Number(total).toLocaleString()} transactions</span>` : null}
    </div>
    ${loading ? html`<div class="empty">Loading transactions…</div>` :
      rows.length === 0 ? html`<div class="empty">No transactions match.</div>` : html`
      <div class="grid-wrap" style=${{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'auto' }}>
        <table class="grid">
          <thead><tr>
            <th>Date</th><th>District</th><th>Type</th><th style=${{ textAlign: 'right' }}>Value</th>
            <th style=${{ textAlign: 'right' }}>Area</th><th style=${{ textAlign: 'right' }}>Price/m²</th>
          </tr></thead>
          <tbody>
            ${rows.map((t) => html`<tr key=${t.id}>
              <td>${fmtDate(t.registration_date)}</td>
              <td>${t.district_name || '—'}${t.municipality_name ? html`<div class="muted small">${t.municipality_name}</div>` : null}</td>
              <td>${t.property_type || t.usage || '—'}</td>
              <td style=${{ textAlign: 'right' }}>${compactQar(t.property_value)}</td>
              <td style=${{ textAlign: 'right' }}>${t.area_sqm != null ? Number(t.area_sqm).toLocaleString() + ' m²' : '—'}</td>
              <td style=${{ textAlign: 'right' }}>${t.price_per_sqm != null ? Number(t.price_per_sqm).toLocaleString() : '—'}</td>
            </tr>`)}
          </tbody>
        </table>
      </div>
      <div class="feed-pager"><${Pagination} total=${total} limit=${PAGE} offset=${offset} onChange=${setOffset} /></div>`}`;
}


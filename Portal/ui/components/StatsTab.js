// Database Overview — an admin dashboard summarising the whole database:
// totals, contact completeness (who's missing email/phone), source + industry
// breakdowns, freshness, and the live data-point count.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

const CARD = { background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px 16px', minWidth: 0 };
const LABEL = { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--text-dim)', fontWeight: 700 };

function StatCard({ label, value, sub }) {
  return html`<div style=${CARD}>
    <div style=${{ fontSize: '26px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.1 }}>${fmt(value)}</div>
    <div style=${{ ...LABEL, marginTop: '6px' }}>${label}</div>
    ${sub ? html`<div style=${{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>${sub}</div>` : null}
  </div>`;
}

function Coverage({ label, withN, total }) {
  const p = pct(withN, total);
  const miss = Math.max(0, (total || 0) - (withN || 0));
  const color = p >= 66 ? 'rgb(111 207 151)' : p >= 33 ? 'var(--amber, #e0a93f)' : 'rgb(232 142 168)';
  return html`<div style=${CARD}>
    <div style=${{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
      <div style=${{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>${fmt(withN)}</div>
      <div style=${{ fontSize: '13px', fontWeight: 700, color }}>${p}%</div>
    </div>
    <div style=${{ ...LABEL, marginTop: '6px' }}>${label}</div>
    <div style=${{ height: '6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', marginTop: '8px', overflow: 'hidden' }}>
      <div style=${{ height: '100%', width: p + '%', background: color }}></div>
    </div>
    <div style=${{ fontSize: '11.5px', color: 'var(--text-dim)', marginTop: '5px' }}>${fmt(miss)} missing</div>
  </div>`;
}

function Bars({ rows, labelKey, valueKey }) {
  const max = rows.reduce((m, r) => Math.max(m, Number(r[valueKey]) || 0), 0) || 1;
  return html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    ${rows.length === 0 ? html`<div class="muted small">No data.</div>` : null}
    ${rows.map((r) => html`<div key=${r[labelKey]} style=${{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      <span style=${{ width: '150px', flexShrink: 0, fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${r[labelKey]}</span>
      <div style=${{ flex: 1, height: '8px', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
        <div style=${{ height: '100%', width: (Number(r[valueKey]) / max * 100) + '%', background: 'linear-gradient(90deg, var(--accent), rgba(91,140,255,.5))' }}></div>
      </div>
      <span style=${{ width: '74px', textAlign: 'right', flexShrink: 0, fontSize: '12px', color: 'var(--text)' }}>${fmt(r[valueKey])}</span>
    </div>`)}
  </div>`;
}

const section = (title, body, extra) => html`<section style=${{ marginTop: '22px' }}>
  <div style=${{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '10px' }}>
    <h3 style=${{ margin: 0, fontSize: '13px', color: 'var(--text)' }}>${title}</h3>
    ${extra ? html`<span class="muted small">${extra}</span>` : null}
  </div>
  ${body}
</section>`;

const GRID = (min = '180px') => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`, gap: '12px' });

export function StatsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setData(await api.statsOverview()); }
    catch (err) { toast(/admin/i.test(err.message) ? 'Admin only' : 'Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading || !data) return html`<div class="overview" style=${{ padding: '24px' }}><div class="empty">Loading database overview…</div></div>`;

  const c = data.companies || {};
  const cc = data.company_contacts || {};
  const cca = data.company_contacts_active || {};
  const pc = data.person_contacts || {};

  return html`<div class="overview" style=${{ padding: '20px 22px 40px' }}>
    <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
      <h2 style=${{ margin: 0, fontSize: '18px' }}>Database Overview</h2>
      <span style=${{ flex: 1 }}></span>
      <button onClick=${load} style=${{ background: 'var(--bg-elev-2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>Refresh</button>
    </div>
    <div class="muted small" style=${{ marginBottom: '14px' }}>A live snapshot of everything in the Bell database.</div>

    <div style=${GRID('190px')}>
      <${StatCard} label="Companies" value=${c.total} sub=${`${fmt(c.active)} active · ${fmt(c.archived)} archived`} />
      <${StatCard} label="People" value=${data.people?.total} sub=${`${fmt(data.people?.with_employment)} with employment · ${fmt(data.people?.revealed)} revealed`} />
      <${StatCard} label="Jobs" value=${data.jobs?.total} sub=${`${fmt(data.jobs?.active)} active`} />
      <${StatCard} label="Data points" value=${data.data_points} sub="every stored field, counted" />
    </div>

    ${section('Active companies', html`<div style=${GRID('190px')}>
      <${StatCard} label="Active companies" value=${c.active} sub=${`${fmt(c.assembled)} assembled (BIN) · ${fmt(c.with_people)} with people`} />
      <${Coverage} label="Active · has email" withN=${cca.with_email} total=${c.active} />
      <${StatCard} label="Emails · active companies" value=${cca.emails_total} sub=${`across ${fmt(cca.with_email)} companies`} />
      <${Coverage} label="Active · has phone" withN=${cca.with_phone} total=${c.active} />
      <${StatCard} label="Phones · active companies" value=${cca.phones_total} sub=${`across ${fmt(cca.with_phone)} companies`} />
      <${Coverage} label="Active · has website" withN=${c.active_with_website} total=${c.active} />
    </div>`, 'the active, customer-facing subset')}

    ${section('Company contact completeness', html`<div style=${GRID('190px')}>
      <${Coverage} label="Has email" withN=${cc.with_email} total=${c.total} />
      <${Coverage} label="Has phone" withN=${cc.with_phone} total=${c.total} />
      <${Coverage} label="Has website" withN=${c.with_website} total=${c.total} />
      <${Coverage} label="Has LinkedIn" withN=${c.with_linkedin} total=${c.total} />
      <${Coverage} label="Has industry" withN=${c.with_industry} total=${c.total} />
    </div>`)}

    ${section('Totals in the database', html`<div style=${GRID('190px')}>
      <${StatCard} label="Company emails" value=${cc.emails_total} sub=${`${fmt(cc.without_email)} companies have none`} />
      <${StatCard} label="Company phones" value=${cc.phones_total} sub=${`${fmt(cc.without_phone)} companies have none`} />
      <${StatCard} label="Company socials" value=${cc.socials_total} />
      <${StatCard} label="People emails" value=${pc.emails_total} sub=${`${fmt(pc.with_email)} people`} />
      <${StatCard} label="People phones" value=${pc.phones_total} sub=${`${fmt(pc.with_phone)} people`} />
    </div>`)}

    ${section('Companies by source', html`<${Bars} rows=${data.sources || []} labelKey="source" valueKey="companies" />`)}

    ${section('Top industries', html`<${Bars} rows=${data.industries || []} labelKey="industry" valueKey="n" />`, 'by tag, across active companies')}

    ${section('Freshness', html`<div style=${GRID('190px')}>
      <${StatCard} label="Companies updated · 7 days" value=${c.updated_7d} />
      <${StatCard} label="Companies updated · 30 days" value=${c.updated_30d} />
      <${StatCard} label="People updated · 7 days" value=${data.people?.updated_7d} />
    </div>`)}
  </div>`;
}

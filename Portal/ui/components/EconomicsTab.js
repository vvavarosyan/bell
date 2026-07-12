// Economics — Phase 6, "Bell as a business" (admin-only). What it costs to run
// Bell vs. what it earns: revenue from real tenant plans, burn from recorded
// service costs (+ metered spend), margin and unit economics. Every figure is a
// real sum; the operator fills in the fixed monthly service bills. Hooks at top.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const qar = (n) => n == null ? '—' : 'QAR ' + Number(n).toLocaleString();
const CATS = ['compute', 'ai', 'enrichment', 'auth', 'payments', 'email', 'maps', 'voice', 'other'];

export function EconomicsTab() {
  const [econ, setEcon] = useState(null);
  const [costs, setCosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [e, c] = await Promise.all([api.economics(), api.economicsCosts()]);
      setEcon(e); setCosts(c.rows || []);
    } catch (err) { toast('Economics load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const saveCost = async (row, patch) => {
    setSaving(true);
    try { await api.saveEconomicsCost({ id: row.id, ...patch }); await load(); }
    catch (err) { toast('Save failed: ' + err.message, 'error'); }
    finally { setSaving(false); }
  };
  const addCost = async () => {
    const service = window.prompt('New service name (e.g. "OpenAI", "Twilio"):');
    if (!service) return;
    setSaving(true);
    try { await api.saveEconomicsCost({ service, category: 'other', monthly_amount: 0, currency: 'USD' }); await load(); }
    catch (err) { toast('Add failed: ' + err.message, 'error'); }
    finally { setSaving(false); }
  };
  const delCost = async (id) => {
    if (!window.confirm('Remove this service from the cost list?')) return;
    try { await api.deleteEconomicsCost(id); await load(); } catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  };

  if (loading) return html`<div class="page-fill"><div class="page-scroll"><div class="empty">Loading economics…</div></div></div>`;
  if (!econ) return html`<div class="page-fill"><div class="page-scroll"><div class="empty">Economics unavailable.</div></div></div>`;

  const r = econ.revenue, c = econ.costs, m = econ.margin, u = econ.unit_economics, s = econ.scale;

  const kpi = (label, value, sub, tint) => html`
    <div style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '14px 16px', minWidth: 0 }}>
      <div style=${{ fontSize: '21px', fontWeight: 700, color: tint || 'var(--text)' }}>${value}</div>
      <div class="muted small" style=${{ marginTop: '2px' }}>${label}</div>
      ${sub ? html`<div class="muted small" style=${{ opacity: 0.7, marginTop: '1px' }}>${sub}</div>` : null}
    </div>`;
  const card = (title, body, note) => html`
    <div style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '14px 16px' }}>
      <div style=${{ fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '12px', display: 'flex', alignItems: 'center' }}>${title}</div>
      ${body}
      ${note ? html`<div class="muted small" style=${{ marginTop: '8px', opacity: 0.7 }}>${note}</div>` : null}
    </div>`;

  const profit = m.gross_profit_monthly_qar;
  return html`
    <div class="page-fill"><div class="page-scroll">
      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '4px 0 12px' }}>
        <h2 style=${{ margin: 0, fontSize: '17px' }}>Economics</h2>
        <span class="muted small">What it costs to run Bell vs. what it earns · admin only · all figures QAR</span>
        <span class="spacer" style=${{ flex: 1 }}></span>
        <button onClick=${load}>Refresh</button>
      </div>

      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        ${kpi('Revenue · MRR', qar(r.mrr_qar), `${r.paying_tenants} paying · ${r.total_tenants} total tenants`, '#6fcf97')}
        ${kpi('Monthly burn', qar(c.total_burn_monthly_qar), `${c.recorded_services} services + metered`, '#f5c84c')}
        ${kpi(profit >= 0 ? 'Gross profit / mo' : 'Net burn / mo', qar(Math.abs(profit)), m.gross_margin_pct != null ? `${m.gross_margin_pct}% margin` : 'no revenue yet', profit >= 0 ? '#6fcf97' : '#ef6f6f')}
        ${kpi('ARR (run-rate)', qar(r.arr_qar), r.arpa_qar ? `ARPA ${qar(r.arpa_qar)}` : '—')}
        ${kpi('Cost / active company', u.cost_per_active_company_qar != null ? qar(u.cost_per_active_company_qar) : '—', `over ${Number(s.active_companies).toLocaleString()} active`)}
      </div>

      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        ${card('Revenue by plan', r.by_plan.length ? html`
          <table class="grid" style=${{ width: '100%' }}>
            <thead><tr><th>Plan</th><th style=${{ textAlign: 'right' }}>Tenants</th><th style=${{ textAlign: 'right' }}>Price</th><th style=${{ textAlign: 'right' }}>MRR</th></tr></thead>
            <tbody>${r.by_plan.map((p) => html`<tr key=${p.plan}>
              <td style=${{ textTransform: 'capitalize' }}>${p.plan}</td>
              <td style=${{ textAlign: 'right' }}>${p.tenants}</td>
              <td style=${{ textAlign: 'right' }}>${qar(p.price_qar)}</td>
              <td style=${{ textAlign: 'right', color: 'var(--text)' }}>${qar(p.mrr_qar)}</td>
            </tr>`)}</tbody>
          </table>` : html`<div class="muted small">No paying tenants yet — revenue starts when subscriptions go live.</div>`)}

        ${card('Cost by category', c.by_category.length ? html`<div>
          ${c.by_category.map((cat) => html`<div key=${cat.category} style=${{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: '12.5px' }}>
            <span style=${{ textTransform: 'capitalize', color: 'var(--text)' }}>${cat.category}</span>
            <span class="muted">${qar(cat.monthly_qar)}/mo</span>
          </div>`)}
          <div style=${{ display: 'flex', justifyContent: 'space-between', padding: '7px 0 0', marginTop: '5px', borderTop: '1px solid var(--border)', fontSize: '12.5px', fontWeight: 700 }}>
            <span>Total recorded</span><span>${qar(c.opex_monthly_qar)}/mo</span>
          </div>
          ${c.research_spend_qar_30d ? html`<div class="muted small" style=${{ marginTop: '4px' }}>+ ${qar(c.research_spend_qar_30d)} metered research spend (last 30d)</div>` : null}
        </div>` : html`<div class="muted small">Enter your monthly service costs below to see the breakdown.</div>`)}
      </div>

      ${card(html`<span>Operating costs</span><span class="spacer" style=${{ flex: 1 }}></span><button onClick=${addCost} disabled=${saving} style=${{ fontSize: '11px' }}>+ Add service</button>`, html`
        <table class="grid" style=${{ width: '100%' }}>
          <thead><tr><th>Service</th><th>Category</th><th style=${{ textAlign: 'right' }}>Monthly</th><th>Cur</th><th>On</th><th></th></tr></thead>
          <tbody>
            ${costs.map((row) => html`<tr key=${row.id} style=${{ opacity: row.active ? 1 : 0.5 }}>
              <td>${row.service}${row.note ? html`<div class="muted small">${row.note}</div>` : null}</td>
              <td>
                <select class="bdi-filter-input" value=${row.category || 'other'} onChange=${(e) => saveCost(row, { category: e.target.value })} style=${{ fontSize: '11.5px', padding: '2px 4px' }}>
                  ${CATS.map((cat) => html`<option key=${cat} value=${cat}>${cat}</option>`)}
                </select>
              </td>
              <td style=${{ textAlign: 'right' }}>
                <input type="number" value=${row.monthly_amount} min="0" step="1"
                  onBlur=${(e) => { const v = Number(e.target.value); if (v !== Number(row.monthly_amount)) saveCost(row, { monthly_amount: v }); }}
                  style=${{ width: '90px', textAlign: 'right', background: 'rgba(255,255,255,.04)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text)', padding: '3px 6px', fontSize: '12px' }} />
              </td>
              <td>
                <select class="bdi-filter-input" value=${row.currency || 'USD'} onChange=${(e) => saveCost(row, { currency: e.target.value })} style=${{ fontSize: '11.5px', padding: '2px 4px' }}>
                  ${['USD', 'QAR', 'EUR', 'GBP'].map((cu) => html`<option key=${cu} value=${cu}>${cu}</option>`)}
                </select>
              </td>
              <td><input type="checkbox" checked=${row.active} onChange=${(e) => saveCost(row, { active: e.target.checked })} /></td>
              <td><button onClick=${() => delCost(row.id)} title="Remove" style=${{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button></td>
            </tr>`)}
          </tbody>
        </table>`, `Foreign amounts converted to QAR for totals. ${econ.fx_note}`)}

      <div style=${{ height: '12px' }}></div>
      ${card('Scale — what the spend maintains', html`
        <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
          ${[['Active companies', s.active_companies], ['Total companies', s.total_companies], ['People', s.people], ['Open jobs', s.jobs], ['Research jobs', s.research_jobs]].map(([label, val]) => html`
            <div key=${label}><div style=${{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>${Number(val || 0).toLocaleString()}</div><div class="muted small">${label}</div></div>`)}
        </div>`)}

      <div class="muted small" style=${{ marginTop: '14px', lineHeight: 1.5 }}>
        Revenue is the sum of active tenants × their plan price. Burn is your recorded monthly service costs (converted to QAR) plus the API spend Bell meters. Enter each service's real monthly figure above to make the margin exact.
      </div>
    </div></div>`;
}

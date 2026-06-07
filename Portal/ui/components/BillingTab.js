// System → Billing. Left rail (Overview / Invoices) + body, matching the Bell
// settings vibe (.settings-shell). Subscription + credits/usage from our DB,
// invoices from Stripe, and the Stripe Customer Portal for payment management.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'invoices', label: 'Invoices & receipts' },
];
const REASONS = {
  monthly_grant: 'Monthly grant', reveal_company: 'Revealed a company',
  reveal_person: 'Revealed a person', bulk_reveal: 'Bulk reveal',
  admin_adjust: 'Adjustment', research: 'Research',
};
const STATUS_COLOR = {
  active: 'var(--green)', trialing: 'var(--accent-bright)', past_due: 'var(--amber)',
  canceled: 'var(--red)', paid: 'var(--green)', open: 'var(--amber)', void: 'var(--text-muted)',
};
const money = (minor, ccy) => `${ccy || 'QAR'} ${((Number(minor) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const pill = (st) => html`<span style=${{ padding: '2px 9px', borderRadius: '10px', fontSize: '12px', fontWeight: 600,
  color: STATUS_COLOR[st] || 'var(--text-muted)', border: '1px solid ' + (STATUS_COLOR[st] || 'var(--border)') }}>${(st || 'none').replace('_', ' ')}</span>`;

export function BillingTab() {
  const [section, setSection] = useState('overview');
  const [sub, setSub] = useState(null);
  const [usage, setUsage] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => { (async () => {
    try {
      const [s, u, inv] = await Promise.all([
        api.billingSubscription().catch(() => null),
        api.billingUsage().catch(() => null),
        api.billingInvoices().catch(() => ({ invoices: [] })),
      ]);
      setSub(s); setUsage(u); setInvoices(inv?.invoices || []);
    } finally { setLoading(false); }
  })(); }, []);

  const openPortal = async () => {
    setPortalBusy(true);
    try { const { url } = await api.billingPortal(); if (url) window.location.href = url; }
    catch (e) { toast(e.body?.detail || 'Subscribe first to manage billing.', 'error'); }
    finally { setPortalBusy(false); }
  };

  if (loading) return html`<div class="settings-shell"><div class="empty">Loading billing…</div></div>`;

  const pct = usage && usage.allotment ? Math.min(100, Math.round((usage.used_this_cycle / usage.allotment) * 100)) : 0;
  const val = { color: 'var(--text)', fontWeight: 600 };

  const overview = html`
    <div class="card">
      <h2>Plan</h2>
      <div class="row"><label>Current plan</label><span style=${val}>${sub?.plan_label || sub?.plan || 'No plan'}</span> ${pill(sub?.subscription_status)}</div>
      ${sub?.plan_renewed_at ? html`<div class="row"><label>Renews</label><span>${fmtDate(sub.plan_renewed_at)}</span></div>` : null}
      ${sub?.plan_expires_at ? html`<div class="row"><label>Expires</label><span>${fmtDate(sub.plan_expires_at)}</span></div>` : null}
      <div class="row"><label></label>
        <button onClick=${() => (window.location.href = '/subscribe')}>Change plan</button>
        <button class="danger" style=${{ color: 'var(--text)', borderColor: 'var(--border)' }} disabled=${portalBusy} onClick=${openPortal}>${portalBusy ? 'Opening…' : 'Manage billing'}</button>
      </div>
      <div class="hint">Manage billing opens Stripe for your payment method, tax details, plan changes, and cancellation.</div>
    </div>

    <div class="card">
      <h2>Credits & usage</h2>
      <div class="row"><label>Balance</label><span style=${val}>${(usage?.balance ?? 0).toLocaleString()}</span></div>
      <div class="row"><label>Used this cycle</label><span>${(usage?.used_this_cycle ?? 0).toLocaleString()}</span></div>
      <div class="row"><label>Monthly allotment</label><span>${usage?.allotment ? usage.allotment.toLocaleString() : '—'}</span></div>
      <div class="row"><label>Renews / resets</label><span>${fmtDate(usage?.cycle_reset)}</span></div>
      ${usage?.allotment ? html`
        <div style=${{ height: '8px', background: 'var(--bg-elev-2)', borderRadius: '999px', overflow: 'hidden', margin: '12px 0 4px' }}>
          <div style=${{ width: pct + '%', height: '100%', background: 'var(--accent)' }}></div>
        </div>` : null}

      <div style=${{ marginTop: '16px' }}>
        <div class="hint" style=${{ marginBottom: '6px' }}>Recent activity</div>
        ${(usage?.entries || []).length === 0
          ? html`<div class="hint">No activity yet.</div>`
          : usage.entries.slice(0, 12).map((e, i) => html`
              <div key=${i} style=${{ display: 'grid', gridTemplateColumns: '1fr auto 110px', gap: '12px', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--border)', fontSize: '13px' }}>
                <span>${REASONS[e.reason] || e.reason}</span>
                <span style=${{ color: e.delta < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>${e.delta > 0 ? '+' : ''}${e.delta.toLocaleString()}</span>
                <span style=${{ color: 'var(--text-muted)', textAlign: 'right' }}>${fmtDate(e.created_at)}</span>
              </div>`)}
      </div>
    </div>`;

  const invoicesPage = html`
    <div class="card">
      <h2>Invoices & receipts</h2>
      ${invoices.length === 0
        ? html`<div class="hint">No invoices yet — they'll appear here after your first payment.</div>`
        : html`<table style=${{ width: '100%', borderCollapse: 'collapse', marginTop: '6px', fontSize: '13px' }}>
            <thead><tr style=${{ color: 'var(--text-muted)', textAlign: 'left' }}>
              <th style=${th}>Date</th><th style=${th}>Invoice</th><th style=${th}>Amount</th><th style=${th}>Status</th><th style=${th}></th>
            </tr></thead>
            <tbody>
              ${invoices.map(inv => html`
                <tr key=${inv.id} style=${{ borderTop: '1px solid var(--border)' }}>
                  <td style=${td}>${fmtDate(inv.created)}</td>
                  <td style=${td}>${inv.number || inv.id}</td>
                  <td style=${td}>${money(inv.amount_paid || inv.total, inv.currency)}</td>
                  <td style=${td}>${pill(inv.status)}</td>
                  <td style=${{ ...td, textAlign: 'right' }}>
                    ${inv.invoice_pdf ? html`<a class="linkbtn" href=${inv.invoice_pdf} target="_blank" rel="noopener">PDF</a>` : ''}
                    ${inv.hosted_invoice_url ? html` <a class="linkbtn" href=${inv.hosted_invoice_url} target="_blank" rel="noopener">View</a>` : ''}
                  </td>
                </tr>`)}
            </tbody>
          </table>`}
      <div class="hint" style=${{ marginTop: '12px' }}>Full archive, payment method and tax details: <a class="linkbtn" onClick=${openPortal}>Manage billing</a>.</div>
    </div>`;

  return html`
    <div class="settings-shell">
      <div class="settings-rail">
        <div class="settings-rail-title">Billing</div>
        ${SECTIONS.map(s => html`
          <button key=${s.id} class=${'settings-rail-item' + (section === s.id ? ' active' : '')}
            onClick=${() => setSection(s.id)}>${s.label}</button>`)}
      </div>
      <div class="settings-body">
        ${section === 'overview' ? overview : invoicesPage}
      </div>
    </div>`;
}

const th = { padding: '6px 8px', fontWeight: 600, fontSize: '12px' };
const td = { padding: '8px' };

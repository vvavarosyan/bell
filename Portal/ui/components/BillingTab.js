// System → Billing. Single full-bleed scrolling page (plan, credits & usage,
// invoices). Subscription/usage from our DB, invoices from Stripe, payment
// management via the Stripe Customer Portal.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const REASONS = {
  monthly_grant: 'Monthly grant', reveal_company: 'Revealed a company',
  reveal_person: 'Revealed a person', bulk_reveal: 'Bulk reveal',
  admin_adjust: 'Adjustment', research: 'Research',
};
const STATUS_COLOR = {
  active: 'var(--green)', trialing: 'var(--accent-bright)', past_due: 'var(--amber)',
  canceled: 'var(--red)', paid: 'var(--green)', open: 'var(--amber)', void: 'var(--text-muted)',
};
const money = (m, c) => `${c || 'QAR'} ${((Number(m) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const pill = (st) => html`<span class="sys-pill" style=${{ color: STATUS_COLOR[st] || 'var(--text-muted)', borderColor: STATUS_COLOR[st] || 'var(--border)' }}>${(st || 'none').replace('_', ' ')}</span>`;

export function BillingTab() {
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

  if (loading) return html`<div class="sys-page"><div class="sys-body"><div class="empty">Loading billing…</div></div></div>`;

  const pct = usage && usage.allotment ? Math.min(100, Math.round((usage.used_this_cycle / usage.allotment) * 100)) : 0;

  return html`
    <div class="sys-page">
      <div class="sys-body">

        <div class="sys-section">
          <h2>Plan</h2>
          <div class="sys-kv"><span class="k">Current plan</span><span class="v">${sub?.plan_label || sub?.plan || 'No plan'}</span>${pill(sub?.subscription_status)}</div>
          ${sub?.plan_renewed_at ? html`<div class="sys-kv"><span class="k">Renews</span><span>${fmtDate(sub.plan_renewed_at)}</span></div>` : null}
          ${sub?.plan_expires_at ? html`<div class="sys-kv"><span class="k">Expires</span><span>${fmtDate(sub.plan_expires_at)}</span></div>` : null}
          <div class="sys-actions">
            <button class="sys-btn" onClick=${() => (window.location.href = '/subscribe')}>Change plan</button>
            <button class="sys-btn sys-btn-secondary" disabled=${portalBusy} onClick=${openPortal}>${portalBusy ? 'Opening…' : 'Manage billing'}</button>
          </div>
          <div class="sys-hint" style=${{ marginTop: '12px', marginBottom: 0 }}>Manage billing opens Stripe for your payment method, tax details, plan changes, and cancellation.</div>
        </div>

        <div class="sys-section">
          <h2>Credits & usage</h2>
          <div class="sys-kv"><span class="k">Balance</span><span class="v">${(usage?.balance ?? 0).toLocaleString()}</span></div>
          <div class="sys-kv"><span class="k">Used this cycle</span><span>${(usage?.used_this_cycle ?? 0).toLocaleString()}</span></div>
          <div class="sys-kv"><span class="k">Monthly allotment</span><span>${usage?.allotment ? usage.allotment.toLocaleString() : '—'}</span></div>
          <div class="sys-kv"><span class="k">Renews / resets</span><span>${fmtDate(usage?.cycle_reset)}</span></div>
          ${usage?.allotment ? html`<div class="sys-bar"><span style=${{ width: pct + '%' }}></span></div>` : null}

          <div style=${{ marginTop: '18px', maxWidth: '640px' }}>
            <div class="sys-hint" style=${{ marginBottom: '4px' }}>Recent activity</div>
            ${(usage?.entries || []).length === 0
              ? html`<div class="sys-hint">No activity yet.</div>`
              : usage.entries.slice(0, 14).map((e, i) => html`
                  <div key=${i} style=${{ display: 'grid', gridTemplateColumns: '1fr auto 120px', gap: '12px', alignItems: 'center', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: '13px' }}>
                    <span>${REASONS[e.reason] || e.reason}</span>
                    <span style=${{ color: e.delta < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>${e.delta > 0 ? '+' : ''}${e.delta.toLocaleString()}</span>
                    <span style=${{ color: 'var(--text-muted)', textAlign: 'right' }}>${fmtDate(e.created_at)}</span>
                  </div>`)}
          </div>
        </div>

        <div class="sys-section">
          <h2>Invoices & receipts</h2>
          ${invoices.length === 0
            ? html`<div class="sys-hint">No invoices yet — they'll appear here after your first payment.</div>`
            : html`<table class="sys-table">
                <thead><tr><th>Date</th><th>Invoice</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  ${invoices.map(inv => html`
                    <tr key=${inv.id}>
                      <td>${fmtDate(inv.created)}</td>
                      <td>${inv.number || inv.id}</td>
                      <td>${money(inv.amount_paid || inv.total, inv.currency)}</td>
                      <td>${pill(inv.status)}</td>
                      <td style=${{ textAlign: 'right' }}>
                        ${inv.invoice_pdf ? html`<a class="linkbtn" href=${inv.invoice_pdf} target="_blank" rel="noopener">PDF</a>` : ''}
                        ${inv.hosted_invoice_url ? html` <a class="linkbtn" href=${inv.hosted_invoice_url} target="_blank" rel="noopener">View</a>` : ''}
                      </td>
                    </tr>`)}
                </tbody>
              </table>`}
          <div class="sys-hint" style=${{ marginTop: '14px', marginBottom: 0 }}>Full archive, payment method and tax details: <a class="linkbtn" onClick=${openPortal}>Manage billing</a>.</div>
        </div>

      </div>
    </div>`;
}

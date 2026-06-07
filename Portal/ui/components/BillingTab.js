// System → Billing. Subscription summary, credits & usage (from the ledger),
// invoices/receipts (from Stripe), and the Stripe Customer Portal for managing
// payment method / plan / cancellation.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const card = {
  background: 'var(--bg-elev)', border: '1px solid var(--border)',
  borderRadius: '12px', padding: '20px', marginBottom: '16px',
};
const label = { color: 'var(--text-muted)', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' };
const money = (minor, ccy) => `${ccy || 'QAR'} ${((Number(minor) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const fmtDate = (s) => s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';

const REASONS = {
  monthly_grant: 'Monthly grant', reveal_company: 'Revealed a company',
  reveal_person: 'Revealed a person', bulk_reveal: 'Bulk reveal',
  admin_adjust: 'Adjustment', research: 'Research',
};
const STATUS_COLORS = {
  active: 'var(--green)', trialing: 'var(--accent-bright)', past_due: 'var(--amber)',
  canceled: 'var(--red)', paid: 'var(--green)', open: 'var(--amber)', void: 'var(--text-muted)',
};

export function BillingTab() {
  const [sub, setSub] = useState(null);
  const [usage, setUsage] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [s, u, inv] = await Promise.all([
          api.billingSubscription().catch(() => null),
          api.billingUsage().catch(() => null),
          api.billingInvoices().catch(() => ({ invoices: [] })),
        ]);
        setSub(s); setUsage(u); setInvoices(inv?.invoices || []);
      } finally { setLoading(false); }
    })();
  }, []);

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const { url } = await api.billingPortal();
      if (url) window.location.href = url;
    } catch (e) {
      toast(e.body?.detail || 'Open billing portal failed — subscribe first.', 'error');
    } finally { setPortalBusy(false); }
  };

  if (loading) return html`<div style=${{ padding: '24px', color: 'var(--text-muted)' }}>Loading billing…</div>`;

  const statusBadge = (st) => html`
    <span style=${{ display: 'inline-block', padding: '2px 10px', borderRadius: '999px', fontSize: '12px',
      fontWeight: 600, color: '#fff', background: STATUS_COLORS[st] || 'var(--text-muted)' }}>
      ${(st || 'none').replace('_', ' ')}
    </span>`;

  const pct = usage && usage.allotment ? Math.min(100, Math.round((usage.used_this_cycle / usage.allotment) * 100)) : 0;

  return html`
    <div style=${{ maxWidth: '900px', padding: '8px 4px' }}>

      <!-- Plan -->
      <div style=${card}>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <div style=${label}>Current plan</div>
            <div style=${{ fontSize: '24px', fontWeight: 700, margin: '4px 0' }}>
              ${sub?.plan_label || sub?.plan || 'No plan'} ${' '} ${statusBadge(sub?.subscription_status)}
            </div>
            <div style=${{ color: 'var(--text-muted)', fontSize: '13px' }}>
              ${sub?.plan_renewed_at ? `Renews ${fmtDate(sub.plan_renewed_at)}` : ''}
              ${sub?.plan_expires_at ? ` · Expires ${fmtDate(sub.plan_expires_at)}` : ''}
            </div>
          </div>
          <div style=${{ display: 'flex', gap: '8px' }}>
            <button class="btn" style=${btnSecondary} onClick=${() => (window.location.href = '/subscribe')}>Change plan</button>
            <button class="btn" style=${btnPrimary} disabled=${portalBusy} onClick=${openPortal}>
              ${portalBusy ? 'Opening…' : 'Manage billing'}
            </button>
          </div>
        </div>
      </div>

      <!-- Credits & usage -->
      <div style=${card}>
        <div style=${label}>Credits & usage</div>
        <div style=${{ display: 'flex', gap: '28px', margin: '10px 0 14px', flexWrap: 'wrap' }}>
          <div><div style=${big}>${(usage?.balance ?? 0).toLocaleString()}</div><div style=${sub2}>balance</div></div>
          <div><div style=${big}>${(usage?.used_this_cycle ?? 0).toLocaleString()}</div><div style=${sub2}>used this cycle</div></div>
          <div><div style=${big}>${usage?.allotment ? usage.allotment.toLocaleString() : '—'}</div><div style=${sub2}>monthly allotment</div></div>
          <div><div style=${big}>${fmtDate(usage?.cycle_reset)}</div><div style=${sub2}>renews / resets</div></div>
        </div>
        ${usage?.allotment ? html`
          <div style=${{ height: '8px', background: 'var(--bg)', borderRadius: '999px', overflow: 'hidden' }}>
            <div style=${{ width: pct + '%', height: '100%', background: 'var(--accent-bright)' }}></div>
          </div>` : null}

        <div style=${{ marginTop: '16px' }}>
          <div style=${label}>Recent activity</div>
          ${(usage?.entries || []).length === 0
            ? html`<div style=${{ color: 'var(--text-muted)', padding: '8px 0', fontSize: '13px' }}>No activity yet.</div>`
            : html`<div style=${{ marginTop: '8px' }}>
                ${usage.entries.slice(0, 12).map((e, i) => html`
                  <div key=${i} style=${ledgerRow}>
                    <span>${REASONS[e.reason] || e.reason}</span>
                    <span style=${{ color: e.delta < 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>
                      ${e.delta > 0 ? '+' : ''}${e.delta.toLocaleString()}
                    </span>
                    <span style=${{ color: 'var(--text-muted)', fontSize: '12px' }}>${fmtDate(e.created_at)}</span>
                  </div>`)}
              </div>`}
        </div>
      </div>

      <!-- Invoices -->
      <div style=${card}>
        <div style=${label}>Invoices & receipts</div>
        ${invoices.length === 0
          ? html`<div style=${{ color: 'var(--text-muted)', padding: '10px 0', fontSize: '13px' }}>No invoices yet. They'll appear here after your first payment.</div>`
          : html`<table style=${{ width: '100%', borderCollapse: 'collapse', marginTop: '10px', fontSize: '14px' }}>
              <thead><tr style=${{ color: 'var(--text-muted)', textAlign: 'left', fontSize: '12px' }}>
                <th style=${th}>Date</th><th style=${th}>Invoice</th><th style=${th}>Amount</th><th style=${th}>Status</th><th style=${th}></th>
              </tr></thead>
              <tbody>
                ${invoices.map(inv => html`
                  <tr key=${inv.id} style=${{ borderTop: '1px solid var(--border)' }}>
                    <td style=${td}>${fmtDate(inv.created)}</td>
                    <td style=${td}>${inv.number || inv.id}</td>
                    <td style=${td}>${money(inv.amount_paid || inv.total, inv.currency)}</td>
                    <td style=${td}>${statusBadge(inv.status)}</td>
                    <td style=${{ ...td, textAlign: 'right' }}>
                      ${inv.invoice_pdf ? html`<a href=${inv.invoice_pdf} target="_blank" rel="noopener" style=${linkStyle}>PDF</a>` : ''}
                      ${inv.hosted_invoice_url ? html` · <a href=${inv.hosted_invoice_url} target="_blank" rel="noopener" style=${linkStyle}>View</a>` : ''}
                    </td>
                  </tr>`)}
              </tbody>
            </table>`}
        <div style=${{ marginTop: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
          Need payment method, tax details, or the full archive? Use <a style=${linkStyle} onClick=${openPortal}>Manage billing</a>.
        </div>
      </div>
    </div>`;
}

const btnPrimary = { background: 'var(--accent-bright)', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 };
const btnSecondary = { background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' };
const big = { fontSize: '22px', fontWeight: 700 };
const sub2 = { color: 'var(--text-muted)', fontSize: '12px' };
const ledgerRow = { display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '14px', alignItems: 'center', padding: '6px 0', borderTop: '1px solid var(--border)', fontSize: '13px' };
const th = { padding: '6px 8px', fontWeight: 600 };
const td = { padding: '8px' };
const linkStyle = { color: 'var(--accent-bright)', cursor: 'pointer', textDecoration: 'none' };

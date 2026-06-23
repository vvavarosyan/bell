// System → Billing. Plan up/downgrade, buy extra credits (in-app Stripe
// Payment Element — the user never leaves Bell), credits & usage, invoices,
// and a payment-status banner with a 24h freeze warning. Subscription/usage
// from our DB, invoices from Stripe, card management via the Customer Portal.

import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const REASONS = {
  monthly_grant: 'Monthly grant', reveal_company: 'Revealed a company',
  reveal_person: 'Revealed a person', bulk_reveal: 'Bulk reveal',
  admin_adjust: 'Adjustment', research: 'Research', credit_purchase: 'Credit purchase',
};
const STATUS_COLOR = {
  active: 'var(--green)', trialing: 'var(--accent-bright)', past_due: 'var(--amber)',
  canceled: 'var(--red)', paid: 'var(--green)', open: 'var(--amber)', void: 'var(--text-muted)',
};
const money = (m, c) => `${c || 'QAR'} ${((Number(m) || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
const qar = (n) => `QAR ${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 })}`;
const fmtDate = (s) => s ? new Date(s).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const pill = (st) => html`<span class="sys-pill" style=${{ color: STATUS_COLOR[st] || 'var(--text-muted)', borderColor: STATUS_COLOR[st] || 'var(--border)' }}>${(st || 'none').replace('_', ' ')}</span>`;

// Load Stripe.js once and return a Stripe instance for the publishable key.
let _stripePromise = null;
function loadStripe(pk) {
  if (_stripePromise) return _stripePromise;
  _stripePromise = new Promise((resolve, reject) => {
    if (window.Stripe) return resolve(window.Stripe(pk));
    const s = document.createElement('script');
    s.src = 'https://js.stripe.com/v3/'; s.async = true;
    s.onload = () => resolve(window.Stripe(pk));
    s.onerror = () => reject(new Error('stripe_js_failed'));
    document.head.appendChild(s);
  });
  return _stripePromise;
}
const STRIPE_APPEARANCE = {
  theme: 'night', labels: 'above',
  variables: { colorPrimary: '#5b8cff', colorBackground: 'rgba(255,255,255,0.03)', colorText: '#e6e9ef', colorTextSecondary: '#8a93a6', borderRadius: '8px', fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
};

// In-app card payment for a credit top-up (Stripe Payment Element).
function CreditCheckout({ pk, clientSecret, label, onSuccess, onCancel }) {
  const elRef = useRef(null);
  const ref = useRef({ stripe: null, elements: null, pe: null });
  const [ready, setReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const stripe = await loadStripe(pk);
        if (dead) return;
        const elements = stripe.elements({ clientSecret, appearance: STRIPE_APPEARANCE, loader: 'auto' });
        const pe = elements.create('payment', { layout: { type: 'tabs', defaultCollapsed: false } });
        ref.current = { stripe, elements, pe };
        if (elRef.current) { pe.mount(elRef.current); setReady(true); }
      } catch { setErr('Could not load the secure payment field. Please try again.'); }
    })();
    return () => { dead = true; try { ref.current.pe?.unmount(); ref.current.pe?.destroy(); } catch { /* ignore */ } };
  }, [clientSecret, pk]);

  const pay = async () => {
    const { stripe, elements } = ref.current;
    if (!stripe || !elements) return;
    setPaying(true); setErr('');
    const { error, paymentIntent } = await stripe.confirmPayment({ elements, redirect: 'if_required' });
    if (error) { setErr(error.message || 'Payment failed. Please check your card and try again.'); setPaying(false); return; }
    if (paymentIntent && paymentIntent.status === 'succeeded') { onSuccess(); return; }
    setErr('Payment did not complete. Please try again.'); setPaying(false);
  };

  return html`
    <div style=${{ marginTop: '12px', border: '1px solid var(--accent)', borderRadius: '10px', padding: '14px', background: 'rgba(91,140,255,0.04)' }}>
      <div style=${{ fontWeight: 600, fontSize: '13px', marginBottom: '10px', color: 'var(--text)' }}>${label}</div>
      <div ref=${elRef}></div>
      ${!ready && !err ? html`<div class="sys-hint" style=${{ marginTop: 0 }}>Loading secure payment field…</div>` : null}
      ${err ? html`<div style=${{ color: 'var(--red)', fontSize: '12.5px', marginTop: '8px' }}>${err}</div>` : null}
      <div style=${{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button class="sys-btn" disabled=${!ready || paying} onClick=${pay}>${paying ? 'Processing…' : 'Pay now'}</button>
        <button class="sys-btn sys-btn-secondary" disabled=${paying} onClick=${onCancel}>Cancel</button>
      </div>
      <div class="sys-hint" style=${{ marginTop: '8px', marginBottom: 0 }}>🔒 Encrypted by Stripe — Bell never sees your card details.</div>
    </div>`;
}

export function BillingTab() {
  const [sub, setSub] = useState(null);
  const [usage, setUsage] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [plans, setPlans] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [pk, setPk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [portalBusy, setPortalBusy] = useState(false);
  const [changing, setChanging] = useState(null);
  const [buyQty, setBuyQty] = useState('');
  const [buying, setBuying] = useState(false);
  const [checkout, setCheckout] = useState(null);

  useEffect(() => { (async () => {
    try {
      const [s, u, inv, pl, pr, mode] = await Promise.all([
        api.billingSubscription().catch(() => null),
        api.billingUsage().catch(() => null),
        api.billingInvoices().catch(() => ({ invoices: [] })),
        api.billingPlans().catch(() => ({ plans: [] })),
        api.billingCreditPricing().catch(() => null),
        fetch('/api/auth/mode').then(r => r.json()).catch(() => ({})),
      ]);
      setSub(s); setUsage(u); setInvoices(inv?.invoices || []);
      setPlans(pl?.plans || []); setPricing(pr); setPk(mode?.stripe_publishable_key || null);
    } finally { setLoading(false); }
  })(); }, []);

  if (loading) return html`<div class="sys-page"><div class="sys-body"><div class="empty">Loading billing…</div></div></div>`;

  const openPortal = async () => {
    setPortalBusy(true);
    try { const { url } = await api.billingPortal(); if (url) window.location.href = url; }
    catch (e) { toast(e.body?.detail || 'Subscribe first to manage billing.', 'error'); }
    finally { setPortalBusy(false); }
  };

  const reloadUsage = async () => {
    const [u, inv] = await Promise.all([api.billingUsage().catch(() => usage), api.billingInvoices().catch(() => ({ invoices }))]);
    setUsage(u); setInvoices(inv?.invoices || invoices);
    window.dispatchEvent(new Event('bdi:credits-changed'));
  };

  const changePlan = async (planId, kind) => {
    if (kind === 'down' && !window.confirm('Schedule a downgrade? You keep your current plan and credits until the end of this billing cycle, then renew on the lower plan.')) return;
    setChanging(planId);
    try {
      const r = await api.billingChangePlan(planId);
      if (r.change === 'upgrade') toast(r.credits_added > 0 ? `Upgraded — ${r.credits_added.toLocaleString()} credits added (prorated).` : 'Plan upgraded.');
      else if (r.change === 'downgrade') toast(`Downgrade scheduled${r.effective ? ' for ' + new Date(r.effective).toLocaleDateString() : ' at next renewal'}.`);
      else if (r.canceled_downgrade) toast('Scheduled downgrade canceled — staying on your current plan.');
      else toast('Plan updated.');
      const [s, u] = await Promise.all([api.billingSubscription().catch(() => sub), api.billingUsage().catch(() => usage)]);
      setSub(s); setUsage(u); window.dispatchEvent(new Event('bdi:credits-changed'));
    } catch (e) { toast(e.body?.detail || e.body?.error || e.message || 'Plan change failed', 'error'); }
    finally { setChanging(null); }
  };

  const quote = (raw) => {
    if (!pricing) return null;
    const n = Math.floor(Number(raw));
    if (!Number.isFinite(n) || n <= 0) return null;
    if (n < pricing.min) return { error: `Minimum is ${pricing.min.toLocaleString()} credits` };
    if (n > pricing.max) return { error: `Maximum is ${pricing.max.toLocaleString()} credits` };
    let rate = pricing.tiers[pricing.tiers.length - 1].rate;
    for (const t of pricing.tiers) { if (n <= t.upTo) { rate = t.rate; break; } }
    return { credits: n, rate, total: Math.round(n * rate * 100) / 100 };
  };

  const startCheckout = async () => {
    const q = quote(buyQty);
    if (!q) { toast(`Enter how many credits to buy (min ${pricing?.min?.toLocaleString() || 500}).`, 'error'); return; }
    if (q.error) { toast(q.error, 'error'); return; }
    if (!pk) { toast('Card payments are not configured on this server yet.', 'error'); return; }
    setBuying(true);
    try {
      const r = await api.billingBuyCredits(q.credits);
      if (!r.client_secret) { toast('Could not start the payment. Please try again.', 'error'); return; }
      setCheckout({ client_secret: r.client_secret, payment_intent_id: r.payment_intent_id, credits: q.credits, total: q.total });
    } catch (e) {
      const msg = e.body?.error === 'stripe_not_configured' ? 'Payments are not set up on this server yet.' : (e.body?.detail || e.message || 'Could not start payment');
      toast(msg, 'error');
    } finally { setBuying(false); }
  };

  const onPaid = async () => {
    const c = checkout;
    setCheckout(null); setBuyQty('');
    try { await api.billingBuyCreditsConfirm(c.payment_intent_id); } catch { /* webhook will still grant */ }
    toast(`Added ${c.credits.toLocaleString()} credits to your balance.`);
    await reloadUsage();
  };

  const pct = usage && usage.allotment ? Math.min(100, Math.round((usage.used_this_cycle / usage.allotment) * 100)) : 0;
  const currentPlanPrice = plans.find(p => p.id === sub?.plan)?.price_qar ?? 0;
  const hasActiveSub = !!sub && (sub.is_active || sub.subscription_status === 'past_due');
  const q = quote(buyQty);

  return html`
    <div class="sys-page">
      <div class="sys-body">

        ${sub && (sub.subscription_status === 'past_due' || sub.frozen) ? html`
          <div style=${{
            marginBottom: '18px', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap',
            border: '1px solid ' + (sub.frozen ? 'var(--red)' : 'var(--amber)'),
            background: sub.frozen ? 'rgba(229,83,75,0.10)' : 'rgba(245,158,11,0.10)',
          }}>
            <span style=${{ fontSize: '13px', color: 'var(--text)', flex: 1, minWidth: '240px' }}>
              ${sub.frozen
                ? html`<b style=${{ color: 'var(--red)' }}>Your account is frozen.</b> A subscription payment is overdue. Update your billing to restore full access.`
                : html`<b style=${{ color: 'var(--amber)' }}>Subscription payment failed.</b> Update your billing within <b>${sub.grace_hours_left ?? 24}h</b> or your account will be frozen.`}
            </span>
            <button class="sys-btn" disabled=${portalBusy} onClick=${openPortal}>${portalBusy ? 'Opening…' : 'Update billing'}</button>
          </div>` : null}

        <div class="sys-section">
          <h2>Plan</h2>
          <div class="sys-kv"><span class="k">Current plan</span><span class="v">${sub?.plan_label || sub?.plan || 'No plan'}</span>${pill(sub?.subscription_status)}</div>
          ${sub?.plan_renewed_at ? html`<div class="sys-kv"><span class="k">Renews</span><span>${fmtDate(sub.plan_renewed_at)}</span></div>` : null}
          ${sub?.plan_expires_at ? html`<div class="sys-kv"><span class="k">Period ends</span><span>${fmtDate(sub.plan_expires_at)}</span></div>` : null}

          ${sub?.pending_plan ? html`<div style=${{ marginTop: '12px', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--amber)', background: 'rgba(245,158,11,0.08)', fontSize: '12.5px', color: 'var(--text)' }}>
            Scheduled: your plan changes to <b>${sub.pending_plan_label}</b>${sub.plan_expires_at ? ' on ' + fmtDate(sub.plan_expires_at) : ' at the next renewal'}. You keep <b>${sub.plan_label}</b> and its credits until then.
          </div>` : null}
          <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginTop: '14px' }}>
            ${plans.map(p => {
              const current = p.id === sub?.plan;
              const pending = p.id === sub?.pending_plan;
              const isDown = hasActiveSub && p.price_qar < currentPlanPrice;
              const isUp = hasActiveSub && p.price_qar > currentPlanPrice;
              return html`<div key=${p.id} style=${{
                border: '1px solid ' + (current ? 'var(--accent)' : pending ? 'var(--amber)' : 'var(--border)'), borderRadius: '12px', padding: '16px',
                background: current ? 'rgba(91,140,255,0.06)' : 'var(--bg-elev, rgba(255,255,255,0.02))', display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                <div style=${{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style=${{ fontWeight: 700, fontSize: '15px', color: 'var(--text)' }}>${p.name}</span>
                  ${pending ? html`<span style=${{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--amber)', border: '1px solid var(--amber)', borderRadius: '4px', padding: '1px 5px' }}>Scheduled</span>` : null}
                </div>
                <div style=${{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>${qar(p.price_qar)}<span style=${{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 400 }}> / ${p.interval || 'month'}</span></div>
                <div style=${{ fontSize: '12px', color: 'var(--text-muted)' }}>${(p.credits || 0).toLocaleString()} credits / month</div>
                <div style=${{ flex: 1 }}></div>
                ${current
                  ? (sub?.pending_plan
                      ? html`<button class="sys-btn" disabled=${changing === p.id} onClick=${() => changePlan(p.id)}>${changing === p.id ? 'Updating…' : 'Keep this plan'}</button>`
                      : html`<button class="sys-btn sys-btn-secondary" disabled>Current plan</button>`)
                  : pending
                    ? html`<button class="sys-btn sys-btn-secondary" disabled>Scheduled for renewal</button>`
                    : !hasActiveSub
                      ? html`<button class="sys-btn" onClick=${() => (window.location.href = '/subscribe')}>Choose ${p.name}</button>`
                      : html`<button class="sys-btn ${isUp ? '' : 'sys-btn-secondary'}" disabled=${changing === p.id || !!sub?.pending_plan}
                          onClick=${() => changePlan(p.id, isDown ? 'down' : 'up')}>${changing === p.id ? 'Updating…' : (isUp ? 'Upgrade' : 'Downgrade')}</button>`}
              </div>`;
            })}
          </div>
          <div class="sys-actions" style=${{ marginTop: '14px' }}>
            <button class="sys-btn sys-btn-secondary" disabled=${portalBusy} onClick=${openPortal}>${portalBusy ? 'Opening…' : 'Manage billing & payment method'}</button>
          </div>
          <div class="sys-hint" style=${{ marginTop: '8px', marginBottom: 0 }}>Upgrades take effect immediately (prorated); downgrades apply from the change onward. Manage billing opens Stripe for your card, tax details, and cancellation.</div>
        </div>

        <div class="sys-section">
          <h2>Credits & usage</h2>
          <div class="sys-kv"><span class="k">Balance</span><span class="v">${(usage?.balance ?? 0).toLocaleString()}</span></div>
          <div class="sys-kv"><span class="k">Used this cycle</span><span>${(usage?.used_this_cycle ?? 0).toLocaleString()}</span></div>
          <div class="sys-kv"><span class="k">Monthly allotment</span><span>${usage?.allotment ? usage.allotment.toLocaleString() : '—'}</span></div>
          <div class="sys-kv"><span class="k">Renews / resets</span><span>${fmtDate(usage?.cycle_reset)}</span></div>
          ${usage?.allotment ? html`<div class="sys-bar"><span style=${{ width: pct + '%' }}></span></div>` : null}

          <div style=${{ marginTop: '18px', maxWidth: '560px', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style=${{ fontWeight: 600, fontSize: '14px', color: 'var(--text)', marginBottom: '4px' }}>Buy extra credits</div>
            <div class="sys-hint" style=${{ marginTop: 0 }}>Top up any time — paid right here, no leaving Bell. Bigger top-ups get a better rate; purchased credits roll over (they don't reset monthly).</div>
            ${checkout ? html`
              <${CreditCheckout} pk=${pk} clientSecret=${checkout.client_secret}
                label=${`${checkout.credits.toLocaleString()} credits — ${qar(checkout.total)}`}
                onSuccess=${onPaid} onCancel=${() => setCheckout(null)} />
            ` : html`
              <div style=${{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                <input class="sys-input" type="number" min=${pricing?.min || 500} max=${pricing?.max || 100000} step="100"
                  placeholder=${`Credits (min ${(pricing?.min || 500).toLocaleString()})`} value=${buyQty}
                  onInput=${e => setBuyQty(e.target.value)} style=${{ width: '180px' }} />
                <button class="sys-btn" disabled=${buying || !q || !!q?.error} onClick=${startCheckout}>${buying ? 'Starting…' : 'Buy credits'}</button>
              </div>
              <div style=${{ marginTop: '8px', fontSize: '13px', minHeight: '18px', color: q?.error ? 'var(--red)' : 'var(--text-muted)' }}>
                ${q?.error ? q.error
                  : q ? html`${q.credits.toLocaleString()} credits × ${qar(q.rate)}/credit = <b style=${{ color: 'var(--text)' }}>${qar(q.total)}</b>`
                  : (pricing ? html`Rate: up to 15,000 @ QAR 1.00 · 15k–60k @ QAR 0.75 · 60k+ @ QAR 0.50 per credit` : '')}
              </div>
            `}
          </div>

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
                        ${inv.hosted_invoice_url ? html` <a class="linkbtn" href=${inv.hosted_invoice_url} target="_blank" rel="noopener">${inv.kind === 'credit' ? 'Receipt' : 'View'}</a>` : ''}
                      </td>
                    </tr>`)}
                </tbody>
              </table>`}
          <div class="sys-hint" style=${{ marginTop: '14px', marginBottom: 0 }}>Subscription invoices are downloadable here. Credit top-ups get an emailed Stripe receipt and show under Recent activity. Full archive & tax details: <a class="linkbtn" onClick=${openPortal}>Manage billing</a>.</div>
        </div>

      </div>
    </div>`;
}

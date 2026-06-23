// System → Billing. Fully in-app: plan up/downgrade, buy extra credits, update
// card, cancel/resume — all without leaving Bell for the Stripe portal. Branded
// receipts for every charge. Subscription/usage from our DB; cards + receipts
// rendered from Stripe data we fetch server-side.

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
const cardBrand = (b) => ({ visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover' }[b] || (b ? b[0].toUpperCase() + b.slice(1) : 'Card'));
const pill = (st) => html`<span class="sys-pill" style=${{ color: STATUS_COLOR[st] || 'var(--text-muted)', borderColor: STATUS_COLOR[st] || 'var(--border)' }}>${(st || 'none').replace('_', ' ')}</span>`;

// Load Stripe.js once for a publishable key.
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

// Generic in-app Stripe Elements form. mode 'payment' (charge) or 'setup' (save card).
function StripeForm({ pk, clientSecret, mode, label, cta, onDone, onCancel }) {
  const elRef = useRef(null);
  const ref = useRef({ stripe: null, elements: null, pe: null });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
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

  const submit = async () => {
    const { stripe, elements } = ref.current;
    if (!stripe || !elements) return;
    setBusy(true); setErr('');
    const res = mode === 'setup'
      ? await stripe.confirmSetup({ elements, redirect: 'if_required' })
      : await stripe.confirmPayment({ elements, redirect: 'if_required' });
    if (res.error) { setErr(res.error.message || 'Failed — please check your card and try again.'); setBusy(false); return; }
    const obj = mode === 'setup' ? res.setupIntent : res.paymentIntent;
    if (obj && obj.status === 'succeeded') { onDone(obj); return; }
    setErr('Did not complete. Please try again.'); setBusy(false);
  };

  return html`
    <div style=${{ marginTop: '12px', border: '1px solid var(--accent)', borderRadius: '10px', padding: '14px', background: 'rgba(91,140,255,0.04)' }}>
      ${label ? html`<div style=${{ fontWeight: 600, fontSize: '13px', marginBottom: '10px', color: 'var(--text)' }}>${label}</div>` : null}
      <div ref=${elRef}></div>
      ${!ready && !err ? html`<div class="sys-hint" style=${{ marginTop: 0 }}>Loading secure payment field…</div>` : null}
      ${err ? html`<div style=${{ color: 'var(--red)', fontSize: '12.5px', marginTop: '8px' }}>${err}</div>` : null}
      <div style=${{ display: 'flex', gap: '8px', marginTop: '12px' }}>
        <button class="sys-btn" disabled=${!ready || busy} onClick=${submit}>${busy ? 'Processing…' : (cta || 'Confirm')}</button>
        <button class="sys-btn sys-btn-secondary" disabled=${busy} onClick=${onCancel}>Cancel</button>
      </div>
      <div class="sys-hint" style=${{ marginTop: '8px', marginBottom: 0 }}>🔒 Encrypted by Stripe — Bell never sees your card details.</div>
    </div>`;
}

// Open a branded, printable receipt/invoice for a row — rendered in-app, no Stripe.
function openReceipt(row, me) {
  const w = window.open('', '_blank');
  if (!w) { toast('Allow pop-ups to open the receipt.', 'error'); return; }
  const isCredit = row.kind === 'credit';
  const docType = isCredit ? 'Receipt' : 'Invoice';
  const amount = money(row.amount_paid || row.total, row.currency);
  const dt = row.created ? new Date(row.created).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
  const num = row.number || row.id;
  const name = me?.user?.full_name || '';
  const email = me?.user?.email || '';
  const company = me?.tenant?.name || me?.user?.tenant_name || '';
  const lineDesc = isCredit ? `Bell credit top-up — ${row.number}` : `Bell subscription — ${num}`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${docType} ${esc(num)} · Bell</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#111827; background:#f3f4f6; margin:0; padding:32px; }
    .doc { max-width:680px; margin:0 auto; background:#fff; border:1px solid #e5e7eb; border-radius:12px; padding:36px 40px; }
    .top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:28px; }
    .brand { display:flex; align-items:center; gap:10px; }
    .mark { width:34px; height:34px; border-radius:8px; background:linear-gradient(135deg,#5b8cff,#a5c3ff); color:#fff; font-weight:700; font-size:11px; display:flex; align-items:center; justify-content:center; letter-spacing:.06em; }
    .brand b { font-size:15px; }
    .brand small { display:block; color:#6b7280; font-size:11px; }
    h1 { font-size:20px; margin:0 0 2px; text-align:right; }
    .muted { color:#6b7280; font-size:12px; }
    .meta { display:flex; gap:40px; margin:18px 0 26px; flex-wrap:wrap; }
    .meta div b { display:block; font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:#9ca3af; margin-bottom:4px; }
    table { width:100%; border-collapse:collapse; margin:8px 0 0; }
    th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:#9ca3af; padding:8px 0; border-bottom:1px solid #e5e7eb; }
    td { padding:12px 0; border-bottom:1px solid #f3f4f6; font-size:13px; }
    td.r, th.r { text-align:right; }
    .total { display:flex; justify-content:flex-end; margin-top:18px; }
    .total .box { min-width:220px; }
    .total .row { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; }
    .total .grand { border-top:2px solid #111827; margin-top:6px; padding-top:10px; font-size:16px; font-weight:700; }
    .status { display:inline-block; padding:3px 10px; border-radius:999px; font-size:11px; font-weight:600; background:#dcfce7; color:#166534; }
    .foot { margin-top:30px; color:#9ca3af; font-size:11px; line-height:1.6; }
    .actions { max-width:680px; margin:18px auto 0; text-align:right; }
    button { background:#5b8cff; color:#fff; border:0; border-radius:8px; padding:10px 18px; font-size:13px; font-weight:600; cursor:pointer; }
    @media print { body { background:#fff; padding:0; } .doc { border:0; } .actions { display:none; } }
  </style></head><body>
    <div class="doc">
      <div class="top">
        <div class="brand"><div class="mark">BDI</div><div><b>Bell Data Intelligence</b><small>bell.qa</small></div></div>
        <div><h1>${docType}</h1><div class="muted">${esc(num)}</div></div>
      </div>
      <div class="meta">
        <div><b>Billed to</b>${company ? esc(company) + '<br>' : ''}${esc(name)}${name && email ? '<br>' : ''}${esc(email)}</div>
        <div><b>Date</b>${esc(dt)}</div>
        <div><b>Status</b><span class="status">${esc((row.status || 'paid').toUpperCase())}</span></div>
      </div>
      <table>
        <thead><tr><th>Description</th><th class="r">Amount</th></tr></thead>
        <tbody><tr><td>${esc(lineDesc)}</td><td class="r">${esc(amount)}</td></tr></tbody>
      </table>
      <div class="total"><div class="box">
        <div class="row"><span class="muted">Subtotal</span><span>${esc(amount)}</span></div>
        <div class="row grand"><span>Total paid</span><span>${esc(amount)}</span></div>
      </div></div>
      <div class="foot">Thank you for your business. This document was generated by Bell Data Intelligence.<br>Questions? Reply to your billing email or contact support.</div>
    </div>
    <div class="actions"><button onclick="window.print()">Download / Print PDF</button></div>
  </body></html>`);
  w.document.close();
}

export function BillingTab() {
  const [sub, setSub] = useState(null);
  const [usage, setUsage] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [plans, setPlans] = useState([]);
  const [pricing, setPricing] = useState(null);
  const [pk, setPk] = useState(null);
  const [me, setMe] = useState(null);
  const [card, setCard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState(null);
  const [buyQty, setBuyQty] = useState('');
  const [buying, setBuying] = useState(false);
  const [checkout, setCheckout] = useState(null);
  const [cardSetup, setCardSetup] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  useEffect(() => { (async () => {
    try {
      const [s, u, inv, pl, pr, mode, meR, pm] = await Promise.all([
        api.billingSubscription().catch(() => null),
        api.billingUsage().catch(() => null),
        api.billingInvoices().catch(() => ({ invoices: [] })),
        api.billingPlans().catch(() => ({ plans: [] })),
        api.billingCreditPricing().catch(() => null),
        fetch('/api/auth/mode').then(r => r.json()).catch(() => ({})),
        api.authMe().catch(() => null),
        api.billingPaymentMethod().catch(() => ({ card: null })),
      ]);
      setSub(s); setUsage(u); setInvoices(inv?.invoices || []);
      setPlans(pl?.plans || []); setPricing(pr); setPk(mode?.stripe_publishable_key || null);
      setMe(meR); setCard(pm?.card || null);
    } finally { setLoading(false); }
  })(); }, []);

  if (loading) return html`<div class="sys-page"><div class="sys-body"><div class="empty">Loading billing…</div></div></div>`;

  const reloadSub = async () => { const s = await api.billingSubscription().catch(() => sub); setSub(s); };
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
      toast(e.body?.error === 'stripe_not_configured' ? 'Payments are not set up on this server yet.' : (e.body?.detail || e.message || 'Could not start payment'), 'error');
    } finally { setBuying(false); }
  };

  const onPaid = async () => {
    const c = checkout; setCheckout(null); setBuyQty('');
    try { await api.billingBuyCreditsConfirm(c.payment_intent_id); } catch { /* webhook will grant */ }
    toast(`Added ${c.credits.toLocaleString()} credits to your balance.`);
    await reloadUsage();
  };

  const startCardUpdate = async () => {
    if (!pk) { toast('Card payments are not configured on this server yet.', 'error'); return; }
    try {
      const r = await api.billingPmSetup();
      if (!r.client_secret) { toast('Could not start card update.', 'error'); return; }
      setCardSetup({ client_secret: r.client_secret });
    } catch (e) { toast(e.body?.detail || e.message || 'Could not start card update', 'error'); }
  };
  const onCardSaved = async (si) => {
    setCardSetup(null);
    try { await api.billingPmDefault(si.payment_method); } catch { /* best effort */ }
    const pm = await api.billingPaymentMethod().catch(() => ({ card: null }));
    setCard(pm?.card || null);
    toast('Card updated.');
  };

  const doCancel = async () => {
    if (!window.confirm('Cancel your subscription? You keep access until the end of the current period, and you can resume any time before then.')) return;
    setCancelBusy(true);
    try { const r = await api.billingCancel(); toast(`Subscription will cancel${r.cancels_at ? ' on ' + new Date(r.cancels_at).toLocaleDateString() : ' at period end'}.`); await reloadSub(); }
    catch (e) { toast(e.body?.detail || e.message || 'Cancel failed', 'error'); }
    finally { setCancelBusy(false); }
  };
  const doResume = async () => {
    setCancelBusy(true);
    try { await api.billingResume(); toast('Subscription resumed — it will keep renewing.'); await reloadSub(); }
    catch (e) { toast(e.body?.detail || e.message || 'Resume failed', 'error'); }
    finally { setCancelBusy(false); }
  };

  const pct = usage && usage.allotment ? Math.min(100, Math.round((usage.used_this_cycle / usage.allotment) * 100)) : 0;
  const currentPlanPrice = plans.find(p => p.id === sub?.plan)?.price_qar ?? 0;
  const hasActiveSub = !!sub && (sub.is_active || sub.subscription_status === 'past_due');
  const q = quote(buyQty);

  return html`
    <div class="sys-page">
      <div class="sys-body">

        ${sub && (sub.subscription_status === 'past_due' || sub.frozen) ? html`
          <div style=${{ marginBottom: '18px', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', border: '1px solid ' + (sub.frozen ? 'var(--red)' : 'var(--amber)'), background: sub.frozen ? 'rgba(229,83,75,0.10)' : 'rgba(245,158,11,0.10)' }}>
            <span style=${{ fontSize: '13px', color: 'var(--text)', flex: 1, minWidth: '240px' }}>
              ${sub.frozen
                ? html`<b style=${{ color: 'var(--red)' }}>Your account is frozen.</b> A subscription payment is overdue — update your card to restore access.`
                : html`<b style=${{ color: 'var(--amber)' }}>Subscription payment failed.</b> Update your card within <b>${sub.grace_hours_left ?? 24}h</b> or your account will be frozen.`}
            </span>
            <button class="sys-btn" onClick=${startCardUpdate}>Update card</button>
          </div>` : null}

        ${sub?.cancel_at_period_end ? html`
          <div style=${{ marginBottom: '18px', padding: '12px 16px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', border: '1px solid var(--amber)', background: 'rgba(245,158,11,0.10)' }}>
            <span style=${{ fontSize: '13px', color: 'var(--text)', flex: 1, minWidth: '240px' }}>Your subscription is set to cancel${sub.plan_expires_at ? ' on ' + fmtDate(sub.plan_expires_at) : ' at period end'}. You keep access until then.</span>
            <button class="sys-btn" disabled=${cancelBusy} onClick=${doResume}>${cancelBusy ? '…' : 'Resume subscription'}</button>
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
              return html`<div key=${p.id} style=${{ border: '1px solid ' + (current ? 'var(--accent)' : pending ? 'var(--amber)' : 'var(--border)'), borderRadius: '12px', padding: '16px', background: current ? 'rgba(91,140,255,0.06)' : 'var(--bg-elev, rgba(255,255,255,0.02))', display: 'flex', flexDirection: 'column', gap: '8px' }}>
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
                      : html`<button class="sys-btn ${isUp ? '' : 'sys-btn-secondary'}" disabled=${changing === p.id || !!sub?.pending_plan} onClick=${() => changePlan(p.id, isDown ? 'down' : 'up')}>${changing === p.id ? 'Updating…' : (isUp ? 'Upgrade' : 'Downgrade')}</button>`}
              </div>`;
            })}
          </div>
          ${hasActiveSub && !sub?.cancel_at_period_end ? html`<div class="sys-actions" style=${{ marginTop: '14px' }}>
            <button class="sys-btn sys-btn-secondary" style=${{ color: 'var(--red)' }} disabled=${cancelBusy} onClick=${doCancel}>${cancelBusy ? '…' : 'Cancel subscription'}</button>
          </div>` : null}
          <div class="sys-hint" style=${{ marginTop: '8px', marginBottom: 0 }}>Upgrades take effect immediately (prorated); downgrades apply at the end of the cycle. Canceling keeps access until the period ends.</div>
        </div>

        <div class="sys-section">
          <h2>Payment method</h2>
          ${card ? html`<div class="sys-kv"><span class="k">Card</span><span class="v">${cardBrand(card.brand)} •••• ${card.last4}</span><span class="muted small">expires ${card.exp_month}/${card.exp_year}</span></div>`
            : html`<div class="sys-hint">No card on file.</div>`}
          ${cardSetup ? html`<${StripeForm} pk=${pk} clientSecret=${cardSetup.client_secret} mode="setup" label="Add a new card" cta="Save card" onDone=${onCardSaved} onCancel=${() => setCardSetup(null)} />`
            : html`<div class="sys-actions" style=${{ marginTop: '10px' }}><button class="sys-btn sys-btn-secondary" onClick=${startCardUpdate}>${card ? 'Update card' : 'Add a card'}</button></div>`}
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
            <div class="sys-hint" style=${{ marginTop: 0 }}>Top up any time — paid right here, no leaving Bell. Bigger top-ups get a better rate; purchased credits roll over.</div>
            ${checkout ? html`
              <${StripeForm} pk=${pk} clientSecret=${checkout.client_secret} mode="payment"
                label=${`${checkout.credits.toLocaleString()} credits — ${qar(checkout.total)}`} cta="Pay now"
                onDone=${onPaid} onCancel=${() => setCheckout(null)} />
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
                <thead><tr><th>Date</th><th>Document</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  ${invoices.map(inv => html`
                    <tr key=${inv.id}>
                      <td>${fmtDate(inv.created)}</td>
                      <td>${inv.number || inv.id}</td>
                      <td>${money(inv.amount_paid || inv.total, inv.currency)}</td>
                      <td>${pill(inv.status)}</td>
                      <td style=${{ textAlign: 'right' }}><button class="linkbtn" onClick=${() => openReceipt(inv, me)}>${inv.kind === 'credit' ? 'Receipt' : 'Invoice'}</button></td>
                    </tr>`)}
                </tbody>
              </table>`}
          <div class="sys-hint" style=${{ marginTop: '14px', marginBottom: 0 }}>Each opens a printable Bell receipt — use your browser's "Save as PDF" to download.</div>
        </div>

      </div>
    </div>`;
}

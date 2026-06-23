// /api/billing — Stripe Checkout sessions, customer portal, subscription
// webhook. The webhook is the source of truth for tenant subscription state.

import { Router } from 'express';
import Stripe from 'stripe';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { PLANS, planById, stripePriceId, planByStripePrice, priceCredits, CREDIT_TOPUP } from '../config/plans.js';
import { notifyTenant } from '../lib/notifications.js';
import { grantPurchasedCredits } from '../lib/credits.js';

const router = Router();

// Lazy Stripe client — only created when needed (so the server boots even
// without Stripe keys, useful for local-admin mode).
let _stripe = null;
function stripe() {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY not set');
  _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
  return _stripe;
}

// ---------------------------------------------------------------------------
// GET /api/billing/plans — public catalog with resolved Stripe price ids
// ---------------------------------------------------------------------------
router.get('/plans', (req, res) => {
  const plans = PLANS.map(p => {
    const { stripe_price_id_env, ...rest } = p;
    return {
      ...rest,
      stripe_price_id: process.env[stripe_price_id_env] || null,
      currency: 'QAR',
      // Don't expose env var names externally
    };
  });
  res.json({ plans, currency: 'QAR' });
});

// ---------------------------------------------------------------------------
// GET /api/billing/subscription — current tenant subscription state
// ---------------------------------------------------------------------------
router.get('/subscription', requireAuth, async (req, res, next) => {
  try {
    const r = await query(`
      SELECT plan, subscription_status, plan_renewed_at, plan_expires_at, past_due_at,
             credit_balance, stripe_customer_id, stripe_subscription_id
        FROM tenants WHERE id = $1
    `, [req.tenant.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'tenant_not_found' });
    const t = r.rows[0];
    // Self-heal: if we think they're past_due but Stripe says the subscription is
    // live (e.g. a one-off charge wrongly flipped it before this fix), correct it.
    if (t.subscription_status === 'past_due' && t.stripe_subscription_id) {
      try {
        const live = await stripe().subscriptions.retrieve(t.stripe_subscription_id);
        if (['active', 'trialing'].includes(live.status)) {
          await query(`UPDATE tenants SET subscription_status = $2, past_due_at = NULL WHERE id = $1`, [req.tenant.id, live.status]);
          t.subscription_status = live.status; t.past_due_at = null;
        }
      } catch { /* keep DB value if Stripe is unreachable */ }
    }
    const GRACE_MS = 24 * 60 * 60 * 1000;
    const pastDue = t.subscription_status === 'past_due' && !!t.past_due_at;
    const graceMsLeft = pastDue ? Math.max(0, GRACE_MS - (Date.now() - new Date(t.past_due_at).getTime())) : null;
    res.json({
      plan:                t.plan,
      plan_label:          planById(t.plan)?.name || t.plan,
      subscription_status: t.subscription_status,
      is_active:           ['active','trialing'].includes(t.subscription_status),
      credit_balance:      Number(t.credit_balance) || 0,
      plan_renewed_at:     t.plan_renewed_at,
      plan_expires_at:     t.plan_expires_at,
      past_due_at:         t.past_due_at,
      grace_hours_left:    graceMsLeft != null ? Math.ceil(graceMsLeft / 3600000) : null,
      frozen:              pastDue ? graceMsLeft <= 0 : ['canceled', 'unpaid'].includes(t.subscription_status),
      has_stripe_customer: !!t.stripe_customer_id,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/billing/checkout — create an INCOMPLETE Stripe Subscription and
// return the PaymentIntent's client_secret for use with Stripe Elements.
//
// Body: { plan_id: 'starter' | 'business' | 'enterprise' }
// Returns: { client_secret, subscription_id, customer_id }
//
// Client-side flow:
//   1. POST here with plan_id → get client_secret
//   2. Mount Stripe Payment Element with that client_secret
//   3. User fills card details inside the styled Element
//   4. stripe.confirmPayment() processes the payment
//   5. Stripe redirects to return_url (/?stripe=success)
//   6. Webhook fires invoice.payment_succeeded → sub.status flips to active
//
// Why this shape (not Checkout Sessions): gives us full control over the
// payment page layout. The form, plan selector, order summary, and any
// custom fields all live in our own page; Stripe only owns the secure card
// input field.
// ---------------------------------------------------------------------------
router.post('/checkout', requireAuth, async (req, res, next) => {
  try {
    const { plan_id } = req.body || {};
    const plan = planById(plan_id);
    if (!plan) return res.status(400).json({ error: 'invalid_plan' });
    if (!plan.self_serve) return res.status(400).json({ error: 'plan_not_self_serve' });

    const priceId = stripePriceId(plan);
    if (!priceId) {
      return res.status(500).json({
        error: 'plan_not_configured',
        detail: `${plan.stripe_price_id_env} env var is not set on this deployment.`,
      });
    }

    // Resolve or create the Stripe customer for this tenant
    const customerId = await getOrCreateStripeCustomer(req.tenant, req.user);

    // Create an incomplete subscription. The PaymentIntent on the latest
    // invoice will be confirmed client-side once the user enters card data.
    const subscription = await stripe().subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        bdi_tenant_id: String(req.tenant.id),
        bdi_user_id:   String(req.user.id),
        bdi_plan_id:   plan.id,
      },
    });

    const paymentIntent = subscription.latest_invoice?.payment_intent;
    if (!paymentIntent?.client_secret) {
      return res.status(500).json({
        error: 'stripe_setup_failed',
        detail: 'Could not obtain PaymentIntent client_secret from new subscription.',
      });
    }

    res.json({
      client_secret:   paymentIntent.client_secret,
      subscription_id: subscription.id,
      customer_id:     customerId,
    });
  } catch (err) {
    if (err.message?.includes('STRIPE_SECRET_KEY')) {
      return res.status(500).json({ error: 'stripe_not_configured', message: err.message });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/billing/change-plan — upgrade/downgrade the active subscription to
// another self-serve tier in-app, with proration. Body: { plan_id }.
// Upgrades bill the prorated difference immediately; downgrades credit it
// forward. The customer.subscription.updated webhook also syncs tenant.plan.
// ---------------------------------------------------------------------------
router.post('/change-plan', requireAuth, async (req, res, next) => {
  try {
    const plan = planById(req.body?.plan_id);
    if (!plan || !plan.self_serve) return res.status(400).json({ error: 'invalid_plan' });
    const newPrice = stripePriceId(plan);
    if (!newPrice) return res.status(500).json({ error: 'plan_not_configured', detail: `${plan.stripe_price_id_env} not set.` });

    const r = await query(`SELECT stripe_subscription_id FROM tenants WHERE id = $1`, [req.tenant.id]);
    const subId = r.rows[0]?.stripe_subscription_id;
    if (!subId) return res.status(400).json({ error: 'no_subscription', detail: 'Start a subscription before changing plans.' });

    const sub = await stripe().subscriptions.retrieve(subId);
    const item = sub.items?.data?.[0];
    if (!item?.id) return res.status(500).json({ error: 'subscription_item_missing' });
    if (item.price?.id === newPrice) return res.json({ ok: true, unchanged: true, plan: plan.id });

    await stripe().subscriptions.update(subId, {
      items: [{ id: item.id, price: newPrice }],
      proration_behavior: 'create_prorations',
      payment_behavior:   'allow_incomplete',
      metadata: { ...(sub.metadata || {}), bdi_tenant_id: String(req.tenant.id), bdi_plan_id: plan.id },
    });
    // Reflect immediately; the webhook will also confirm.
    await query(`UPDATE tenants SET plan = $2, updated_at = now() WHERE id = $1`, [req.tenant.id, plan.id]);
    res.json({ ok: true, plan: plan.id, plan_label: plan.name });
  } catch (err) {
    if (err.message?.includes('STRIPE_SECRET_KEY')) return res.status(500).json({ error: 'stripe_not_configured', message: err.message });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/billing/portal — Stripe Customer Portal (manage subscription)
// Returns: { url }
// ---------------------------------------------------------------------------
router.post('/portal', requireAuth, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT stripe_customer_id FROM tenants WHERE id = $1`,
      [req.tenant.id]
    );
    const customerId = r.rows[0]?.stripe_customer_id;
    if (!customerId) {
      return res.status(400).json({ error: 'no_stripe_customer', detail: 'Subscribe first before opening the billing portal.' });
    }
    const origin = req.headers.origin || `https://${req.hostname}`;
    const session = await stripe().billingPortal.sessions.create({
      customer:    customerId,
      return_url:  `${origin}/`,
    });
    res.json({ url: session.url });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/billing/invoices — the tenant's invoices/receipts from Stripe
// (date, amount, status, hosted page + downloadable PDF).
// ---------------------------------------------------------------------------
router.get('/invoices', requireAuth, async (req, res, next) => {
  try {
    const r = await query(`SELECT stripe_customer_id FROM tenants WHERE id = $1`, [req.tenant.id]);
    const customerId = r.rows[0]?.stripe_customer_id;
    if (!customerId) return res.json({ invoices: [] });
    const limit = Math.min(Number(req.query.limit ?? 24), 100);
    const list = await stripe().invoices.list({ customer: customerId, limit });
    const invoices = (list.data || []).map(inv => ({
      id:                 inv.id,
      number:             inv.number,
      created:            inv.created ? new Date(inv.created * 1000).toISOString() : null,
      total:              inv.total,
      amount_paid:        inv.amount_paid,
      currency:           (inv.currency || 'qar').toUpperCase(),
      status:             inv.status,         // draft | open | paid | void | uncollectible
      hosted_invoice_url: inv.hosted_invoice_url,
      invoice_pdf:        inv.invoice_pdf,
    }));
    res.json({ invoices });
  } catch (err) {
    if (err.message?.includes('STRIPE_SECRET_KEY')) return res.json({ invoices: [], stripe_unconfigured: true });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/billing/usage — credit balance, this cycle's usage, and the full
// ledger history (every grant + spend with reason/amount/date).
// ---------------------------------------------------------------------------
router.get('/usage', requireAuth, async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 50), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const tr = await query(
      `SELECT plan, credit_balance, plan_renewed_at, plan_expires_at FROM tenants WHERE id = $1`,
      [req.tenant.id],
    );
    const t = tr.rows[0] || {};
    const cycleStart = t.plan_renewed_at || null;
    const usedR = await query(
      `SELECT COALESCE(-SUM(delta), 0)::int AS used FROM credit_ledger
        WHERE tenant_id = $1 AND delta < 0
          AND created_at >= COALESCE($2, date_trunc('month', now()))`,
      [req.tenant.id, cycleStart],
    );
    const entriesR = await query(
      `SELECT delta, reason, balance_after, ref_type, ref_id, actor, created_at
         FROM credit_ledger WHERE tenant_id = $1
        ORDER BY created_at DESC, id DESC LIMIT $2 OFFSET $3`,
      [req.tenant.id, limit, offset],
    );
    res.json({
      balance:         Number(t.credit_balance) || 0,
      allotment:       planById(t.plan)?.credits ?? null,
      used_this_cycle: usedR.rows[0]?.used || 0,
      cycle_start:     cycleStart,
      cycle_reset:     t.plan_expires_at || null,
      entries:         entriesR.rows,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/billing/credit-pricing — top-up pricing config (for the UI preview)
// ---------------------------------------------------------------------------
router.get('/credit-pricing', (req, res) => {
  res.json({ ...CREDIT_TOPUP });
});

// ---------------------------------------------------------------------------
// POST /api/billing/buy-credits — start a one-time extra-credit purchase.
// Body: { credits }. Creates a STANDALONE Stripe PaymentIntent (NOT an invoice,
// so it is fully isolated from the subscription lifecycle) and returns its
// client_secret for the in-app Payment Element. allow_redirects:'never' keeps
// the whole flow on-platform (card only — the user never leaves Bell). Credits
// are granted via /buy-credits/confirm (instant) + the payment_intent.succeeded
// webhook (idempotent safety net).
// ---------------------------------------------------------------------------
router.post('/buy-credits', requireAuth, async (req, res, next) => {
  try {
    const priced = priceCredits(req.body?.credits);
    if (priced.error) {
      return res.status(400).json({ error: 'invalid_quantity', reason: priced.error, min: CREDIT_TOPUP.min, max: CREDIT_TOPUP.max });
    }
    const customerId = await getOrCreateStripeCustomer(req.tenant, req.user);
    const pi = await stripe().paymentIntents.create({
      amount:        priced.amount,        // halalas
      currency:      'qar',
      customer:      customerId,
      description:   `${priced.credits.toLocaleString()} Bell credits`,
      receipt_email: req.user?.email || undefined,
      metadata: {
        bdi_kind:      'credit_topup',
        bdi_tenant_id: String(req.tenant.id),
        bdi_credits:   String(priced.credits),
      },
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
    });
    res.json({ ok: true, client_secret: pi.client_secret, payment_intent_id: pi.id, credits: priced.credits, qar: priced.qar });
  } catch (err) {
    if (err.message?.includes('STRIPE_SECRET_KEY')) {
      return res.status(500).json({ error: 'stripe_not_configured', message: err.message });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/billing/buy-credits/confirm — after the card is confirmed in-app,
// verify the PaymentIntent succeeded and grant the credits immediately
// (idempotent; the webhook also grants as a safety net). Body: { payment_intent_id }.
// ---------------------------------------------------------------------------
router.post('/buy-credits/confirm', requireAuth, async (req, res, next) => {
  try {
    const pid = String(req.body?.payment_intent_id || '');
    if (!pid) return res.status(400).json({ error: 'missing_payment_intent' });
    const pi = await stripe().paymentIntents.retrieve(pid);
    if (pi.metadata?.bdi_kind !== 'credit_topup' || Number(pi.metadata?.bdi_tenant_id) !== req.tenant.id) {
      return res.status(400).json({ error: 'mismatch' });
    }
    if (pi.status !== 'succeeded') return res.json({ ok: false, status: pi.status });
    const credits = Number(pi.metadata.bdi_credits) || 0;
    const r = await grantPurchasedCredits(req.tenant.id, credits, pi.id, pi.amount, req.user?.email || 'purchase');
    res.json({ ok: true, granted: r.granted, balance: r.balance, credits });
  } catch (err) {
    if (err.message?.includes('STRIPE_SECRET_KEY')) return res.status(500).json({ error: 'stripe_not_configured', message: err.message });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/billing/stripe-webhook — Stripe → us, subscription lifecycle
//
// MOUNTED WITH RAW BODY (see server.js) — Stripe needs the exact bytes to
// verify the signature.
//
// Events we handle:
//   checkout.session.completed       — initial subscription created
//   customer.subscription.updated    — plan change / renewal / status change
//   customer.subscription.deleted    — subscription ended (cancellation)
//   invoice.payment_failed           — soft-warn, status flips to past_due
//   invoice.payment_succeeded        — renewal payment confirmed; top up credits
// ---------------------------------------------------------------------------
router.post('/stripe-webhook', async (req, res) => {
  const sig = req.header('stripe-signature');
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!whSecret) {
    console.error('[billing] STRIPE_WEBHOOK_SECRET not set — webhook ignored');
    return res.status(500).json({ error: 'webhook_secret_not_set' });
  }

  let event;
  try {
    // req.body is a Buffer because we mounted express.raw for this path
    event = stripe().webhooks.constructEvent(req.body, sig, whSecret);
  } catch (err) {
    console.error('[billing] webhook signature invalid:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      default:
        // Other events ignored
        break;
    }
    res.json({ received: true, type: event.type });
  } catch (err) {
    console.error(`[billing] webhook handler failed for ${event.type}:`, err.stack || err.message);
    // 200 anyway — we logged + can replay manually if needed
    res.json({ received: true, type: event.type, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Webhook handlers
// ---------------------------------------------------------------------------

async function handleCheckoutCompleted(session) {
  // First subscription creation. The customer.subscription.created event
  // also fires, so we just log here and let that handler do the actual work.
  console.log(`[billing] checkout completed: customer=${session.customer} sub=${session.subscription}`);
}

async function handleSubscriptionChange(sub) {
  const customerId = sub.customer;
  const subscriptionId = sub.id;
  const status = sub.status;     // active | trialing | past_due | canceled | etc.
  const currentPeriodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
  const currentPeriodStart = sub.current_period_start ? new Date(sub.current_period_start * 1000) : null;

  // Determine which plan this sub is on (by matching the Stripe price id)
  const priceId = sub.items?.data?.[0]?.price?.id;
  const plan = planByStripePrice(priceId);
  if (!plan) {
    console.warn(`[billing] subscription ${subscriptionId} has unknown price id ${priceId}`);
  }

  // Resolve which tenant this belongs to. Prefer metadata (faster + no DB
  // race), fall back to looking up by stripe_customer_id.
  const tenantIdMeta = sub.metadata?.bdi_tenant_id;
  let tenantId = tenantIdMeta ? Number(tenantIdMeta) : null;
  if (!tenantId) {
    const r = await query(`SELECT id FROM tenants WHERE stripe_customer_id = $1`, [customerId]);
    tenantId = r.rows[0]?.id;
  }
  if (!tenantId) {
    console.warn(`[billing] could not resolve tenant for subscription ${subscriptionId}`);
    return;
  }

  await withTransaction(async (client) => {
    await client.query(`
      UPDATE tenants
         SET plan                   = COALESCE($2, plan),
             stripe_subscription_id = $3,
             subscription_status    = $4,
             plan_renewed_at        = COALESCE($5, plan_renewed_at),
             plan_expires_at        = $6,
             past_due_at            = CASE WHEN $4 IN ('active','trialing') THEN NULL ELSE past_due_at END
       WHERE id = $1
    `, [
      tenantId,
      plan?.id || null,
      subscriptionId,
      status,
      currentPeriodStart,
      currentPeriodEnd,
    ]);
  });

  console.log(`[billing] tenant ${tenantId} → plan=${plan?.id || '?'} status=${status} period_end=${currentPeriodEnd?.toISOString()}`);
}

async function handleSubscriptionDeleted(sub) {
  // Subscription canceled / ended. Don't zero credits — freeze them.
  await query(`
    UPDATE tenants
       SET subscription_status = 'canceled',
           plan_expires_at     = now()
     WHERE stripe_subscription_id = $1 OR stripe_customer_id = $2
  `, [sub.id, sub.customer]);
  console.log(`[billing] subscription ${sub.id} canceled — credits frozen for customer ${sub.customer}`);
}

async function handleInvoicePaid(inv) {
  // Only SUBSCRIPTION invoices affect plan/credits here. Credit top-ups are
  // standalone PaymentIntents (handled separately) and must never touch
  // subscription state.
  if (!inv.subscription) return;
  // Renewal succeeded — top up credits for the tenant's current plan.
  const customerId = inv.customer;
  const r = await query(
    `SELECT id, plan FROM tenants WHERE stripe_customer_id = $1`,
    [customerId]
  );
  const t = r.rows[0];
  if (!t) return;
  const plan = planById(t.plan);
  if (!plan) return;

  // Credits are granted EXCLUSIVELY by ensureMonthlyGrant() (the single source
  // of truth) so they can't be double-counted. This webhook only confirms the
  // subscription is active; the lazy monthly grant issues plan.credits exactly
  // once per period on the next balance read.
  await query(`
    UPDATE tenants
       SET subscription_status = 'active',
           plan_renewed_at     = now(),
           past_due_at         = NULL
     WHERE id = $1
  `, [t.id]);
  console.log(`[billing] tenant ${t.id} invoice paid plan=${plan.id} — credits via monthly grant`);
  notifyTenant(t.id, {
    category: 'account', type: 'payment_succeeded',
    title: 'Subscription renewed',
    body: 'Your payment went through and your credits for the new period are ready.',
    link: '/billing', icon: 'megaphone',
  }).catch(() => {});
}

async function handleInvoiceFailed(inv) {
  // Only a SUBSCRIPTION payment failure may mark a tenant past_due. One-off
  // charges must never freeze a subscription (this was the credit-top-up bug).
  if (!inv.subscription) return;
  const r = await query(`
    UPDATE tenants SET subscription_status = 'past_due',
                       past_due_at = COALESCE(past_due_at, now())
     WHERE stripe_customer_id = $1
   RETURNING id
  `, [inv.customer]);
  console.log(`[billing] invoice payment failed for customer ${inv.customer} — marked past_due`);
  const tid = r.rows[0]?.id;
  if (tid) notifyTenant(tid, {
    category: 'account', type: 'payment_failed',
    title: 'Payment failed',
    body: "We couldn't process your subscription payment. Please update your billing details to keep your access active.",
    link: '/billing', icon: 'megaphone', email: true,
  }).catch(() => {});
}

// Credit top-up PaymentIntent succeeded → grant the bought credits (idempotent).
async function handlePaymentIntentSucceeded(pi) {
  if (pi.metadata?.bdi_kind !== 'credit_topup') return;   // ignore all other PIs
  const tenantId = Number(pi.metadata.bdi_tenant_id) || null;
  const credits  = Number(pi.metadata.bdi_credits) || 0;
  if (!tenantId || credits <= 0) return;
  const r = await grantPurchasedCredits(tenantId, credits, pi.id, pi.amount, 'purchase');
  if (r.granted > 0) {
    notifyTenant(tenantId, {
      category: 'account', type: 'credits_purchased',
      title: `${credits.toLocaleString()} credits added`,
      body: 'Your credit top-up went through — the credits are in your balance.',
      link: '/billing', icon: 'megaphone',
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Helper: get-or-create Stripe customer for a tenant
// ---------------------------------------------------------------------------
async function getOrCreateStripeCustomer(tenant, user) {
  // Already have a customer id?
  const r = await query(`SELECT stripe_customer_id FROM tenants WHERE id = $1`, [tenant.id]);
  const existing = r.rows[0]?.stripe_customer_id;
  if (existing) return existing;

  // Create one
  const customer = await stripe().customers.create({
    email: user.email,
    name:  tenant.name,
    metadata: {
      bdi_tenant_id: String(tenant.id),
      bdi_tenant_slug: tenant.slug,
    },
  });

  await query(`UPDATE tenants SET stripe_customer_id = $2 WHERE id = $1`,
    [tenant.id, customer.id]);
  return customer.id;
}

export default router;

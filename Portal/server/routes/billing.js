// /api/billing — Stripe Checkout sessions, customer portal, subscription
// webhook. The webhook is the source of truth for tenant subscription state.

import { Router } from 'express';
import Stripe from 'stripe';
import { query, withTransaction } from '../db.js';
import { requireAuth } from '../lib/auth.js';
import { PLANS, planById, stripePriceId, planByStripePrice } from '../config/plans.js';

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
      SELECT plan, subscription_status, plan_renewed_at, plan_expires_at,
             credit_balance, stripe_customer_id, stripe_subscription_id
        FROM tenants WHERE id = $1
    `, [req.tenant.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'tenant_not_found' });
    const t = r.rows[0];
    res.json({
      plan:                t.plan,
      plan_label:          planById(t.plan)?.name || t.plan,
      subscription_status: t.subscription_status,
      is_active:           ['active','trialing'].includes(t.subscription_status),
      credit_balance:      Number(t.credit_balance) || 0,
      plan_renewed_at:     t.plan_renewed_at,
      plan_expires_at:     t.plan_expires_at,
      has_stripe_customer: !!t.stripe_customer_id,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/billing/checkout — create a Stripe EMBEDDED Checkout session
// Body: { plan_id: 'starter' | 'business' | 'enterprise' }
// Returns: { client_secret } — used by Stripe.js to mount the embedded form
//
// The UI mounts the embedded form inside /subscribe so the user never leaves
// Bell during payment. After a successful payment, Stripe redirects to
// return_url (which we set to /?stripe=success) and our app bootstrap polls
// the subscription endpoint until the webhook activates the plan.
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

    const origin = req.headers.origin
      || `https://${req.hostname}`
      || `http://${req.headers.host}`;
    // Embedded checkout uses ONE return_url for both success + cancel.
    // We include the session_id placeholder so the app bootstrap can verify
    // the session if needed.
    const returnUrl = `${origin}/?stripe=success&session_id={CHECKOUT_SESSION_ID}`;

    const session = await stripe().checkout.sessions.create({
      ui_mode: 'embedded',
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      return_url: returnUrl,
      subscription_data: {
        metadata: {
          bdi_tenant_id: String(req.tenant.id),
          bdi_user_id:   String(req.user.id),
          bdi_plan_id:   plan.id,
        },
      },
      payment_method_collection: 'always',
      allow_promotion_codes: true,
      automatic_tax: { enabled: false },
    });

    res.json({
      client_secret: session.client_secret,
      session_id:    session.id,
    });
  } catch (err) {
    if (err.message?.includes('STRIPE_SECRET_KEY')) {
      return res.status(500).json({ error: 'stripe_not_configured', message: err.message });
    }
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
             plan_expires_at        = $6
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

  await query(`
    UPDATE tenants
       SET credit_balance      = credit_balance + $2,
           subscription_status = 'active',
           plan_renewed_at     = now()
     WHERE id = $1
  `, [t.id, plan.credits || 0]);
  console.log(`[billing] tenant ${t.id} renewed plan=${plan.id}, +${plan.credits} credits`);
}

async function handleInvoiceFailed(inv) {
  await query(`
    UPDATE tenants SET subscription_status = 'past_due'
     WHERE stripe_customer_id = $1
  `, [inv.customer]);
  console.log(`[billing] invoice payment failed for customer ${inv.customer} — marked past_due`);
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

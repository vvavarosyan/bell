// Bell subscription plans.
//
// Display info lives here in code (one source of truth for both the
// Portal's /subscribe page and any future marketing display).
// Stripe price IDs come from env vars — set them in Railway after creating
// the products in Stripe Dashboard.

export const PLANS = [
  {
    id:          'starter',
    name:        'Starter',
    tagline:     'For solo operators and small teams getting started with Qatar intelligence',
    price_qar:   2000,
    interval:    'month',
    // Credits granted on each renewal cycle
    credits:     1000,
    // Stripe product price id — pasted in via env var
    stripe_price_id_env: 'STRIPE_PRICE_STARTER',
    // Listed features for display on /subscribe
    features: [
      'All 130,000+ Qatar companies',
      '240,000+ decision-makers',
      'Research reports (1,000 credits / month)',
      'Map + Signals access',
      'Email support',
    ],
    // Self-serve via Stripe Checkout
    self_serve: true,
  },
  {
    id:          'business',
    name:        'Business',
    tagline:     'For teams that need depth — full enrichment + multi-seat workspace',
    price_qar:   10000,
    interval:    'month',
    credits:     5000,
    stripe_price_id_env: 'STRIPE_PRICE_BUSINESS',
    features: [
      'Everything in Starter',
      'Research reports (5,000 credits / month)',
      'Team workspace + multiple seats',
      'CRM + activity feed',
      'API access',
      'Priority support',
    ],
    self_serve: true,
    highlighted: true,    // shown as the recommended tier
  },
  {
    id:          'enterprise',
    name:        'Enterprise',
    tagline:     'For sovereign funds, ministries, and large enterprises',
    price_qar:   30000,
    interval:    'month',
    credits:     20000,
    stripe_price_id_env: 'STRIPE_PRICE_ENTERPRISE',
    features: [
      'Everything in Business',
      'Research reports (20,000 credits / month)',
      'Dedicated instance option (Qatari servers, Qatari law)',
      'Custom integrations',
      'SOC 2 + audit logging',
      'Named CSM + onboarding',
      'SLA + 24/7 support',
    ],
    self_serve: true,
  },
];

/**
 * Lookup a plan by id. Returns null if unknown.
 */
export function planById(id) {
  return PLANS.find(p => p.id === id) || null;
}

/**
 * Resolve a plan's Stripe price id at runtime (looking up the env var
 * named in stripe_price_id_env). Returns null if env var unset.
 */
export function stripePriceId(plan) {
  if (!plan?.stripe_price_id_env) return null;
  return process.env[plan.stripe_price_id_env] || null;
}

/**
 * Lookup the plan associated with a given Stripe price id (reverse direction,
 * used by the webhook to figure out which plan a subscription is on).
 */
export function planByStripePrice(stripePrice) {
  if (!stripePrice) return null;
  for (const plan of PLANS) {
    if (stripePriceId(plan) === stripePrice) return plan;
  }
  return null;
}

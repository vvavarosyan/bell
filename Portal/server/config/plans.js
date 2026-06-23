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
    credits:     2000,
    // Max outbound outreach emails per day
    emails_per_day: 200,
    // Stripe product price id — pasted in via env var
    stripe_price_id_env: 'STRIPE_PRICE_STARTER',
    // Listed features for display on /subscribe
    features: [
      'All 130,000+ Qatar companies',
      '240,000+ decision-makers',
      '2,000 credits / month',
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
    credits:     15000,
    emails_per_day: 1000,
    stripe_price_id_env: 'STRIPE_PRICE_BUSINESS',
    features: [
      'Everything in Starter',
      '15,000 credits / month',
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
    credits:     60000,
    emails_per_day: 5000,
    stripe_price_id_env: 'STRIPE_PRICE_ENTERPRISE',
    features: [
      'Everything in Business',
      '60,000 credits / month',
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

// ---------------------------------------------------------------------------
// Extra-credit (top-up) pricing — a flat per-credit rate chosen by the bracket
// the total quantity lands in (the whole purchase is billed at that rate).
// Mirrors the plans' per-credit economics. Buy 500–100,000 credits at once.
// ---------------------------------------------------------------------------
export const CREDIT_TOPUP = {
  min: 500,
  max: 100000,
  currency: 'QAR',
  tiers: [
    { upTo: 14999,  rate: 1.00 },   // up to 15,000  → mirrors Starter rate
    { upTo: 59999,  rate: 0.75 },   // 15,000–60,000 → mirrors Business rate
    { upTo: 100000, rate: 0.50 },   // 60,000+       → mirrors Enterprise rate
  ],
};

/** Per-credit rate for a given quantity (whole purchase billed at this rate). */
export function creditRate(qty) {
  const q = Number(qty) || 0;
  for (const t of CREDIT_TOPUP.tiers) if (q <= t.upTo) return t.rate;
  return CREDIT_TOPUP.tiers[CREDIT_TOPUP.tiers.length - 1].rate;
}

/** Validate + price a credit top-up. Returns { credits, rate, qar, amount } or { error }. */
export function priceCredits(qty) {
  const credits = Math.floor(Number(qty));
  if (!Number.isFinite(credits)) return { error: 'invalid' };
  if (credits < CREDIT_TOPUP.min) return { error: 'min', min: CREDIT_TOPUP.min };
  if (credits > CREDIT_TOPUP.max) return { error: 'max', max: CREDIT_TOPUP.max };
  const rate = creditRate(credits);
  const qar = Math.round(credits * rate * 100) / 100;   // QAR (2dp)
  const amount = Math.round(credits * rate * 100);        // halalas — Stripe smallest unit
  return { credits, rate, qar, amount };
}

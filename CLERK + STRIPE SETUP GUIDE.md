# Bell.qa — Clerk + Stripe Setup Guide

Final manual configuration to flip on signup + paid subscriptions. ~30 min total.

You said you already have:
- Clerk account + application + DNS verified ✅
- Stripe dashboard with the 3 plans already set up ✅
- Resend account ✅

This guide just tells you which env vars to paste where + how to configure the webhooks.

---

## Phase 1 · Get the keys you need

### From Clerk dashboard → API Keys
- **Publishable key** — `pk_test_...` or `pk_live_...` (safe to expose to browser)
- **Secret key** — `sk_test_...` or `sk_live_...` (NEVER share)

### From Stripe dashboard → Developers → API keys
- **Publishable key** — `pk_test_...` or `pk_live_...` (only needed if we add client-side Stripe later; safe to skip for now)
- **Secret key** — `sk_test_...` or `sk_live_...`

### From Stripe dashboard → Products
For each of your 3 products (Starter, Business, Enterprise), open the product → find its **Price** → copy the **Price ID** (looks like `price_xxxxxxxxxxxxxx`).

You should end up with 3 price IDs:
- Starter (QAR 2,000/month) — `price_xxx_starter`
- Business (QAR 10,000/month) — `price_xxx_business`
- Enterprise (QAR 30,000/month) — `price_xxx_enterprise`

---

## Phase 2 · Railway env vars

### portal-staging service (staging environment)

| Variable | Value |
|---|---|
| `CLERK_PUBLISHABLE_KEY` | your Clerk `pk_test_...` (or `pk_live_...` if using one Clerk app for both envs) |
| `CLERK_SECRET_KEY` | your Clerk `sk_test_...` |
| `CLERK_WEBHOOK_SECRET` | (fill after Phase 3) |
| `BDI_MODE` | change to `user` |
| `BDI_PLATFORM_ADMIN_EMAILS` | `vvavarosyan@yahoo.com` (and any other Bell staff emails, comma-separated) |
| `STRIPE_SECRET_KEY` | your Stripe `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | (fill after Phase 4) |
| `STRIPE_PRICE_STARTER` | the Starter price ID from Stripe |
| `STRIPE_PRICE_BUSINESS` | the Business price ID from Stripe |
| `STRIPE_PRICE_ENTERPRISE` | the Enterprise price ID from Stripe |

### portal service (production environment)

Same shape as above, with the **production** values for any keys that have separate test/live modes (Stripe `sk_live_...`, prod Stripe price IDs).

### marketing service (production environment)

Just one new variable — so the marketing site's `/sign-in` and `/get-access` redirects know where to send people:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://app.bell.qa` |

### marketing-staging service (staging environment)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_APP_URL` | `https://app-staging.bell.qa` |

Railway will redeploy each service automatically when you save env vars.

---

## Phase 3 · Clerk webhook

Clerk → Webhooks → **+ Add endpoint** (do this twice, once per environment):

**For staging:**
- **Endpoint URL:** `https://app-staging.bell.qa/api/auth/clerk-webhook`
- **Subscribe to events:** `user.created`, `user.updated`, `user.deleted`
- Create → copy the **Signing Secret** (`whsec_...`)
- Paste that into Railway → staging → portal-staging → `CLERK_WEBHOOK_SECRET`

**For production:**
- **Endpoint URL:** `https://app.bell.qa/api/auth/clerk-webhook`
- Same events
- Paste signing secret into Railway → production → portal → `CLERK_WEBHOOK_SECRET`

---

## Phase 4 · Stripe webhook

Stripe → Developers → Webhooks → **+ Add endpoint** (twice — staging + production):

**For staging:**
- **Endpoint URL:** `https://app-staging.bell.qa/api/billing/stripe-webhook`
- **Events to send:** click "Select events" and choose:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
- Add endpoint → reveal the **Signing secret** (`whsec_...`) → copy
- Paste into Railway → staging → portal-staging → `STRIPE_WEBHOOK_SECRET`

**For production:**
- Same setup at `https://app.bell.qa/api/billing/stripe-webhook`
- Copy that signing secret to Railway → production → portal → `STRIPE_WEBHOOK_SECRET`

---

## Phase 5 · Verify end-to-end

### On staging

1. Open `https://app-staging.bell.qa` in a fresh incognito window
2. Redirected to `/sign-in` ✓
3. Click **Create an account** → sign up with a NEW email
4. After signup, you land on `/subscribe` ✓
5. Click **Subscribe — QAR 2,000/mo** on Starter
6. Stripe Checkout opens. Use test card `4242 4242 4242 4242`, any future date, any CVC, any postcode
7. After payment, redirected back to Portal `/` ✓
8. Within 10 sec the subscription webhook fires → `subscription_status='active'`, credits added
9. Open Railway → portal-staging → Deploy Logs → see `[billing] tenant N → plan=starter status=active`

### Verify the flow works for platform_admin

1. Sign up at `app-staging.bell.qa/sign-up` using the email in `BDI_PLATFORM_ADMIN_EMAILS`
2. Your role becomes `platform_admin` automatically
3. The subscription gate is BYPASSED for platform_admin — you land directly in the Portal
4. You can use everything without paying

### On production

Repeat the staging test on `app.bell.qa` once you flip Stripe to live mode. Use a real card.

---

## Troubleshooting

- **"plan_not_configured" on Subscribe button** → the `STRIPE_PRICE_*` env var for that plan isn't set on the current Railway service.
- **Sign-up succeeds but /subscribe shows "Account is still being set up"** → Clerk webhook isn't firing or signing-secret mismatch. Check Clerk dashboard → Webhooks → Attempts.
- **Stripe Checkout opens but webhook never fires** → check Stripe dashboard → Webhooks → Attempts for your endpoint. Common cause: wrong URL or signing secret.
- **Stuck in redirect loop /sign-in → /subscribe → /sign-in** → your tenant has no Stripe customer yet because the webhook hasn't fired. Refresh after a few seconds.
- **Marketing site still shows "Sign in coming soon"** → `NEXT_PUBLIC_APP_URL` not set on the marketing service. Or you haven't deployed yet (push after this guide).

---

## What changed for the local Mac

Nothing. `BDI_MODE=local-admin` still bypasses auth + subscription. You always act as `platform_admin` on tenant_id=1. All `.command` files work as before.

---

## Checklist

- [ ] Set 10 env vars on portal-staging (Clerk + Stripe + BDI_MODE + admin emails)
- [ ] Set 10 env vars on portal (production)
- [ ] Set `NEXT_PUBLIC_APP_URL` on marketing + marketing-staging
- [ ] Created Clerk webhook endpoint for staging, pasted signing secret
- [ ] Created Clerk webhook endpoint for production, pasted signing secret
- [ ] Created Stripe webhook endpoint for staging (6 events), pasted signing secret
- [ ] Created Stripe webhook endpoint for production (6 events), pasted signing secret
- [ ] Pushed code via Push Changes.command (staging)
- [ ] Merged develop → main via Open Production Release.command (production)
- [ ] Verified staging signup → subscribe → land in Portal
- [ ] Verified platform_admin email bypasses subscription gate

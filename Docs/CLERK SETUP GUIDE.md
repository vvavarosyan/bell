# Bell.qa — Clerk (Auth) Setup Guide

This is the dashboard side of Milestone B1. Code changes are already in your repo — once you complete the steps below + push, your `app.bell.qa` will require sign-in and `staging.app.bell.qa` will too.

**Time: ~30 min.** Two Clerk instances (one for staging+local, one for production) + env vars in Railway + Namehero DNS for Clerk's domain proofing.

---

## Phase 1 · Create your Clerk applications (10 min)

You need **two** Clerk applications: one for development/staging, one for production. Why two: production has real users, development can be reset/recreated freely without affecting them.

### Step 1.1 — Create the development application

1. Sign in at https://dashboard.clerk.com
2. **Create application** → name it `Bell — Development`
3. Authentication strategy: keep the defaults (Email + Google enabled is fine). You can add more providers later (Apple, GitHub, etc.) — anytime, without code changes.
4. Click **Create application**
5. You'll land on the **API keys** page. **Copy these two:**
   - **Publishable key** (starts with `pk_test_…`) — safe to expose to browser
   - **Secret key** (starts with `sk_test_…`) — KEEP PRIVATE, never paste in chat
6. **Note the keys somewhere safe** — you'll paste them into Railway shortly.

### Step 1.2 — Configure the development application URLs

In the Clerk dashboard for your dev app:

1. **Domains** → **Add domain**: `app-staging.bell.qa`
   - Clerk shows you a CNAME record to add at Namehero (for domain verification + sending sign-in emails from your domain)
   - Add the CNAME at Namehero. We'll do this DNS in Phase 2.
2. **Paths** (in left sidebar → "Customization" → "Paths" or "Account Portal"):
   - **Sign-in URL**: `/sign-in`
   - **Sign-up URL**: `/sign-up`
   - **After sign-in URL**: `/`
   - **After sign-up URL**: `/`
3. **Allowed origins** (under "Domains" or "Configure" → "Restrictions"):
   - Add `https://app-staging.bell.qa`
   - Add `http://localhost:3939` (so your local Mac can also test against the dev Clerk instance, optional)

### Step 1.3 — Create the production application

Repeat Step 1.1 with the name `Bell — Production`. Copy the **publishable key** (`pk_live_…`) and **secret key** (`sk_live_…`).

### Step 1.4 — Configure the production application

1. **Domains** → **Add domain**: `app.bell.qa`
   - Note the CNAME for DNS
2. **Paths**:
   - Sign-in URL: `/sign-in`
   - Sign-up URL: `/sign-up`
   - After sign-in URL: `/`
   - After sign-up URL: `/`
3. **Allowed origins**: `https://app.bell.qa`

---

## Phase 2 · DNS at Namehero (10 min + propagation)

Both Clerk apps gave you CNAME records. Add them at Namehero.

1. Log into Namehero → DNS for `bell.qa`
2. **Add the CNAMEs Clerk gave you.** They'll look like:
   - `clerk.bell.qa` → `frontend-api.clerk.services` (or similar — copy exact value from Clerk)
   - `accounts.bell.qa` → something like `accounts.clerk.services`
   - There may be 4–6 records per app (clerk, accounts, clk_, clkmail). Add **every record Clerk listed**, exactly as shown.
3. Save.
4. Back in Clerk → Domains → click **Check status** every few minutes. Once all records verify (green ✅), Phase 2 is done.

DNS propagation: 5–30 min usually.

---

## Phase 3 · Set environment variables in Railway (5 min)

### Step 3.1 — Add staging env vars

Railway → switch to **staging** environment → click **portal-staging** service → **Variables** tab → add:

| Variable | Value |
|---|---|
| `CLERK_PUBLISHABLE_KEY` | the `pk_test_…` from Step 1.1 |
| `CLERK_SECRET_KEY` | the `sk_test_…` from Step 1.1 |
| `CLERK_WEBHOOK_SECRET` | (we'll fill this in Phase 4) |
| `BDI_MODE` | change from `staging` to `user` |
| `BDI_PLATFORM_ADMIN_EMAILS` | your email (e.g. `vvavarosyan@yahoo.com`) — comma-separated for multiple admins |

### Step 3.2 — Add production env vars

Switch to **production** environment → **portal** service → **Variables** → add the same SHAPE of variables but with the **production** Clerk values:

| Variable | Value |
|---|---|
| `CLERK_PUBLISHABLE_KEY` | the `pk_live_…` from Step 1.3 |
| `CLERK_SECRET_KEY` | the `sk_live_…` from Step 1.3 |
| `CLERK_WEBHOOK_SECRET` | (Phase 4) |
| `BDI_MODE` | already `user` ✓ |
| `BDI_PLATFORM_ADMIN_EMAILS` | your email |

Railway redeploys automatically when you save variables. Both services will redeploy.

---

## Phase 4 · Configure the webhook (10 min)

Clerk needs to tell our backend when users sign up so we can create their tenant + user row. This is done via a webhook.

### Step 4.1 — Add webhook in staging Clerk app

1. Dashboard → your **Development** app → **Webhooks** in left sidebar
2. Click **+ Add endpoint**
3. **Endpoint URL**: `https://app-staging.bell.qa/api/auth/clerk-webhook`
4. **Subscribe to events**: check the following:
   - ☑ `user.created`
   - ☑ `user.updated`
   - ☑ `user.deleted`
5. Click **Create**
6. On the next page, Clerk shows you the **Signing Secret** (starts with `whsec_…`). **Copy it.**
7. Go back to **Railway → staging → portal-staging → Variables** and paste this as `CLERK_WEBHOOK_SECRET`.

### Step 4.2 — Add webhook in production Clerk app

Repeat Step 4.1 in the **Production** Clerk app:
- Endpoint URL: `https://app.bell.qa/api/auth/clerk-webhook`
- Subscribe to `user.created`, `user.updated`, `user.deleted`
- Copy the `whsec_…` signing secret
- Add as `CLERK_WEBHOOK_SECRET` in **Railway → production → portal → Variables**

Railway redeploys again with the webhook secret.

---

## Phase 5 · Verify end-to-end (5 min)

After everything is set up:

1. Visit `https://app-staging.bell.qa` in a fresh incognito window
2. You should be redirected to `https://app-staging.bell.qa/sign-in`
3. Sign up with a new email — Clerk handles the flow
4. After sign-up, you land on the Portal UI
5. Click **Settings** → you should see your name + tenant ("X's Workspace") in the sidebar footer area
6. Open Railway → staging → portal-staging → **Deploy Logs** → search for `[auth]` — you should see `[auth] provisioned user <email> as owner of tenant 'X's Workspace'`

If steps 1–5 work, repeat with the production URL `https://app.bell.qa`. Sign up with your real email (the one listed in `BDI_PLATFORM_ADMIN_EMAILS`) — you'll be provisioned as **platform_admin** instead of owner.

---

## Troubleshooting

- **"Sign-in not configured" page** → `CLERK_PUBLISHABLE_KEY` not set on that service in Railway. Re-check.
- **Sign-up succeeds in Clerk but Portal shows "Account is still being set up"** → webhook didn't fire or signing-secret mismatch. Check Clerk → Webhooks → Attempts. Verify `CLERK_WEBHOOK_SECRET` matches between Clerk dashboard and Railway env var.
- **DNS not verifying** → wait longer (up to 24h). Check at dnschecker.org.
- **403 forbidden on admin.bell.qa** → expected unless your user has role `platform_admin`. The `BDI_PLATFORM_ADMIN_EMAILS` env var sets this on first sign-in. If you signed up before adding your email there, manually update via psql: `UPDATE users SET role='platform_admin' WHERE email='your@email.com'`.

---

## Local Mac — nothing changes

Your local Portal still runs `BDI_MODE=local-admin` (no auth). Same workflow, same `.command` files. Auth only kicks in on `app.bell.qa` / `app-staging.bell.qa` / `admin.bell.qa`.

---

## Checklist

- [ ] Created Clerk development app, copied `pk_test_` + `sk_test_` keys
- [ ] Configured dev app: domain `app-staging.bell.qa`, paths, allowed origins
- [ ] Created Clerk production app, copied `pk_live_` + `sk_live_` keys
- [ ] Configured prod app: domain `app.bell.qa`, paths, allowed origins
- [ ] Added Clerk CNAMEs at Namehero, verified green in Clerk dashboard
- [ ] Set Railway env vars on portal-staging (5 vars)
- [ ] Set Railway env vars on portal (5 vars)
- [ ] Created webhook in dev Clerk → saved signing secret to staging env var
- [ ] Created webhook in prod Clerk → saved signing secret to production env var
- [ ] Verified: sign-up at app-staging.bell.qa → land on Portal → see name in sidebar
- [ ] Verified: sign-up at app.bell.qa with platform_admin email → land on Portal → role=platform_admin

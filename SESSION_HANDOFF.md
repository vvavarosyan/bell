# Bell Data Intelligence — Session Handoff

**Last updated:** 2026-05-29 (Val + Claude session)
**Status:** ✅ ROOT CAUSE FOUND & FIXED in code — pending deploy to staging + prod

---

## ✅ RESOLVED — auth hang root cause (2026-05-29, second session)

**It was NOT the JWT / JWKS fetch.** A botched git merge-conflict resolution
(commit `27fd0b9 Merge branch 'main' into develop`) left two bare branch-label
tokens inside `Portal/server/lib/auth.js` `requireAuth()`:

- line ~163: a stray ` develop` (leftover from `<<<<<<< develop`)
- line ~182: a stray ` main` (leftover from `>>>>>>> main`)

These parse fine (bare identifier statements) but at RUNTIME `develop` throws
`ReferenceError: develop is not defined`. Because `requireAuth` is an async
middleware and Express has no async error handler, the rejected promise means
**no response is ever sent** → the request hangs ~20s then the browser aborts.
That is the exact "Signing you in…" symptom, and it's why adding `CLERK_JWT_KEY`
changed nothing — JWT verification was never the problem.

**Fix:** removed both stray tokens (kept the platform_admin auto-promote block,
which was the `develop` side of the conflict). Also found & fixed the SAME
botched-merge remnants in `Push Changes.command` (stray ` develop`/` main` plus a
duplicated old plain-pull block — kept the stash-pull-unstash flow).

Verified: `node --check Portal/server/lib/auth.js` OK, `bash -n Push Changes.command` OK,
repo re-scanned for conflict markers — none remain.

**To ship (click-only):**
1. Double-click `Push Changes.command` → pushes develop → staging deploys.
2. Test sign-in on the staging app URL — should no longer hang.
3. Double-click `Open Production Release.command` → opens develop→main PR; merge it → production deploys.
4. Test sign-in on https://app.bell.qa.

**Cleanup once confirmed working:** `CLERK_JWT_KEY` is now optional (the code
still supports offline verify and it's harmless to keep). The 8s verifyToken
timeout + console.error logging added last session are good to keep regardless.

---

## 🚨 (HISTORICAL) ACTIVE BLOCKER — superseded by the RESOLVED section above

**Symptom:** Signing in at https://app.bell.qa hangs forever on "Signing you in…" message.

**What happens:**
1. User goes to bell.qa → Sign in → enters admin@bell.qa creds (or any account) in Clerk
2. Clerk authenticates successfully, redirects back to app.bell.qa
3. Browser shows "Signing you in…" indefinitely
4. Network tab shows `/api/auth/me` request hangs (status=pending, 20+ sec) before timing out
5. No error message ever appears in the UI

**What we've already tried:**
- ✅ Removed auto-redirect-to-/sign-in on 401 in `Portal/ui/lib/api.js` (was causing redirect loop)
- ✅ Surfaced actual 401 reason in `Portal/ui/app.js` boot message instead of redirecting
- ✅ Added platform_admin auto-promote on every requireAuth (re-checks `BDI_PLATFORM_ADMIN_EMAILS`)
- ✅ Added lazy provisioning (create tenant + user on first authenticated request, no webhook required)
- ✅ Added email-relink path (if email exists with different `clerk_user_id`, UPDATE the clerk_user_id)
- ✅ Added `CLERK_JWT_KEY` env var support in `Portal/server/lib/auth.js` for **offline** JWT verification (avoids the JWKS network fetch)
- ✅ Added `Promise.race` with 8-sec timeout around `verifyToken()` so hangs fail loud instead of silent
- ✅ Added `console.error('[auth] verifyToken FAILED: …')` logging so Railway logs show the actual error
- ✅ Deployed to **BOTH** staging (portal-staging) AND production (portal) via develop → main
- ✅ Val added `CLERK_JWT_KEY` env var on **BOTH** Railway services (portal-staging + portal)
- ❌ **STILL STUCK at "Signing you in…"** after all of the above

**Diagnostic data from last Chrome inspection:**
- JWT alg: `RS256`
- JWT issuer: `https://clerk.bell.qa`
- JWT subject: `user_3EMAUME6MJznBolIwdP7SDb1Gsm`
- `/api/auth/me` ms_elapsed: 20482 (request hung 20+ seconds before abort)

**Root cause hypothesis (unconfirmed):**
`@clerk/backend`'s `verifyToken()` is trying to fetch JWKS from `https://clerk.bell.qa/.well-known/jwks.json` and that network call hangs from Railway's runtime. The `CLERK_JWT_KEY` env var should have made it skip the fetch — but the symptom didn't change, which means either:
- (a) The env var didn't take effect on Railway (typo in name, deploy didn't pick it up, wrong service)
- (b) The PEM key Val pasted is malformed (line endings stripped, missing BEGIN/END headers)
- (c) Something else entirely is hanging (DB query, Stripe call, etc.) — not the JWT verify

**Next concrete steps for the new session:**
1. **Check Railway logs immediately.** Open the `portal` service in Railway → Logs tab → reproduce the sign-in. Look for `[auth] verifyToken FAILED:` or `[auth] verifyToken_timeout_8s` line. If timeout fires, the JWT verify is still hanging → JWT_KEY didn't take effect. If a different error fires, fix that.
2. **Verify env var on Railway:** In Railway → portal service → Variables, confirm `CLERK_JWT_KEY` exists, name is exactly `CLERK_JWT_KEY` (case sensitive), value starts with `-----BEGIN PUBLIC KEY-----` and ends with `-----END PUBLIC KEY-----` with proper newlines preserved.
3. **Add a short-circuit log at top of `requireAuth`** to confirm the request is even reaching auth code:
   ```js
   console.log('[auth] requireAuth hit, CLERK_JWT_KEY set?', !!CLERK_JWT_KEY, 'token prefix:', m[1]?.slice(0,20));
   ```
4. **Suspect /api/auth/me isn't even the hang point.** If logs show requireAuth returns quickly, the hang must be downstream — DB query in `getOrCreateUserAndTenant`, or the `client.users.getUser()` call to Clerk API (which DOES need network). Check what's slow in `/api/auth/me` handler.
5. **Easier fallback:** Switch Clerk to **session-token cookie** mode (Clerk's "networkless" verification) OR drop @clerk/backend and verify JWT manually with `jsonwebtoken` + `jwks-rsa` with explicit timeout.

**Most likely actual culprit (untested theory):** the lazy provisioning calls `client.users.getUser(clerkUserId)` in `Portal/server/lib/auth.js` to fetch email/name — that's a network call to Clerk's API. If THAT's hanging from Railway, JWT verify could be fine but `getUser` hangs. Check this first.

---

## Project Overview

**Bell Data Intelligence (bell.qa)** — Qatar business intelligence platform that scrapes/aggregates Qatari company data from 3 sources (QFZ, QFC, MOCI), enriches it (LinkedIn, Apollo, etc.), assembles canonical records, and serves it via a SaaS Portal.

**Owner:** Val (vvavarosyan@yahoo.com)
**Hosting:** Railway (compute + Postgres) — NOT Vercel
**Auth:** Clerk (clerk.bell.qa)
**Billing:** Stripe (Elements custom UI, not Checkout)
**Email:** Resend
**DNS:** Namehero (Cloudflare deferred)

---

## Architecture

### Three deployments, one codebase

| Env | URL | Mode | Auth | Purpose |
|---|---|---|---|---|
| Local Mac | localhost (Portal app) | `BDI_MODE=local-admin` | None | Val's data engine; runs scrapers, builds DB |
| Production (user) | https://app.bell.qa | `BDI_MODE=user` | Clerk required + subscription gate | Customer-facing SaaS Portal |
| Production (admin) | https://admin.bell.qa | `BDI_MODE=admin` | Clerk required (platform_admin only) | Bell team's ops console |
| Marketing | https://bell.qa | n/a | Public | Next.js 14 marketing site |

Staging mirrors of all three: `staging.bell.qa`, `app-staging.bell.qa`, `admin-staging.bell.qa`.

### Branch model (GitFlow lite)
- `main` → production (auto-deploys to `portal`, `marketing`, `admin` services on Railway)
- `develop` → staging (auto-deploys to `portal-staging`, `marketing-staging`, `admin-staging`)
- All changes go to `develop` first, then PR to `main`
- Repo merge mode: **Merge commits** (NOT squash, NOT rebase — squash was creating phantom merge conflicts on every PR)
- "Require linear history" is DISABLED on main branch protection

### Click-only workflow constraint
**Val refuses to use the terminal or write code.** Everything must be:
- `.command` files (double-clickable shell scripts) at the workspace root
- Or buttons inside the Portal UI

Current `.command` files in `/Users/vva/Desktop/Bell Data Intelligence/`:
- `Push Changes.command` — stash → pull develop → commit → push develop
- `Open Production Release.command` — opens GitHub PR page for develop → main
- (and the older local-dev runners: Start Portal, Run Scrapers, etc.)

`Push Changes.command` has stash-pull-unstash flow to handle uncommitted local edits.

### Multi-tenancy (logical)
- All per-tenant tables have `tenant_id UUID NOT NULL` from day one
- Postgres RLS planned but NOT YET ENFORCED
- 6 roles: `platform_admin` / `owner` / `admin` / `lead` / `member` / `viewer`
- Subscription gate: no free tier; non-`platform_admin` users without active sub get bounced to `/subscribe`

### Subscription plans (QAR, monthly)
| Plan | Price | Stripe price ID env var |
|---|---|---|
| Starter | QAR 2,000 | `STRIPE_PRICE_ID_STARTER` |
| Business | QAR 10,000 | `STRIPE_PRICE_ID_BUSINESS` |
| Enterprise | QAR 30,000 | `STRIPE_PRICE_ID_ENTERPRISE` |

Defined in `Portal/server/config/plans.js`. Stripe runs in **subscription** mode with `payment_behavior: 'default_incomplete'` to return a PaymentIntent client_secret for Stripe Elements.

### Snowball doctrine
Every input enriches the DB. Every output feeds a public surface. Designed in for ingestion (publish flags) and Deep Data (Qatar Open Data syncs into companies).

---

## What's Built (Done)

### Data pipeline
- ✅ QFZ scraper (Qatar Free Zones investor directory)
- ✅ QFC scraper (Qatar Financial Centre public register)
- ✅ MOCI scraper (Ministry of Commerce business map)
- ✅ Enrichment stages: LinkedIn lookup, Apollo lookup, OpenAI normalization, contact extraction
- ✅ Assembly: dedup queue, BIN/PIN/JIN identifier assignment (only during Assembly), canonicalization
- ✅ Final published table with publish flags

### Portal (Express + vanilla React via htm)
- ✅ Sidebar nav with all sections (Companies, People, Jobs, Sources, Settings, Map, Dedup, Recent Jobs, Research, Deep Data, Archived)
- ✅ Companies tab + filters + drawer + edit + contacts + archive + reset enrichment
- ✅ People tab + drawer + edit + reveal + seniority recompute
- ✅ Jobs tab
- ✅ Settings tab (API keys via macOS Keychain on Mac, env vars on Railway)
- ✅ Sources tab (ingest/scrape triggers, live job stream)
- ✅ Map tab (Mapbox)
- ✅ Dedup Queue tab
- ✅ Recent Jobs tab
- ✅ Deep Data tab (Qatar Open Data via Opendatasoft API, 1,260 datasets, drawer w/ chart + records + preview, auto-sync at 3pm daily + manual button)
- ⏸️ Research tab — UI built (R1+R2) but engine paused (Firecrawl Spark broken: returns `data:null` even when credits charged)

### Marketing site (Next.js 14 at bell.qa)
- ✅ 16 capability pages live
- ✅ Megamenu w/ Intelligence section (4 items, sequential + divider layout)
- ✅ Buyer Intent + Prediction Engine as separate pages
- See [marketing memory] for naming conventions, canonical numbers, brand vocabulary

### Authentication & billing (Milestone B1)
- ✅ Clerk integration on production domain (clerk.bell.qa, JWT verification via @clerk/backend)
- ✅ Sign-up + Sign-in flows
- ✅ `/api/auth/mode` returns mode + publishable_key
- ✅ `/api/auth/me` lazy-provisions user + tenant on first request
- ✅ Platform admin auto-promote (re-checks BDI_PLATFORM_ADMIN_EMAILS on every requireAuth)
- ✅ Email-relink (handles re-signup with same email but new Clerk user ID)
- ✅ Subscribe page (Stripe Elements custom Bell-branded UI with plan radio cards + sticky order summary)
- ✅ Subscription gate at app boot (bootstrap polls billingSubscription up to 8x if returning from Stripe success)
- ✅ Sign out → /sign-in
- ❌ **JWT verification hanging on production — see ACTIVE BLOCKER above**

### Infrastructure
- ✅ Dockerfile-based deploys on Railway (portal, portal-staging, marketing, marketing-staging, admin, admin-staging)
- ✅ Postgres on Railway (production + staging instances)
- ✅ Migrations system in `Portal/server/migrations/`
- ✅ Custom domains: bell.qa, app.bell.qa, admin.bell.qa + staging mirrors all wired up via Namehero DNS
- ✅ SSL via Railway managed certs
- ✅ Stripe webhooks per environment (each has own signing secret)
- ✅ Resend for transactional email

---

## What's Pending

### Blocking (must do first)
- 🔴 **Fix JWT verification hang on app.bell.qa** (see ACTIVE BLOCKER)

### Milestone C — Local Mac → Railway data sync (✅ BUILT 2026-05-29, pending deploy + token)
Mechanism chosen: **one-way row-level upsert push** (NOT WAL replication / pg_dump —
those would clobber the tenants/users/billing tables that ALSO live in prod Postgres).
- New "Sync to Bell.qa" tab in the local Portal (platform_admin / System section).
  - **Push now** → incremental: only rows changed since the last push (updated_at watermark).
  - **Full resync** → every assembled row (button, with confirm).
- Soft-delete only: `archived=true` is synced and hides the row on the app; prod rows
  are NEVER hard-deleted by a sync.
- Syncs ASSEMBLED canonical rows only (bin/pin/jin assigned): companies, people, jobs,
  company_sources, person_companies. Mid-pipeline rows stay local.
- Child tables carry the PARENT'S natural key (company bin / person pin); the prod
  receiver resolves prod ids from those — local integer ids are meaningless on prod.
- Reveal state (`is_revealed`/`revealed_at`/`revealed_by`) is PROD-OWNED and deliberately
  NOT synced (a customer reveals on the app; the engine must never overwrite it).
- Machine-to-machine auth: shared `BDI_SYNC_TOKEN` (Keychain `sync-token` on Mac, env var
  on Railway). The `/api/sync/ingest` receiver checks Bearer === BDI_SYNC_TOKEN.
- Upsert SQL validated end-to-end against a real SQL engine (pg-mem): upsert, soft-delete,
  bin/pin resolution, idempotency, and the person_companies expression-index ON CONFLICT.

**Files:** `Portal/server/sync/{tables,ingest,push}.js`, `Portal/server/routes/sync.js`
(mounted at `/api/sync` in server.js), `Portal/ui/components/SyncTab.js` (+ Sidebar/app.js
wiring), `Portal/server/routes/settings.js` (allow `sync-token` key), `Portal/ui/lib/api.js`.

**TO SHIP (click-only + 1 Railway env var):**
1. Double-click `Push Changes.command` → staging deploys.
2. On Railway, add env var **`BDI_SYNC_TOKEN`** (a long random secret) to the **portal**
   service (production). Add it to **portal-staging** too if testing against staging first.
3. Test: in the local Portal → "Sync to Bell.qa" tab → paste the SAME token + set Target URL
   (https://app.bell.qa, or the staging app URL) → click "Push now". Watch the per-table counts.
4. Double-click `Open Production Release.command` → merge develop→main → production deploys.

**Fast-follow (not built yet):** Deep Data tables (od_datasets/od_records) are NOT synced in
v1 — the framework is table-driven so adding them later is small. Prod doesn't surface Deep
Data yet, so this wasn't blocking.

### Deferred features
- ⏸️ **Research section** — paused until Firecrawl fixes Spark Pro, OR we swap engine to plain scrape + LLM
- ⏸️ **Public bell.qa/data/<slug> pages** for Deep Data datasets
- ⏸️ **Deep Data → companies enrichment snowball** — wire dataset records into company records
- ⏸️ **Team section (T1–T4)** — invitations, roles, member management UI
- ⏸️ **Clerk custom signup fields** (company name, role, etc.)
- ⏸️ **Marketing smart header** — show "Dashboard" link when signed in, "Sign in" otherwise
- ⏸️ **Clerk branding** — apply Bell colors/logo to Clerk-hosted screens

### Tech debt
- ⏸️ Enforce Postgres RLS (currently logical only)
- ⏸️ Stripe webhook idempotency keys
- ⏸️ Better error UI on Portal 401s (currently shows raw reason string)

---

## Key Files / Where Things Live

### Portal (Express server + vanilla React UI)
- `Portal/server/index.js` — Express entry, wires all routes
- `Portal/server/lib/auth.js` — **Clerk JWT verification, lazy provisioning, platform_admin auto-promote** (currently broken on prod)
- `Portal/server/lib/db.js` — Postgres pool, **installs global int8 → JS Number parser** (do not remove)
- `Portal/server/lib/keychain.js` — macOS Keychain on Mac, env var fallback (`BDI_KEY_*`) on Linux
- `Portal/server/routes/billing.js` — Stripe Subscriptions API integration
- `Portal/server/routes/auth.js` — `/api/auth/mode` + `/api/auth/me`
- `Portal/server/config/plans.js` — 3 QAR plan tiers (Starter/Business/Enterprise)
- `Portal/server/migrations/` — SQL migrations (numeric prefix order)
- `Portal/ui/app.js` — React bootstrap, auth wiring, subscription gate
- `Portal/ui/lib/api.js` — fetch wrapper with Clerk token injection
- `Portal/ui/subscribe.html` — Stripe Elements custom UI
- `Portal/Dockerfile` — production build (Node 22, includes server/config thanks to fixed .dockerignore)
- `Portal/.dockerignore` — **must use `/Config/` (anchored) not `Config/`** — otherwise it silently excludes `server/config/`

### Marketing
- `Marketing/` (Next.js 14)
- See `bellqa_marketing_site_state` memory for content patterns

### .command files (workspace root)
- `Push Changes.command` — push develop → staging
- `Open Production Release.command` — open develop→main PR
- Older local-dev runners (Start Portal, Run Scrapers, etc.)

### This handoff
- `SESSION_HANDOFF.md` ← you are here

---

## Environment Variables

### Required on every Portal service (Railway)
```
BDI_MODE=user|admin|local-admin
DATABASE_URL=postgres://...
BDI_PLATFORM_ADMIN_EMAILS=admin@bell.qa,vvavarosyan@yahoo.com

# Clerk
CLERK_SECRET_KEY=sk_live_...
CLERK_PUBLISHABLE_KEY=pk_live_...
CLERK_JWT_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----   # ← just added, may be broken

# Stripe
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_STARTER=price_...
STRIPE_PRICE_ID_BUSINESS=price_...
STRIPE_PRICE_ID_ENTERPRISE=price_...

# Resend
RESEND_API_KEY=re_...
RESEND_FROM=noreply@bell.qa

# API keys (Linux env-var fallback for keychain.js)
BDI_KEY_OPENAI=...
BDI_KEY_FIRECRAWL=...
BDI_KEY_APIFY=...
BDI_KEY_MAPBOX=...   # used by both Portal and Marketing
```

### Marketing (Next.js)
```
NEXT_PUBLIC_MAPBOX_TOKEN=pk....
NEXT_PUBLIC_APP_URL=https://app.bell.qa
```

### Local Mac (no env, uses macOS Keychain via `security` CLI)
- Keys stored under service `bdi-keys`
- `BDI_MODE=local-admin` set in Start Portal.command

---

## Doctrines (saved memory)

These are loaded into every Claude session via MEMORY.md:

1. **Snowball Doctrine** — every input enriches the DB, every output feeds a public surface
2. **Click-only workflow** — Val won't use terminal; everything via .command files or UI buttons
3. **Always deploy both envs** — every code change must ship to BOTH staging AND production in the same session, no exceptions
4. **Bell architecture** — one codebase, three deployments, logical multi-tenancy + RLS, optional dedicated-instance tier; all per-tenant tables get tenant_id from day-one
5. **Deployment stack** — Railway (compute + Postgres) + Cloudflare deferred + Clerk + Stripe + Resend; GitFlow lite (main=prod, develop=staging)
6. **Postgres bigint parser** — db.js installs int8→Number, do not remove
7. **Dedup scoring** — current weights documented, gmaps_place_id/same_city/same_country deliberately excluded
8. **Research paused** — Firecrawl Spark broken, resume when fixed or swap engine

---

## Recent Debugging Trail (chronological)

**Today (2026-05-29) auth debugging:**
1. After Milestone B1 deploy, sign-in at app.bell.qa hung at "Signing you in…"
2. Initial theory: redirect loop. Removed auto-redirect on 401 in api.js. → Symptom unchanged.
3. Surfaced 401 reason in app.js boot message. → Boot message never appeared (request hanging, not 401-ing).
4. Chrome inspection: `/api/auth/me` request status=pending, hangs 20+ sec, then aborts.
5. Got JWT details from token decode: alg RS256, iss https://clerk.bell.qa, sub user_3EMAUME6MJznBolIwdP7SDb1Gsm.
6. Diagnosed: `@clerk/backend.verifyToken()` defaults to JWKS network fetch from clerk.bell.qa/.well-known/jwks.json — that fetch hangs from Railway.
7. **Fix shipped:** Added `CLERK_JWT_KEY` env var support + 8-sec timeout + console.error logging in `Portal/server/lib/auth.js`.
8. Pushed develop → staging deployed. Merged develop → main → production deployed.
9. Val added `CLERK_JWT_KEY` env var on both portal and portal-staging services in Railway.
10. **Re-tested — STILL STUCK** at "Signing you in…". (← current state)

**Earlier in session:**
- Deployed Milestone A (online with Railway + custom domains + Postgres + Dockerfile)
- Deployed Milestone B1 (Clerk + multi-tenant schema + Stripe Elements subscribe page)
- Fixed Push Changes.command pull failures (added stash-pull-unstash flow)
- Fixed GitHub squash-merge phantom conflicts (changed merge mode to Merge commits, removed linear history requirement)
- Fixed .dockerignore bug excluding server/config/plans.js (changed `Config/` → `/Config/`)

---

## How to Continue in a New Session

Tell the new Claude:

> "Read `/Users/vva/Desktop/Bell Data Intelligence/SESSION_HANDOFF.md` — that's where we left off. The blocker is the JWT verification hang on app.bell.qa. Start with the 'Next concrete steps' under ACTIVE BLOCKER."

Memory files at `/Users/vva/Library/Application Support/Claude/local-agent-mode-sessions/.../memory/` will auto-load. The new session should:
1. Read this handoff doc first
2. Check Railway production logs for `[auth] verifyToken FAILED:` or `[auth] verifyToken_timeout_8s`
3. If timeout fires → `CLERK_JWT_KEY` didn't take effect (verify env var name + PEM format)
4. If different error → fix that
5. If logs show nothing during sign-in → request isn't reaching auth code; check Express middleware order
6. Strong suspect: `client.users.getUser()` call inside lazy provisioning is the real hang point, not verifyToken — try short-circuiting it with just JWT claims for first response

# Bell.qa — Going Online · Setup Guide

This is your step-by-step guide to take what we've built locally and deploy it to the world. Follow the steps in order — each one unblocks the next. You can stop and restart at any phase; nothing is destructive until the final deploy.

**Time estimate:** 1.5–2 hours of clicking through dashboards, plus DNS propagation wait (~30 min to 2 hours).

**Cost expectation:** Railway Pro plan ~$20/mo to start; Postgres + 2 small services included. Total ~$20-30/mo until traffic ramps.

---

## Before you begin

Make sure you have logins ready for all these (you said you do):

- [ ] GitHub account
- [ ] Railway account (you have Pro plan with 32GB/32vCPU credit)
- [ ] Namehero account (where `bell.qa` is registered)
- [ ] Stripe account (we'll use Test mode first)
- [ ] Clerk account
- [ ] Resend account

Open all of these in browser tabs now. Keep them open through the whole guide.

---

## Phase 1 · GitHub repo (15 min)

Goal: get the `Bell Data Intelligence` folder onto GitHub as a private repo.

### Step 1.1 — Create the empty GitHub repo

1. Go to **github.com** → click the **"+"** icon top right → **"New repository"**.
2. Fill in:
   - **Repository name:** `bell-data-intelligence` (or whatever you prefer — keep it lowercase, hyphen-separated, no spaces)
   - **Description:** "Bell.qa — Qatar's intelligence platform"
   - **Visibility:** **Private** (you can flip to public later if you want)
   - **DO NOT** check "Add a README", "Add .gitignore", or "Choose a license" — we already have files in our folder; an empty remote is what we want
3. Click **"Create repository"**.
4. You'll land on a page with a URL like `https://github.com/YOUR-USERNAME/bell-data-intelligence`. **Copy this URL.** You'll need it in Step 1.2.

### Step 1.2 — Connect your local folder to the repo

In your `Bell Data Intelligence` folder, you'll find a file called **`1. Connect to GitHub.command`** (created by Claude in this session). Double-click it.

A Terminal window opens. It will:

1. Initialize git in this folder
2. Ask for your GitHub repo URL — paste the URL from Step 1.1 and press Enter
3. Create the initial commit
4. Push everything to GitHub

When it finishes, you'll see "Push successful" and the terminal stays open showing the result. You can close it.

**Refresh your GitHub repo page** — you should now see all your files (Portal, bell-marketing, etc.).

### Step 1.3 — Create the `develop` branch

1. On your repo page on GitHub, look at the file tree. Above the file list, there's a dropdown that says **`main`**. Click it.
2. In the text box that appears, type **`develop`**.
3. Click **"Create branch: develop from main"**.

Now you have two branches: `main` (production) and `develop` (staging).

### Step 1.4 — Protect the `main` branch

This stops you from accidentally pushing broken code to production.

1. On your repo, click **"Settings"** tab (top right of the repo, not your account settings).
2. In the left sidebar: **"Branches"**.
3. Click **"Add classic branch protection rule"** (or "Add rule").
4. **Branch name pattern:** `main`
5. Check the following boxes:
   - ☑ Require a pull request before merging
   - ☑ Require approvals: **0** (you're a solo team, leave at 0)
   - ☑ Require linear history (optional but cleaner)
6. Click **"Create"** at the bottom.

Now you can't push directly to main — only via Pull Request from develop. ✅

---

## Phase 2 · Railway project + Postgres (30 min)

Goal: create a Railway project with two environments (production + staging), each with its own Postgres.

### Step 2.1 — Create the Railway project

1. Go to **railway.com** → click **"+ New Project"** top right.
2. Choose **"Empty Project"**.
3. Name it: **`bell-data-intelligence`** (or just `bell`).
4. You'll land on an empty canvas.

### Step 2.2 — Add Postgres to the project

1. On the project canvas, click **"+ Create"** → **"Database"** → **"Add PostgreSQL"**.
2. A Postgres service appears. Railway auto-generates a password and exposes connection details via env vars.
3. Click the Postgres service → **"Variables"** tab. Note: you don't need to copy anything; Railway will inject these into your other services automatically via `${{Postgres.DATABASE_URL}}` references.

### Step 2.3 — Create the staging environment

By default Railway has one environment called **"production"**. We want a second one called **"staging"**.

1. Top-right of the project canvas, click the environment dropdown (it says **"production"**).
2. Click **"+ New Environment"** at the bottom of the dropdown.
3. Name it: **`staging`**.
4. **"Source environment"**: choose **"production"**. This duplicates the current setup (including Postgres) into staging.
5. Click **"Create"**.

Now you have two environments with separate Postgres instances. Switch between them using the dropdown.

### Step 2.4 — Connect Railway to your GitHub repo

In Railway, click your project → click **"+ Create"** on the canvas → choose **"GitHub Repo"**.

If this is your first time, Railway will ask you to install the GitHub app:

1. Click **"Configure GitHub App"** → authorize Railway → choose **"Only select repositories"** → pick `bell-data-intelligence` → click **"Install"**.
2. Back on Railway, the dropdown should now show your repo. Select it.
3. **Branch:** choose **`develop`** for staging environment (you'll set `main` for production in Step 2.8).
4. **Service name:** type **`marketing`** (we'll add the other services next).
5. **Root directory:** type **`bell-marketing`** (this tells Railway to deploy only this subdirectory).
6. Click **"Deploy"**.

Railway starts building. You'll see logs streaming. First build can take 2-5 minutes.

### Step 2.5 — Add the Portal service

Click **"+ Create"** on the canvas again → **"GitHub Repo"** → same repo.

1. **Service name:** `portal`
2. **Root directory:** `Portal/server`
3. **Branch:** `develop`
4. Click **"Deploy"**.

### Step 2.6 — Configure environment variables for the Portal

The Portal needs to connect to Postgres. Click the **portal** service → **"Variables"** tab → **"+ New Variable"**.

Add these one at a time:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Click "Reference" button → choose `Postgres` → `DATABASE_URL`. This auto-links to the shared Postgres. |
| `HOST` | `0.0.0.0` |
| `NODE_ENV` | `production` |
| `BDI_MODE` | `staging` (we'll set to `user` for production later) |

Save. Railway will redeploy the portal with these variables.

### Step 2.7 — Configure environment variables for the marketing site

Click the **marketing** service → **"Variables"** tab. Add:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_SITE_URL` | `https://staging.bell.qa` (we'll add the domain in Phase 3) |

You can skip Mapbox token for now — the map won't render on staging without it but the site will still build. Add later if you want.

### Step 2.8 — Switch to production environment and configure it

1. Use the environment dropdown top-right → switch to **`production`**.
2. You'll see the same services (they were copied from production setup, but they're not yet pointing at `main`).
3. Click **marketing** service → **"Settings"** tab → **"Source"** section → change branch to **`main`**.
4. Repeat for **portal** service → branch **`main`**.
5. Go to Variables tab for each service and update:
   - Portal: `BDI_MODE` = `user` (instead of `staging`)
   - Marketing: `NEXT_PUBLIC_SITE_URL` = `https://bell.qa`

### Step 2.9 — Test staging is live

In the **staging** environment, click the **marketing** service → **"Settings"** tab → **"Networking"** section → click **"Generate Domain"**. Railway creates a URL like `marketing-production-abcd.up.railway.app`.

Click it. Your marketing site should load! 🎉

Do the same for the **portal** service → you'll get a URL → it should show the Portal UI.

If anything fails, check the **"Deployments"** tab → click the failing deployment → read the logs. Common issue: missing env var.

---

## Phase 3 · Custom domains (30 min + DNS propagation)

Goal: point `bell.qa`, `app.bell.qa`, `admin.bell.qa` (production) and `staging.bell.qa`, `app-staging.bell.qa` (staging) to Railway.

### Step 3.1 — Add custom domains in Railway (production)

Switch to the **production** environment.

For each service (marketing, portal), do this:

1. Click the service → **"Settings"** → **"Networking"** → **"Custom Domain"**.
2. For **marketing**: enter `bell.qa` → click "Add". Railway shows you a CNAME or A record to add at your DNS.
3. For **portal**: enter `app.bell.qa` → "Add". Same — note the DNS record Railway gives you.

For now we'll point **admin.bell.qa** to the same portal service (the admin tab visibility comes later via env vars). Add `admin.bell.qa` to the portal service too.

**Important:** Railway gives you slightly different record types depending on whether you're using the apex (`bell.qa`) or a subdomain (`app.bell.qa`):
- **Apex** (`bell.qa`): an A or AAAA record, or a CNAME if your DNS supports CNAME flattening (Namehero does)
- **Subdomain** (`app.bell.qa`, `admin.bell.qa`): a CNAME pointing at Railway's `*.up.railway.app` hostname

**Write down each record Railway gives you.** You'll add them at Namehero next.

### Step 3.2 — Add staging custom domains

Switch to the **staging** environment.

- Marketing service → add `staging.bell.qa`
- Portal service → add `app-staging.bell.qa` and `admin-staging.bell.qa`

Note the DNS records.

### Step 3.3 — Update DNS at Namehero

1. Log into Namehero → **"Domain List"** → **"Manage"** next to `bell.qa`.
2. Click **"Manage DNS Records"** (or similar — Namehero's UI may have moved).
3. **First**: if `bell.qa` is currently pointing to your Namehero VPS hosting for the old site, you'll be REPLACING those records. Take a screenshot of the current DNS before making changes (so you can revert if needed).
4. Add the records Railway gave you. Each record will look like:

   | Type | Host | Value | TTL |
   |---|---|---|---|
   | CNAME | `@` (or `bell.qa`) | `marketing-production-xxxx.up.railway.app` | Automatic |
   | CNAME | `app` | `portal-production-xxxx.up.railway.app` | Automatic |
   | CNAME | `admin` | `portal-production-xxxx.up.railway.app` | Automatic |
   | CNAME | `staging` | `marketing-staging-xxxx.up.railway.app` | Automatic |
   | CNAME | `app-staging` | `portal-staging-xxxx.up.railway.app` | Automatic |
   | CNAME | `admin-staging` | `portal-staging-xxxx.up.railway.app` | Automatic |

   *(Replace the `xxxx` parts with the actual hostnames Railway gave you.)*

5. **Delete any old A records** for `@`, `www`, etc. that were pointing to your Namehero VPS — those would conflict.

6. Save.

### Step 3.4 — Wait for propagation

DNS changes take 5 minutes to 2 hours globally. You can check at **dnschecker.org** by entering `bell.qa` — when most servers show the Railway CNAME, you're propagated.

Railway will auto-issue SSL certificates within a few minutes after propagation. The domain entries in Railway should turn green ✅ when SSL is ready.

### Step 3.5 — Verify

Once propagated:

- Visit `https://bell.qa` → marketing site loads with HTTPS ✅
- Visit `https://app.bell.qa` → Portal loads ✅
- Visit `https://staging.bell.qa` → staging marketing loads ✅
- Visit `https://app-staging.bell.qa` → staging Portal loads ✅

🎉 **You're live.**

---

## Phase 4 · Database migrations (10 min)

Your Postgres on Railway is empty. We need to run the migrations to create the tables.

The Portal's `migrate.js` auto-runs all migrations on boot — so when the Portal service starts, it should apply migrations against Railway's Postgres automatically. Check the Portal service's **"Deployments"** → latest deployment → logs. You should see lines like `[bdi] Applied N migration(s): 0001, 0002, ...`.

If migrations didn't run for any reason, you can trigger them by restarting the Portal service: **Settings → Restart**.

---

## Phase 5 · Initial data sync from local to Railway (later)

For now, Railway's Postgres is empty (just schema, no data). Your local Mac has all the Qatari company/people/job/Open Data records.

We'll wire the local → Railway sync in a later session (Milestone C). For now, the production Portal will show empty tables. That's fine — we'll populate it before you launch publicly.

---

## Daily workflow once everything is set up

Your normal cycle becomes:

1. **Make code changes locally** (with me in Cowork)
2. **Double-click `Push Changes.command`** — commits and pushes to `develop` → auto-deploys to staging
3. **Test on `app-staging.bell.qa`** — click around, verify it works
4. **Double-click `Open Production Release.command`** — opens a GitHub URL to create a PR from `develop` → `main`
5. **Review and merge the PR** in your browser
6. Railway auto-deploys to production. You're live within ~3 minutes.

If something breaks in production, you can **revert** the merge commit in GitHub and Railway will auto-deploy the previous version within 3 minutes.

---

## What's NOT in this guide (deferred to later milestones)

- **Cloudflare CDN** — adds edge caching globally. Deferred per your call. Easy to add later.
- **Clerk authentication** — Milestone B. Adds sign-in/sign-up flows to `app.bell.qa`.
- **Stripe billing** — Milestone B. Adds paid subscriptions.
- **Resend transactional email** — Milestone B. Welcome emails, receipts, etc.
- **Local → Railway data sync** — Milestone C. Pushes your local Qatari company data to production.
- **Multi-tenancy + RLS** — done with Clerk integration in Milestone B.
- **Sentry error monitoring** — optional, add when you have your first real users.

---

## When something doesn't work

1. **Railway service won't start** → check logs in the service's "Deployments" tab.
2. **Custom domain shows "Not secure" or 502** → SSL hasn't been issued yet. Wait 5-10 more minutes. If still broken after 30 min, delete and re-add the domain in Railway.
3. **DNS not propagating** → wait longer (up to 24h max). Check with dnschecker.org.
4. **Portal shows "Database not connected"** → verify `DATABASE_URL` env var is set, referenced from the Postgres service.

Anything else — start a Cowork session with me and paste the error. I'll diagnose.

---

## Checklist (tick as you go)

- [ ] **Phase 1** GitHub
  - [ ] Created empty private repo
  - [ ] Double-clicked `1. Connect to GitHub.command` and pushed
  - [ ] Created `develop` branch on GitHub
  - [ ] Protected `main` branch (require PR)
- [ ] **Phase 2** Railway
  - [ ] Created project `bell-data-intelligence`
  - [ ] Added Postgres
  - [ ] Created `staging` environment (duplicated from production)
  - [ ] Connected GitHub repo
  - [ ] Created `marketing` service (root dir: `bell-marketing`, branch: develop for staging / main for production)
  - [ ] Created `portal` service (root dir: `Portal/server`, branch: develop for staging / main for production)
  - [ ] Set env vars on both services in both environments
  - [ ] Generated Railway domain → tested staging marketing loads
  - [ ] Generated Railway domain → tested staging portal loads
- [ ] **Phase 3** Custom domains
  - [ ] Added all 6 custom domains in Railway (3 production + 3 staging)
  - [ ] Updated DNS at Namehero
  - [ ] Waited for propagation
  - [ ] Verified all 6 URLs load with HTTPS ✅
- [ ] **Phase 4** Migrations
  - [ ] Confirmed Portal logs show "Applied N migration(s)"

When all four phases are checked: **you're online**. 🚀

# Bell.qa Marketing Site — Build Plan

> Locked decisions and proposed structure for the new public-facing
> `bell.qa` marketing site, written 2026-05-23.

---

## 1. Confirmed Architecture — Four Areas

| Area | Audience | URL | Status | Tech |
|------|----------|-----|--------|------|
| **Bell Data Intelligence (BDI)** | You + admin team | Local Mac only | ✅ Built (this Portal) | Node + React + local Postgres |
| **Marketing site** | Anyone (public) | `bell.qa` | 🛠️ This plan | Next.js (static-first) |
| **User Portal** | Signed-in customers | `app.bell.qa` | Future | Next.js + Clerk auth |
| **Business Admin** | You + admin team (hosted) | `admin.bell.qa` | Future | Next.js + Clerk auth |

**Separation of admin responsibilities:**

- **BDI handles data admin** (locally, on your Mac): scraping, enrichment, dedup, assembly, identifier assignment, data quality. Heavy lifting stays local. Final clean data is pushed to the hosted Postgres.
- **`admin.bell.qa` handles business admin** (hosted, accessible anywhere): user management, credit allocation/deduction, signup analytics, revenue stats, customer support, content moderation. Light, no data ops.

This split is the right call. Data work belongs on a beefy local machine where iteration is free; business work belongs on a hosted dashboard where you can act from anywhere.

---

## 2. The Data Flow (locked)

```
LOCAL (your Mac)                              HOSTED (Railway)
────────────────                              ──────────────────
                                              ┌──────────────────┐
┌────────────────────────┐                    │ bell.qa          │
│ Bell Data Intelligence │                    │ (marketing,      │
│ ─────────────────────  │                    │  static, no DB)  │
│ • Scrapers             │                    └──────────────────┘
│ • Enrichment           │                    ┌──────────────────┐
│ • Dedup + Assembly     │                    │ app.bell.qa      │
│ • Local Postgres       │   Push Final       │ (user portal,    │
│ • Admin Portal UI      │── Data (JSON) ────►│  Clerk auth)     │
└────────────────────────┘                    └──────────────────┘
                                              ┌──────────────────┐
                                              │ admin.bell.qa    │
                                              │ (business admin) │
                                              └──────────────────┘
                                              ┌──────────────────┐
                                              │ Bell.qa Postgres │
                                              │ • Final data     │
                                              │ • Users (Clerk)  │
                                              │ • Credits        │
                                              │ • Leads          │
                                              │ • CRM data       │
                                              └──────────────────┘
```

Marketing site needs **no database** at all — every page is statically rendered at build time. Only exception is the Contact form, which posts to a tiny API route that stores the lead and triggers an email via Mailtrap.

---

## 3. Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Framework** | **Next.js 14 (App Router)** | Static-first, React, mature ecosystem, deploys anywhere |
| **Language** | **TypeScript** | Type safety, fewer runtime bugs, scales to multiple devs |
| **Styling** | **Tailwind CSS** | Fast iteration, no CSS bloat, design tokens built in |
| **Content** | **MDX** | Write blog/docs as Markdown with React components inline |
| **Forms** | **Next.js Route Handlers + Server Actions** | No separate API layer needed |
| **Animation** | **Framer Motion (sparingly)** | Subtle scroll reveals, hover effects |
| **Icons** | **Lucide React** | Same family as BDI Portal, brand consistency |
| **Fonts** | **Inter + JetBrains Mono** | Modern, clean, free, what BDI already uses |
| **Email** | **Mailtrap** | Same as your stack; transactional sends for contact form |
| **Deployment** | **Railway** | Same platform as Bell.qa backend; auto-deploy from GitHub |
| **Source** | **GitHub** | Separate `bell-marketing` repo, not in BDI |

**Tech stack scale assessment** (confirming earlier):
- Stack is **solid for v1 through ~100K users**.
- Likely future migrations *if* scale demands: Postgres → AWS RDS, Auth → Auth0/self-hosted, Email → Resend/Postmark/SES.
- None urgent. All current vendors are industry-standard.

---

## 4. Repository Structure

**Separate repo:** `bell-marketing` (new, cleanest isolation per your choice).

```
bell-marketing/
├── app/
│   ├── (landing)/               ← v1 main pages
│   │   ├── page.tsx             ← Home
│   │   ├── pricing/page.tsx
│   │   ├── features/page.tsx
│   │   └── contact/page.tsx
│   ├── (resources)/             ← reserved routes (placeholders at launch)
│   │   ├── docs/page.tsx
│   │   ├── blog/page.tsx
│   │   ├── companies/page.tsx
│   │   ├── research/page.tsx
│   │   ├── news/page.tsx
│   │   ├── our-data/page.tsx
│   │   └── free-tools/page.tsx
│   ├── api/
│   │   └── contact/route.ts     ← Contact form handler
│   ├── layout.tsx               ← Root layout: fonts, metadata, theme
│   ├── globals.css
│   ├── not-found.tsx
│   ├── sitemap.ts               ← Auto-generated sitemap
│   ├── robots.ts                ← Auto-generated robots.txt
│   └── opengraph-image.tsx      ← Auto-generated OG image
├── components/
│   ├── nav/                     ← Top navigation, mobile menu
│   ├── hero/                    ← Landing hero with gradient text
│   ├── pricing/                 ← Tier cards, comparison table
│   ├── feature-grid/            ← Reusable feature showcase
│   ├── footer/
│   ├── cta-section/             ← Reusable "Get Started" blocks
│   └── ui/                      ← button, card, badge, input
├── content/
│   ├── pricing-tiers.ts         ← Single source of truth for plans
│   ├── features.ts              ← Feature catalog
│   └── navigation.ts            ← Nav structure
├── public/
│   ├── logo.svg
│   ├── og-image.png
│   └── favicon files
├── lib/
│   ├── seo.ts                   ← Per-page metadata helpers
│   └── mail.ts                  ← Mailtrap client
├── tailwind.config.ts
├── tsconfig.json
├── next.config.mjs
├── package.json
└── README.md
```

---

## 5. Visual Design Direction

**Style:** dark, premium, technical — extending the BDI "Intelligence Command" aesthetic to public web. Reference points: **Linear.app**, **Vercel.com**, **Cursor.com**.

**Design tokens** (a tiny `@bell/brand` package shared between marketing and future user portal):

```ts
colors:
  bg:           #0a0e1a   // deep navy/black (matches BDI --bg)
  bg-elev:      #131829
  bg-elev-2:    #1a2034
  border:       #2a3149
  text:         #e6edff
  text-muted:   #8a93a6
  text-dim:     #5a6478
  accent:       #5b8cff   // BDI primary blue
  accent-bright:#8bb0ff
  accent-fade:  #5b8cff20

fonts:
  display:  Inter (700-900 weights for hero)
  body:     Inter (400-500)
  mono:     JetBrains Mono (for data/numbers in marketing)
```

**Visual treatments:**
- Big bold hero typography with subtle gradient text effects on accent words
- Generous whitespace
- Subtle gradient glows behind accent CTAs
- Smooth scroll-triggered fade-ins (Framer Motion, low-motion only)
- Real numbers/data sprinkled throughout to convey scale ("33,845 verified companies")
- Screenshots of the Portal as product visuals (no fake mockups)

---

## 6. Page Inventory

### v1 (this round of build)

| Route | Purpose | Components |
|-------|---------|------------|
| `/` | Home / Landing | Hero, trust strip, 3 feature highlights, pricing snippet, final CTA |
| `/pricing` | Tier comparison | Tier cards, comparison table, FAQ accordion |
| `/features` | Product detail | Hero + category nav, one detailed section per major capability |
| `/contact` | Get in touch | Form: name/email/company/message + confirmation screen |

### Reserved routes (placeholders at launch, content later)

| Route | Purpose | Initial state |
|-------|---------|---------------|
| `/docs` | User guides, API docs | "Coming soon" + SEO meta wired |
| `/blog` | Insights, posts | "Coming soon" + listing scaffold |
| `/companies` | Public preview of dataset (SEO magnet) | Empty shell, route reserved |
| `/research` | Published market research | "Coming soon" |
| `/news` | Press releases, announcements | "Coming soon" |
| `/our-data` | Deep dive on the dataset (sources, coverage, freshness) | "Coming soon" |
| `/free-tools` | Free lead-magnet tools | "Coming soon" |

Reserving routes now means SEO is set up correctly from day one, and shipping a new page later is one PR away.

---

## 7. Performance & SEO

**Performance targets:**
- Lighthouse 100 across Performance / Accessibility / Best Practices / SEO on Home
- LCP < 1s
- FCP < 0.5s
- Initial JS bundle < 100KB
- All images via `next/image` (lazy, AVIF/WebP, responsive)
- Fonts self-hosted (no Google Fonts blocking)

**SEO setup:**
- Per-page metadata in route `generateMetadata()`
- Auto-generated `sitemap.xml` and `robots.txt`
- OpenGraph image per route (auto-generated)
- Schema.org structured data: `Organization`, `Product`, `Article` (blog), `FAQPage` (pricing)
- Canonical URLs everywhere
- Arabic alternate hreflang (future, if you launch a /ar route)

---

## 8. Forms & API

**Contact form flow:**

1. User submits `name / email / company / message` on `/contact`
2. Form POSTs to `/api/contact` (Next.js route handler)
3. Handler validates + writes to Bell.qa Postgres `leads` table (new):
   ```sql
   leads (id, name, email, company, message, source_page, ip, ua, created_at)
   ```
4. Handler sends email notification via Mailtrap to your inbox
5. Returns success → confirmation screen ("We'll be in touch within 24 hours")
6. Light spam protection: honeypot field + simple rate limit by IP

No other forms in v1.

---

## 9. Deployment

- **GitHub repo:** new `bell-marketing` repo, public or private as you prefer
- **Railway service:** `bell-marketing-web` (separate from existing bell.qa Railway service)
- **Auto-deploy:** main branch → production
- **PR previews:** branch deploys for review before merge
- **Custom domain:** `bell.qa` (DNS cutover from existing site)
- **Staging URL:** `bell-marketing-staging.up.railway.app` (auto-provisioned by Railway)
- **Existing bell.qa:** stays untouched until you say to cut DNS over — graceful migration

---

## 10. Build Sequence

| Round | Scope | Deliverable |
|-------|-------|-------------|
| **1** *(this round)* | Plan approval + repo scaffold + design system | Empty Next.js project with brand tokens, nav, footer, layout |
| **2** | Home page | Hero, trust strip, feature highlights, pricing snippet, CTA |
| **3** | Pricing page | Tier cards, comparison table, FAQ |
| **4** | Features page | Category nav + per-capability sections |
| **5** | Contact form | UI + `/api/contact` handler + Mailtrap wiring + `leads` table migration |
| **6** | Reserved routes | "Coming soon" pages with proper SEO for /docs, /blog, /companies, /research, /news, /our-data, /free-tools |
| **7** | Deploy + DNS cutover | Push to Railway, cut bell.qa DNS, verify |

---

## 11. Open Decisions Before Building

These four items need answers before Round 2:

1. **Pricing tiers** — what are the plans, prices, and what does each include?
2. **Free Tools list** — which 1-3 tools to prioritize first (a) free company lookup, (b) industry report generator, (c) something else?
3. **Logo** — keep existing Bell.qa logo or refresh? (Send me the SVG if existing.)
4. **Contact form recipient** — your email address for lead notifications (yes, what we have on file is fine, just confirming).

Plus one timing decision later:

5. **DNS cutover** — when bell.qa points to the new site (we don't have to decide now, but it'll come up at Round 7).

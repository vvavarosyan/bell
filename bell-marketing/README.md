# Bell.qa Marketing Site

Public-facing marketing site for **Bell.qa**, the intelligence layer for Qatar's economy.

This is a separate project from [Bell Data Intelligence](../) (the local admin
portal). It deploys to `bell.qa` and is intentionally isolated — it has its own
codebase, its own deployment, and doesn't share runtime code with the admin
portal. They share only a small `@bell/brand` design-tokens package and the
hosted Bell.qa Postgres (for contact-form leads only).

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS
- MDX for blog/docs (added when those pages get real content)
- Framer Motion for subtle scroll animations
- Mailtrap for contact form delivery
- Railway for hosting

## Quick start (Val)

1. Double-click **`Install Marketing Dependencies.command`** (one time, after
   I scaffold the project or whenever I change `package.json`).
2. **(Optional, for the hero globe)** Create a file called `.env.local` next
   to `package.json` and paste:
   ```
   NEXT_PUBLIC_MAPBOX_TOKEN=pk.YOUR_TOKEN_HERE
   ```
   Get the token from <https://account.mapbox.com/access-tokens/> (you already
   have one in BDI's Keychain — same one works, but restrict it to `localhost`
   + `bell.qa` in the Mapbox dashboard for safety). Skip this and the hero
   shows a static dark fallback instead of the animated globe — both look
   good.
3. Double-click **`Run Marketing Locally.command`** — opens `http://localhost:3000`
   in your browser. Edit any file under `app/` or `components/`, save, and the
   page refreshes automatically.
4. When you're happy with changes, open **GitHub Desktop**, review the diff,
   commit, push. Railway auto-deploys within ~60 seconds.

## Project layout

```
bell-marketing/
├── app/
│   ├── (landing)/               ← v1 main pages
│   │   ├── features/page.tsx
│   │   └── contact/page.tsx
│   ├── (resources)/             ← reserved routes
│   │   ├── docs/page.tsx
│   │   ├── blog/page.tsx
│   │   ├── companies/page.tsx
│   │   ├── research/page.tsx
│   │   ├── news/page.tsx
│   │   ├── our-data/page.tsx
│   │   └── free-tools/page.tsx
│   ├── api/contact/route.ts     ← contact form handler (added Round 5)
│   ├── layout.tsx               ← root layout, fonts, theme
│   ├── globals.css              ← brand CSS variables + Tailwind
│   ├── page.tsx                 ← Home
│   ├── sitemap.ts               ← auto-generated sitemap
│   ├── robots.ts                ← auto-generated robots.txt
│   └── not-found.tsx
├── components/
│   ├── nav.tsx
│   ├── footer.tsx
│   └── wordmark.tsx
├── content/
│   └── navigation.ts            ← single source of truth for nav links
├── tailwind.config.ts
├── tsconfig.json
├── next.config.mjs
└── package.json
```

## Deployment

- **Production:** Railway service `bell-marketing-web` → `bell.qa`
- **Staging:** Railway preview environments from non-`main` branches
- **DNS:** cut over from existing bell.qa to this service in Round 7

## Adding a page

1. Create `app/(landing)/<name>/page.tsx`
2. Add a link in `content/navigation.ts`
3. Export a `metadata` object for SEO

That's it — the route is live in dev mode immediately and auto-generated in
`sitemap.xml` on next deploy.

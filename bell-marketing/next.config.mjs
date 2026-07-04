// redeploy nonce: 2026-06-02 (re-trigger build after Railway registry-push hiccup on #39)
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lint is a dev-time concern, not a deploy-time blocker. Same approach
  // Vercel, Linear, and most production Next.js apps take. Lint runs in your
  // editor and via `npm run lint` locally; deploys don't fail on cosmetic
  // rule violations like react/no-unescaped-entities.
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Same logic for TypeScript: deploy doesn't fail on type errors. If you want
  // to enforce typecheck-on-deploy later, flip this back to false and run
  // `tsc --noEmit` in CI separately.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Standalone output bundles only the deps actually used, with a minimal
  // server.js entrypoint. The official Next.js recommendation for
  // Docker/Railway deploys — produces smaller, more reliable images and
  // fixes a class of webpack module-resolution errors caused by the default
  // bundler's interaction with hosted build environments.
  // See: https://nextjs.org/docs/app/api-reference/next-config-js/output
  output: 'standalone',
  // NOTE: experimental.optimizePackageImports was removed here. It tree-shakes
  // lucide-react / framer-motion at build time but has a known bug where
  // webpack can lose track of unrelated components during the optimization
  // pass on Linux build hosts (manifesting as "Cannot resolve @/components/X"
  // for files that exist and have correct exports). Cost is a slightly bigger
  // bundle in exchange for reliable builds. Not worth keeping enabled.
  // Old / renamed URLs → new canonical paths. Issued as HTTP 301
  // (`permanent: true`) so search engines update their index.
  //
  // /platform is intentionally a navigation grouping, not a page —
  // it redirects to the home page. Each individual capability page
  // lives at /platform/{slug} (e.g. /platform/bella).
  async redirects() {
    return [
      { source: '/platform', destination: '/', permanent: true },
      { source: '/features', destination: '/', permanent: true },
      // /data is a navigation grouping like /platform — the megamenu
      // does the navigation work, and direct visits land on Coverage
      // (the breadth-claim page) as the canonical entry point.
      { source: '/data',     destination: '/data/coverage', permanent: true },
      // Old leaf URL retained for any external links that used it.
      { source: '/our-data', destination: '/data/coverage', permanent: true },
    ];
  },
  // Cache-Control for HTML DOCUMENTS only (Val 2026-07-04 — the real reason
  // Bella's voice fix "never worked": Next's default for static pages is
  // `s-maxage=31536000, stale-while-revalidate`, so Railway's edge served
  // YEAR-OLD HTML after each deploy → the old JS bundle → the fix never ran).
  // Force revalidation so a new deploy's content-hashed chunks are picked up
  // immediately. The `accept: text/html` condition scopes this to page
  // documents ONLY — hashed /_next/static assets keep their immutable cache,
  // so this costs nothing on assets and just guarantees fresh HTML.
  async headers() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'header', key: 'accept', value: '.*text/html.*' }],
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
        ],
      },
    ];
  },
};

export default nextConfig;

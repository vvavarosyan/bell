/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Marketing site is largely static — favour SSG where possible.
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
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
};

export default nextConfig;

/**
 * SITEMAP DATA — single source of truth for both the human-readable
 * sitemap page at /sitemap and the machine-readable sitemap at
 * /sitemap.xml.
 *
 * Why one file?
 *   • Two sitemaps must stay in sync. Drift between them is bad for SEO,
 *     bad for users, and a maintenance hazard.
 *   • A single typed list makes it trivial to add a new route or section
 *     and have it appear in both places automatically.
 *
 * Status taxonomy:
 *   • 'live'        — page is live. Appears on the HTML sitemap. Indexed
 *                     in /sitemap.xml.
 *   • 'live-quiet'  — page is live. Appears on the HTML sitemap. NOT
 *                     listed in /sitemap.xml (e.g. /sovereign — still
 *                     reachable via search, just not advertised).
 *   • 'coming-soon' — placeholder route, currently a ComingSoon shell.
 *                     Listed on the HTML sitemap with a SOON badge. NOT
 *                     in /sitemap.xml until the page has real content.
 *   • 'noindex'     — page exists but is private/redirect (e.g. /sign-in,
 *                     /get-access). Shown on HTML sitemap for transparency
 *                     under "Account access". NOT in /sitemap.xml.
 *
 * Scale plan:
 *   The static SITEMAP_SECTIONS below covers the ~30 site shell pages.
 *   Once collections like /companies, /news, /research start producing
 *   pages, those items will be unrolled into /sitemap.xml at index-build
 *   time (see getDynamicSitemapEntries below — currently a stub that
 *   returns no items). The HTML /sitemap page will NOT enumerate each
 *   item — it shows the COLLECTION and links to the collection's own
 *   index page. That keeps the human sitemap usable at any scale.
 */

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type SitemapStatus = 'live' | 'live-quiet' | 'coming-soon' | 'noindex';

export type SitemapRoute = {
  label:       string;
  href:        string;
  description: string;
  status:      SitemapStatus;
  // Optional: explicit changeFrequency / priority overrides for XML sitemap.
  // If omitted, defaults are computed per section in getXmlSitemapEntries.
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?:        number;
};

export type SitemapSection = {
  id:          string;
  label:       string;
  description: string;
  routes:      SitemapRoute[];
};

export type DynamicCollection = {
  id:          string;
  label:       string;
  href:        string;        // collection index page (e.g. /companies)
  description: string;
  // Future-state: pulled from DB. For now, zero until each collection
  // has real published items.
  itemCount:   number;
  // Example URL shape so visitors see what individual pages look like.
  exampleUrl:  string;
  // 'coming-soon' until the collection actually has pages published.
  status:      'live' | 'coming-soon';
};

// ───────────────────────────────────────────────────────────────────────────
// Static site shell — every "fixed" page on bell.qa
// ───────────────────────────────────────────────────────────────────────────

export const SITEMAP_SECTIONS: SitemapSection[] = [
  {
    id:          'core',
    label:       'Core',
    description: 'The main entry points to Bell.qa.',
    routes: [
      { label: 'Home',     href: '/',         description: 'The Bell.qa front door.',                          status: 'live',        priority: 1.0, changeFrequency: 'weekly' },
      { label: 'Data',     href: '/data',     description: 'Where Bell.qa intelligence comes from.',           status: 'live',        priority: 0.9, changeFrequency: 'weekly' },
      { label: 'Pricing',  href: '/pricing',  description: 'Plans, credits, and how to apply for access.',     status: 'live' },
      { label: 'Status',   href: '/status',   description: 'Live operational status of every system.',         status: 'live' },
    ],
  },
  {
    id:          'platform',
    label:       'Platform',
    description: 'Each capability of the Bell.qa platform. Pages are being designed individually and will go live as they ship.',
    routes: [
      // Functions
      { label: 'Sales',                href: '/platform/sales',                description: 'Sales pipeline on the Bell.qa graph.',           status: 'live' },
      { label: 'Marketing',            href: '/platform/marketing',            description: 'Targeted reach across Qatari accounts.',          status: 'live' },
      { label: 'Business Development', href: '/platform/business-development', description: 'Partnerships, JVs, and M&A mapping.',             status: 'live' },
      { label: 'Research',             href: '/platform/research',             description: 'Sector views and longitudinal analysis.',         status: 'live' },
      { label: 'GTM',                  href: '/platform/gtm',                  description: 'Go-to-market planning and execution.',            status: 'live' },
      // Workspace
      { label: 'CRM',                  href: '/platform/crm',                  description: 'Native CRM on the Bell.qa graph.',                status: 'live' },
      { label: 'Bella',                href: '/platform/bella',                description: 'The autonomous agent inside Bell.qa.',            status: 'live' },
      { label: 'Team',                 href: '/platform/team',                 description: 'Workspace members, roles, permissions.',          status: 'live' },
      // Intelligence
      { label: 'Map',                  href: '/platform/map',                  description: 'The Qatari market, mapped geographically.',       status: 'live' },
      { label: 'Signals & Insights',   href: '/platform/signals-and-insights', description: 'Live signal stream across the Qatari market.',    status: 'live' },
      { label: 'Buyer Intent',         href: '/platform/buyer-intent',         description: 'Account-level intent scoring and ready-to-buy detection.', status: 'live' },
      { label: 'Prediction Engine',    href: '/platform/prediction-engine',    description: 'Forecasting and probability over the graph.',     status: 'live' },
    ],
  },
  {
    id:          'data',
    label:       'Data',
    description: 'The data layer behind every Bell.qa surface — coverage, pipeline, live tracking, and trust.',
    routes: [
      { label: 'Coverage', href: '/data/coverage', description: 'Every Qatari company, person, and signal — mapped.',  status: 'live' },
      { label: 'Pipeline', href: '/data/pipeline', description: 'The proprietary machine behind the data.',            status: 'live' },
      { label: 'Live',     href: '/data/live',     description: 'Refreshed by the minute, not the quarter.',           status: 'live' },
      { label: 'Trust',    href: '/data/trust',    description: 'Sovereign-grade. Cited end to end. Removable.',       status: 'live' },
    ],
  },
  {
    id:          'product',
    label:       'Product',
    description: 'Tools, documentation, and product features.',
    routes: [
      { label: 'Free Tools',     href: '/free-tools',     description: 'Public utilities anyone can use.',          status: 'coming-soon' },
      { label: 'Documentation',  href: '/docs',           description: 'The platform, explained end to end.',       status: 'live' },
      { label: 'Knowledge Base', href: '/knowledge-base', description: 'Guides, how-tos, and best practices.',      status: 'live' },
      { label: 'FAQ',            href: '/faq',            description: 'Answers to the most-asked questions.',      status: 'live' },
    ],
  },
  {
    id:          'insights',
    label:       'Insights',
    description: 'Editorial and analytical content from the Bell.qa team.',
    routes: [
      { label: 'Blog',     href: '/blog',     description: 'Market commentary and product updates.', status: 'coming-soon' },
      { label: 'News',     href: '/news',     description: 'Qatar business news, summarized daily by Bell.', status: 'live', changeFrequency: 'daily', priority: 0.8 },
      { label: 'Research', href: '/research', description: 'Reports, briefings, and longitudinal studies.', status: 'coming-soon' },
    ],
  },
  {
    id:          'company',
    label:       'Company',
    description: 'Who we are and how to get in touch.',
    routes: [
      { label: 'About Us',             href: '/about',     description: 'Our mission and the team behind it.',                    status: 'live' },
      { label: 'Roadmap',              href: '/roadmap',   description: 'What we\'re building next.',                              status: 'live' },
      { label: 'Support',              href: '/support',   description: 'Get help from the team.',                                 status: 'live' },
      { label: 'Contact',              href: '/contact',   description: 'Reach the Bell.qa team.',                                 status: 'live' },
      // /sovereign is intentionally live-quiet — visible to anyone browsing
      // the HTML sitemap, but excluded from /sitemap.xml so it doesn't get
      // advertised in the public routes feed.
      { label: 'Government Licensing', href: '/sovereign', description: 'Annual licensing for ministries and regulators.',        status: 'live-quiet' },
    ],
  },
  {
    id:          'legal',
    label:       'Legal',
    description: 'Policies, terms, and compliance.',
    routes: [
      { label: 'Privacy Policy',   href: '/privacy',       description: 'How Bell.qa handles your data.',  status: 'live' },
      { label: 'Terms of Service', href: '/terms',         description: 'Terms of using Bell.qa.',         status: 'live' },
      { label: 'Cookie Policy',    href: '/cookie-policy', description: 'How Bell.qa uses cookies.',       status: 'live' },
    ],
  },
  {
    id:          'system',
    label:       'For crawlers and AI',
    description: 'Files that help search engines and AI tools understand Bell.qa.',
    routes: [
      { label: 'Bell.qa AI Information', href: '/ai-information', description: 'What AI assistants should know about Bell.qa.',       status: 'live' },
      { label: 'llms.txt',               href: '/llms-txt',       description: 'Bell.qa instructions for large language models.',     status: 'live' },
      { label: 'Sitemap',                href: '/sitemap',        description: 'This page — every section of Bell.qa, in one place.', status: 'live' },
    ],
  },
  {
    id:          'account',
    label:       'Sign in &amp; access',
    description: 'For existing and new customers. These pages live behind the sign-in.',
    routes: [
      { label: 'Sign In',    href: '/sign-in',    description: 'For existing customers. Opens app.bell.qa once your workspace is provisioned.', status: 'noindex' },
      { label: 'Get Access', href: '/get-access', description: 'Where new customers begin the registration process.',                          status: 'noindex' },
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Dynamic collections — the future scale story
// ───────────────────────────────────────────────────────────────────────────

/**
 * Collections that will eventually contain large numbers of individual
 * pages. Today: zero items. As each collection comes online, set the
 * itemCount via a real DB query and flip status to 'live'.
 *
 * When this happens:
 *   • The HTML sitemap automatically shows the live item count.
 *   • The XML sitemap (via getDynamicSitemapEntries) should be updated to
 *     unroll individual items.
 */
export const DYNAMIC_COLLECTIONS: DynamicCollection[] = [
  {
    id:           'companies',
    label:        'Company Profiles',
    href:         '/companies',
    description:  'Individual profile pages for every Qatari company in the Bell.qa graph. Each company has its own page with overview, signals, and related entities.',
    itemCount:    0,
    exampleUrl:   '/companies/{bin}-{slug}',
    status:       'coming-soon',
  },
  {
    id:           'news',
    label:        'News',
    href:         '/news',
    description:  'Qatar business news, summarized daily by Bell — every story has its own page, cross-linked to the market it moves.',
    itemCount:    0,
    exampleUrl:   '/news/{id}-{slug}',
    status:       'live',
  },
  {
    id:           'research',
    label:        'Research',
    href:         '/research',
    description:  'In-depth research published by the Bell.qa team. Sector reports, market briefings, and longitudinal studies.',
    itemCount:    0,
    exampleUrl:   '/research/{slug}',
    status:       'coming-soon',
  },
  {
    id:           'blog',
    label:        'Blog',
    href:         '/blog',
    description:  'Product updates, engineering notes, and editorial commentary from the Bell.qa team.',
    itemCount:    0,
    exampleUrl:   '/blog/{slug}',
    status:       'coming-soon',
  },
  {
    id:           'knowledge-base',
    label:        'Knowledge Base',
    href:         '/knowledge-base',
    description:  'How-to guides, best practices, and operational documentation for using the Bell.qa platform.',
    itemCount:    0,
    exampleUrl:   '/knowledge-base/{slug}',
    status:       'coming-soon',
  },
  {
    id:           'docs',
    label:        'API Documentation',
    href:         '/docs',
    description:  'Reference documentation for the Bell.qa API, schemas, integrations, and SDKs.',
    itemCount:    0,
    exampleUrl:   '/docs/{section}/{topic}',
    status:       'coming-soon',
  },
  {
    id:           'free-tools',
    label:        'Free Tools',
    href:         '/free-tools',
    description:  'Public utility pages anyone can use — company lookups, registry searches, and other open utilities.',
    itemCount:    0,
    exampleUrl:   '/free-tools/{tool}',
    status:       'coming-soon',
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Helpers — used by app/sitemap.ts and the HTML sitemap page
// ───────────────────────────────────────────────────────────────────────────

/**
 * All routes from every section. Pure data — no filtering applied.
 * Useful for the HTML sitemap which shows everything (with status).
 */
export function getAllRoutes(): SitemapRoute[] {
  return SITEMAP_SECTIONS.flatMap(s => s.routes);
}

/**
 * Routes that should appear in /sitemap.xml. Filters out:
 *   • 'live-quiet' — public but not advertised in XML feed
 *   • 'coming-soon' — no real content yet
 *   • 'noindex' — account / redirect pages
 */
export function getXmlIndexableRoutes(): SitemapRoute[] {
  return getAllRoutes().filter(r => r.status === 'live');
}

/**
 * Dynamic collection index URLs that should appear in /sitemap.xml.
 * Currently empty until any collection has at least one published item.
 *
 * Once a collection goes live (e.g. /companies has its first published
 * profile), the collection's index page should be added here AND the
 * individual items unrolled via getDynamicSitemapEntries.
 */
export function getLiveDynamicCollectionUrls(): string[] {
  return DYNAMIC_COLLECTIONS
    .filter(c => c.status === 'live')
    .map(c => c.href);
}

/**
 * Stub for unrolling dynamic collection items into the XML sitemap.
 *
 * TODO: when DB is wired, this should query each live collection and
 * return one entry per published item. For a million-company scale,
 * Next.js supports a sitemap-index pattern — see:
 * https://nextjs.org/docs/app/building-your-application/optimizing/metadata#generating-a-sitemap
 *
 * For now this returns an empty list, which is correct because no
 * dynamic content has been published yet.
 */
export function getDynamicSitemapEntries(): {
  url:           string;
  lastModified:  Date;
  changeFrequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?:      number;
}[] {
  // Intentionally empty. Plug DB queries in here per collection.
  return [];
}

/**
 * Aggregate counts for the HTML sitemap KPI strip.
 */
export function getSitemapStats() {
  const all = getAllRoutes();
  return {
    totalStaticPages:     all.length,
    livePages:            all.filter(r => r.status === 'live' || r.status === 'live-quiet').length,
    comingSoonPages:      all.filter(r => r.status === 'coming-soon').length,
    dynamicCollections:   DYNAMIC_COLLECTIONS.length,
    liveDynamicCollections: DYNAMIC_COLLECTIONS.filter(c => c.status === 'live').length,
  };
}

/**
 * Section-level default changeFrequency and priority for the XML sitemap.
 * Overridden by per-route values if provided in the data above.
 */
export function getDefaultSeoMeta(sectionId: string): {
  changeFrequency: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority:        number;
} {
  switch (sectionId) {
    case 'core':     return { changeFrequency: 'weekly',  priority: 0.9 };
    case 'product':  return { changeFrequency: 'weekly',  priority: 0.8 };
    case 'insights': return { changeFrequency: 'daily',   priority: 0.8 };
    case 'company':  return { changeFrequency: 'monthly', priority: 0.6 };
    case 'legal':    return { changeFrequency: 'yearly',  priority: 0.4 };
    case 'system':   return { changeFrequency: 'monthly', priority: 0.4 };
    default:         return { changeFrequency: 'monthly', priority: 0.5 };
  }
}

/**
 * Find which section a given route belongs to. Used for default SEO meta.
 */
export function findSectionForRoute(href: string): SitemapSection | undefined {
  return SITEMAP_SECTIONS.find(s => s.routes.some(r => r.href === href));
}

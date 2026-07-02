/**
 * Single source of truth for marketing-site navigation.
 *
 * Top-level nav (left of the CTAs):
 *   • Platform    (megaMenu: Capabilities / Platform / Operations & access)
 *   • Our Data    (SOON, leaf link)
 *   • Resources   (megaMenu: Documentation / Tools & Insights / Company)
 *   • Pricing     (leaf link)
 *
 * Header CTAs (right):
 *   • Sign In     (ghost button)
 *   • Get Access  (accent button)
 *
 * Multiple megamenus are supported. Each megamenu item has its own
 * 3-column layout plus an optional footer (text + CTA).
 */

export type NavLeaf = {
  label: string;
  href:  string;
  /** Render with a dimmed "SOON" badge. */
  comingSoon?: boolean;
};

export type MegaItem = NavLeaf & {
  /** Lucide icon name (matches a key in MEGA_ICONS in megamenu.tsx) */
  icon: string;
  /** One-line description shown under the item title */
  description: string;
  /** When true, render a thin horizontal divider line ABOVE this item.
   *  Used to visually pair groups of items within a column without
   *  adding labeled subheaders. Only honored in non-wide columns. */
  dividerBefore?: boolean;
};

export type MegaColumn = {
  label: string;
  items: MegaItem[];
  /** When true, this column takes 2 grid slots in the megamenu and its
   *  items render in a 2-column subgrid. Use when a column has more
   *  items than the others and would otherwise look much taller. */
  wide?: boolean;
  /** Optional override for the number of rows in the wide subgrid.
   *  Defaults to `Math.max(items.length - 1, 1)` (left-heavy 4-1
   *  layout — used by Functions). Set to a smaller number for a
   *  balanced layout (e.g. 2 with 4 items → 2x2). Only honored when
   *  `wide: true`. */
  subgridRows?: number;
};

export type MegaFooter = {
  /** Short note shown on the left of the footer band. */
  text:    string;
  /** Optional CTA on the right. If omitted, no CTA is rendered. */
  cta?: {
    label: string;
    href:  string;
  };
};

export type NavItem =
  | (NavLeaf & { kind: 'link' })
  | {
      kind:        'megamenu';
      label:       string;
      comingSoon?: boolean;
      columns:     MegaColumn[];
      /** Optional footer customisation. If omitted, megamenu defaults apply. */
      footer?:     MegaFooter;
    };

/** Top-level header navigation.
 *
 *  Platform is a navigation grouping, not a page — clicking /platform
 *  redirects to home (see next.config.mjs). Each capability lives at
 *  /platform/{slug}. Pages are designed individually with Val before
 *  being built; for now they're ComingSoon placeholders.
 */
export const PRIMARY_NAV: NavItem[] = [
  {
    kind:  'megamenu',
    label: 'Platform',
    columns: [
      {
        label: 'Functions',
        // wide: Functions has 5 items vs 3 in Workspace/Intelligence — without
        // this flag the column would tower above the others. Marked wide so
        // its items lay out in a 2-column subgrid, keeping the megamenu's
        // overall height balanced.
        wide:  true,
        items: [
          { label: 'Sales',                href: '/platform/sales',                icon: 'target',     description: 'Run pipeline against the Bell.qa graph.' },
          { label: 'Marketing',            href: '/platform/marketing',            icon: 'megaphone',  description: 'Reach the right Qatari accounts at the right time.' },
          { label: 'Business Development', href: '/platform/business-development', icon: 'handshake',  description: 'Map partnerships, JVs, and acquisitions.' },
          { label: 'Research',             href: '/platform/research',             icon: 'microscope', description: 'Sector views with full lineage.' },
          { label: 'GTM',                  href: '/platform/gtm',                  icon: 'rocket',     description: 'Plan and execute go-to-market motions.' },
        ],
      },
      {
        label: 'Workspace',
        items: [
          { label: 'CRM',  href: '/platform/crm',  icon: 'inbox',   description: 'Native CRM on the Bell.qa graph.' },
          { label: 'Bella', href: '/platform/bella', icon: 'bot',    description: 'The autonomous agent inside Bell.qa.' },
          { label: 'Team',  href: '/platform/team',  icon: 'users-2', description: 'Workspace members, roles, permissions.' },
        ],
      },
      {
        label: 'Intelligence',
        items: [
          { label: 'Map',                  href: '/platform/map',                  icon: 'map',           description: 'Qatari market, mapped geographically.' },
          { label: 'Signals & Insights',   href: '/platform/signals-and-insights', icon: 'radar',         description: 'Live signal stream across the Qatari market.' },
          { label: 'Buyer Intent',         href: '/platform/buyer-intent',         icon: 'crosshair',     description: 'Account-level intent scoring, ready-to-buy detection.',          dividerBefore: true },
          { label: 'Prediction Engine',    href: '/platform/prediction-engine',    icon: 'brain-circuit', description: 'Forecasting and probability across the graph.' },
        ],
      },
    ],
    footer: {
      text: 'Twelve capabilities. One platform. Built for Qatar.',
      cta:  { label: 'Get Access', href: '/get-access' },
    },
  },
  {
    kind:  'megamenu',
    label: 'Data',
    columns: [
      {
        label: 'The data',
        // wide: render as a 2-column subgrid. subgridRows: 2 produces
        // a balanced 2x2 layout for the four Data items, instead of
        // the default left-heavy 3-1 split.
        wide:        true,
        subgridRows: 2,
        items: [
          { label: 'Coverage', href: '/data/coverage', icon: 'database',  description: 'Every Qatari company, person, signal — mapped.' },
          { label: 'Pipeline', href: '/data/pipeline', icon: 'workflow',  description: 'The proprietary machine behind the data.' },
          { label: 'Live',     href: '/data/live',     icon: 'activity',  description: 'Refreshed by the minute, not the quarter.' },
          { label: 'Trust',    href: '/data/trust',    icon: 'shield-check', description: 'Sovereign-grade. Cited end to end. Removable.' },
        ],
      },
    ],
    footer: {
      text: 'The data layer behind every Bell.qa surface. Built in Qatar.',
      cta:  { label: 'Get Access', href: '/get-access' },
    },
  },
  {
    kind: 'megamenu',
    label: 'Resources',
    columns: [
      {
        label: 'Documentation',
        items: [
          {
            label: 'Knowledge Base',
            href:  '/knowledge-base',
            icon:  'book-open',
            description: 'Guides, how-tos, and best practices.',
          },
          {
            label: 'Documentation',
            href:  '/docs',
            icon:  'file-text',
            description: 'The platform, explained end to end.',
          },
          {
            label: 'FAQ',
            href:  '/faq',
            icon:  'help-circle',
            description: 'Answers to the most-asked questions.',
          },
        ],
      },
      {
        label: 'Tools & Insights',
        items: [
          {
            label: 'Free Tools',
            href:  '/free-tools',
            icon:  'wrench',
            description: 'Public utilities anyone can use.',
            comingSoon: true,
          },
          {
            label: 'Blog',
            href:  '/blog',
            icon:  'pen-line',
            description: 'Market commentary and product updates.',
            comingSoon: true,
          },
          {
            label: 'News',
            href:  '/news',
            icon:  'newspaper',
            description: 'Qatar business news, summarized daily by Bell.',
          },
        ],
      },
      {
        label: 'Company',
        items: [
          {
            label: 'About Us',
            href:  '/about',
            icon:  'users',
            description: 'Our mission and the team behind it.',
          },
          {
            label: 'Roadmap',
            href:  '/roadmap',
            icon:  'compass',
            description: 'What we\'re building next.',
          },
          {
            label: 'Support',
            href:  '/support',
            icon:  'life-buoy',
            description: 'Get help from the team.',
          },
        ],
      },
    ],
    footer: {
      text: 'Guides, documentation, and the company behind Bell. Built for Qatar.',
      cta:  { label: 'Get in touch', href: '/contact' },
    },
  },
  { kind: 'link', label: 'Pricing', href: '/pricing' },
  { kind: 'link', label: '0 Risk', href: '/0-risk' },
];

/** Header right-side CTAs.
 *  - signIn   → user portal sign-in (placeholder until app.bell.qa exists)
 *  - getAccess → registration entry. Placeholder for now; once the user
 *                portal ships, repoint to `https://app.bell.qa/sign-up`. */
export const HEADER_CTAS = {
  signIn:   { label: 'Sign In',    href: '/sign-in' },
  getAccess:{ label: 'Get Access', href: '/get-access' },
};

// ───────────────────────────────────────────────────────────────────────────
// Footer navigation
// ───────────────────────────────────────────────────────────────────────────

/** Small links at the very bottom of the footer, alongside the copyright.
 *  Two groups so they can render as two visual rows. */
export const FOOTER_LEGAL: NavLeaf[] = [
  { label: 'Privacy',        href: '/privacy' },
  { label: 'Terms',          href: '/terms' },
  { label: 'Cookie Policy',  href: '/cookie-policy' },
  { label: 'Status',         href: '/status' },
];

export const FOOTER_SYSTEM: NavLeaf[] = [
  { label: 'Bell.qa AI Information', href: '/ai-information' },
  { label: 'llms.txt',               href: '/llms-txt' },
  { label: 'Sitemap',                href: '/sitemap' },
];

/** Official Bell social profiles (provided by Val 2026-07-02). Used by the
 *  footer icon row and the Organization JSON-LD `sameAs` (so Google links the
 *  profiles to the brand entity). */
export const SOCIAL_LINKS: { label: string; href: string }[] = [
  { label: 'LinkedIn',  href: 'https://www.linkedin.com/company/bell-data-intelligence' },
  { label: 'X',         href: 'https://x.com/BellDataIntel' },
  { label: 'Instagram', href: 'https://www.instagram.com/bell_data_intelligence' },
  { label: 'Facebook',  href: 'https://www.facebook.com/profile.php?id=61591474925350' },
  { label: 'TikTok',    href: 'https://vt.tiktok.com/ZSCxLgB39/' },
];

export const FOOTER_NAV: { label: string; links: NavLeaf[]; wide?: boolean }[] = [
  {
    label: 'Platform',
    // Wide: renders in the footer as a 2-column subgrid spanning 2
    // outer footer columns. Hosts all 12 Platform sub-pages so the
    // sitemap reads end-to-end from the footer.
    wide: true,
    links: [
      // Functions
      { label: 'Sales',                href: '/platform/sales' },
      { label: 'Marketing',            href: '/platform/marketing' },
      { label: 'Business Development', href: '/platform/business-development' },
      { label: 'Research',             href: '/platform/research' },
      { label: 'GTM',                  href: '/platform/gtm' },
      // Workspace
      { label: 'CRM',                  href: '/platform/crm' },
      { label: 'Bella',                href: '/platform/bella' },
      { label: 'Team',                 href: '/platform/team' },
      // Intelligence
      { label: 'Map',                  href: '/platform/map' },
      { label: 'Signals & Insights',   href: '/platform/signals-and-insights' },
      { label: 'Buyer Intent',         href: '/platform/buyer-intent' },
      { label: 'Prediction Engine',    href: '/platform/prediction-engine' },
    ],
  },
  {
    label: 'Data',
    links: [
      { label: 'Coverage', href: '/data/coverage' },
      { label: 'Pipeline', href: '/data/pipeline' },
      { label: 'Live',     href: '/data/live' },
      { label: 'Trust',    href: '/data/trust' },
    ],
  },
  {
    label: 'Insights',
    links: [
      { label: 'Blog',     href: '/blog',     comingSoon: true },
      { label: 'News',     href: '/news' },
      { label: 'Research', href: '/research', comingSoon: true },
    ],
  },
  {
    label: 'Company',
    links: [
      { label: 'About Us',                href: '/about' },
      { label: 'Roadmap',                 href: '/roadmap' },
      { label: 'Support',                 href: '/support' },
      { label: 'Contact',                 href: '/contact' },
      // Government licensing entry point. Deliberately tucked at the bottom
      // of the Company column rather than the Product column so it doesn't
      // surface alongside commercial pricing for regular visitors.
      { label: 'Government Licensing',    href: '/sovereign' },
    ],
  },
];

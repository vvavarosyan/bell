import type { Metadata } from 'next';
import { SitemapPageBody } from '@/components/sitemap-sections';

export const metadata: Metadata = {
  title: 'Sitemap',
  description:
    'A human-readable index of every section on Bell.qa, including the dynamic collections we are building toward — company profiles, news, research, and more.',
  alternates: {
    // Surface the machine-readable counterpart so it shows up in
    // <link rel="sitemap"> for crawlers that look for it.
    types: {
      'application/xml': '/sitemap.xml',
    },
  },
};

/**
 * Human-readable sitemap page. The machine-readable XML version lives at
 * /sitemap.xml and is driven by the same data source — /content/sitemap-data.ts
 * — so the two stay in lockstep as the site grows.
 *
 * This page is intentionally a pure server component. No 'use client', no
 * hydration cost, no animations. The whole page renders as static HTML for
 * maximum SEO benefit and instant load.
 */
export default function SitemapPage() {
  return <SitemapPageBody />;
}

/**
 * Revalidate on a slow cadence. Once dynamic collections are wired, this
 * will pick up new items every hour at minimum without a redeploy.
 */
export const revalidate = 3600; // 1 hour

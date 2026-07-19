import type { MetadataRoute } from 'next';
import {
  getXmlIndexableRoutes,
  getLiveDynamicCollectionUrls,
  getDynamicSitemapEntries,
  getDefaultSeoMeta,
  findSectionForRoute,
} from '@/content/sitemap-data';
import { getNewsSitemapEntries } from '@/lib/news';
import { getResearchSitemapEntries } from '@/lib/research';

const BASE = 'https://bell.qa';

// Re-generate periodically so freshly-published news pages enter the sitemap
// without a deploy (Phase B2 — the "daily fresh pages" snowball).
export const revalidate = 3600;

/**
 * Machine-readable sitemap at /sitemap.xml.
 *
 * Driven by /content/sitemap-data.ts — the same source the human
 * sitemap at /sitemap consumes. To add or remove a URL, edit that file.
 *
 * Excludes:
 *   • 'live-quiet' routes (e.g. /sovereign — public but not advertised)
 *   • 'coming-soon' routes (placeholders, no real content yet)
 *   • 'noindex' routes (/sign-in, /get-access — account redirects)
 *
 * Dynamic items (per-company, per-news, etc.) come from
 * getDynamicSitemapEntries(), which currently returns an empty list and
 * will plug into the database once collections start producing content.
 * For a million-item scale, swap to Next's sitemap-index pattern.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // Static page entries
  const staticEntries: MetadataRoute.Sitemap = getXmlIndexableRoutes().map(route => {
    const section = findSectionForRoute(route.href);
    const defaults = getDefaultSeoMeta(section?.id ?? '');
    return {
      url:             BASE + route.href,
      lastModified:    now,
      changeFrequency: route.changeFrequency ?? defaults.changeFrequency,
      priority:        route.priority        ?? defaults.priority,
    };
  });

  // Dynamic collection index pages (e.g. /companies, /news once live).
  // Currently none — every collection is 'coming-soon'.
  const collectionEntries: MetadataRoute.Sitemap = getLiveDynamicCollectionUrls().map(href => ({
    url:             BASE + href,
    lastModified:    now,
    changeFrequency: 'daily',
    priority:        0.8,
  }));

  // Individual items inside each live dynamic collection.
  // Wired-up later from the database via getDynamicSitemapEntries.
  const dynamicItemEntries: MetadataRoute.Sitemap = getDynamicSitemapEntries().map(item => ({
    url:             item.url.startsWith('http') ? item.url : BASE + item.url,
    lastModified:    item.lastModified,
    changeFrequency: item.changeFrequency ?? 'weekly',
    priority:        item.priority        ?? 0.6,
  }));

  // Live news pages (Bell-written summaries) — fetched from the platform's
  // public endpoint; fails soft to an empty list so the sitemap never breaks.
  let newsEntries: MetadataRoute.Sitemap = [];
  try {
    newsEntries = (await getNewsSitemapEntries()).map(e => ({
      url:             e.url,
      lastModified:    e.lastModified,
      changeFrequency: 'weekly' as const,
      priority:        0.6,
    }));
  } catch { /* soft */ }

  // Live research report pages (Bell-authored) — same soft-fail pattern as
  // news, so a freshly-published report enters the sitemap without a deploy.
  let researchEntries: MetadataRoute.Sitemap = [];
  try {
    researchEntries = (await getResearchSitemapEntries()).map(e => ({
      url:             e.url,
      lastModified:    e.lastModified,
      changeFrequency: 'weekly' as const,
      priority:        0.7,
    }));
  } catch { /* soft */ }

  // DEDUPE by URL — /news and /research appeared twice (once as static routes, once as
  // collection indexes), which Google flags as "Duplicate without user-selected canonical"
  // (Search Console, 2026-07-18). First occurrence wins (static entries carry the tuned
  // priorities).
  const seen = new Set<string>();
  return [...staticEntries, ...collectionEntries, ...dynamicItemEntries, ...newsEntries, ...researchEntries]
    .filter(e => (seen.has(e.url) ? false : (seen.add(e.url), true)));
}

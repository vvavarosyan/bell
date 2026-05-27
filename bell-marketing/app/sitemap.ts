import type { MetadataRoute } from 'next';
import {
  getXmlIndexableRoutes,
  getLiveDynamicCollectionUrls,
  getDynamicSitemapEntries,
  getDefaultSeoMeta,
  findSectionForRoute,
} from '@/content/sitemap-data';

const BASE = 'https://bell.qa';

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
export default function sitemap(): MetadataRoute.Sitemap {
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

  return [...staticEntries, ...collectionEntries, ...dynamicItemEntries];
}

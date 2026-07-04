/**
 * Marketing-site news data layer (Phase B2). Pulls Bell-written summaries from
 * the platform's PUBLIC endpoint (no auth) with ISR caching, and fails SOFT —
 * if the API is unreachable the pages render their empty states instead of
 * crashing a build or a request.
 */

const API = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.bell.qa').replace(/\/$/, '');
const REVALIDATE = 900; // 15 min — "daily fresh pages" with hourly-grade latency

export type NewsItem = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body?: string | null;
  category: string;
  sentiment: 'positive' | 'negative' | 'neutral' | string;
  importance: number;
  source_name: string | null;
  source_url: string | null;
  entities: { companies?: string[]; people?: string[] };
  published_at: string;
};

export async function getNews(limit = 40, category?: string): Promise<NewsItem[]> {
  try {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (category) qs.set('category', category);
    const res = await fetch(`${API}/api/public/news?${qs.toString()}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export async function getNewsItem(id: number): Promise<{ item: NewsItem; related: NewsItem[] } | null> {
  try {
    const res = await fetch(`${API}/api/public/news/${id}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.item) return null;
    return { item: data.item, related: Array.isArray(data.related) ? data.related : [] };
  } catch {
    return null;
  }
}

/** Sitemap entries for the latest news pages — consumed by app/sitemap.ts. */
export async function getNewsSitemapEntries(): Promise<{ url: string; lastModified: Date }[]> {
  const items = await getNews(200);
  return items.map(i => ({
    url: `https://bell.qa/news/${i.slug}`,
    lastModified: new Date(i.published_at),
  }));
}

// ── Presentation helpers ────────────────────────────────────────────────────

export const CATEGORY_META: Record<string, { label: string; color: string }> = {
  economic:    { label: 'Economy',     color: '#3b82f6' },
  political:   { label: 'Policy',      color: '#a855f7' },
  corporate:   { label: 'Corporate',   color: '#14b8a6' },
  energy:      { label: 'Energy',      color: '#f59e0b' },
  real_estate: { label: 'Real Estate', color: '#ec4899' },
  tech:        { label: 'Technology',  color: '#6366f1' },
  legal:       { label: 'Legal',       color: '#64748b' },
  sports:      { label: 'Sports',      color: '#22c55e' },
  other:       { label: 'Market',      color: '#94a3b8' },
};

/** Category → the most relevant Bell surface to convert readers into. */
export const CATEGORY_CTA: Record<string, { label: string; href: string; blurb: string }> = {
  economic:    { label: 'Explore the full Qatari economy',        href: '/data/coverage',                 blurb: '130,000+ companies, mapped and refreshed continuously.' },
  political:   { label: 'Track policy-driven market shifts',      href: '/data/live',                     blurb: 'Bell watches registries and rules change in near-real-time.' },
  corporate:   { label: 'Map partnerships, JVs and acquisitions', href: '/platform/business-development', blurb: 'The corporate network behind every headline.' },
  energy:      { label: 'Follow Qatar’s energy signals',     href: '/platform/signals-and-insights', blurb: 'Live signals across the sector that powers the Gulf.' },
  real_estate: { label: 'See the market on the map',              href: '/platform/map',                  blurb: 'Every project and player, placed geographically.' },
  tech:        { label: 'Plan your Qatar GTM',                    href: '/platform/gtm',                  blurb: 'Enter the market with the full picture.' },
  legal:       { label: 'Data you can defend',                    href: '/data/trust',                    blurb: 'Provenance on every fact. Sovereign-grade by design.' },
  sports:      { label: 'Reach the brands behind the games',      href: '/platform/marketing',            blurb: 'Target the right Qatari accounts at the right time.' },
  other:       { label: 'See what Bell tracks daily',             href: '/platform/signals-and-insights', blurb: 'The live signal stream across the Qatari market.' },
};

export function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return ''; }
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  if (s < 86400 * 14) return Math.floor(s / 86400) + 'd ago';
  return fmtDate(iso);
}

export function idFromSlug(slug: string): number {
  const n = Number(String(slug || '').split('-')[0]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

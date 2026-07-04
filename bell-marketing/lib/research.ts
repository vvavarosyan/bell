/**
 * Marketing-site research data layer (Val 2026-07-03). Pulls PUBLISHED Bell
 * research reports from the platform's public endpoint (no auth, anonymized
 * server-side) with ISR caching. Fails SOFT — unreachable API renders the
 * empty state, never a crash.
 */

const API = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.bell.qa').replace(/\/$/, '');
const REVALIDATE = 900; // 15 min

export type ResearchListItem = {
  id: number;
  title: string;
  summary: string | null;
  public_slug: string;
  published_at: string | null;
  section_count: number;
  type: string;
  target_label: string | null;
};

export type ResearchSection = { title?: string; body_markdown?: string };

export type ResearchReport = ResearchListItem & {
  sections: ResearchSection[];
  sources?: { url: string; label?: string | null }[];
};

/** Report type → display meta + the conversion page it should point to. */
export const TYPE_META: Record<string, { label: string; cta: { label: string; href: string } }> = {
  company: { label: 'Company deep-dive', cta: { label: 'Research any Qatari company', href: '/platform/research' } },
  person:  { label: 'Person profile',    cta: { label: 'Map Qatar\'s decision-makers', href: '/data/coverage' } },
  sector:  { label: 'Sector landscape',  cta: { label: 'See the full sector graph', href: '/data/coverage' } },
  other:   { label: 'Research report',   cta: { label: 'Research anything on Qatar', href: '/platform/research' } },
};
export const typeMeta = (t: string) => TYPE_META[t] || { label: 'Research report', cta: { label: 'Commission your own research', href: '/platform/research' } };

export async function getResearch(limit = 40, type?: string): Promise<ResearchListItem[]> {
  try {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (type) qs.set('type', type);
    const res = await fetch(`${API}/api/public/research?${qs.toString()}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.items) ? data.items : [];
  } catch {
    return [];
  }
}

export async function getResearchReport(slug: string): Promise<{ item: ResearchReport; related: ResearchListItem[] } | null> {
  try {
    const res = await fetch(`${API}/api/public/research/${encodeURIComponent(slug)}`, { next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.item ? { item: data.item, related: data.related || [] } : null;
  } catch {
    return null;
  }
}

/** Dynamic sitemap entries for every published report. */
export async function getResearchSitemapEntries(): Promise<{ url: string; lastModified?: string }[]> {
  const items = await getResearch(50);
  return items.map((r) => ({
    url: `https://bell.qa/research/${r.public_slug}`,
    lastModified: r.published_at || undefined,
  }));
}

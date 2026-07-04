import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getNewsItem, idFromSlug, CATEGORY_META, CATEGORY_CTA, fmtDate, timeAgo, type NewsItem } from '@/lib/news';

export const revalidate = 300;

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = idFromSlug(params.slug);
  const data = id ? await getNewsItem(id) : null;
  if (!data) return { title: 'News' };
  const { item } = data;
  return {
    title: item.title,
    description: item.summary.slice(0, 155),
    alternates: { canonical: `/news/${item.slug}` },
    openGraph: {
      type: 'article',
      title: item.title,
      description: item.summary.slice(0, 200),
      publishedTime: item.published_at,
    },
  };
}

function Chip({ category }: { category: string }) {
  const m = CATEGORY_META[category] || CATEGORY_META.other;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: m.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

const STATS = [
  ['130,000+', 'Qatari companies'],
  ['240,000+', 'decision-makers'],
  ['1.2B', 'datapoints daily'],
] as const;

export default async function NewsArticlePage({ params }: Props) {
  const id = idFromSlug(params.slug);
  const data = id ? await getNewsItem(id) : null;
  if (!data) notFound();
  const { item, related } = data;
  const cta = CATEGORY_CTA[item.category] || CATEGORY_CTA.other;
  const companies = (item.entities?.companies || []).slice(0, 8);
  const bodyParas = (item.body || '').split(/\n+/).map((p) => p.trim()).filter(Boolean);

  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: item.title,
    description: item.summary,
    datePublished: item.published_at,
    dateModified: item.published_at,
    inLanguage: 'en',
    mainEntityOfPage: `https://bell.qa/news/${item.slug}`,
    author: { '@type': 'Organization', name: 'Bell Data Intelligence', url: 'https://bell.qa' },
    publisher: { '@id': 'https://bell.qa/#organization' },
    ...(item.source_url ? { isBasedOn: item.source_url } : {}),
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Newsroom', item: 'https://bell.qa/news' },
      { '@type': 'ListItem', position: 2, name: item.title, item: `https://bell.qa/news/${item.slug}` },
    ],
  };

  return (
    <div className="max-w-screen-lg mx-auto px-6 pt-24 pb-32">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonld) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      {/* Breadcrumb */}
      <div className="text-[12px] text-text-dim mb-8">
        <Link href="/news" className="hover:text-text-muted">Newsroom</Link>
        <span className="mx-2">/</span>
        <span>{(CATEGORY_META[item.category] || CATEGORY_META.other).label}</span>
      </div>

      <div className="flex gap-12">
        {/* Article */}
        <article className="min-w-0 flex-1 max-w-3xl">
          <div className="flex items-center gap-4 mb-4">
            <Chip category={item.category} />
            <span className="text-[12px] text-text-dim" title={fmtDate(item.published_at)}>{timeAgo(item.published_at)}</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold text-text leading-tight mb-6">{item.title}</h1>

          <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
            Bell summary
          </div>
          <p className="text-lg text-text-muted leading-relaxed">{item.summary}</p>

          {bodyParas.length > 0 && (
            <div className="mt-8">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">The full story</div>
              <div className="space-y-4 text-[15px] text-text-muted leading-relaxed">
                {bodyParas.map((para, i) => <p key={i}>{para}</p>)}
              </div>
            </div>
          )}

          {companies.length > 0 && (
            <div className="mt-8">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">Mentioned in this story</div>
              <div className="flex flex-wrap gap-2">
                {companies.map(c => (
                  <span key={c} className="text-xs px-3 py-1.5 rounded-full border border-border text-text-muted">{c}</span>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-text-dim">
                Bell tracks these organizations in depth — profiles, people, signals, and history.{' '}
                <Link href="/get-access" className="text-accent-bright hover:underline">See them inside Bell →</Link>
              </p>
            </div>
          )}

          {/* Source attribution */}
          <div className="mt-10 rounded-xl border border-border bg-bg-elev px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-[13px] text-text-muted">
              Summary written by Bell Data Intelligence{item.source_name ? ` · original reporting: ${item.source_name}` : ''}.
            </span>
            {item.source_url && (
              <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-accent-bright hover:underline whitespace-nowrap">
                Read the original ↗
              </a>
            )}
          </div>

          {/* Contextual conversion CTA — the strategic backlink */}
          <div className="mt-8 rounded-2xl border border-accent/40 bg-accent/5 px-7 py-7">
            <div className="text-lg font-semibold text-text mb-1.5">{cta.label}</div>
            <p className="text-sm text-text-muted leading-relaxed mb-5">{cta.blurb}</p>
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex flex-wrap gap-3">
                <Link href={cta.href} className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition">Explore on Bell</Link>
                <Link href="/pricing" className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md border border-border text-text-muted hover:text-text transition">Pricing</Link>
              </div>
              <div className="flex gap-6">
                {STATS.map(([v, l]) => (
                  <div key={l}>
                    <div className="text-[15px] font-bold text-text">{v}</div>
                    <div className="text-[10.5px] text-text-dim">{l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </article>

        {/* Side rail */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-xl border border-border bg-bg-elev px-5 py-5">
              <div className="text-[13px] font-semibold text-text mb-2">Get this feed, connected.</div>
              <p className="text-[12px] text-text-muted leading-relaxed mb-4">
                Inside Bell, every story links to live company records, signals, and the people behind them.
              </p>
              <Link href="/get-access" className="inline-flex items-center px-4 py-2 text-xs font-medium rounded-md bg-accent text-white hover:brightness-110 transition">Get Access</Link>
            </div>
            <div className="rounded-xl border border-border bg-bg-elev px-5 py-5">
              <div className="text-[13px] font-semibold text-text mb-2">Need customers first?</div>
              <p className="text-[12px] text-text-muted leading-relaxed mb-4">
                The 0 Risk programme: hand-prepared prospect lists, pay only when you win.
              </p>
              <Link href="/0-risk" className="text-xs text-accent-bright hover:underline">Learn about 0 Risk →</Link>
            </div>
          </div>
        </aside>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <div className="mt-16">
          <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-5">More in {(CATEGORY_META[item.category] || CATEGORY_META.other).label}</div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {related.map((r: NewsItem) => (
              <Link key={r.id} href={`/news/${r.slug}`} className="group rounded-xl border border-border bg-bg-elev p-4 hover:border-accent/50 transition">
                <div className="text-[10.5px] text-text-dim mb-2">{timeAgo(r.published_at)}</div>
                <div className="text-[13.5px] font-semibold text-text leading-snug group-hover:text-accent-bright transition-colors line-clamp-3">{r.title}</div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

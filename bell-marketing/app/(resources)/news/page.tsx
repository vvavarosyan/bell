import type { Metadata } from 'next';
import Link from 'next/link';
import { getNews, CATEGORY_META, timeAgo, type NewsItem } from '@/lib/news';

export const metadata: Metadata = {
  title: 'Qatar Business News',
  description:
    'Qatar\'s market, reported daily — Bell reads every source and writes the essentials: economy, corporate moves, energy, real estate, tech, and policy.',
  alternates: { canonical: '/news' },
};

// ISR — pages stay fresh as Bell's news engine publishes new summaries.
export const revalidate = 900;

const CATS = ['', 'economic', 'corporate', 'energy', 'real_estate', 'tech', 'political', 'legal'] as const;

function Chip({ category }: { category: string }) {
  const m = CATEGORY_META[category] || CATEGORY_META.other;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider"
      style={{ color: m.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />
      {m.label}
    </span>
  );
}

function Card({ item, big = false }: { item: NewsItem; big?: boolean }) {
  return (
    <Link
      href={`/news/${item.slug}`}
      className={
        'group flex flex-col rounded-xl border border-border bg-bg-elev hover:border-accent/50 transition ' +
        (big ? 'p-7 md:col-span-2' : 'p-5')
      }
    >
      <div className="flex items-center gap-3 mb-3">
        <Chip category={item.category} />
        <span className="text-[11px] text-text-dim">{timeAgo(item.published_at)}</span>
      </div>
      <h2 className={(big ? 'text-2xl' : 'text-[15px]') + ' font-semibold text-text leading-snug group-hover:text-accent-bright transition-colors'}>
        {item.title}
      </h2>
      <p className={'mt-3 text-text-muted leading-relaxed ' + (big ? 'text-[15px]' : 'text-[13px] line-clamp-3')}>
        {item.summary}
      </p>
      <div className="mt-auto pt-4 flex items-center justify-between">
        <span className="text-[11px] text-text-dim">
          {item.source_name ? `Reporting: ${item.source_name}` : 'Bell Newsroom'}
        </span>
        <span className="text-[12px] text-accent-bright opacity-0 group-hover:opacity-100 transition-opacity">Read →</span>
      </div>
    </Link>
  );
}

export default async function NewsPage({ searchParams }: { searchParams?: { category?: string } }) {
  const category = searchParams?.category && CATEGORY_META[searchParams.category] ? searchParams.category : '';
  const items = await getNews(41, category || undefined);
  const [lead, ...rest] = items;

  return (
    <div className="max-w-screen-xl mx-auto px-6 pt-24 pb-32">
      <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">Newsroom</div>
      <h1 className="text-display-md md:text-display-lg text-gradient mb-4">The country, reported daily.</h1>
      <p className="text-lg text-text-muted leading-relaxed max-w-2xl mb-2">
        Bell&apos;s engines read Qatar&apos;s news sources continuously; every story below is
        summarized by Bell, categorized, and linked to the market it moves.
      </p>
      <p className="text-sm text-text-dim mb-10">
        Want the stories connected to live company records?{' '}
        <Link href="/get-access" className="text-accent-bright hover:underline">Open the full Market Feed in Bell</Link>.
      </p>

      {/* Category filter */}
      <div className="flex flex-wrap gap-2 mb-10">
        {CATS.map(c => {
          const active = category === c;
          const label = c ? (CATEGORY_META[c]?.label || c) : 'All';
          return (
            <Link
              key={c || 'all'}
              href={c ? `/news?category=${c}` : '/news'}
              className={
                'text-xs px-3 py-1.5 rounded-full border transition ' +
                (active
                  ? 'border-accent text-text bg-accent/10'
                  : 'border-border text-text-muted hover:text-text hover:border-accent/50')
              }
            >
              {label}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-border bg-bg-elev px-8 py-16 text-center max-w-2xl mx-auto">
          <div className="text-[15px] font-semibold text-text mb-2">Fresh coverage is warming up</div>
          <p className="text-sm text-text-muted leading-relaxed">
            Bell&apos;s news engine is writing its first summaries for this section right now —
            new stories publish here automatically, every day.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {lead && <Card item={lead} big />}
          {rest.map(i => <Card key={i.id} item={i} />)}
        </div>
      )}

      {/* Conversion band — the strategic backlink block */}
      <div className="mt-16 rounded-2xl border border-border bg-bg-elev px-8 py-10 flex flex-wrap items-center gap-8">
        <div className="flex-1 min-w-[260px]">
          <div className="text-xl font-semibold text-text mb-2">The intelligence behind these headlines.</div>
          <p className="text-sm text-text-muted leading-relaxed max-w-xl">
            Every story here touches companies Bell tracks in depth — 130,000+ Qatari companies,
            240,000+ named decision-makers, 500+ datapoints per record, refreshed continuously.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/data/coverage" className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md border border-border text-text-muted hover:text-text transition">Explore the data</Link>
          <Link href="/get-access" className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition">Get Access</Link>
        </div>
      </div>
    </div>
  );
}

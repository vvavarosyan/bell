import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getResearchReport, typeMeta, type ResearchSection } from '@/lib/research';

export const revalidate = 120;

function fmtDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const data = await getResearchReport(params.slug);
  if (!data) return { title: 'Research report' };
  const { item } = data;
  const description = (item.summary || `${typeMeta(item.type).label} on Qatar's economy by Bell Data Intelligence.`).slice(0, 280);
  return {
    title: item.title,
    description,
    alternates: { canonical: `https://bell.qa/research/${item.public_slug}` },
    openGraph: {
      type: 'article',
      title: item.title,
      description,
      url: `https://bell.qa/research/${item.public_slug}`,
      siteName: 'Bell.qa',
    },
  };
}

/**
 * Minimal, SAFE markdown renderer for agent-written report bodies: headings,
 * bullets, numbered lists, bold, links, citations, paragraphs. Everything
 * renders as React text nodes / anchors (auto-escaped) — no raw HTML ever.
 */
type Src = { url: string; label?: string | null };

function Inline({ text, sources }: { text: string; sources?: Src[] }) {
  const nodes: JSX.Element[] = [];
  // [[n]](url) citation · [text](url) link · bare [n] → sources[n-1].url
  const rx = /\[\[(\d+)\]\]\(([^)\s]+)\)|\[([^\]]+)\]\(([^)\s]+)\)|\[(\d{1,3})\](?!\()/g;
  let last = 0, key = 0;
  let m: RegExpExecArray | null;
  const pushText = (s: string) => {
    if (!s) return;
    s.split(/\*\*([^*]+)\*\*/g).forEach((p, i) => {
      if (!p) return;
      nodes.push(i % 2 === 1
        ? <strong key={`b${key++}`} className="text-text font-semibold">{p}</strong>
        : <span key={`t${key++}`}>{p}</span>);
    });
  };
  const cite = (label: string, href: string) => nodes.push(
    <a key={`c${key++}`} href={href} target="_blank" rel="noopener noreferrer nofollow"
      className="mx-0.5 align-super text-[11px] font-semibold text-accent-bright no-underline hover:underline">{label}</a>
  );
  while ((m = rx.exec(text || '')) !== null) {
    pushText((text || '').slice(last, m.index));
    if (m[1] !== undefined) {
      cite(`[${m[1]}]`, m[2]);                               // [[n]](url)
    } else if (m[3] !== undefined) {
      nodes.push(                                            // [text](url)
        <a key={`l${key++}`} href={m[4]} target="_blank" rel="noopener noreferrer nofollow"
          className="text-accent-bright underline decoration-accent/40 underline-offset-2 hover:decoration-accent">{m[3]}</a>
      );
    } else {                                                 // bare [n] → sources[n-1]
      const n = Number(m[5]);
      const src = sources && sources[n - 1];
      if (src && src.url) cite(`[${n}]`, src.url);
      else pushText(`[${n}]`);
    }
    last = m.index + m[0].length;
  }
  pushText((text || '').slice(last));
  return <>{nodes}</>;
}

function Markdown({ text, sources }: { text: string; sources?: Src[] }) {
  const blocks: JSX.Element[] = [];
  const lines = String(text || '').split('\n');
  let list: { ordered: boolean; items: string[] } | null = null;
  let para: string[] = [];
  let key = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={key++} className="text-[15px] leading-relaxed text-text-muted mb-4"><Inline text={para.join(' ')} sources={sources} /></p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const cls = 'pl-6 mb-4 space-y-2 ' + (list.ordered ? 'list-decimal' : 'list-disc');
      blocks.push(
        <ul key={key++} className={cls}>
          {list.items.map((it, i) => <li key={i} className="text-[15px] leading-relaxed text-text-muted"><Inline text={it} sources={sources} /></li>)}
        </ul>
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const t = line.trim();
    const h = /^(#{1,4})\s+(.*)$/.exec(t);
    const bullet = /^[-*•]\s+(.*)$/.exec(t);
    const num = /^\d+[.)]\s+(.*)$/.exec(t);
    if (!t) { flushPara(); flushList(); continue; }
    if (h) {
      flushPara(); flushList();
      blocks.push(<h3 key={key++} className="text-lg font-semibold text-text mt-8 mb-3"><Inline text={h[2]} sources={sources} /></h3>);
    } else if (bullet) {
      flushPara();
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] }; }
      list.items.push(bullet[1]);
    } else if (num) {
      flushPara();
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] }; }
      list.items.push(num[1]);
    } else {
      flushList();
      para.push(t);
    }
  }
  flushPara(); flushList();
  return <>{blocks}</>;
}

export default async function ResearchReportPage({ params }: { params: { slug: string } }) {
  const data = await getResearchReport(params.slug);
  if (!data) notFound();
  const { item, related } = data;
  const meta = typeMeta(item.type);
  const sections: ResearchSection[] = Array.isArray(item.sections) ? item.sections : [];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: item.title,
    description: item.summary || undefined,
    datePublished: item.published_at || undefined,
    author: { '@type': 'Organization', name: 'Bell Data Intelligence', url: 'https://bell.qa' },
    publisher: { '@id': 'https://bell.qa/#organization' },
    mainEntityOfPage: `https://bell.qa/research/${item.public_slug}`,
  };
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Research', item: 'https://bell.qa/research' },
      { '@type': 'ListItem', position: 2, name: item.title, item: `https://bell.qa/research/${item.public_slug}` },
    ],
  };

  return (
    <div className="relative">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      <section className="relative pt-28 pb-10">
        <div className="max-w-screen-xl mx-auto px-6">
          <Link href="/research" className="text-xs text-text-dim hover:text-text transition">← All research</Link>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-wider">
            <span className="rounded-full border border-accent/50 bg-accent/10 px-3 py-1 font-semibold text-accent-bright">{meta.label}</span>
            <span className="text-text-dim">{fmtDate(item.published_at)}</span>
            <span className="text-text-dim">{sections.length} sections</span>
            <span className="text-text-dim">Published by Bell Research</span>
          </div>
          <h1 className="mt-4 text-display-md text-text max-w-4xl">{item.title}</h1>
          {item.summary && (
            <p className="mt-4 max-w-3xl text-base text-text-muted leading-relaxed"><Inline text={item.summary} sources={item.sources} /></p>
          )}
        </div>
      </section>

      <section className="relative pb-20">
        <div className="max-w-screen-xl mx-auto px-6 lg:grid lg:grid-cols-[1fr_320px] lg:gap-10">
          {/* Report body */}
          <article className="min-w-0">
            {sections.map((s, i) => (
              <div key={i} className="mb-2">
                {s.title && <h2 className="text-xl md:text-2xl font-semibold text-text mt-10 mb-4">{s.title}</h2>}
                <Markdown text={s.body_markdown || ''} sources={item.sources} />
              </div>
            ))}
            <div className="mt-12 rounded-xl border border-border bg-bg-elev p-5 text-xs text-text-dim leading-relaxed">
              Produced by Bell Research on the Bell.qa graph. Sources are cited inline; underlying
              records carry full provenance inside the platform.
            </div>
          </article>

          {/* Sticky conversion rail */}
          <aside className="mt-12 lg:mt-0">
            <div className="lg:sticky lg:top-24 space-y-4">
              <div className="rounded-2xl border border-accent/40 bg-bg-elev p-6">
                <div className="text-sm font-semibold text-text">Run this on your own targets</div>
                <p className="mt-2 text-xs text-text-muted leading-relaxed">
                  Point the same research engine at any of 130,000+ Qatari companies or
                  240,000+ decision-makers — dossiers, sectors, leadership maps.
                </p>
                <Link href="/get-access"
                  className="mt-4 block rounded-lg bg-accent px-4 py-2.5 text-center text-sm font-bold text-[#0b1020] transition hover:shadow-[0_0_18px_rgb(var(--accent)/0.5)]">
                  Get Access
                </Link>
                <Link href={meta.cta.href}
                  className="mt-2 block rounded-lg border border-border px-4 py-2.5 text-center text-xs font-semibold text-text transition hover:border-accent">
                  {meta.cta.label}
                </Link>
              </div>
              <div className="rounded-2xl border border-border bg-bg-elev p-6">
                <div className="text-xs uppercase tracking-wider text-text-dim font-semibold">The graph behind this</div>
                <div className="mt-3 space-y-2 text-sm text-text-muted">
                  <div><span className="text-text font-semibold">130,000+</span> Qatari companies</div>
                  <div><span className="text-text font-semibold">240,000+</span> decision-makers</div>
                  <div><span className="text-text font-semibold">1.2B</span> datapoints daily</div>
                </div>
                <Link href="/0-risk" className="mt-4 block text-xs font-semibold text-accent-bright hover:underline">
                  Can't pay yet? Start with 0 Risk →
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="relative pb-24">
          <div className="max-w-screen-xl mx-auto px-6">
            <h2 className="text-lg font-semibold text-text mb-5">More Bell research</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {related.map((r) => (
                <Link key={r.id} href={`/research/${r.public_slug}`}
                  className="group rounded-2xl border border-border bg-bg-elev p-5 transition hover:border-accent/60">
                  <div className="text-[10.5px] uppercase tracking-wider text-accent-bright font-semibold">{typeMeta(r.type).label}</div>
                  <div className="mt-2 text-sm font-semibold text-text leading-snug group-hover:text-accent-bright transition line-clamp-3">{r.title}</div>
                  <div className="mt-3 text-[11px] text-text-dim">{fmtDate(r.published_at)}</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

import Link from 'next/link';
import {
  Layers, FileText, Newspaper, BookOpen, Bot, Wrench,
  Building2, UserCircle2, Map, Database, Lock, ArrowRight,
  CheckCircle2, Hourglass, EyeOff, FileCode,
} from 'lucide-react';
import {
  SITEMAP_SECTIONS,
  DYNAMIC_COLLECTIONS,
  getSitemapStats,
  type SitemapRoute,
  type SitemapStatus,
  type DynamicCollection,
} from '@/content/sitemap-data';

/**
 * SITEMAP PAGE — server-rendered, no client JS.
 *
 * Top to bottom:
 *   1. Hero — title + description + jump-to-section anchors
 *   2. KPI strip — total pages / live / dynamic collections / last updated
 *   3. Dynamic collections band — the scale story (companies, news, research…)
 *   4. Static sections — every fixed page on the site, grouped
 *   5. Footer — machine-readable XML sitemap, robots.txt, last-updated note
 *
 * Everything is driven by /content/sitemap-data.ts. Adding a route there
 * automatically appears here AND in /sitemap.xml.
 */

// ───────────────────────────────────────────────────────────────────────────
// Icon registry — keyed by dynamic collection id, with a default fallback
// ───────────────────────────────────────────────────────────────────────────

const COLLECTION_ICONS: Record<string, React.ComponentType<{ size?: number | string }>> = {
  companies:        Building2,
  people:           UserCircle2,
  news:             Newspaper,
  research:         FileText,
  blog:             FileText,
  'knowledge-base': BookOpen,
  docs:             FileCode,
  'free-tools':     Wrench,
};

// ───────────────────────────────────────────────────────────────────────────
// Public — page composition
// ───────────────────────────────────────────────────────────────────────────

export function SitemapPageBody() {
  const stats        = getSitemapStats();
  const lastUpdated  = new Date();

  return (
    <>
      <Hero />
      <KpiStrip stats={stats} lastUpdated={lastUpdated} />
      <DynamicCollectionsBand />
      <StaticSections />
      <Footnote lastUpdated={lastUpdated} />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Hero
// ───────────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative pt-24 pb-12 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(91,140,255,0.14) 0%, transparent 65%)',
        }}
      />

      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full bg-bg-elev-2 border border-border text-text text-xs font-semibold uppercase tracking-wider">
          <Map size={11} />
          Sitemap
        </div>
        <h1 className="text-display-md md:text-display-lg text-gradient max-w-3xl mx-auto">
          Every page on Bell.qa,<br/>in one place.
        </h1>
        <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed max-w-2xl mx-auto">
          A simple, organised index of the site. Pages you can read today
          are listed alongside the larger sections we&apos;re building
          toward — company profiles, news, research, and more.
        </p>

        {/* Jump-to anchors — keyboard-friendly internal nav */}
        <nav aria-label="Sitemap quick nav" className="mt-7 flex flex-wrap items-center justify-center gap-2">
          <JumpLink href="#dynamic"   label="Dynamic collections" />
          {SITEMAP_SECTIONS.map(sec => (
            <JumpLink key={sec.id} href={`#${sec.id}`} label={sec.label} />
          ))}
        </nav>
      </div>
    </section>
  );
}

function JumpLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="text-[11px] uppercase tracking-wider font-semibold px-3 py-1.5 rounded-full border border-border text-text-muted hover:text-text hover:border-text-dim/60 transition-colors"
    >
      {label}
    </a>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. KPI strip
// ───────────────────────────────────────────────────────────────────────────

function KpiStrip({
  stats, lastUpdated,
}: {
  stats:       ReturnType<typeof getSitemapStats>;
  lastUpdated: Date;
}) {
  const kpis = [
    {
      icon:  Layers,
      label: 'Pages on Bell.qa',
      value: stats.totalStaticPages.toString(),
      sub:   `${stats.livePages} live · ${stats.comingSoonPages} coming`,
    },
    {
      icon:  Database,
      label: 'Larger sections',
      value: stats.dynamicCollections.toString(),
      sub:   `${stats.liveDynamicCollections} live · ${stats.dynamicCollections - stats.liveDynamicCollections} in build`,
    },
    {
      icon:  Bot,
      label: 'For crawlers and AI',
      value: 'XML',
      sub:   '/sitemap.xml',
    },
    {
      icon:  Hourglass,
      label: 'Last updated',
      value: formatDate(lastUpdated),
      sub:   'refreshes every hour',
    },
  ];

  return (
    <section className="relative pb-12">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k, i) => {
            const Icon = k.icon;
            return (
              <div
                key={i}
                className="rounded-xl border border-border p-5"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-accent-bright"
                    style={{ background: 'rgba(91,140,255,0.14)' }}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-text-dim font-mono">
                    {k.sub}
                  </span>
                </div>
                <div className="text-2xl md:text-3xl font-semibold text-text tabular-nums leading-none">
                  {k.value}
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                  {k.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Dynamic collections band
// ───────────────────────────────────────────────────────────────────────────

function DynamicCollectionsBand() {
  return (
    <section id="dynamic" className="relative py-12 scroll-mt-24">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            Larger sections
          </h2>
          <p className="mt-2 text-sm text-text-muted max-w-2xl">
            These are the parts of Bell.qa that will hold a lot of content
            over time — every Qatari company, every news item, every
            research piece, each on its own page.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DYNAMIC_COLLECTIONS.map(c => (
            <DynamicCollectionCard key={c.id} c={c} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DynamicCollectionCard({ c }: { c: DynamicCollection }) {
  const Icon = COLLECTION_ICONS[c.id] ?? Database;
  const isLive = c.status === 'live';

  return (
    <div
      className="relative rounded-xl border border-border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
      }}
    >
      <div className="p-5 pb-4 border-b border-border">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-accent-bright"
            style={{ background: 'rgba(91,140,255,0.14)' }}
          >
            <Icon size={17} />
          </span>
          <StatusPill status={c.status} />
        </div>
        <h3 className="text-base font-semibold text-text leading-tight">{c.label}</h3>
        <p className="mt-1.5 text-[12px] text-text-muted leading-relaxed">{c.description}</p>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-1">
            Pages published
          </div>
          <div className="text-text font-mono tabular-nums text-sm">
            {c.itemCount.toLocaleString()}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-1">
            Example address
          </div>
          <code
            className="text-[11px] font-mono text-text-muted block px-2.5 py-1.5 rounded border border-border bg-bg/60 overflow-x-auto"
          >
            {c.exampleUrl}
          </code>
        </div>
      </div>

      <div className="p-5 pt-0">
        <Link
          href={c.href}
          className={
            'group w-full inline-flex items-center justify-between gap-2 px-4 py-2.5 rounded-md text-[13px] font-medium transition border ' +
            (isLive
              ? 'border-accent/40 text-accent-bright hover:bg-accent/10'
              : 'border-border text-text-muted hover:text-text hover:border-text-dim/50')
          }
        >
          <span>{isLive ? 'Browse' : 'Visit'}</span>
          <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. Static sections
// ───────────────────────────────────────────────────────────────────────────

function StaticSections() {
  return (
    <section className="relative py-12">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            All pages
          </h2>
          <p className="mt-2 text-sm text-text-muted max-w-2xl">
            Every page on Bell.qa, grouped by what it&apos;s for. Pages
            marked
            <span className="mx-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: 'rgb(255 196 99)', background: 'rgba(255,196,99,0.12)' }}>
              Coming
            </span>
            are placeholders that will be filled out as we release each piece.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SITEMAP_SECTIONS.map(sec => (
            <SectionCard key={sec.id} section={sec} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionCard({ section }: { section: typeof SITEMAP_SECTIONS[number] }) {
  return (
    <article
      id={section.id}
      className="relative rounded-2xl border border-border overflow-hidden scroll-mt-24"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
      }}
    >
      <header className="px-5 md:px-6 py-4 border-b border-border bg-bg-elev-2/40">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold text-text">{section.label}</h3>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
            {section.routes.length} page{section.routes.length === 1 ? '' : 's'}
          </span>
        </div>
        <p className="mt-1 text-[12px] text-text-muted leading-relaxed">
          {section.description}
        </p>
      </header>

      <ul>
        {section.routes.map((route, i) => (
          <RouteRow
            key={route.href}
            route={route}
            divided={i < section.routes.length - 1}
          />
        ))}
      </ul>
    </article>
  );
}

function RouteRow({ route, divided }: { route: SitemapRoute; divided: boolean }) {
  const isPublic = route.status === 'live' || route.status === 'live-quiet';

  // 'noindex' routes — render plain, not clickable from sitemap
  // (Sign In and Get Access are placeholder routes for app.bell.qa)
  const RowContent = (
    <div className="flex items-start justify-between gap-4 px-5 md:px-6 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={
            'text-[14px] font-semibold leading-tight ' +
            (isPublic ? 'text-text' : 'text-text-muted')
          }>
            {route.label}
          </span>
          <code className="text-[11px] font-mono text-text-dim tabular-nums">
            {route.href}
          </code>
        </div>
        <p className="mt-0.5 text-[12px] text-text-muted leading-snug">
          {route.description}
        </p>
      </div>
      <div className="shrink-0 mt-0.5">
        <StatusPill status={route.status} />
      </div>
    </div>
  );

  // 'noindex' rows are not interactive (just informational on the sitemap)
  if (route.status === 'noindex') {
    return (
      <li className={divided ? 'border-b border-border' : ''}>
        {RowContent}
      </li>
    );
  }

  return (
    <li className={divided ? 'border-b border-border' : ''}>
      <Link
        href={route.href}
        className="group block hover:bg-bg-elev/40 transition-colors"
      >
        {RowContent}
      </Link>
    </li>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Shared — status pill
// ───────────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: SitemapStatus }) {
  // Public-facing labels — no "no-index", "live-quiet" or other jargon.
  // The internal distinction between 'live' and 'live-quiet' doesn't
  // matter to a visitor; both are live pages they can open. Same pill.
  const style =
    status === 'live' || status === 'live-quiet'
      ? { color: 'rgb(111 207 151)', bg: 'rgba(111,207,151,0.12)', border: 'rgba(111,207,151,0.30)', label: 'Live',           icon: CheckCircle2 }
      : status === 'coming-soon'
      ? { color: 'rgb(255 196 99)',  bg: 'rgba(255,196,99,0.12)',  border: 'rgba(255,196,99,0.30)',  label: 'Coming soon',    icon: Hourglass    }
      :                          { color: 'rgb(156 165 185)', bg: 'rgba(156,165,185,0.10)', border: 'rgba(156,165,185,0.30)', label: 'Sign-in only', icon: EyeOff };

  const Icon = style.icon;

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
      style={{ color: style.color, background: style.bg, borderColor: style.border }}
    >
      <Icon size={10} />
      {style.label}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Footnote
// ───────────────────────────────────────────────────────────────────────────

function Footnote({ lastUpdated }: { lastUpdated: Date }) {
  return (
    <section className="relative pt-12 pb-20">
      <div className="max-w-screen-xl mx-auto px-6">
        <div
          className="rounded-2xl border border-border overflow-hidden p-6 md:p-8"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            <div className="md:col-span-8">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
                For search engines and AI
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="/sitemap.xml"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-[12px] font-mono text-text hover:border-text-dim/60 transition-colors"
                >
                  <Bot size={12} className="text-accent-bright" />
                  /sitemap.xml
                </a>
                <a
                  href="/robots.txt"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-[12px] font-mono text-text hover:border-text-dim/60 transition-colors"
                >
                  <Lock size={12} className="text-accent-bright" />
                  /robots.txt
                </a>
                <Link
                  href="/llms-txt"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border text-[12px] font-mono text-text hover:border-text-dim/60 transition-colors"
                >
                  <Bot size={12} className="text-accent-bright" />
                  /llms.txt
                </Link>
              </div>
              <p className="mt-4 text-[12px] text-text-muted leading-relaxed max-w-2xl">
                The XML sitemap is what Google and other crawlers read.
                It&apos;s generated from the same list of pages you see above,
                so the two stay aligned as the site grows.
              </p>
            </div>

            <div className="md:col-span-4 md:text-right">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                Last updated
              </div>
              <div className="text-sm text-text font-mono tabular-nums">
                {formatDate(lastUpdated)}
              </div>
              <div className="mt-1 text-[11px] text-text-dim">
                Auto-refreshes every hour
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Utilities
// ───────────────────────────────────────────────────────────────────────────

/**
 * Format a Date as "YYYY-MM-DD" for stable, locale-independent display.
 * Avoids server/client locale drift in date strings.
 */
function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

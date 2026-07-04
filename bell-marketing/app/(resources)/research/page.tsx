import type { Metadata } from 'next';
import Link from 'next/link';
import { getResearch, typeMeta, TYPE_META } from '@/lib/research';

export const revalidate = 120;

export const metadata: Metadata = {
  title: 'Research',
  description:
    'Original research on Qatar\'s economy, published by Bell Data Intelligence: company deep-dives, sector reports, leadership profiles, and market themes — built on the Bell.qa graph.',
  alternates: { canonical: 'https://bell.qa/research' },
};

function fmtDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function ResearchIndex({ searchParams }: { searchParams?: { type?: string } }) {
  const type = searchParams?.type && TYPE_META[searchParams.type] ? searchParams.type : undefined;
  const items = await getResearch(40, type);
  const [lead, ...rest] = items;

  return (
    <div className="relative">
      {/* Hero */}
      <section className="relative pt-28 pb-12 overflow-hidden">
        <div className="absolute inset-0 bg-accent-glow opacity-30 pointer-events-none" />
        <div className="relative max-w-screen-xl mx-auto px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border border-border bg-bg-elev-2 text-text text-[11px] font-semibold uppercase tracking-wider">
            Bell Research
          </div>
          <h1 className="text-display-md md:text-display-lg text-text max-w-3xl">
            The market, researched in the open.
          </h1>
          <p className="mt-4 max-w-2xl text-base text-text-muted leading-relaxed">
            Reports produced on the Bell.qa graph — company deep-dives, sector breakdowns,
            leadership maps. Every report is built from cited sources and published here in full.
          </p>
          {/* Type filter */}
          <div className="mt-7 flex flex-wrap gap-2">
            <Link href="/research"
              className={`rounded-full border px-4 py-1.5 text-xs transition ${!type ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-muted hover:border-accent hover:text-text'}`}>
              All
            </Link>
            {Object.entries(TYPE_META).map(([t, m]) => (
              <Link key={t} href={`/research?type=${t}`}
                className={`rounded-full border px-4 py-1.5 text-xs transition ${type === t ? 'border-accent bg-accent/10 text-text' : 'border-border text-text-muted hover:border-accent hover:text-text'}`}>
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Reports */}
      <section className="relative pb-16">
        <div className="max-w-screen-xl mx-auto px-6">
          {items.length === 0 && (
            <div className="rounded-2xl border border-border bg-bg-elev p-10 text-center">
              <div className="text-text font-semibold">The research desk is warming up.</div>
              <p className="mt-2 text-sm text-text-muted">
                New reports publish here automatically as they're completed. Check back shortly —
                or commission your own inside the platform.
              </p>
            </div>
          )}

          {lead && (
            <Link href={`/research/${lead.public_slug}`}
              className="group block rounded-2xl border border-border bg-bg-elev p-8 transition hover:border-accent/60 hover:shadow-[0_0_40px_rgb(var(--accent)/0.12)]">
              <div className="flex items-center gap-3 text-[11px] uppercase tracking-wider">
                <span className="text-accent-bright font-semibold">{typeMeta(lead.type).label}</span>
                <span className="text-text-dim">{fmtDate(lead.published_at)}</span>
                <span className="text-text-dim">{lead.section_count} sections</span>
              </div>
              <h2 className="mt-3 text-2xl md:text-3xl font-semibold text-text leading-tight group-hover:text-accent-bright transition">
                {lead.title}
              </h2>
              {lead.summary && <p className="mt-3 max-w-3xl text-[15px] text-text-muted leading-relaxed line-clamp-3">{lead.summary}</p>}
              <div className="mt-5 text-xs font-semibold text-accent-bright">Read the full report →</div>
            </Link>
          )}

          {rest.length > 0 && (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {rest.map((r) => (
                <Link key={r.id} href={`/research/${r.public_slug}`}
                  className="group flex flex-col rounded-2xl border border-border bg-bg-elev p-6 transition hover:border-accent/60">
                  <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-wider">
                    <span className="text-accent-bright font-semibold">{typeMeta(r.type).label}</span>
                    <span className="text-text-dim">{fmtDate(r.published_at)}</span>
                  </div>
                  <h3 className="mt-2.5 text-base font-semibold text-text leading-snug group-hover:text-accent-bright transition line-clamp-2">
                    {r.title}
                  </h3>
                  {r.summary && <p className="mt-2 text-[13px] text-text-muted leading-relaxed line-clamp-3">{r.summary}</p>}
                  <div className="mt-auto pt-4 text-[11px] text-text-dim">{r.section_count} sections · full report</div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Conversion band */}
      <section className="relative pb-24">
        <div className="max-w-screen-xl mx-auto px-6">
          <div className="rounded-2xl border border-accent/40 bg-bg-elev p-8 md:p-10 md:flex items-center gap-8">
            <div className="flex-1">
              <h2 className="text-xl md:text-2xl font-semibold text-text">
                Need this depth on a company you're chasing?
              </h2>
              <p className="mt-2 text-sm text-text-muted leading-relaxed max-w-2xl">
                These reports are produced by the same research engine every Bell.qa customer can
                point at any Qatari company, sector, or leadership team — 130,000+ companies,
                240,000+ decision-makers, every datapoint cited.
              </p>
            </div>
            <div className="mt-6 md:mt-0 flex flex-col sm:flex-row gap-3 shrink-0">
              <Link href="/get-access"
                className="rounded-lg bg-accent px-6 py-3 text-center text-sm font-bold text-[#0b1020] transition hover:shadow-[0_0_20px_rgb(var(--accent)/0.5)]">
                Get Access
              </Link>
              <Link href="/0-risk"
                className="rounded-lg border border-border px-6 py-3 text-center text-sm font-semibold text-text transition hover:border-accent">
                Or start with 0 Risk
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

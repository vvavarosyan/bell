import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'Bell Data Intelligence is the intelligence layer for Qatar\'s economy — built in Qatar, on Bell-owned infrastructure, from official sources. This is why it exists.',
  alternates: { canonical: '/about' },
};

const STATS = [
  { value: '130,000+', label: 'Qatari companies mapped' },
  { value: '1.6M+',    label: 'people in the graph' },
  { value: '240,000+', label: 'named decision-makers' },
  { value: '500+',     label: 'datapoints per record' },
];

const PRINCIPLES = [
  {
    title: 'Bell doesn\'t license its data. It builds it.',
    body:  'Every record is collected, verified, and refreshed by Bell\'s own software from official registries and the public web — never bought as a stale third-party dump. If we can\'t trace a fact to a source, it doesn\'t ship.',
  },
  {
    title: 'Built for Qatar. Only Qatar.',
    body:  'Global databases treat Qatar as a rounding error — thin coverage, transliteration errors, records that died years ago. Bell goes the opposite way: one market, covered end to end, with the depth a single-market focus makes possible.',
  },
  {
    title: 'Sovereign-grade by design.',
    body:  'Qatari soil, Qatari servers, Qatari operators, Qatari law — available as a dedicated deployment for institutions that require it. And for everyone in the directory: correction and removal on request, honoured within 14 days.',
  },
  {
    title: 'The platform compounds.',
    body:  'Every search, signal, and verified datapoint makes the graph denser and the intelligence sharper. Bell is designed as a flywheel: usage improves data, better data enables better decisions, and the country\'s picture gets clearer every day.',
  },
];

export default function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-32">
      <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
        Company
      </div>
      <h1 className="text-display-md md:text-display-lg text-gradient mb-6">
        The country, recorded.
      </h1>
      <p className="text-lg md:text-xl text-text-muted leading-relaxed max-w-3xl">
        Bell Data Intelligence exists because Qatar — one of the most dynamic
        economies on earth — deserved better than being a footnote in global
        databases. We build the definitive, living record of Qatari business:
        every company, every decision-maker, every opening, every signal —
        unified, verified, and searchable.
      </p>

      {/* Canonical numbers */}
      <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6">
        {STATS.map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-bg-elev px-5 py-6">
            <div className="text-2xl font-semibold text-text">{s.value}</div>
            <div className="mt-1 text-sm text-text-dim leading-snug">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Story */}
      <div className="doc-prose mt-16 max-w-3xl">
        <h2>Why we built Bell</h2>
        <p>
          Anyone who has tried to sell, invest, research, or partner in Qatar
          knows the problem: the information exists — spread across registries,
          licences, gazettes, websites, and networks — but no one had done the
          work of unifying it, verifying it, and keeping it alive. Teams paid
          global data vendors for coverage that stopped at a few thousand stale
          records, then did the real work by hand.
        </p>
        <p>
          Bell is that work, done properly, once, for everyone. Our collection
          engines read the official sources continuously; our enrichment pipeline
          connects companies to the people who run them, the jobs they open, and
          the signals they emit; and everything lands in one graph with full
          provenance — so you can always ask &quot;how do you know this?&quot; and get an
          answer.
        </p>
        <h2>What Bell is today</h2>
        <p>
          A working platform: search across the full directory, reveal verified
          contact details, watch live signals, work accounts in a built-in CRM,
          commission deep research, and — for companies that need customers
          before they can afford software — the{' '}
          <Link href="/0-risk">0 Risk programme</Link>, where Bell provides
          hand-prepared prospect lists and only earns when you close.
        </p>
        <h2>Principles we operate by</h2>
      </div>

      <div className="mt-8 grid md:grid-cols-2 gap-6 max-w-3xl">
        {PRINCIPLES.map(p => (
          <div key={p.title} className="rounded-xl border border-border bg-bg-elev px-5 py-5">
            <div className="text-[15px] font-semibold text-text mb-2">{p.title}</div>
            <p className="text-sm text-text-muted leading-relaxed">{p.body}</p>
          </div>
        ))}
      </div>

      <div className="doc-prose mt-16 max-w-3xl">
        <h2>Where we&apos;re going</h2>
        <p>
          The public <Link href="/roadmap">roadmap</Link> shows what&apos;s shipping
          next — from deeper signals and richer maps to Bella, the autonomous
          agent that works the platform for you. If you&apos;d like to shape it,{' '}
          <Link href="/contact">talk to us</Link>.
        </p>
      </div>

      <div className="mt-16 flex flex-wrap gap-4">
        <Link
          href="/get-access"
          className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition"
        >
          Get Access
        </Link>
        <Link
          href="/contact"
          className="inline-flex items-center px-5 py-2.5 text-sm font-medium rounded-md border border-border text-text-muted hover:text-text transition"
        >
          Contact the team
        </Link>
      </div>
    </div>
  );
}

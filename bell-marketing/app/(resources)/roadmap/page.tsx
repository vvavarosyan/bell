import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Roadmap',
  description:
    'What Bell.qa is building — now, next, and later. Deeper coverage, live signals, Bella the autonomous agent, richer maps, and more.',
  alternates: { canonical: '/roadmap' },
};

type Item = { title: string; body: string };
type Column = { id: string; label: string; hint: string; accent: string; items: Item[] };

const COLUMNS: Column[] = [
  {
    id: 'now',
    label: 'Now',
    hint: 'In active development',
    accent: 'text-green-400',
    items: [
      { title: 'Coverage deepening', body: 'Pushing website, contact, and decision-maker coverage across all 191,000+ companies — every record verifiably richer, month over month.' },
      { title: '0 Risk programme', body: 'The revenue-share track for companies that need customers first: hand-prepared prospect lists, deal tracking, and pay-only-when-you-win.' },
      { title: 'Customer contributions', body: 'Import your own lists, add datapoints to any record, and let Bell\'s curation pipeline verify the best of it into the shared directory.' },
      { title: 'Notifications & alerts', body: 'In-app and email alerts for the moments that matter — approvals, deliveries, replies, and account events.' },
    ],
  },
  {
    id: 'next',
    label: 'Next',
    hint: 'Designed, queued to build',
    accent: 'text-accent-bright',
    items: [
      { title: 'Signals, personalized', body: 'The live signal stream tuned to YOUR ideal customer profile — expansions, licences, hires, and buying moments that match what you sell.' },
      { title: 'Bella', body: 'The autonomous agent inside Bell.qa: chat and voice, able to search, reveal, enrich, and work your CRM with your approval at every step.' },
      { title: 'Map intelligence layers', body: 'Select an area, reveal every company in it, and see the market geographically — with layers for buildings, zones, and networks.' },
      { title: 'Team controls', body: 'Per-member permissions, credit budgets, and activity trails for larger workspaces.' },
      { title: 'Outreach engine', body: 'Send from your own domain, sequence intelligently, and measure replies — natively on the Bell graph.' },
    ],
  },
  {
    id: 'later',
    label: 'Later',
    hint: 'On the horizon',
    accent: 'text-text-dim',
    items: [
      { title: 'Public API', body: 'Programmatic access to the directory and signals for teams that build.' },
      { title: 'External CRM sync', body: 'Two-way connections to HubSpot, Salesforce, and Zoho.' },
      { title: 'Arabic experience', body: 'A first-class Arabic interface across the platform and site.' },
      { title: 'Prediction engine', body: 'Forecasting and probability across the graph — from growth trajectories to buying likelihood.' },
    ],
  },
];

export default function RoadmapPage() {
  return (
    <div className="max-w-screen-xl mx-auto px-6 pt-24 pb-32">
      <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
        Company
      </div>
      <h1 className="text-display-md md:text-display-lg text-gradient mb-4">
        What we&apos;re building.
      </h1>
      <p className="text-lg text-text-muted leading-relaxed max-w-2xl mb-4">
        Bell ships continuously — the platform you see today gets deeper every
        week. This is the honest shape of what&apos;s coming. No dates: quality
        decides when things ship.
      </p>
      <p className="text-sm text-text-dim mb-14">
        Have a need that should be on this page?{' '}
        <Link href="/contact" className="text-accent-bright hover:underline">Tell us</Link> — customer
        pull moves items up.
      </p>

      <div className="grid md:grid-cols-3 gap-8">
        {COLUMNS.map(col => (
          <div key={col.id}>
            <div className="flex items-baseline gap-3 mb-5">
              <h2 className={`text-xl font-semibold ${col.accent}`}>{col.label}</h2>
              <span className="text-xs text-text-dim uppercase tracking-wider">{col.hint}</span>
            </div>
            <div className="space-y-4">
              {col.items.map(item => (
                <div key={item.title} className="rounded-xl border border-border bg-bg-elev px-5 py-4">
                  <div className="text-[15px] font-semibold text-text mb-1.5">{item.title}</div>
                  <p className="text-sm text-text-muted leading-relaxed">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="mt-14 text-xs text-text-dim max-w-2xl">
        This roadmap describes direction, not commitment — scope and order can
        change as we learn. Features ship when they meet Bell&apos;s bar for
        accuracy and polish.
      </p>
    </div>
  );
}

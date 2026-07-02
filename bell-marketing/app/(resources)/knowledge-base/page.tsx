import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Knowledge Base',
  description:
    'Step-by-step guides for Bell.qa — first search, reveals, CRM, imports, exports, data quality, and account management.',
  alternates: { canonical: '/knowledge-base' },
};

type Article = { title: string; minutes: number; steps: string[]; note?: string };
type Section = { id: string; label: string; blurb: string; articles: Article[] };

const SECTIONS: Section[] = [
  {
    id: 'getting-started',
    label: 'Getting started',
    blurb: 'From zero to your first revealed decision-maker in minutes.',
    articles: [
      {
        title: 'Run your first search',
        minutes: 2,
        steps: [
          'Open app.bell.qa and go to Companies.',
          'Type any name, registration number, or keyword — search is fuzzy, so partial spellings and typos still find the right record.',
          'Stack filters (industry, city, size, has-website, status) to carve the market down to your exact segment.',
          'Click any row — the full profile opens in the side drawer: identity, status, people, contacts, financials, and sources.',
        ],
      },
      {
        title: 'Reveal your first contact',
        minutes: 1,
        steps: [
          'Open a company or person — contact details show masked by default.',
          'Click Reveal. One credit unlocks the verified details for your workspace permanently.',
          'Revealed records are added to your CRM automatically, so nothing you paid for gets lost.',
        ],
        note: 'Credits refresh monthly with your plan. Already-revealed records never charge twice.',
      },
      {
        title: 'Tell Bell who your ideal customer is',
        minutes: 3,
        steps: [
          'Go to Settings and open the Company & ICP profile.',
          'Describe what you sell, your pricing, and your target industries, sizes, and decision-maker titles.',
          'Bell uses this profile to sharpen matching and, as the roadmap ships, to personalize your signals.',
        ],
      },
    ],
  },
  {
    id: 'prospecting',
    label: 'Prospecting',
    blurb: 'Find the companies that should be your customers.',
    articles: [
      {
        title: 'Build a target list with filters',
        minutes: 4,
        steps: [
          'In Companies, apply your segment filters — industry tags match ALL of a company\'s industries, not just its primary one.',
          'Sort by Bell Score to work the most complete, most active records first.',
          'Select rows and reveal in bulk; every revealed company lands in your CRM in one motion.',
        ],
      },
      {
        title: 'Explore the market on the Map',
        minutes: 2,
        steps: [
          'Open Map to see the directory geographically.',
          'Zoom into a district or free zone to see who operates there.',
          'Use it for territory planning and field visits — the same records, placed in the real world.',
        ],
      },
      {
        title: 'Watch the Market Feed',
        minutes: 1,
        steps: [
          'The Market Feed surfaces what\'s changing across the Qatari market — fresh records, updates, and market news.',
          'Check Data Statistics in the feed for the live size and freshness of the graph.',
        ],
      },
    ],
  },
  {
    id: 'crm',
    label: 'CRM & your pipeline',
    blurb: 'Work accounts where the data lives.',
    articles: [
      {
        title: 'Add companies and people to your CRM',
        minutes: 2,
        steps: [
          'Reveal any record — it joins your CRM automatically.',
          'Or add manually: in CRM, click “+ New” to create a company or contact that isn\'t in Bell yet. It stays private to your workspace.',
          'Track status, notes, and activity per record; your team sees one shared truth.',
        ],
      },
      {
        title: 'Import a list (CSV, Excel, or JSON)',
        minutes: 5,
        steps: [
          'In CRM, click Import and choose your file — .csv, .xlsx, and JSON all work; Arabic text is fully supported.',
          'Bell auto-maps common columns (name, email, phone, company, website, city).',
          'The preview matches every row against Bell\'s directory. Sure matches link automatically; close calls go to a “Confirm matches” step where you decide link vs keep-separate.',
          'Finish — linked rows enrich your CRM with Bell\'s live record, new rows are created privately in your workspace.',
        ],
        note: 'Contributed business info may be reviewed by Bell\'s curation team to improve the shared directory — nothing publishes without human review, and your private copy is never changed.',
      },
      {
        title: 'Export your CRM to CSV',
        minutes: 1,
        steps: [
          'In CRM, click Export CSV (or select specific rows first and export just those).',
          'Exports include your revealed contact details and run in batches of up to 2,500 rows — use the batch picker for larger books.',
        ],
      },
      {
        title: 'Add your own datapoints to any record',
        minutes: 1,
        steps: [
          'Open a CRM record and use “Added details” to attach phones, emails, websites, notes, or custom fields.',
          'Your additions are instant and private to your workspace.',
        ],
      },
    ],
  },
  {
    id: 'data-quality',
    label: 'Data quality & rights',
    blurb: 'When something looks wrong — or shouldn\'t be there.',
    articles: [
      {
        title: 'Report incorrect data',
        minutes: 1,
        steps: [
          'Open the record and use Request Details / report an issue, or email support@bell.qa with the record link.',
          'Bell\'s team verifies against the sources and corrects — provenance means we can always re-check where a fact came from.',
        ],
      },
      {
        title: 'Request removal (for listed businesses & people)',
        minutes: 1,
        steps: [
          'Email legal@bell.qa identifying the record, or start from the Trust page.',
          'Verified requests are honoured within 14 days.',
        ],
        note: 'Built in Qatar. Yours to remove.',
      },
    ],
  },
  {
    id: 'account',
    label: 'Account & billing',
    blurb: 'Plans, credits, and workspace admin.',
    articles: [
      {
        title: 'Understand your credits',
        minutes: 1,
        steps: [
          'Your sidebar shows the live credit balance.',
          'Reveals charge one credit per company or person — only the first time.',
          'Credits refresh with your billing cycle; the Billing page shows history and renewal dates.',
        ],
      },
      {
        title: 'Change plan or payment details',
        minutes: 2,
        steps: [
          'Open Billing in the app to upgrade, downgrade, or update payment.',
          'Upgrades apply immediately; downgrades at the next renewal. If a payment fails you get a grace period before the workspace freezes.',
        ],
      },
      {
        title: 'Join the 0 Risk programme instead',
        minutes: 3,
        steps: [
          'If paying up front isn\'t right for you, apply at 0risk.bell.qa.',
          'Complete your profile, upload CR + QID, sign and stamp the agreement, submit — then request your first list of 100 matched prospects once approved.',
        ],
      },
    ],
  },
];

export default function KnowledgeBasePage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-32">
      <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
        Resources
      </div>
      <h1 className="text-display-md text-gradient mb-4">Knowledge Base.</h1>
      <p className="text-lg text-text-muted leading-relaxed max-w-2xl mb-6">
        Practical, step-by-step guides for every part of Bell — written the way
        we&apos;d want to read them.
      </p>
      <div className="flex flex-wrap gap-2 mb-14">
        {SECTIONS.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="text-xs px-3 py-1.5 rounded-full border border-border text-text-muted hover:text-text hover:border-accent/50 transition"
          >
            {s.label}
          </a>
        ))}
      </div>

      {SECTIONS.map(section => (
        <section key={section.id} id={section.id} className="mb-14 scroll-mt-24">
          <h2 className="text-xl font-semibold text-text mb-1">{section.label}</h2>
          <p className="text-sm text-text-dim mb-5">{section.blurb}</p>
          <div className="space-y-3">
            {section.articles.map(a => (
              <details
                key={a.title}
                className="group rounded-xl border border-border bg-bg-elev px-5 py-4"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between gap-4">
                  <span className="text-[15px] font-semibold text-text">{a.title}</span>
                  <span className="flex items-center gap-3 shrink-0">
                    <span className="text-[11px] text-text-dim">{a.minutes} min</span>
                    <span className="text-text-dim group-open:rotate-45 transition-transform text-lg leading-none">+</span>
                  </span>
                </summary>
                <ol className="mt-4 list-decimal pl-5 space-y-2">
                  {a.steps.map((s, i) => (
                    <li key={i} className="text-sm text-text-muted leading-relaxed">{s}</li>
                  ))}
                </ol>
                {a.note && (
                  <p className="mt-3 text-xs text-text-dim border-l-2 border-accent/40 pl-3 leading-relaxed">{a.note}</p>
                )}
              </details>
            ))}
          </div>
        </section>
      ))}

      <div className="mt-4 rounded-xl border border-border bg-bg-elev px-6 py-5 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-text-muted">
          Can&apos;t find what you need? The team answers within one business day.
        </p>
        <Link
          href="/support"
          className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition"
        >
          Get support
        </Link>
      </div>
    </div>
  );
}

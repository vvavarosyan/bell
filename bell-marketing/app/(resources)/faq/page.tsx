import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'Answers to the most-asked questions about Bell.qa — coverage, data sources, pricing, credits, PDPPL compliance, the 0 Risk programme, and more.',
  alternates: { canonical: '/faq' },
};

type QA = { q: string; a: string; link?: { label: string; href: string } };

const GROUPS: { label: string; items: QA[] }[] = [
  {
    label: 'The platform',
    items: [
      {
        q: 'What is Bell.qa?',
        a: 'Bell Data Intelligence is the intelligence layer for Qatar\'s economy: a living, searchable record of 191,000+ Qatari companies, 1.6M+ people in the graph, and all named decision-makers — with signals, maps, a built-in CRM, and research tools on top. One market, covered end to end.',
      },
      {
        q: 'Where does the data come from?',
        a: 'From Bell\'s own collection software reading official and public sources: the Ministry of Commerce and Industry, the QFC public register, sector regulators, official gazettes, tender platforms, company websites, press archives, and professional networks as a leadership-graph source. Every datapoint carries provenance — you can always see where a fact came from. Bell doesn\'t license its data. It builds it.',
      },
      {
        q: 'How fresh is the data?',
        a: 'Bell\'s engines run continuously — 1.2 billion datapoints are scanned, tracked, and updated every day across 21 record types, with refresh tiers from sub-90-seconds (live signals) to daily and weekly (registry records). Records show when they were last updated.',
      },
      {
        q: 'Does Bell cover companies outside Qatar?',
        a: 'No — and that\'s deliberate. Bell covers one market with depth no global database matches. International entities appear only where they touch the Qatari market (for example, as a parent company or partner of a Qatari firm).',
      },
      {
        q: 'Is there an API?',
        a: 'Not publicly yet. Programmatic access is on the roadmap; teams with a strong need can contact us about early arrangements.',
        link: { label: 'Roadmap', href: '/roadmap' },
      },
      {
        q: 'Is the platform available in Arabic?',
        a: 'The data itself handles Arabic names and records natively. The interface is currently English; a first-class Arabic experience is on the roadmap.',
      },
    ],
  },
  {
    label: 'Pricing & accounts',
    items: [
      {
        q: 'What does Bell cost?',
        a: 'Plans are billed in Qatari Riyal (QAR) and include a monthly credit allowance. There is no free tier — see the pricing page for current plans. Government and institutional licensing is handled separately.',
        link: { label: 'Pricing', href: '/pricing' },
      },
      {
        q: 'What are credits and reveals?',
        a: 'Contact details in the directory are masked by default. Spending a credit "reveals" a company\'s or person\'s verified contact details for your workspace permanently — revealed records also flow into your CRM automatically. Credits refresh monthly with your plan.',
      },
      {
        q: 'Can my team share a workspace?',
        a: 'Yes. Workspaces support multiple members; the owner controls access. Finer-grained roles, per-member credit budgets, and activity trails are rolling out on the roadmap.',
      },
      {
        q: 'How do I cancel?',
        a: 'Any time, from Billing inside the app. Access continues to the end of the paid period; you can export your CRM data before you go.',
      },
    ],
  },
  {
    label: 'The 0 Risk programme',
    items: [
      {
        q: 'What is 0 Risk?',
        a: 'A track for companies that need customers before they can pay for software. Instead of a subscription, you sign a revenue-share agreement: Bell\'s team hand-prepares lists of prospects that precisely match your ideal customer, with full dossiers — and Bell earns an agreed percentage only from deals you actually close from those lists.',
        link: { label: 'Learn about 0 Risk', href: '/0-risk' },
      },
      {
        q: 'How do I join 0 Risk?',
        a: 'Apply at 0risk.bell.qa: complete your company profile, upload your CR and QID, sign and stamp the agreement, and submit. Bell\'s team reviews every application; once approved, you can request your first list of 100 matched prospects.',
      },
    ],
  },
  {
    label: 'Data rights & compliance',
    items: [
      {
        q: 'Is using Bell compliant with Qatari law?',
        a: 'Bell is built in Qatar around Qatari law, including the Personal Data Privacy Protection Law (Law No. 13 of 2016). The directory holds business-context data with provenance, contact details are gated behind explicit reveals, and listed people can request correction or removal at any time. For your own outreach using revealed contacts, you\'re responsible for contacting people lawfully.',
        link: { label: 'Trust', href: '/data/trust' },
      },
      {
        q: 'I\'m listed in Bell — how do I correct or remove my information?',
        a: 'Email legal@bell.qa (or use the Trust page) identifying the record. Corrections and removals are honoured within 14 days.',
        link: { label: 'Privacy Policy', href: '/privacy' },
      },
      {
        q: 'Can I import my own lists — and what happens to them?',
        a: 'Yes — CSV, Excel, and JSON imports go into YOUR private workspace and match intelligently against Bell records. Business information you contribute may, after human review by Bell\'s curation team, improve the shared directory (that\'s in the Terms). Nothing is published automatically, and your private copy is never affected.',
      },
      {
        q: 'Can I export data?',
        a: 'Yes — your CRM (including revealed contacts) exports to CSV in batches of up to 2,500 rows. Bulk redistribution or reselling of the directory itself isn\'t allowed.',
      },
      {
        q: 'How is my workspace data protected?',
        a: 'Workspaces are isolated per customer; your CRM, notes, and imports are never visible to other customers. Payments are processed by Stripe (card details never touch Bell\'s servers), and sovereign deployments on Qatari soil are available for institutions that require them.',
      },
    ],
  },
];

// FAQPage structured data — built from the exact same content, so Google can
// show rich results without any drift between markup and page.
const FAQ_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: GROUPS.flatMap(g => g.items).map(item => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

export default function FaqPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-24 pb-32">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSONLD) }}
      />
      <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
        Resources
      </div>
      <h1 className="text-display-md text-gradient mb-4">
        Frequently asked questions.
      </h1>
      <p className="text-lg text-text-muted leading-relaxed mb-14">
        Plain answers to the questions we hear most. Something missing?{' '}
        <Link href="/contact" className="text-accent-bright hover:underline">Ask us directly</Link>.
      </p>

      {GROUPS.map(group => (
        <section key={group.label} className="mb-12">
          <h2 className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-4">
            {group.label}
          </h2>
          <div className="space-y-3">
            {group.items.map(item => (
              <details
                key={item.q}
                className="group rounded-xl border border-border bg-bg-elev px-5 py-4 open:pb-5"
              >
                <summary className="cursor-pointer list-none flex items-start justify-between gap-4">
                  <span className="text-[15px] font-semibold text-text leading-snug">{item.q}</span>
                  <span className="text-text-dim group-open:rotate-45 transition-transform text-lg leading-none mt-0.5">+</span>
                </summary>
                <p className="mt-3 text-sm text-text-muted leading-relaxed">{item.a}</p>
                {item.link && (
                  <Link href={item.link.href} className="mt-2 inline-block text-sm text-accent-bright hover:underline">
                    {item.link.label} →
                  </Link>
                )}
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

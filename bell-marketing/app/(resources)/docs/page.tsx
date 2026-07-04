import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'Bell.qa platform documentation — the data model, search, reveals and credits, CRM, imports and exports, research, the 0 Risk programme, teams, billing, and security.',
  alternates: { canonical: '/docs' },
};

/** Doc sections — single-page reference with a sticky side nav (GitHub-docs
 *  style). Content is the source of truth for how the platform ACTUALLY works;
 *  keep it in lockstep with the product. */
const NAV = [
  { id: 'overview',       label: 'Overview' },
  { id: 'getting-started', label: 'Getting started' },
  { id: 'data-model',     label: 'The data model' },
  { id: 'search',         label: 'Search & filters' },
  { id: 'reveals',        label: 'Reveals & credits' },
  { id: 'crm',            label: 'CRM' },
  { id: 'imports',        label: 'Imports' },
  { id: 'exports',        label: 'Exports' },
  { id: 'research',       label: 'Research' },
  { id: 'zero-risk',      label: 'The 0 Risk programme' },
  { id: 'team',           label: 'Team & roles' },
  { id: 'billing',        label: 'Billing' },
  { id: 'security',       label: 'Security & compliance' },
  { id: 'api',            label: 'API' },
];

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-28 text-xl font-semibold text-text mt-14 mb-4 pt-6 border-t border-border first:mt-0 first:pt-0 first:border-0">
      {children}
    </h2>
  );
}

export default function DocsPage() {
  return (
    <div className="max-w-screen-xl mx-auto px-6 pt-24 pb-32">
      <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
        Resources
      </div>
      <h1 className="text-display-md text-gradient mb-4">Documentation.</h1>
      <p className="text-lg text-text-muted leading-relaxed max-w-2xl mb-12">
        The Bell platform, explained end to end — what the graph contains, how
        the mechanics work, and what every feature actually does.
      </p>

      <div className="flex gap-12">
        {/* Sticky side nav */}
        <aside className="hidden lg:block w-52 shrink-0">
          <nav className="sticky top-24 space-y-1">
            <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
              On this page
            </div>
            {NAV.map(item => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="block text-sm text-text-muted hover:text-text py-1 transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div className="min-w-0 max-w-3xl doc-prose">
          <H2 id="overview">Overview</H2>
          <p>
            Bell is a graph of the Qatari economy: <strong>191,000+ companies</strong>{' '}
            (76,000+ actively trading), <strong>1.6M+ people</strong> with{' '}
            <strong>all named decision-makers</strong>, live job openings, and
            a continuous stream of market signals — up to{' '}
            <strong>500+ datapoints per record</strong>, refreshed continuously by
            Bell&apos;s own collection engines. Everything below runs on that graph.
          </p>
          <p>
            Bell has four surfaces: <strong>bell.qa</strong> (this site),{' '}
            <strong>app.bell.qa</strong> (the platform), <strong>0risk.bell.qa</strong>{' '}
            (the 0 Risk programme portal), and a sovereign deployment option for
            institutions.
          </p>

          <H2 id="getting-started">Getting started</H2>
          <ol>
            <li><strong>Get access</strong> — subscribe at <Link href="/pricing">bell.qa/pricing</Link>; your workspace activates immediately after checkout.</li>
            <li><strong>Set your ICP</strong> — in Settings, describe what you sell and who buys it. This sharpens matching and powers upcoming personalized signals.</li>
            <li><strong>Search, reveal, work</strong> — find your segment, reveal decision-makers, and manage everything in the built-in CRM.</li>
          </ol>

          <H2 id="data-model">The data model</H2>
          <p>Four core entities, linked:</p>
          <table>
            <thead>
              <tr><th>Entity</th><th>What it holds</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>Company</strong></td><td>Identity (name, legal name, registration numbers), status, industry tags (a company can carry several; one is primary), locations, digital presence (website, social), contacts, shareholders and financials where disclosed, and its enrichment history.</td></tr>
              <tr><td><strong>Person</strong></td><td>Name, current role and employer, seniority, professional profile links, and verified work contact details (masked until revealed).</td></tr>
              <tr><td><strong>Job</strong></td><td>Open positions linked to the hiring company — a live hiring signal.</td></tr>
              <tr><td><strong>Signal</strong></td><td>Time-stamped market events: registrations, licences, expansions, hiring bursts, and news.</td></tr>
            </tbody>
          </table>
          <p>
            Two properties apply to every record: <strong>provenance</strong> (each
            datapoint records the source it came from — registry, website, press —
            so facts are auditable) and the <strong>Bell Score</strong>, a
            completeness/quality measure that helps you work the richest records
            first.
          </p>

          <H2 id="search">Search &amp; filters</H2>
          <ul>
            <li><strong>Everything is searchable</strong> — names, legal names, registration numbers, contacts, and record details all feed the search index.</li>
            <li><strong>Fuzzy by design</strong> — typos, partial spellings, and transliteration variants still find the intended record.</li>
            <li><strong>Filters stack</strong> — industry (matches ANY of a company&apos;s tags), city, status, company size, has-website, source registry, and more.</li>
            <li><strong>Sort by Bell Score</strong> to prioritize complete records, or by recency to see what just changed.</li>
          </ul>

          <H2 id="reveals">Reveals &amp; credits</H2>
          <ul>
            <li>Contact details are <strong>masked by default</strong> across the directory.</li>
            <li>A <strong>reveal</strong> spends one credit and permanently unlocks that company&apos;s or person&apos;s verified contact details for your workspace. Nothing double-charges: already-revealed records are free forever.</li>
            <li>Reveals are <strong>workspace-wide</strong> — anything a teammate reveals is revealed for you too, across Companies, People, and the Map.</li>
            <li>Every reveal <strong>auto-adds the record to your CRM</strong>, so paid intelligence is never lost.</li>
            <li>Credits arrive monthly with your plan; the sidebar shows your live balance.</li>
          </ul>

          <H2 id="crm">CRM</H2>
          <p>
            Bell ships a native CRM on the graph, so account truth and market truth
            stay one thing:
          </p>
          <ul>
            <li><strong>Records</strong> — companies and contacts, created by reveals, manual “+ New” entries, or imports. Manual entries stay private to your workspace.</li>
            <li><strong>Live linkage</strong> — a CRM record linked to a Bell entity keeps receiving Bell&apos;s updates (status changes, new people, new signals).</li>
            <li><strong>Added details</strong> — attach your own phones, emails, notes, and custom fields to any record; instant, private, yours.</li>
            <li><strong>Activity</strong> — status changes and actions are logged per record for the whole team.</li>
          </ul>

          <H2 id="imports">Imports</H2>
          <ul>
            <li>Formats: <strong>CSV, Excel (.xlsx/.xls), and JSON</strong>. Arabic content is fully supported.</li>
            <li>Columns auto-map (name, email, phone, company, title, website, city); a preview shows exactly what will be created.</li>
            <li>
              <strong>Intelligent matching:</strong> each row is compared against the
              directory. Exact identifiers (domain, phone, email) or a near-exact
              name with corroboration link automatically; close calls go to a{' '}
              <strong>Confirm matches</strong> step where you choose link vs
              keep-separate. A fuzzy name alone never silently merges.
            </li>
            <li>Linked rows enrich your CRM with the live Bell record; unmatched rows become private records in your workspace.</li>
            <li>Contributed business info may be reviewed by Bell&apos;s curation team for the shared directory — human review always, private copies untouched (see <Link href="/terms">Terms §6</Link>).</li>
          </ul>

          <H2 id="exports">Exports</H2>
          <ul>
            <li>Export your CRM — or just selected rows — to <strong>CSV</strong> (Excel-safe, Arabic-safe).</li>
            <li>Exports run in batches of up to <strong>2,500 rows</strong>; a batch picker handles larger books without overlaps.</li>
            <li>Unrevealed contact details stay masked in exports — reveals are the unlock, everywhere.</li>
          </ul>

          <H2 id="research">Research</H2>
          <p>
            Commission deep-dive reports on a company, person, or sector. Bell&apos;s
            research pipeline assembles the dossier — background, structure,
            financial signals, relationships — and delivers it into your workspace.
            Completed research strengthens the graph itself: verified facts flow
            back into the records they concern.
          </p>

          <H2 id="zero-risk">The 0 Risk programme</H2>
          <p>
            For companies that need customers before they can pay for software,{' '}
            <strong>0risk.bell.qa</strong> offers a revenue-share track instead of a
            subscription:
          </p>
          <ol>
            <li>Complete your company profile (including CR, Computer Card, and signatory QID) to 100%.</li>
            <li>Upload your documents, download the auto-filled agreement, sign &amp; stamp it, upload it back, and submit.</li>
            <li>Bell&apos;s team reviews every application — approval, or a request to fix specific items.</li>
            <li>Once approved, request a list: Bell hand-prepares matched prospects with full dossiers (contacts included), viewable in the portal and exportable to CSV.</li>
            <li>Report deal progress per company; Bell finalizes wins. Further list allowances are granted by the Bell team based on how you work the current list.</li>
          </ol>
          <p>
            The signed agreement governs the revenue share; the{' '}
            <Link href="/0-risk">0 Risk page</Link> has the full pitch.
          </p>

          <H2 id="team">Team &amp; roles</H2>
          <ul>
            <li>Workspaces support multiple members under one subscription; the owner controls membership.</li>
            <li>Reveals, CRM, and credits are shared workspace-wide.</li>
            <li>Granular per-member permissions, credit budgets, and activity trails are rolling out — see the <Link href="/roadmap">roadmap</Link>.</li>
          </ul>

          <H2 id="billing">Billing</H2>
          <ul>
            <li>Plans bill in <strong>QAR</strong> via Stripe; card details never touch Bell&apos;s servers.</li>
            <li>Upgrades apply immediately; downgrades at the next renewal; cancel anytime with access to period end.</li>
            <li>If a renewal fails you get a short grace period, then the workspace freezes (nothing is deleted) until payment resumes.</li>
          </ul>

          <H2 id="security">Security &amp; compliance</H2>
          <ul>
            <li><strong>Tenant isolation</strong> — every workspace&apos;s CRM, imports, and reveals are scoped server-side to that workspace alone.</li>
            <li><strong>Provenance</strong> — directory facts are auditable to their source.</li>
            <li><strong>PDPPL</strong> — business-context data, gated contact reveals, and correction/removal for listed people within 14 days (<Link href="/data/trust">Trust</Link>, <Link href="/privacy">Privacy Policy</Link>).</li>
            <li><strong>Sovereign option</strong> — dedicated deployments on Qatari soil, under Qatari law, for institutions that require it (<Link href="/sovereign">Government licensing</Link>).</li>
          </ul>

          <H2 id="api">API</H2>
          <p>
            A public API is <strong>not yet available</strong> — it&apos;s on the{' '}
            <Link href="/roadmap">roadmap</Link>. If programmatic access would
            change what you can build, <Link href="/contact">talk to us</Link>{' '}
            about early arrangements; customer pull decides ordering.
          </p>

          <div className="mt-14 rounded-xl border border-border bg-bg-elev px-6 py-5 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-text-muted m-0">
              Something undocumented? Tell us and we&apos;ll write it up.
            </p>
            <Link
              href="/support"
              className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition no-underline"
            >
              Contact support
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

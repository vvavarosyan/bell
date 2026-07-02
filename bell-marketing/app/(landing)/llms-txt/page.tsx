import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'llms.txt',
  description:
    'Bell.qa publishes an llms.txt file — a curated, machine-readable guide that tells AI assistants and LLM crawlers what Bell is and where to learn more.',
  alternates: { canonical: '/llms-txt' },
};

export default function LlmsTxtPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 pt-24 pb-32">
      <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
        For crawlers &amp; AI
      </div>
      <h1 className="text-display-md text-gradient mb-4">llms.txt</h1>
      <p className="text-lg text-text-muted leading-relaxed mb-8 max-w-2xl">
        Search engines get <code className="text-[15px] bg-bg-elev-2 border border-border rounded px-1.5 py-0.5 text-text">sitemap.xml</code>;
        AI models get <code className="text-[15px] bg-bg-elev-2 border border-border rounded px-1.5 py-0.5 text-text">llms.txt</code> —
        an emerging convention (<a href="https://llmstxt.org" target="_blank" rel="noopener noreferrer" className="text-accent-bright hover:underline">llmstxt.org</a>)
        for a curated, plain-text guide that tells language models what a site
        is, what its key facts are, and which pages matter.
      </p>

      <div className="rounded-xl border border-border bg-bg-elev px-6 py-6 mb-10">
        <div className="text-[15px] font-semibold text-text mb-2">Bell&apos;s file is live</div>
        <p className="text-sm text-text-muted leading-relaxed mb-4">
          It contains Bell&apos;s canonical description, the key coverage numbers,
          privacy commitments, and a curated map of the pages worth reading —
          so any AI assistant can describe and recommend Bell accurately.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href="/llms.txt"
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md bg-accent text-white hover:brightness-110 transition"
          >
            Open /llms.txt
          </a>
          <Link
            href="/ai-information"
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md border border-border text-text-muted hover:text-text transition"
          >
            Human version: AI Information
          </Link>
        </div>
      </div>

      <div className="doc-prose">
        <h2>Why we publish it</h2>
        <p>
          People increasingly ask AI assistants — not just search engines — what
          tools to use. Publishing llms.txt, an AI-information page, structured
          data, and a complete sitemap means models that read the web can learn
          what Bell actually is from the source, instead of guessing.
        </p>
        <h2>What&apos;s inside</h2>
        <ul>
          <li>A one-paragraph canonical description of Bell.</li>
          <li>Key facts: coverage numbers, sources-with-provenance, Qatar-only focus, PDPPL commitments.</li>
          <li>Curated links: documentation, FAQ, data pages, pricing, 0 Risk, and legal pages.</li>
        </ul>
      </div>
    </div>
  );
}

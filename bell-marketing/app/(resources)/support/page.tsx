import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail, MessageSquare, BookOpen, HelpCircle, Activity, ShieldCheck } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Support',
  description:
    'Get help with Bell.qa — contact the team, browse the knowledge base and documentation, check system status, or request data correction/removal.',
  alternates: { canonical: '/support' },
};

const CHANNELS = [
  {
    icon: Mail,
    title: 'Email the team',
    body: 'For account, billing, data, or anything else — a human reads every message.',
    cta: 'support@bell.qa',
    href: 'mailto:support@bell.qa',
  },
  {
    icon: MessageSquare,
    title: 'Contact form',
    body: 'Prefer a form? Send a message with your workspace details and we\'ll follow up.',
    cta: 'Open the contact page',
    href: '/contact',
  },
];

const SELF_SERVE = [
  { icon: BookOpen,    title: 'Knowledge Base', body: 'Step-by-step guides for every part of the platform.', href: '/knowledge-base' },
  { icon: HelpCircle,  title: 'FAQ',            body: 'The questions we hear most, answered plainly.',        href: '/faq' },
  { icon: BookOpen,    title: 'Documentation',  body: 'The platform explained end to end — data model, credits, imports, teams.', href: '/docs' },
  { icon: Activity,    title: 'System status',  body: 'Live operational status of every Bell system.',        href: '/status' },
];

export default function SupportPage() {
  return (
    <div className="max-w-4xl mx-auto px-6 pt-24 pb-32">
      <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-3">
        Company
      </div>
      <h1 className="text-display-md text-gradient mb-4">Support</h1>
      <p className="text-lg text-text-muted leading-relaxed max-w-2xl mb-2">
        Talk to the people who build Bell — no ticket maze, no chatbot wall.
      </p>
      <p className="text-sm text-text-dim mb-12">
        We respond within one business day, Sunday–Thursday, Doha time (AST).
      </p>

      <div className="grid md:grid-cols-2 gap-6">
        {CHANNELS.map(c => (
          <a
            key={c.title}
            href={c.href}
            className="rounded-xl border border-border bg-bg-elev px-6 py-6 hover:border-accent/50 transition group"
          >
            <c.icon size={20} className="text-accent-bright mb-3" />
            <div className="text-[15px] font-semibold text-text mb-1.5">{c.title}</div>
            <p className="text-sm text-text-muted leading-relaxed mb-3">{c.body}</p>
            <span className="text-sm text-accent-bright group-hover:underline">{c.cta} →</span>
          </a>
        ))}
      </div>

      <h2 className="text-xl font-semibold text-text mt-16 mb-6">Help yourself first</h2>
      <div className="grid md:grid-cols-2 gap-6">
        {SELF_SERVE.map(s => (
          <Link
            key={s.title}
            href={s.href}
            className="flex gap-4 rounded-xl border border-border bg-bg-elev px-5 py-4 hover:border-accent/50 transition"
          >
            <s.icon size={18} className="text-text-dim mt-0.5 shrink-0" />
            <span>
              <span className="block text-sm font-semibold text-text">{s.title}</span>
              <span className="block text-sm text-text-muted leading-relaxed mt-0.5">{s.body}</span>
            </span>
          </Link>
        ))}
      </div>

      <div className="mt-16 rounded-xl border border-border bg-bg-elev px-6 py-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={18} className="text-accent-bright" />
          <span className="text-[15px] font-semibold text-text">Listed in Bell and want changes?</span>
        </div>
        <p className="text-sm text-text-muted leading-relaxed">
          If your company or profile appears in the directory, you can request a
          correction or full removal — honoured within 14 days. See{' '}
          <Link href="/data/trust" className="text-accent-bright hover:underline">Trust</Link>{' '}
          or write to{' '}
          <a href="mailto:legal@bell.qa" className="text-accent-bright hover:underline">legal@bell.qa</a>.
        </p>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import {
  ShieldCheck, ArrowRight, CheckCircle2, FileSignature,
  Target, TrendingUp, Coins, ClipboardList,
} from 'lucide-react';

/**
 * "0 RISK AGREEMENT" — a standalone offering page.
 *
 * For companies that need clients but won't/can't pay a subscription. Bell hands
 * them a deeply-researched list of perfect-fit prospects at no upfront cost; they
 * pay a 15% share of the revenue they earn from those prospects. Distinct emerald
 * accent (vs. Bell blue) to signal a separate, performance-based programme.
 *
 * CTA → the app's 0 Risk join flow (app.bell.qa/?zero-risk=join), which signs the
 * user up and enrols them into 0 Risk mode.
 */

const JOIN_URL = 'https://app.bell.qa/?zero-risk=join';
const GREEN = 'rgb(63 185 80)';
const GREEN_BRIGHT = 'rgb(110 210 120)';

export function ZeroRiskSections() {
  return (
    <>
      <ZrHero />
      <ZrWho />
      <ZrHow />
      <ZrDeal />
      <ZrCta />
    </>
  );
}

function Badge() {
  return (
    <div
      className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full text-[11px] font-semibold uppercase tracking-wider border"
      style={{ color: GREEN_BRIGHT, background: 'rgba(63,185,80,0.10)', borderColor: 'rgba(63,185,80,0.30)' }}
    >
      <ShieldCheck size={11} />
      0 Risk Agreement
    </div>
  );
}

function ZrHero() {
  return (
    <section className="relative pt-28 pb-20 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(63,185,80,0.14) 0%, transparent 65%)' }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <Badge />
        <h1
          className="text-display-md md:text-display-lg max-w-3xl mx-auto leading-tight"
          style={{
            background: `linear-gradient(135deg, rgb(245 248 245) 0%, ${GREEN_BRIGHT} 100%)`,
            WebkitBackgroundClip: 'text', backgroundClip: 'text',
            WebkitTextFillColor: 'transparent', color: 'transparent',
          }}
        >
          Clients now. Pay only when you win.
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-lg text-white/70 leading-relaxed">
          The 0 Risk Agreement is for companies that urgently need customers but aren&apos;t ready to pay
          for a subscription. Bell hands you a list of perfectly-matched, deeply-researched prospects at
          <span className="text-white"> no upfront cost</span>. You only pay Bell a
          <span className="text-white"> 15% share of the revenue</span> you earn from the companies we provide.
        </p>
        <div className="mt-9 flex items-center justify-center gap-4">
          <Link
            href={JOIN_URL}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-black transition-transform hover:scale-[1.02]"
            style={{ background: GREEN_BRIGHT }}
          >
            Apply to join <ArrowRight size={16} />
          </Link>
          <Link href="#how" className="text-white/70 hover:text-white text-sm font-medium">
            How it works ↓
          </Link>
        </div>
      </div>
    </section>
  );
}

function ZrWho() {
  const items = [
    { icon: Target, title: 'You need clients, fast', body: 'You have a strong offering but an empty pipeline, and you need qualified prospects now — not in six months.' },
    { icon: Coins, title: 'Cash is tight', body: 'A monthly subscription isn’t where you want to spend right now. With 0 Risk there’s nothing to pay until you actually close a deal.' },
    { icon: TrendingUp, title: 'You’ll back yourself', body: 'You’re confident that with the right introductions you’ll win business — and you’re happy to share a slice of that upside.' },
  ];
  return (
    <section className="py-16">
      <div className="max-w-screen-xl mx-auto px-6">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-white">Who it&apos;s for</h2>
        <div className="mt-10 grid md:grid-cols-3 gap-6">
          {items.map((it) => (
            <div key={it.title} className="rounded-xl border border-white/10 bg-white/[0.02] p-6">
              <it.icon size={22} style={{ color: GREEN_BRIGHT }} />
              <div className="mt-3 font-semibold text-white">{it.title}</div>
              <p className="mt-2 text-sm text-white/60 leading-relaxed">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ZrHow() {
  const steps = [
    { icon: ClipboardList, title: 'Apply & build your profile', body: 'Sign up and tell us everything about your company, your existing customers, your services and pricing, and your ideal customer profile.' },
    { icon: FileSignature, title: 'Sign the agreement', body: 'Submit your CR and QID and sign & stamp the 0 Risk Agreement. Our team reviews and gives you the green light.' },
    { icon: Target, title: 'Request your first list', body: 'Get 100 companies that perfectly match your ICP — each with a deep dossier: background, financials, tech stack, partners, strengths, weaknesses, and exactly how to approach them.' },
    { icon: TrendingUp, title: 'Win — then scale', body: 'Track every deal in your dashboard. Close one and unlock your next list. Close more and we raise your limits to hundreds, even thousands, of prospects.' },
  ];
  return (
    <section id="how" className="py-16">
      <div className="max-w-screen-xl mx-auto px-6">
        <h2 className="text-2xl md:text-3xl font-bold text-center text-white">How it works</h2>
        <div className="mt-10 grid md:grid-cols-2 gap-6">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-xl border border-white/10 bg-white/[0.02] p-6 flex gap-4">
              <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center font-bold text-black" style={{ background: GREEN_BRIGHT }}>{i + 1}</div>
              <div>
                <div className="font-semibold text-white flex items-center gap-2"><s.icon size={16} style={{ color: GREEN_BRIGHT }} /> {s.title}</div>
                <p className="mt-2 text-sm text-white/60 leading-relaxed">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ZrDeal() {
  const points = [
    'No upfront cost and no subscription — you only pay when you earn.',
    '15% of the revenue you generate from any company Bell provides.',
    'A serious, signed and stamped agreement — built on trust and accountability.',
    'Switch to a full paid Bell account whenever you’re ready.',
  ];
  return (
    <section className="py-16">
      <div className="max-w-3xl mx-auto px-6">
        <div className="rounded-2xl border p-8" style={{ borderColor: 'rgba(63,185,80,0.30)', background: 'rgba(63,185,80,0.06)' }}>
          <h2 className="text-2xl font-bold text-white">The deal, in plain terms</h2>
          <ul className="mt-6 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3 text-white/80">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: GREEN }} />
                <span className="text-sm leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function ZrCta() {
  return (
    <section className="py-20">
      <div className="max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white">Ready to fill your pipeline?</h2>
        <p className="mt-4 text-white/70 max-w-xl mx-auto">Apply now. If approved, your first 100 perfectly-matched prospects are a click away.</p>
        <div className="mt-8">
          <Link
            href={JOIN_URL}
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-lg font-semibold text-black transition-transform hover:scale-[1.02]"
            style={{ background: GREEN_BRIGHT }}
          >
            Apply to join 0 Risk <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

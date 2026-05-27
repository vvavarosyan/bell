'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ShieldCheck, Users, FileSignature, Clock,
  ArrowRight, Database, Sparkles,
  Building2, Mail, UserCircle2, Bot,
  ChevronRight,
} from 'lucide-react';

/**
 * PRICING & ACCESS — public marketing page.
 *
 * Positioning rules baked into the copy:
 *   • Transparent pricing. Selective access.
 *   • Anyone can register, but platform activation is gated by our access
 *     team's review of each new account. Legal documents may be requested
 *     for certain account types.
 *   • Every commercial plan grants full platform access. The only levers
 *     are credit volume, workspace seats, and service intensity.
 *   • Sovereign / Government licensing exists on its own page at /sovereign,
 *     linked from the footer. It is NOT surfaced on the pricing page so the
 *     commercial tiers stand alone for regular users and corporates.
 *
 * Layout — top to bottom:
 *   1. Hero
 *   2. Eligibility band (3 hard constraints)
 *   3. Three-tier plan grid (Starter / Business / Enterprise)
 *   4. Universal includes ("every plan, full platform")
 *   5. Credit economy (what a credit buys + typical monthly outcomes)
 *   6. Approval process (3 numbered steps, 1–24h end to end)
 *   7. Final CTA
 *
 * No FAQ section by design — the verification stage handles questions
 * directly and the page reads more dignified without an accordion.
 */

export function PricingSections() {
  return (
    <>
      <PricingHero />
      <EligibilityBand />
      <PlanGrid />
      <UniversalIncludes />
      <CreditEconomy />
      <ApprovalProcess />
      <PricingFinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Hero
// ───────────────────────────────────────────────────────────────────────────

function PricingHero() {
  return (
    <section className="relative pt-28 pb-20 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(91,140,255,0.16) 0%, transparent 65%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(91,140,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(91,140,255,1) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-bg-elev-2 border border-border text-text text-xs font-semibold uppercase tracking-wider">
          Pricing &amp; Access
        </div>
        <h1 className="text-display-md md:text-display-lg text-gradient max-w-3xl mx-auto">
          Pricing is transparent.<br/>Access is selective.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl mx-auto">
          Bell.qa is an intelligence platform for Qatar&apos;s market. Anyone can
          register, but every new account is reviewed before activation so the
          platform stays in the hands of operators who will use it well.
        </p>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Eligibility band — three hard constraints
// ───────────────────────────────────────────────────────────────────────────

function EligibilityBand() {
  const items = [
    {
      icon: ShieldCheck,
      title: 'Approval-gated activation',
      body:  'Anyone can register. Platform access is granted after our team reviews each new account.',
    },
    {
      icon: FileSignature,
      title: 'Compliance review',
      body:  'Legal documents and verification of trade licence may be requested before activation.',
    },
    {
      icon: Users,
      title: 'Annual or 90-day terms',
      body:  'Commercial plans are billed monthly, with a 90-day minimum or 12-month commitment.',
    },
  ];

  return (
    <section className="relative -mt-4 pb-12">
      <div className="max-w-screen-xl mx-auto px-6">
        <div
          className="rounded-2xl border border-border overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            {items.map((it, i) => {
              const Icon = it.icon;
              return (
                <div key={i} className="p-6 flex items-start gap-4">
                  <span
                    className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg text-accent-bright"
                    style={{ background: 'rgba(91,140,255,0.14)' }}
                  >
                    <Icon size={18} />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-text">{it.title}</div>
                    <div className="mt-1 text-[13px] text-text-muted leading-relaxed">{it.body}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Plan grid
// ───────────────────────────────────────────────────────────────────────────

type Intake = 'Open' | 'Limited' | 'By interview';

type Plan = {
  num:        string;
  name:       string;
  intake:     Intake;
  forWho:     string;
  priceMonth: number;
  credits:    number;
  perks:      string[];
  ctaLabel:   string;
};

const PLANS: Plan[] = [
  {
    num: '01',
    name: 'Starter',
    intake: 'Open',
    forWho:
      'For specialist teams and independent operators running a focused book of business in Qatar.',
    priceMonth: 2000,
    credits:    2000,
    perks: [
      '2 workspace seats',
      'Self-serve onboarding, async support',
      'Response within 2 business days',
      'Monthly credit allocation, resets each cycle',
    ],
    ctaLabel: 'Request Starter access',
  },
  {
    num: '02',
    name: 'Business',
    intake: 'Limited',
    forWho:
      'For revenue, M&A, and corporate intelligence teams running Qatar as a primary market.',
    priceMonth: 10000,
    credits:    15000,
    perks: [
      '10 workspace seats',
      'Guided onboarding, named point of contact',
      'Quarterly intelligence review with our team',
      '30-day rolling credit buffer',
      'Response within 1 business day',
    ],
    ctaLabel: 'Request Business access',
  },
  {
    num: '03',
    name: 'Enterprise',
    intake: 'By interview',
    forWho:
      'For institutions, firms, and family offices treating Qatar coverage as a strategic capability.',
    priceMonth: 30000,
    credits:    60000,
    perks: [
      '30 workspace seats',
      'White-glove onboarding led by an intelligence lead',
      'Dedicated account director',
      'Direct line to the data team for custom signal requests',
      '60-day rolling credit buffer',
      'Response within 4 business hours',
    ],
    ctaLabel: 'Request Enterprise access',
  },
];

function PlanGrid() {
  return (
    <section className="relative pb-20">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PLANS.map((p, i) => (
            <PlanCard key={p.name} plan={p} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan, index }: { plan: Plan; index: number }) {
  const { num, name, intake, forWho, priceMonth, credits, perks, ctaLabel } = plan;
  const isMid = index === 1; // visually elevate the Business tier slightly

  const intakeStyle =
    intake === 'Open'
      ? { color: 'rgb(156 165 185)', bg: 'rgba(156,165,185,0.10)', border: 'rgba(156,165,185,0.30)' }
      : intake === 'Limited'
      ? { color: 'rgb(255 196 99)', bg: 'rgba(255,196,99,0.12)',  border: 'rgba(255,196,99,0.35)'  }
      : { color: 'rgb(165 195 255)', bg: 'rgba(91,140,255,0.16)', border: 'rgba(91,140,255,0.40)' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, delay: index * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
      style={{
        background: isMid
          ? 'linear-gradient(180deg, rgba(26,32,52,0.96) 0%, rgba(19,24,41,0.96) 100%)'
          : 'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        boxShadow: isMid
          ? '0 24px 60px -24px rgba(91,140,255,0.25), 0 0 0 1px rgba(91,140,255,0.18) inset'
          : '0 12px 30px -16px rgba(0,0,0,0.5)',
      }}
      className={
        'relative rounded-2xl border overflow-hidden flex flex-col ' +
        (isMid ? 'border-accent/30' : 'border-border')
      }
    >
      <div className="p-6 pb-5 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border"
            style={{ color: intakeStyle.color, background: intakeStyle.bg, borderColor: intakeStyle.border }}
          >
            Intake: {intake}
          </span>
          <span className="text-[10px] font-mono text-text-dim tabular-nums">{num}</span>
        </div>
        <h3 className="text-2xl font-semibold text-text leading-tight">{name}</h3>
        <p className="mt-2 text-[13px] text-text-muted leading-relaxed min-h-[3.5rem]">
          {forWho}
        </p>
      </div>

      <div className="px-6 py-6 border-b border-border">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-mono text-text-dim">QAR</span>
          <span className="text-4xl md:text-5xl font-semibold text-text tabular-nums leading-none">
            {priceMonth.toLocaleString()}
          </span>
          <span className="text-sm text-text-muted">/ month</span>
        </div>
        <div className="mt-3 flex items-center gap-2 text-[13px] text-text-muted">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded text-accent-bright"
            style={{ background: 'rgba(91,140,255,0.14)' }}
          >
            <Sparkles size={11} />
          </span>
          <span>
            <span className="text-text font-semibold tabular-nums">{credits.toLocaleString()}</span>{' '}
            credits included monthly
          </span>
        </div>
      </div>

      <div className="px-6 py-6 flex-1">
        <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-3">
          This tier adds
        </div>
        <ul className="space-y-2.5">
          {perks.map((perk) => (
            <li key={perk} className="flex items-start gap-2.5 text-[13px] text-text-muted leading-relaxed">
              <span
                className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-accent"
                aria-hidden="true"
              />
              <span>{perk}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="p-6 pt-0">
        <Link
          href="/get-access"
          className={
            'group w-full inline-flex items-center justify-between gap-2 px-5 py-3 rounded-md text-sm font-medium transition ' +
            (isMid
              ? 'bg-accent text-white hover:brightness-110 shadow-lg shadow-accent/30'
              : 'border border-border text-text hover:border-text-dim/60 bg-bg-elev/50')
          }
        >
          <span>{ctaLabel}</span>
          <ArrowRight
            size={15}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. Universal includes — every plan grants the full platform
// ───────────────────────────────────────────────────────────────────────────

const INCLUDES = [
  'Every Qatari company in the Bell.qa graph',
  'Every decision-maker, founder, executive, and board member',
  'Live hiring signals, news, and movement data',
  'Economic, regulatory, real estate, logistics, tourism, environmental layers',
  'Built-in CRM and outbound tooling',
  'Bella, the autonomous revenue agent',
  'API access on Business and Enterprise tiers',
  'Audit-ready data lineage on every record',
];

function UniversalIncludes() {
  return (
    <section className="relative py-20">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(91,140,255,0.04) 50%, transparent 100%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border border-border bg-bg-elev-2 text-text text-[11px] font-semibold uppercase tracking-wider">
            <Database size={11} />
            Included on every plan
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            One platform, no feature gates.
          </h2>
          <p className="mt-3 text-base text-text-muted">
            The only thing that changes between tiers is volume, seats, and the
            level of service around the platform.
          </p>
        </div>

        <div
          className="rounded-2xl border border-border overflow-hidden max-w-4xl mx-auto"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 divide-border">
            {INCLUDES.map((line, i) => (
              <div
                key={i}
                className={
                  'p-4 flex items-start gap-3 text-sm text-text leading-relaxed ' +
                  (i % 2 === 0 ? 'md:border-r md:border-border ' : '') +
                  (i >= 2 ? 'md:border-t md:border-border ' : '')
                }
              >
                <span
                  className="mt-1 shrink-0 inline-flex items-center justify-center w-4 h-4 rounded text-accent-bright"
                  style={{ background: 'rgba(91,140,255,0.16)' }}
                >
                  <ChevronRight size={10} />
                </span>
                <span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Credit economy
// ───────────────────────────────────────────────────────────────────────────

function CreditEconomy() {
  const actions = [
    { icon: Building2,   label: 'Reveal a company',        cost: '1 credit'        },
    { icon: UserCircle2, label: 'Reveal a person',         cost: '1 credit'        },
    { icon: Mail,        label: 'Send one outbound email', cost: '1 credit'        },
    { icon: Bot,         label: 'One Bella task',          cost: '0.25 – 10 credits' },
  ];

  // Right-card content — reframed to outcomes, not input counts.
  // Numbers are deliberately ranges, not point estimates, to communicate
  // that mileage varies with industry, ICP, and how the team uses the
  // platform — but to still give a confident order-of-magnitude.
  const outcomes = [
    {
      plan:   'Starter',
      deals:  '2 – 5',
      note:   'New business closed by a focused individual or small team',
    },
    {
      plan:   'Business',
      deals:  '12 – 25',
      note:   'Steady commercial output across a 10-seat workspace',
    },
    {
      plan:   'Enterprise',
      deals:  '35 – 80',
      note:   'Multi-team programmes operating Qatar as a primary market',
    },
  ];

  return (
    <section className="relative py-20">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border border-border bg-bg-elev-2 text-text text-[11px] font-semibold uppercase tracking-wider">
            <Sparkles size={11} />
            How credits work
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            One unit of work. One credit.
          </h2>
          <p className="mt-3 text-base text-text-muted">
            Credits are the smallest billable unit on the platform. They cover
            every action the platform takes on your behalf, whether the action
            is initiated by you or by Bella running autonomously.
          </p>
        </div>

        {/* items-stretch on the parent + h-full on both cards forces equal
            visual height across the two columns regardless of internal
            content length. */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left — what a credit buys */}
          <div className="lg:col-span-5 flex">
            <div
              className="w-full h-full flex flex-col rounded-2xl border border-border overflow-hidden"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
              }}
            >
              <div className="px-5 py-4 border-b border-border bg-bg-elev-2/40">
                <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
                  What a credit buys
                </div>
              </div>
              <ul className="flex-1">
                {actions.map((a, i) => {
                  const Icon = a.icon;
                  return (
                    <li
                      key={i}
                      className={
                        'px-5 py-4 flex items-center justify-between gap-3 ' +
                        (i < actions.length - 1 ? 'border-b border-border ' : '')
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-accent-bright"
                          style={{ background: 'rgba(91,140,255,0.14)' }}
                        >
                          <Icon size={16} />
                        </span>
                        <span className="text-sm text-text">{a.label}</span>
                      </div>
                      <span className="text-sm font-mono text-text-muted tabular-nums whitespace-nowrap">
                        {a.cost}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="px-5 py-4 border-t border-border bg-bg-elev-2/30 text-[12px] text-text-muted leading-relaxed">
                Simple Bella tasks use{' '}
                <span className="text-text font-semibold">0.25 to 1 credit</span>.
                Complex multi-step workflows can range up to{' '}
                <span className="text-text font-semibold">6 to 10 credits</span>{' '}
                end to end, covering reveal, enrichment, drafting, sending, and
                follow-up sequencing.
              </div>
            </div>
          </div>

          {/* Right — typical monthly outcomes by plan */}
          <div className="lg:col-span-7 flex">
            <div
              className="w-full h-full flex flex-col rounded-2xl border border-border overflow-hidden"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
              }}
            >
              <div className="px-5 py-4 border-b border-border bg-bg-elev-2/40 flex items-center justify-between">
                <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
                  Typical monthly outcomes
                </div>
                <span className="text-[10px] uppercase tracking-wider text-text-dim font-mono">
                  by plan
                </span>
              </div>
              <div className="flex-1 flex flex-col">
                {outcomes.map((o, i) => (
                  <div
                    key={o.plan}
                    className={
                      'flex-1 px-5 py-5 flex items-center justify-between gap-6 ' +
                      (i < outcomes.length - 1 ? 'border-b border-border ' : '')
                    }
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-text">{o.plan}</div>
                      <div className="mt-1 text-[12px] text-text-muted leading-relaxed">
                        {o.note}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl md:text-3xl font-semibold text-text tabular-nums leading-none">
                        {o.deals}
                      </div>
                      <div className="mt-1.5 text-[10px] uppercase tracking-wider text-text-dim">
                        deals / month
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 py-4 border-t border-border bg-bg-elev-2/30 text-[12px] text-text-muted leading-relaxed">
                Ranges are indicative, drawn from customer reported outcomes.
                What a workspace actually closes depends on ICP, sales cycle,
                and how aggressively the team puts Bella to work.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. Approval process — three numbered steps, 1–24h end to end
// ───────────────────────────────────────────────────────────────────────────

const STEPS = [
  {
    n: '01',
    title: 'Register',
    body:  'Anyone can create an account in a few minutes. You provide your firm, contact, and primary intended use.',
    meta:  '~5 minutes',
  },
  {
    n: '02',
    title: 'Review',
    body:  'Our access team reviews each new account. Legal documents or a verification of trade licence may be requested for certain account types.',
    meta:  'Within hours',
  },
  {
    n: '03',
    title: 'Activation',
    body:  'Once cleared, your workspace is unlocked and your team can begin using the platform immediately.',
    meta:  'Same day',
  },
];

function ApprovalProcess() {
  return (
    <section className="relative py-20">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border border-border bg-bg-elev-2 text-text text-[11px] font-semibold uppercase tracking-wider">
            <ShieldCheck size={11} />
            How access works
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            From registration to activation in 1 to 24 hours.
          </h2>
          <p className="mt-3 text-base text-text-muted">
            We don&apos;t auto-approve every account. Each registration is reviewed
            by a member of our access team before the platform is unlocked.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="relative rounded-xl border border-border p-6"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg font-mono text-xs font-semibold"
                  style={{
                    background: 'rgba(91,140,255,0.14)',
                    color:      'rgb(165 195 255)',
                    border:     '1px solid rgba(91,140,255,0.32)',
                  }}
                >
                  {s.n}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
                  {s.meta}
                </span>
              </div>
              <div className="text-base font-semibold text-text leading-tight">{s.title}</div>
              <p className="mt-2 text-[13px] text-text-muted leading-relaxed">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. Final CTA
// ───────────────────────────────────────────────────────────────────────────

function PricingFinalCta() {
  return (
    <section className="relative py-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(91,140,255,0.14) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          Ready to register?
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Most accounts are reviewed and activated the same day. Larger or
          regulated accounts may take up to 24 hours.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-center">
          <Link
            href="/get-access"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium rounded-md bg-accent text-white hover:brightness-110 transition shadow-lg shadow-accent/30"
          >
            Get Access
            <ArrowRight size={16} />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center px-6 py-3 text-base font-medium rounded-md text-text-muted hover:text-text"
          >
            Speak to our team →
          </Link>
        </div>
        <p className="mt-6 text-[12px] text-text-dim flex items-center justify-center gap-2">
          <Clock size={11} />
          Accounts reviewed continuously. End-to-end activation runs from 1 to 24 hours.
        </p>
      </div>
    </section>
  );
}

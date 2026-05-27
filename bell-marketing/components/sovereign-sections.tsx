'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Landmark, Lock, Database, Headphones, FileSignature,
  ShieldCheck, Network, Layers, ArrowRight, Clock,
} from 'lucide-react';

/**
 * SOVEREIGN & GOVERNMENT LICENSING — its own page, deliberately discreet.
 *
 * Reached only via a single footer link (Company column). NOT surfaced on
 * the public pricing page so commercial visitors don't see a "government
 * tier" sitting next to QAR price tags. Tone is institutional: amber/gold
 * accent system instead of Bell blue, NDA framing throughout, no
 * commercial pricing disclosed.
 *
 * Sections, top to bottom:
 *   1. Hero — institutional title, brief positioning
 *   2. Three engagement principles (NDA-first, named liaison, term-based)
 *   3. What's covered — the three pillars (platform access, BIN exchange, services)
 *   4. The BIN data exchange — explainer block
 *   5. Engagement process — 4 steps
 *   6. Contact card — confidential briefing request
 */

// Brand palette for this page — gold-on-black, distinct from the commercial pages.
const GOLD        = 'rgb(212 175 95)';
const GOLD_BRIGHT = 'rgb(232 199 122)';

export function SovereignSections() {
  return (
    <>
      <SovHero />
      <SovPrinciples />
      <SovCoverage />
      <SovBinExchange />
      <SovProcess />
      <SovContact />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Hero
// ───────────────────────────────────────────────────────────────────────────

function SovHero() {
  return (
    <section className="relative pt-28 pb-20 overflow-hidden">
      {/* Gold radial wash, replacing the blue used elsewhere */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(212,175,95,0.14) 0%, transparent 65%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(212,175,95,1) 1px, transparent 1px), linear-gradient(90deg, rgba(212,175,95,1) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full text-[11px] font-semibold uppercase tracking-wider border"
          style={{
            color:       GOLD_BRIGHT,
            background:  'rgba(212,175,95,0.10)',
            borderColor: 'rgba(212,175,95,0.30)',
          }}
        >
          <Landmark size={11} />
          Sovereign &amp; Government Licensing
        </div>
        <h1
          className="text-display-md md:text-display-lg max-w-3xl mx-auto leading-tight"
          style={{
            background: `linear-gradient(135deg, rgb(245 240 230) 0%, ${GOLD_BRIGHT} 100%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            color: 'transparent',
            fontWeight: 700,
            letterSpacing: '-0.03em',
          }}
        >
          For ministries, regulators,<br/>and sovereign entities.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl mx-auto">
          Bell.qa licenses annual seats to Qatari government bodies under
          negotiated terms. Pricing is not published. Briefings are arranged
          on request, under NDA.
        </p>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Three engagement principles
// ───────────────────────────────────────────────────────────────────────────

function SovPrinciples() {
  const items = [
    {
      icon:  Lock,
      title: 'NDA-first engagement',
      body:  'No commercial or technical detail is shared until a mutual non-disclosure is in place between your institution and Bell.qa.',
    },
    {
      icon:  Headphones,
      title: 'Named relationship lead',
      body:  'Every sovereign engagement is anchored by a single relationship lead from our government team, for the duration of the licence.',
    },
    {
      icon:  FileSignature,
      title: 'Annual term, negotiated',
      body:  'Licensing is structured as a fixed-term annual agreement, with terms reflecting institutional scope, user count, and data scope.',
    },
  ];

  return (
    <section className="relative -mt-4 pb-12">
      <div className="max-w-screen-xl mx-auto px-6">
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, rgba(28,22,12,0.92) 0%, rgba(18,14,8,0.92) 100%)',
            borderColor: 'rgba(212,175,95,0.22)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <div
            className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x"
            style={{ borderColor: 'rgba(212,175,95,0.18)' }}
          >
            {items.map((it, i) => {
              const Icon = it.icon;
              return (
                <div
                  key={i}
                  className="p-6 flex items-start gap-4"
                  style={
                    i > 0
                      ? { borderLeftColor: 'rgba(212,175,95,0.18)' }
                      : {}
                  }
                >
                  <span
                    className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-lg"
                    style={{
                      color:      GOLD,
                      background: 'rgba(212,175,95,0.10)',
                      boxShadow:  'inset 0 0 0 1px rgba(212,175,95,0.18)',
                    }}
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
// 3. What's covered — three pillars
// ───────────────────────────────────────────────────────────────────────────

function SovCoverage() {
  const pillars = [
    {
      icon:  Layers,
      title: 'Institution-wide platform access',
      body:  'Bell.qa\'s full intelligence layer made available across the licensed institution. Companies, decision-makers, hiring, economic, regulatory, real estate, logistics, tourism, and environmental data, all in one place.',
      bullets: [
        'Unlimited reads across the licensed body',
        'Workspace seats issued to designated officers',
        'Single sign-on integration with institution identity',
        'Audit-ready data lineage on every record viewed',
      ],
    },
    {
      icon:  Network,
      title: 'BIN data exchange layer',
      body:  'The bidirectional reconciliation protocol that aligns your institution\'s own registries and identifiers with the Bell.qa unified company graph. Detailed in the next section.',
      bullets: [
        'Inbound reconciliation against your registries',
        'Outbound sync of canonical Bell.qa records',
        'Identifier mapping via the BIN identifier system',
        'Hosted in-country, on infrastructure you can audit',
      ],
    },
    {
      icon:  Headphones,
      title: 'Government services & support',
      body:  'A dedicated service envelope around the licence, sized to the operational tempo your institution requires.',
      bullets: [
        'Named relationship lead and technical liaison',
        'Quarterly review with the Bell.qa intelligence team',
        'Custom data and signal requests prioritised',
        'Briefing and training sessions for your officers',
      ],
    },
  ];

  return (
    <section className="relative py-20">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border text-[11px] font-semibold uppercase tracking-wider"
            style={{
              color:       GOLD_BRIGHT,
              background:  'rgba(212,175,95,0.08)',
              borderColor: 'rgba(212,175,95,0.25)',
            }}
          >
            What a licence covers
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            Three pillars, under one agreement.
          </h2>
          <p className="mt-3 text-base text-text-muted">
            Sovereign engagements are structured around three pillars. The
            scope and intensity of each is set during the briefing.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {pillars.map((p, i) => {
            const Icon = p.icon;
            return (
              <motion.div
                key={p.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.55, delay: i * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
                className="relative rounded-2xl border overflow-hidden flex flex-col"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(28,22,12,0.94) 0%, rgba(18,14,8,0.94) 100%)',
                  borderColor: 'rgba(212,175,95,0.22)',
                }}
              >
                <div className="p-6 pb-5 border-b" style={{ borderColor: 'rgba(212,175,95,0.18)' }}>
                  <span
                    className="inline-flex items-center justify-center w-11 h-11 rounded-lg mb-4"
                    style={{
                      color:      GOLD,
                      background: 'rgba(212,175,95,0.10)',
                      boxShadow:  'inset 0 0 0 1px rgba(212,175,95,0.18)',
                    }}
                  >
                    <Icon size={19} />
                  </span>
                  <h3 className="text-base font-semibold text-text leading-tight">{p.title}</h3>
                  <p className="mt-2 text-[13px] text-text-muted leading-relaxed">{p.body}</p>
                </div>
                <ul className="p-6 space-y-2.5 flex-1">
                  {p.bullets.map(b => (
                    <li key={b} className="flex items-start gap-2.5 text-[13px] text-text-muted leading-relaxed">
                      <span
                        className="mt-1.5 shrink-0 w-1 h-1 rounded-full"
                        style={{ background: GOLD }}
                        aria-hidden="true"
                      />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. BIN data exchange explainer
// ───────────────────────────────────────────────────────────────────────────

function SovBinExchange() {
  return (
    <section className="relative py-20">
      <div className="max-w-screen-xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="relative rounded-2xl border overflow-hidden p-8 md:p-12"
          style={{
            background:
              'linear-gradient(135deg, rgba(40,32,18,0.95) 0%, rgba(20,16,12,0.95) 100%)',
            borderColor: 'rgba(212,175,95,0.30)',
            boxShadow: '0 24px 60px -24px rgba(212,175,95,0.18), 0 0 0 1px rgba(212,175,95,0.10) inset',
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 60% 80% at 100% 0%, rgba(212,175,95,0.14) 0%, transparent 60%)',
            }}
          />

          <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-7">
              <div
                className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full text-[11px] font-semibold uppercase tracking-wider border"
                style={{
                  color:       GOLD_BRIGHT,
                  background:  'rgba(212,175,95,0.10)',
                  borderColor: 'rgba(212,175,95,0.30)',
                }}
              >
                <Database size={11} />
                The BIN data exchange
              </div>
              <h2
                className="text-2xl md:text-3xl font-semibold leading-tight"
                style={{
                  background: `linear-gradient(135deg, rgb(245 240 230) 0%, ${GOLD_BRIGHT} 100%)`,
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  color: 'transparent',
                }}
              >
                A bidirectional reconciliation layer between your registries and ours.
              </h2>
              <p className="mt-5 text-[15px] text-text-muted leading-relaxed">
                Every company in Bell.qa carries a canonical{' '}
                <span className="text-text font-semibold">BIN — Bell Identification Number</span>
                {' '}— assigned through our deduplication and assembly pipeline. The
                BIN data exchange is the protocol that lets your institution&apos;s
                own systems converse with our graph in both directions, using
                BIN as the shared key.
              </p>
              <p className="mt-4 text-[15px] text-text-muted leading-relaxed">
                Inbound, we reconcile against your registries so the records in
                Bell.qa reflect what your institution holds as authoritative.
                Outbound, your systems can sync canonical Bell.qa records,
                signals, and identifier mappings into your own data lake or
                operational tooling.
              </p>
              <p className="mt-4 text-[14px] text-text-dim leading-relaxed">
                The exchange runs on infrastructure hosted in Qatar, with
                access logging at every layer. A full technical brief is
                provided after NDA execution.
              </p>
            </div>

            {/* Right: a small diagram-style block showing the exchange */}
            <div className="lg:col-span-5">
              <div
                className="rounded-xl border p-5"
                style={{
                  background:  'rgba(20,16,8,0.55)',
                  borderColor: 'rgba(212,175,95,0.20)',
                }}
              >
                <div
                  className="text-[10px] uppercase tracking-wider font-semibold mb-4"
                  style={{ color: GOLD_BRIGHT }}
                >
                  How the exchange flows
                </div>

                <div className="space-y-3">
                  <ExchangeRow
                    label="Your institution"
                    sub="Authoritative registries, internal IDs"
                  />
                  <ExchangeArrow label="Reconcile inbound" />
                  <ExchangeRow
                    label="BIN reconciliation"
                    sub="Identifier mapping, dedup, lineage"
                    emphasis
                  />
                  <ExchangeArrow label="Sync outbound" />
                  <ExchangeRow
                    label="Bell.qa unified graph"
                    sub="Canonical records, signals, contact data"
                  />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function ExchangeRow({
  label, sub, emphasis,
}: {
  label: string;
  sub:   string;
  emphasis?: boolean;
}) {
  return (
    <div
      className="px-3 py-3 rounded-lg border"
      style={{
        background: emphasis ? 'rgba(212,175,95,0.08)' : 'rgba(20,16,8,0.6)',
        borderColor: emphasis ? 'rgba(212,175,95,0.35)' : 'rgba(212,175,95,0.15)',
      }}
    >
      <div className="text-[13px] font-semibold text-text leading-tight">{label}</div>
      <div className="mt-0.5 text-[11px] text-text-muted leading-tight">{sub}</div>
    </div>
  );
}

function ExchangeArrow({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pl-3">
      <span
        className="inline-block w-px"
        style={{ height: 14, background: 'rgba(212,175,95,0.4)' }}
        aria-hidden="true"
      />
      <span
        className="text-[10px] uppercase tracking-wider font-mono"
        style={{ color: GOLD }}
      >
        {label}
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Engagement process
// ───────────────────────────────────────────────────────────────────────────

const ENGAGEMENT_STEPS = [
  {
    n: '01',
    title: 'Initial request',
    body:  'Your institution submits a formal request for a briefing through this page or directly via our government team.',
    meta:  'Day 0',
  },
  {
    n: '02',
    title: 'NDA execution',
    body:  'A mutual non-disclosure is put in place between Bell.qa and your institution before any detailed material is exchanged.',
    meta:  'Within 2 weeks',
  },
  {
    n: '03',
    title: 'Briefing & technical session',
    body:  'A briefing on platform coverage, the BIN exchange, and the service envelope is held, followed by a technical session with your team.',
    meta:  'Scheduled jointly',
  },
  {
    n: '04',
    title: 'Term sheet & activation',
    body:  'A term sheet is issued reflecting institutional scope and intensity. On signature, infrastructure is provisioned and your officers are onboarded.',
    meta:  'By agreement',
  },
];

function SovProcess() {
  return (
    <section className="relative py-20">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border text-[11px] font-semibold uppercase tracking-wider"
            style={{
              color:       GOLD_BRIGHT,
              background:  'rgba(212,175,95,0.08)',
              borderColor: 'rgba(212,175,95,0.25)',
            }}
          >
            <ShieldCheck size={11} />
            How an engagement proceeds
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            Four formal steps. NDA-first throughout.
          </h2>
          <p className="mt-3 text-base text-text-muted">
            Sovereign engagements move at the pace of institutional process.
            Timeframes are guidance, set in detail at the start.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {ENGAGEMENT_STEPS.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="relative rounded-xl border p-6"
              style={{
                background:
                  'linear-gradient(180deg, rgba(28,22,12,0.92) 0%, rgba(18,14,8,0.92) 100%)',
                borderColor: 'rgba(212,175,95,0.22)',
              }}
            >
              <div className="flex items-start justify-between mb-4">
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-lg font-mono text-xs font-semibold border"
                  style={{
                    background:  'rgba(212,175,95,0.10)',
                    color:       GOLD_BRIGHT,
                    borderColor: 'rgba(212,175,95,0.30)',
                  }}
                >
                  {s.n}
                </span>
                <span
                  className="text-[10px] font-mono uppercase tracking-wider"
                  style={{ color: GOLD }}
                >
                  {s.meta}
                </span>
              </div>
              <div className="text-base font-semibold text-text leading-tight">
                {s.title}
              </div>
              <p className="mt-2 text-[13px] text-text-muted leading-relaxed">
                {s.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. Contact card
// ───────────────────────────────────────────────────────────────────────────

function SovContact() {
  return (
    <section className="relative py-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(212,175,95,0.12) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6">
        <div
          className="max-w-3xl mx-auto rounded-2xl border p-8 md:p-12 text-center"
          style={{
            background:
              'linear-gradient(180deg, rgba(28,22,12,0.94) 0%, rgba(18,14,8,0.94) 100%)',
            borderColor: 'rgba(212,175,95,0.28)',
            boxShadow: '0 24px 60px -24px rgba(212,175,95,0.18)',
          }}
        >
          <div
            className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full text-[11px] font-semibold uppercase tracking-wider border"
            style={{
              color:       GOLD_BRIGHT,
              background:  'rgba(212,175,95,0.10)',
              borderColor: 'rgba(212,175,95,0.30)',
            }}
          >
            <Lock size={11} />
            Confidential briefing
          </div>
          <h2
            className="text-2xl md:text-3xl font-semibold leading-tight max-w-xl mx-auto"
            style={{
              background: `linear-gradient(135deg, rgb(245 240 230) 0%, ${GOLD_BRIGHT} 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              color: 'transparent',
            }}
          >
            Request a briefing for your institution.
          </h2>
          <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
            Briefings are arranged through our government relations team and
            held under NDA. We respond to all institutional enquiries within
            one business day.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 items-center justify-center">
            <Link
              href="/contact?topic=sovereign"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md text-sm font-medium transition"
              style={{
                color:      'rgb(20 16 8)',
                background: GOLD_BRIGHT,
              }}
            >
              Request a confidential briefing
              <ArrowRight size={15} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center px-6 py-3 text-base font-medium rounded-md text-text-muted hover:text-text"
            >
              Speak to our team →
            </Link>
          </div>
          <p
            className="mt-6 text-[12px] flex items-center justify-center gap-2"
            style={{ color: 'rgb(180 165 130)' }}
          >
            <Clock size={11} />
            All institutional enquiries acknowledged within one business day.
          </p>
        </div>
      </div>
    </section>
  );
}

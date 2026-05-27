'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Radar, ArrowRight, Bot, Sparkles, Layers, Zap,
  Scroll, BadgeCheck, Building, ShieldCheck, Globe,
  Newspaper, Linkedin, TrendingUp, FileText, Gavel,
  GraduationCap, GitBranch, BellRing, Filter,
  ListChecks, Clock, MessageSquare, MapPin, Mail,
  MoveRight, Check, Inbox, Users, Crown, BarChart3,
  Map as MapIcon, BrainCircuit, Target, Megaphone,
  Handshake, Microscope, Rocket,
} from 'lucide-react';
import { SignalsPageLiveFeed } from '@/components/signals-page-live-feed';

/**
 * SIGNALS & INSIGHTS PAGE — capability deep-dive.
 *
 * The most ambitious page on the platform. Signals is the foundational
 * primitive every other page references (Map shows them as pulses,
 * CRM auto-attaches them to records, BD watchlists refresh from them,
 * Marketing triggers on them, Sales prioritizes from them). This page
 * is their canonical home.
 *
 * Centerpiece: a real live streaming feed (<SignalsPageLiveFeed/>)
 * where new signals slot in at the top every ~3 seconds, age stamps
 * tick by, and old signals drop off the bottom. Country-scale anchor
 * (no workspace lens). Strategic hero, operational sections.
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. SignalsHero           — "The pulse of the Qatari market."
 *     2. SignalsActivityBar    — live counters
 *     3. TheLiveSignalFeed     — CENTERPIECE — streaming list
 *
 *   ROUND 2+ (to be added):
 *     4. SignalSourceAtlas     — 12 source cards
 *     5. HowSignalsGetRouted   — 4-step routing flow
 *     6. SubscriptionsAndDelivery — capability grid
 *     7. ConnectedToPlatform   — cross-link tiles
 *     8. MidPageCta
 *     9. OtherFunctions
 *    10. ThreeReader           — analyst / sales leader / exec
 *    11. FinalCta
 */

export function SignalsPageSections() {
  return (
    <>
      <SignalsHero />
      <SignalsActivityBar />
      <TheLiveSignalFeed />
      <SignalSourceAtlas />
      <HowSignalsGetRouted />
      <SubscriptionsAndDelivery />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. SignalsHero — strategic opening
// ───────────────────────────────────────────────────────────────────────────

function SignalsHero() {
  return (
    <section className="relative pt-28 md:pt-32 pb-20 md:pb-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 0%, rgba(91,140,255,0.18) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/40 backdrop-blur text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-7">
            <Radar size={12} className="text-accent-bright" />
            <span>Intelligence &middot; Signals & Insights</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">The pulse of the</span>
            <br />
            <span className="text-text">Qatari market.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Every filing, every leadership change, every licence, every
            tender, every expansion &mdash; the moment it lands on a
            public source, it lands on Bell.qa. Routed to the right
            person on the right team within a minute. Cited end to
            end.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <Link
              href="/get-access"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-accent text-white text-sm font-medium hover:brightness-110 transition shadow-lg shadow-accent/30 whitespace-nowrap"
            >
              Get Access
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center px-6 py-3 text-sm font-medium rounded-md border border-border text-text-muted hover:text-text whitespace-nowrap"
            >
              See pricing
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. SignalsActivityBar — cycling live counters
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Signals today',          value: '4,127', sub: 'across the Qatari market'  },
  { label: 'Sources active',         value: '12',    sub: 'regulators, press, more'    },
  { label: 'Avg signal-to-routed',   value: '< 60s', sub: 'land → right inbox'         },
  { label: 'Subscriptions running',  value: '2,840', sub: 'across all workspaces'      },
  { label: 'Bella actions on signals', value: '614', sub: 'this week'                  },
];

function SignalsActivityBar() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % ACTIVITY_FRAMES.length), 2600);
    return () => clearInterval(id);
  }, []);

  const f = ACTIVITY_FRAMES[frame];
  return (
    <section className="relative pb-12">
      <div className="max-w-screen-xl mx-auto px-6">
        <div
          className="rounded-2xl border border-border overflow-hidden px-6 py-5 md:py-6"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          }}
        >
          <div className="flex items-center gap-4">
            <span
              className="relative inline-flex items-center justify-center w-2.5 h-2.5"
              aria-hidden="true"
            >
              <span className="absolute inline-flex w-full h-full rounded-full bg-accent-bright opacity-50 animate-ping" />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-accent-bright" />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
              Live signal stream &middot; whole Qatari market
            </span>
            <div className="flex-1" />
            <AnimatePresence mode="wait">
              <motion.div
                key={frame}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.4 }}
                className="flex items-baseline gap-3 text-right"
              >
                <span className="text-2xl md:text-3xl font-semibold text-text tabular-nums">
                  {f.value}
                </span>
                <div className="text-left">
                  <div className="text-[11.5px] font-semibold text-text uppercase tracking-wider">
                    {f.label}
                  </div>
                  <div className="text-[10.5px] text-text-dim">{f.sub}</div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. TheLiveSignalFeed — CENTERPIECE — embedded streaming list
// ───────────────────────────────────────────────────────────────────────────

function TheLiveSignalFeed() {
  return (
    <section className="relative py-12 md:py-16 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What&apos;s landing, right now
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The live signal feed.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Watch a new signal appear at the top every few seconds.
            Each row tells you the source, the kind, the company, and
            where Bella would route it on a real workspace. The actual
            stream runs at the rate the market produces it.
          </p>
        </div>

        <SignalsPageLiveFeed />

        {/* Footnote strip — what the visitor is looking at */}
        <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-text-dim flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles size={11} className="text-accent-bright" />
            <span>
              Signals are illustrative on this public page &middot; inside the
              workspace, every signal is a real event with a cited source.
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <Layers size={11} />
              <span>12 sources active</span>
            </span>
            <span className="text-text-dim">&middot;</span>
            <span className="flex items-center gap-1.5">
              <Zap size={11} />
              <span>&lt; 60s end-to-end</span>
            </span>
          </div>
        </div>

      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. SignalSourceAtlas — twelve sources Bell ingests from
// ───────────────────────────────────────────────────────────────────────────

type AtlasSource = {
  name:      string;
  kind:      string;
  icon:      React.ComponentType<{ size?: number | string }>;
  tint:      string;
  count:     string;
  coverage:  string;
};

const ATLAS_SOURCES: AtlasSource[] = [
  { name: 'MoCI',              kind: 'Commercial registry',         icon: Scroll,        tint: 'rgb(91 140 255)',  count: '1,240', coverage: 'Every registered company' },
  { name: 'QFC',               kind: 'Financial-services authority',icon: BadgeCheck,    tint: 'rgb(255 159 180)', count: '187',   coverage: '100% of QFC-licensed entities' },
  { name: 'QCB',               kind: 'Central bank',                icon: Building,      tint: 'rgb(165 195 255)', count: '64',    coverage: 'Banking + payments sector' },
  { name: 'QFMA',              kind: 'Capital markets authority',   icon: ShieldCheck,   tint: 'rgb(196 154 255)', count: '92',    coverage: 'All listed issuers' },
  { name: 'MoPH',              kind: 'Public-health regulator',     icon: ShieldCheck,   tint: 'rgb(111 207 151)', count: '143',   coverage: 'Healthcare providers + suppliers' },
  { name: 'MoFA',              kind: 'Foreign affairs ministry',    icon: Globe,         tint: 'rgb(255 196 99)',  count: '38',    coverage: 'Cross-border deals + treaties' },
  { name: 'Press archive',     kind: 'Local + regional media',      icon: Newspaper,     tint: 'rgb(255 196 99)',  count: '892',   coverage: 'Gulf Times, Peninsula, Tribune, Al-Sharq' },
  { name: 'LinkedIn',          kind: 'Leadership graph',            icon: Linkedin,      tint: 'rgb(91 140 255)',  count: '417',   coverage: 'Qatari professionals + Qatari-based companies' },
  { name: 'Industry reports',  kind: 'Sector trackers',             icon: TrendingUp,    tint: 'rgb(111 207 151)', count: '46',    coverage: 'Updated weekly, all sectors' },
  { name: 'Tender portals',    kind: 'Procurement systems',         icon: FileText,      tint: 'rgb(196 154 255)', count: '128',   coverage: 'Government + parastatal' },
  { name: 'Court records',     kind: 'Tribunals + judgments',       icon: Gavel,         tint: 'rgb(232 142 168)', count: '34',    coverage: 'Commercial disputes + filings' },
  { name: 'Academic & policy', kind: 'Think-tanks + journals',      icon: GraduationCap, tint: 'rgb(165 195 255)', count: '21',    coverage: 'Education City + regional policy' },
];

function SignalSourceAtlas() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Where the signals come from
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Twelve sources. One stream. Cited end to end.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Bell ingests from every authority and every channel that
            produces public-record signals about Qatari companies.
            Every entry on the feed traces back to the source that
            published it &mdash; clickable, time-stamped, immutable.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {ATLAS_SOURCES.map((s, i) => (
            <SourceCard key={s.name} source={s} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function SourceCard({ source: s, index }: { source: AtlasSource; index: number }) {
  const Icon = s.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.04 }}
      className="rounded-xl border border-border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
      }}
    >
      <div className="p-4 flex-1">
        <div className="flex items-start justify-between gap-3 mb-3">
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
            style={{
              background: s.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
              color:      s.tint,
            }}
          >
            <Icon size={15} />
          </span>
          <div className="text-right shrink-0">
            <div className="text-[18px] font-semibold text-text tabular-nums leading-none">
              {s.count}
            </div>
            <div className="text-[9.5px] uppercase tracking-wider text-text-dim font-mono mt-0.5">
              last 24h
            </div>
          </div>
        </div>

        <div className="text-[14px] font-semibold text-text leading-tight">
          {s.name}
        </div>
        <div
          className="text-[11px] font-mono uppercase tracking-wider mt-0.5"
          style={{ color: s.tint }}
        >
          {s.kind}
        </div>

        <div className="mt-3 pt-3 border-t border-border/70 text-[11.5px] text-text-muted leading-snug">
          {s.coverage}
        </div>
      </div>

      {/* Tiny "freshness" indicator strip */}
      <div
        className="h-1 w-full"
        style={{
          background:
            'linear-gradient(to right, ' +
            s.tint.replace('rgb', 'rgba').replace(')', ' / 0.5)') +
            ' 0%, ' +
            s.tint.replace('rgb', 'rgba').replace(')', ' / 0.08)') +
            ' 100%)',
        }}
      />
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. HowSignalsGetRouted — 4-step horizontal flow
// ───────────────────────────────────────────────────────────────────────────

type RouteStep = {
  num:    string;
  icon:   React.ComponentType<{ size?: number | string }>;
  tint:   string;
  label:  string;
  body:   string;
  detail: string;
};

const ROUTE_STEPS: RouteStep[] = [
  {
    num:    '01',
    icon:   Radar,
    tint:   'rgb(91 140 255)',
    label:  'Signal lands',
    body:   "QFC publishes a new fintech licence for Tayyar Fintech.",
    detail: 'Ingested from the QFC public register within seconds.',
  },
  {
    num:    '02',
    icon:   Bot,
    tint:   'rgb(196 154 255)',
    label:  'Bella reads & tags',
    body:   "Classified as: licence event, fintech, growth-stage.",
    detail: 'Tags carry through to every downstream subscription match.',
  },
  {
    num:    '03',
    icon:   GitBranch,
    tint:   'rgb(255 196 99)',
    label:  'Subscriptions match',
    body:   "Subscription &lsquo;New QFC fintech licences&rsquo; matches.",
    detail: 'Routes to Maryam (BD) and Hessa (Marketing) simultaneously.',
  },
  {
    num:    '04',
    icon:   Zap,
    tint:   'rgb(111 207 151)',
    label:  'Action triggered',
    body:   "Bella drafts an intro email + adds to BD watchlist.",
    detail: 'Maryam reviews and sends in one click. Logged to the record.',
  },
];

function HowSignalsGetRouted() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            How signals get routed
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Land. Tag. Route. Act.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Four steps, under a minute. The QFC publishes a new licence
            and by the time anyone refreshes their inbox, the right
            person already has a draft email ready to send.
          </p>
        </div>

        {/* Horizontal flow */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 max-w-5xl mx-auto relative">
          {ROUTE_STEPS.map((step, i) => (
            <RouteStepCard
              key={step.num}
              step={step}
              index={i}
              isLast={i === ROUTE_STEPS.length - 1}
            />
          ))}
        </div>

        {/* Footnote — example we just walked through */}
        <div className="mt-6 max-w-3xl mx-auto text-center text-[12px] text-text-dim leading-relaxed">
          One real example, walked end to end &mdash; from QFC&apos;s
          public register to a draft email in Maryam&apos;s outbox.
          Multiply by 4,127 signals a day.
        </div>

      </div>
    </section>
  );
}

function RouteStepCard({
  step, index, isLast,
}: { step: RouteStep; index: number; isLast: boolean }) {
  const Icon = step.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="relative rounded-xl border border-border p-5 flex flex-col gap-3"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        borderTop: '2px solid ' + step.tint,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg"
          style={{
            background: step.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      step.tint,
          }}
        >
          <Icon size={16} />
        </span>
        <span
          className="text-[10px] font-mono font-semibold uppercase tracking-wider"
          style={{ color: step.tint }}
        >
          {step.num}
        </span>
      </div>

      <div>
        <div className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: step.tint }}>
          {step.label}
        </div>
        <p
          className="mt-1.5 text-[13px] text-text leading-snug"
          dangerouslySetInnerHTML={{ __html: step.body }}
        />
      </div>

      <div className="mt-auto pt-3 border-t border-border/70 text-[11px] text-text-dim leading-snug">
        {step.detail}
      </div>

      {/* Arrow connector (visible on md+ between cards) */}
      {!isLast && (
        <span
          aria-hidden="true"
          className="hidden md:flex absolute top-1/2 -right-3 -translate-y-1/2 items-center justify-center w-6 h-6 rounded-full z-10"
          style={{
            background:  'rgb(13 18 35)',
            border:      '1px solid rgba(165,195,255,0.30)',
          }}
        >
          <MoveRight size={11} className="text-text-dim" />
        </span>
      )}
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. SubscriptionsAndDelivery — capability grid
// ───────────────────────────────────────────────────────────────────────────

type SubCapability = {
  icon:   React.ComponentType<{ size?: number | string }>;
  label:  string;
  body:   string;
  detail: string;
  tint:   string;
};

const SUB_CAPABILITIES: SubCapability[] = [
  {
    icon:   Filter,
    label:  'Subscribe to anything',
    body:   "Account, sector, kind, location, regulator, decision-unit, or any combination.",
    detail: "e.g. &lsquo;Any healthcare leadership change inside the Khaleej watchlist&rsquo;",
    tint:   'rgb(91 140 255)',
  },
  {
    icon:   GitBranch,
    label:  'Route automatically',
    body:   "Push matching signals to the right person, lead, or whole team &mdash; no manual triage.",
    detail: "Rules are owner-set; Bella suggests new routes as patterns emerge.",
    tint:   'rgb(196 154 255)',
  },
  {
    icon:   BellRing,
    label:  'Deliver anywhere',
    body:   "In-app feed, email digest, Slack, Bella nudge &mdash; choose per subscription.",
    detail: "Critical signals override the channel preference if the visit is unread.",
    tint:   'rgb(255 196 99)',
  },
  {
    icon:   Clock,
    label:  'Set the priority',
    body:   "Tier signals critical / standard / quiet, with quiet-hours respected per member.",
    detail: "Critical signals page through to mobile; quiet ones wait for the morning digest.",
    tint:   'rgb(111 207 151)',
  },
  {
    icon:   Zap,
    label:  'Auto-act on landing',
    body:   "Bella can draft, log, route, or queue follow-up the moment the signal lands.",
    detail: "Subject to per-team approval mode &mdash; full autonomy, single-click, or queued.",
    tint:   'rgb(165 195 255)',
  },
  {
    icon:   ShieldCheck,
    label:  'Audited end to end',
    body:   "Every signal cited to source. Every match, every route, every action logged.",
    detail: "Replay any subscription window to see exactly what fired and why.",
    tint:   'rgb(232 142 168)',
  },
];

function SubscriptionsAndDelivery() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Subscriptions &amp; delivery
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Subscribe. Route. Deliver. Act.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The signal stream is plumbing; subscriptions are how each
            workspace makes it useful. Filter once, route forever,
            deliver where the team already is, and let Bella act
            without a click when the rule says so.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SUB_CAPABILITIES.map((c, i) => (
            <SubCapabilityCard key={c.label} cap={c} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function SubCapabilityCard({ cap, index }: { cap: SubCapability; index: number }) {
  const Icon = cap.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="rounded-xl border border-border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
      }}
    >
      <div className="p-5 flex-1 flex flex-col gap-3">
        <span
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg"
          style={{
            background: cap.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      cap.tint,
          }}
        >
          <Icon size={16} />
        </span>
        <div>
          <div className="text-[15px] font-semibold text-text leading-snug">
            {cap.label}
          </div>
          <p className="mt-1 text-[12.5px] text-text-muted leading-relaxed">
            {cap.body}
          </p>
        </div>
      </div>
      <div
        className="px-5 py-3 border-t border-border text-[11.5px] text-text-dim leading-snug italic"
        style={{ background: 'rgba(255,255,255,0.015)' }}
        dangerouslySetInnerHTML={{ __html: cap.detail }}
      />
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. ConnectedToPlatform — what Signals plugs into
// ───────────────────────────────────────────────────────────────────────────

type PlatformLink = {
  icon:  React.ComponentType<{ size?: number | string }>;
  label: string;
  href:  string;
  body:  string;
  tint:  string;
};

const CONNECTED_TILES: PlatformLink[] = [
  {
    icon:  Bot,
    label: 'Bella',
    href:  '/platform/bella',
    body:  "The router and the actor. Bella tags every signal as it lands, matches it to subscriptions, and acts on landing &mdash; drafting, logging, routing &mdash; without a human in the loop.",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  Inbox,
    label: 'CRM',
    href:  '/platform/crm',
    body:  "Every signal attaches to the right account record automatically. Open the record and the latest signals are already on it, cited, with the source one click away.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Users,
    label: 'Team',
    href:  '/platform/team',
    body:  "Subscriptions are scoped per team and per member. The Sales lead sees the signals that matter to Sales; BD sees what matters to BD; the owner sees everything.",
    tint:  'rgb(165 195 255)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  "Every signal has a location. They render as live pulses on the Doha map &mdash; the visual readout of the same stream the feed shows row-by-row.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "Forecasts read the signal stream. Hot sectors and emerging targets are surfaced from the patterns Signals captures &mdash; not from a static model.",
    tint:  'rgb(111 207 151)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What Signals feeds
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Every other surface drinks from this stream.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Signals is the foundational primitive. Bella tags. CRM
            attaches. Team scopes. Map pulses. Prediction forecasts.
            Five platform surfaces, one source.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CONNECTED_TILES.map((tile, i) => (
            <ConnectedTile key={tile.href} tile={tile} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ConnectedTile({ tile, index }: { tile: PlatformLink; index: number }) {
  const Icon = tile.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
    >
      <Link
        href={tile.href}
        className="group block h-full rounded-xl border border-border overflow-hidden hover:border-text-dim/50 transition-colors"
        style={{
          background:
            'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        }}
      >
        <div className="p-5 h-full flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg"
              style={{
                background: tile.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
                color:      tile.tint,
              }}
            >
              <Icon size={18} />
            </span>
            <ArrowRight
              size={14}
              className="text-text-dim opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
            />
          </div>
          <h3 className="text-base font-semibold text-text leading-tight mb-1.5">
            {tile.label}
          </h3>
          <p
            className="text-[13px] text-text-muted leading-relaxed flex-1"
            dangerouslySetInnerHTML={{ __html: tile.body }}
          />
          <div className="mt-4 pt-3 border-t border-border/70 text-[11.5px] font-semibold text-accent-bright group-hover:text-text transition-colors inline-flex items-center gap-1.5">
            Explore {tile.label}
            <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. MidPageCta — Get Access band
// ───────────────────────────────────────────────────────────────────────────

function MidPageCta() {
  return (
    <section className="relative py-16">
      <div className="max-w-screen-xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="rounded-2xl border border-border overflow-hidden relative p-8 md:p-10"
          style={{
            background:
              'linear-gradient(135deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
          }}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(91,140,255,0.18) 0%, transparent 60%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                You&apos;ve seen the stream
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now put your team on it.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your first subscription fires the same day.
              </div>
            </div>
            <div className="shrink-0 flex flex-col sm:flex-row gap-3">
              <Link
                href="/get-access"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-accent text-white text-sm font-medium hover:brightness-110 transition shadow-lg shadow-accent/30 whitespace-nowrap"
              >
                Get Access
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center px-6 py-3 text-sm font-medium rounded-md border border-border text-text-muted hover:text-text whitespace-nowrap"
              >
                See pricing
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 9. OtherFunctions — cross-links to the five function pages
// ───────────────────────────────────────────────────────────────────────────

type OtherFunctionCard = {
  icon:    React.ComponentType<{ size?: number | string }>;
  team:    string;
  href:    string;
  tagline: string;
  capabilities: string[];
};

const OTHER_FUNCTIONS: OtherFunctionCard[] = [
  {
    icon:    Target,
    team:    'Sales',
    href:    '/platform/sales',
    tagline: "Turns the Bell.qa graph into pipeline, run by a single rep.",
    capabilities: [
      "Coverage of every Qatari account, not the 200 a rep can hold in their head",
      "Bella drafts, sends, follows up, logs to CRM",
      "Field-level intel before the meeting starts",
    ],
  },
  {
    icon:    Megaphone,
    team:    'Marketing',
    href:    '/platform/marketing',
    tagline: "Reaches the right Qatari accounts at the right moment.",
    capabilities: [
      "Audience lists that update themselves as the market shifts",
      "Campaigns triggered off real-world signals",
      "Attribution back to the signal that surfaced the account",
    ],
  },
  {
    icon:    Handshake,
    team:    'Business Development',
    href:    '/platform/business-development',
    tagline: "Surfaces partnerships and M&A targets before the market does.",
    capabilities: [
      "Maps ownership chains, board overlaps, corporate relationships",
      "Tracks strategic moves &mdash; acquisitions, licences, expansion",
      "Watchlists that surface change automatically",
    ],
  },
  {
    icon:    Microscope,
    team:    'Research',
    href:    '/platform/research',
    tagline: "Hands analysts the report they would have spent days writing.",
    capabilities: [
      "Deep-researches any company, sector, theme, or region",
      "Every public signal pulled with full citation trail",
      "Structured reports delivered in about fifteen minutes",
    ],
  },
  {
    icon:    Rocket,
    team:    'GTM',
    href:    '/platform/gtm',
    tagline: "Plans and runs go-to-market motions across the Qatari market.",
    capabilities: [
      "Sector x channel matrix mapped, priority cells highlighted",
      "Partner shortlists drawn, regulatory path tracked",
      "Same playbook for foreign-in, Qatari-out, and product launch",
    ],
  },
];

function OtherFunctions() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Five functions act on the same signals
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Each one has its own page on what they do with them.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The signal stream is the bloodstream. Each function team
            taps it differently &mdash; Sales prioritizes, Marketing
            triggers, BD watches, Research subscribes, GTM forecasts
            with it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {OTHER_FUNCTIONS.map((f, i) => (
            <OtherFunctionTile key={f.team} fn={f} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function OtherFunctionTile({ fn, index }: { fn: OtherFunctionCard; index: number }) {
  const Icon = fn.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay: index * 0.05 }}
    >
      <Link
        href={fn.href}
        className="group block h-full rounded-xl border border-border overflow-hidden hover:border-accent/40 transition-colors"
        style={{
          background:
            'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        }}
      >
        <div className="p-5 flex flex-col h-full">
          <div className="flex items-center justify-between mb-4">
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-accent-bright"
              style={{ background: 'rgba(91,140,255,0.14)' }}
            >
              <Icon size={18} />
            </span>
            <ArrowRight
              size={14}
              className="text-text-dim opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
            />
          </div>
          <h3 className="text-base font-semibold text-text leading-tight">{fn.team}</h3>
          <p className="mt-2 text-[12.5px] text-accent-bright/90 leading-snug">{fn.tagline}</p>
          <ul className="mt-3 space-y-1.5 border-t border-border pt-3 flex-1">
            {fn.capabilities.map((cap, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[11.5px] text-text-muted leading-relaxed"
              >
                <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-accent" aria-hidden="true" />
                <span dangerouslySetInnerHTML={{ __html: cap }} />
              </li>
            ))}
          </ul>
          <div className="mt-3 pt-3 border-t border-border/70 text-[11px] font-semibold text-accent-bright group-hover:text-text transition-colors inline-flex items-center gap-1.5">
            Explore {fn.team}
            <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 10. ThreeReader — analyst / sales leader / exec
// ───────────────────────────────────────────────────────────────────────────

const SIGNAL_READERS = [
  {
    icon:  BellRing,
    label: 'For the analyst / IC',
    body:  "You stop checking. The signals you care about land in your queue, tagged, sourced, with Bella&apos;s recommendation attached. You spend the hour on the call, not the scan.",
  },
  {
    icon:  BarChart3,
    label: 'For the sales / ops leader',
    body:  "Your team is the first to know. Every market move gets to the right person within a minute &mdash; not when someone notices it in tomorrow&apos;s news roundup.",
  },
  {
    icon:  Crown,
    label: 'For the executive',
    body:  "The country&apos;s heartbeat, on one stream, auditable. You see what your competitors will read about next week. Decisions move from reactive to anticipatory.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same stream
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes when signals are live.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {SIGNAL_READERS.map((r, i) => {
            const Icon = r.icon;
            return (
              <motion.div
                key={r.label}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="rounded-xl border border-border p-6"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
                }}
              >
                <span
                  className="inline-flex items-center justify-center w-10 h-10 rounded-lg text-accent-bright mb-4"
                  style={{ background: 'rgba(91,140,255,0.14)' }}
                >
                  <Icon size={17} />
                </span>
                <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                  {r.label}
                </div>
                <p
                  className="text-[14px] text-text leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: r.body }}
                />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 11. FinalCta — closing Get Access block
// ───────────────────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section className="relative py-28">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(91,140,255,0.16) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          Hear the market before anyone else does.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Twelve sources. One live stream. Every filing, every licence,
          every leadership change, every tender, every expansion &mdash;
          on the right inbox within a minute. Cited end to end.
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
            href="/pricing"
            className="inline-flex items-center px-6 py-3 text-base font-medium rounded-md text-text-muted hover:text-text"
          >
            See pricing →
          </Link>
        </div>
      </div>
    </section>
  );
}

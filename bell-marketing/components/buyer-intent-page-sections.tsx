'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Crosshair, ArrowRight, Building2, User, BadgeCheck,
  Cpu, Newspaper, Radar, TrendingUp, Briefcase,
  ShieldCheck, Linkedin, Sparkles, Flame, ArrowUpRight,
  Send, Crown, MessageSquare, Filter, BellRing, Bot,
  Inbox, Map as MapIcon, LayoutDashboard, ListChecks,
  Settings, Check, ChevronDown, Plus,
  Users, Target, Megaphone, Handshake, Microscope,
  Rocket, BrainCircuit, BarChart3, Eye,
} from 'lucide-react';

/**
 * BUYER INTENT PAGE — capability deep-dive.
 *
 * Reframed on Val's clarification: Buyer Intent is not a leaderboard.
 * It's a layer that lights up records (companies AND people) the
 * moment Bell recognizes intent — personalized per user, decomposable
 * to its contributing factors, and surfaced across CRM filters, list
 * views, alerts, and Bella nudges.
 *
 * Centerpiece: a grid of 6 records — 3 companies + 3 people — each
 * shown with an "Intent: HIGH / RISING / MEDIUM" badge and 4-5
 * decomposed contributing factors (tech stack, news, hiring, regulatory,
 * public activity, board moves).
 *
 * Tone: operational hero, strategic depth in later sections.
 * Anchor: country-scale (every Qatari company + person has a score).
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. BuyerIntentHero       — "Know who's buying. Before they tell you."
 *     2. BuyerIntentActivityBar
 *     3. TheIntentSpotlight    — CENTERPIECE — 6 records lit with intent
 *
 *   ROUND 2+ (to be added):
 *     4. WhatFeedsIntent       — 8 input types Bell reads
 *     5. PersonalizedIntent    — user-defined intent rules
 *     6. WhereIntentSurfaces   — where intent shows up across platform
 *     7. ConnectedToPlatform
 *     8. MidPageCta
 *     9. OtherFunctions
 *    10. ThreeReader           — rep / sales leader / exec
 *    11. FinalCta
 */

export function BuyerIntentPageSections() {
  return (
    <>
      <BuyerIntentHero />
      <BuyerIntentActivityBar />
      <TheIntentSpotlight />
      <WhatFeedsIntent />
      <PersonalizedIntent />
      <WhereIntentSurfaces />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. BuyerIntentHero — operational opening
// ───────────────────────────────────────────────────────────────────────────

function BuyerIntentHero() {
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
            <Crosshair size={12} className="text-accent-bright" />
            <span>Intelligence &middot; Buyer Intent</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">Know who&apos;s buying.</span>
            <br />
            <span className="text-text">Before they tell you.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Bell watches every Qatari company and every Qatari decision-maker
            for buying signals &mdash; tech-stack changes, hiring moves,
            news, regulatory activity, public conversations &mdash; and
            marks the records you should reach out to.
          </p>
          <p className="mt-4 text-[13.5px] text-text-dim leading-relaxed max-w-2xl">
            Personalized per user. Visible on company and person records.
            Decomposable to the signals that caused it. Surfaced in
            filters, lists, alerts, and Bella nudges.
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
// 2. BuyerIntentActivityBar — cycling live counters
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Records marked today', value: '218',  sub: 'companies + people, country-wide' },
  { label: 'High-intent now',      value: '47',   sub: 'across the Qatari market'         },
  { label: 'Rising intent',        value: '109',  sub: 'moving up this week'              },
  { label: 'Average lead time',    value: '8 days', sub: 'intent recognized → first move' },
  { label: 'Personal intent rules', value: '6,420', sub: 'across all users'              },
];

function BuyerIntentActivityBar() {
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
              Live intent recognition &middot; whole Qatari market
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
// 3. TheIntentSpotlight — CENTERPIECE
//    6 records (3 companies + 3 people) currently marked with intent,
//    each decomposed with its contributing factors.
// ───────────────────────────────────────────────────────────────────────────

type IntentTier = 'high' | 'rising' | 'medium';

type RecordKind = 'company' | 'person';

type ContribKind =
  | 'tech-stack' | 'hiring' | 'news' | 'regulatory'
  | 'activity' | 'board' | 'funding' | 'rfp';

type Contribution = {
  kind:  ContribKind;
  body:  string;
};

type IntentRecord = {
  kind:        RecordKind;
  initials:    string;
  name:        string;
  subtitle:    string;
  gradient:    string;
  tier:        IntentTier;
  contributions: Contribution[];
};

const TIER_META: Record<IntentTier, { label: string; color: string; bg: string; border: string }> = {
  high: {
    label: 'High intent',
    color: 'rgb(255 159 180)',
    bg:    'rgba(255,159,180,0.12)',
    border:'rgba(255,159,180,0.32)',
  },
  rising: {
    label: 'Rising intent',
    color: 'rgb(111 207 151)',
    bg:    'rgba(111,207,151,0.12)',
    border:'rgba(111,207,151,0.32)',
  },
  medium: {
    label: 'Medium intent',
    color: 'rgb(165 195 255)',
    bg:    'rgba(165,195,255,0.10)',
    border:'rgba(165,195,255,0.30)',
  },
};

const CONTRIB_META: Record<ContribKind, { label: string; icon: React.ComponentType<{ size?: number | string }> }> = {
  'tech-stack': { label: 'Tech stack',  icon: Cpu        },
  hiring:       { label: 'Hiring',      icon: User       },
  news:         { label: 'News',        icon: Newspaper  },
  regulatory:   { label: 'Regulatory',  icon: ShieldCheck},
  activity:     { label: 'Activity',    icon: Linkedin   },
  board:        { label: 'Board move',  icon: Briefcase  },
  funding:      { label: 'Funding',     icon: TrendingUp },
  rfp:          { label: 'RFP / tender',icon: Radar      },
};

const SPOTLIGHT: IntentRecord[] = [
  // --- Companies ---
  {
    kind:     'company',
    initials: 'DHN',
    name:     'Doha Health Network',
    subtitle: 'Healthcare &middot; private clinic operator',
    gradient: 'linear-gradient(135deg, rgb(91 140 255) 0%, rgb(165 195 255) 100%)',
    tier:     'high',
    contributions: [
      { kind: 'rfp',        body: 'New ERP tender posted &mdash; matches your healthcare ICP' },
      { kind: 'hiring',     body: 'New CFO (ex-QNB) appointed 14 months ago' },
      { kind: 'tech-stack', body: 'Migrating from legacy on-prem to cloud financials' },
      { kind: 'news',       body: 'Capacity-expansion announcement, West Bay' },
    ],
  },
  {
    kind:     'company',
    initials: 'TF',
    name:     'Tayyar Fintech',
    subtitle: 'Doha payments infrastructure',
    gradient: 'linear-gradient(135deg, rgb(111 207 151) 0%, rgb(165 195 255) 100%)',
    tier:     'rising',
    contributions: [
      { kind: 'regulatory', body: 'QFC licence issued 6 days ago' },
      { kind: 'hiring',     body: 'Engineering team grew 38% this quarter' },
      { kind: 'funding',    body: 'Seed round closed at QAR 9M' },
      { kind: 'activity',   body: 'CEO actively posting about tech-stack decisions' },
    ],
  },
  {
    kind:     'company',
    initials: 'QT',
    name:     'QTerminals',
    subtitle: 'Logistics &middot; port operator',
    gradient: 'linear-gradient(135deg, rgb(255 196 99) 0%, rgb(232 142 168) 100%)',
    tier:     'medium',
    contributions: [
      { kind: 'tech-stack', body: 'Evaluating TMS upgrade &mdash; vendor signals on LinkedIn' },
      { kind: 'news',       body: 'Capacity expansion announcement' },
      { kind: 'hiring',     body: 'Hiring Head of Digital Operations' },
    ],
  },

  // --- People ---
  {
    kind:     'person',
    initials: 'AS',
    name:     'Dr. Aisha Al-Sulaiti',
    subtitle: 'Founder &amp; CEO &middot; Doha Health Network',
    gradient: 'linear-gradient(135deg, rgb(255 159 180) 0%, rgb(196 154 255) 100%)',
    tier:     'high',
    contributions: [
      { kind: 'activity', body: 'Spoke at GCC Healthcare Summit on consolidation, last week' },
      { kind: 'board',    body: 'Re-appointed to two industry boards this quarter' },
      { kind: 'news',     body: 'Quoted on the future of private healthcare in Qatar' },
      { kind: 'hiring',   body: 'Brought in Yousef Al-Mannai as new CFO' },
    ],
  },
  {
    kind:     'person',
    initials: 'YM',
    name:     'Yousef Al-Mannai',
    subtitle: 'CFO &middot; Doha Health Network (ex-QNB)',
    gradient: 'linear-gradient(135deg, rgb(91 140 255) 0%, rgb(111 207 151) 100%)',
    tier:     'rising',
    contributions: [
      { kind: 'hiring',   body: 'New role &mdash; CFO since 14 months ago' },
      { kind: 'activity', body: 'Attended FinOps Summit, Doha, 3 weeks ago' },
      { kind: 'activity', body: 'Public posts on ERP modernization' },
      { kind: 'news',     body: 'Featured in a Gulf Times piece on private-sector CFOs' },
    ],
  },
  {
    kind:     'person',
    initials: 'SK',
    name:     'Saif Al-Khater',
    subtitle: 'Board, non-exec &middot; Doha Health Network',
    gradient: 'linear-gradient(135deg, rgb(196 154 255) 0%, rgb(165 195 255) 100%)',
    tier:     'medium',
    contributions: [
      { kind: 'board',    body: 'Sits on three Qatari boards in healthcare adjacencies' },
      { kind: 'activity', body: 'Recent LinkedIn engagement with vendor content' },
      { kind: 'funding',  body: 'Co-invested with Marsa Capital in 2022 deal' },
    ],
  },
];

function TheIntentSpotlight() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What intent looks like on the records
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Six records, marked right now.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Companies and the people who run them. Each one carries an
            intent badge today, and Bell breaks down exactly which
            signals lit it up. These are illustrative on the public
            page &mdash; inside the workspace, the badges are live and
            personalized to your team&apos;s ICP.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SPOTLIGHT.map((rec, i) => (
            <IntentRecordCard key={rec.name} record={rec} index={i} />
          ))}
        </div>

        {/* Legend strip */}
        <div className="mt-6 flex items-center justify-center gap-4 text-[11px] text-text-dim flex-wrap">
          <TierLegend tier="high" />
          <TierLegend tier="rising" />
          <TierLegend tier="medium" />
        </div>

      </div>
    </section>
  );
}

function TierLegend({ tier }: { tier: IntentTier }) {
  const meta = TIER_META[tier];
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: meta.color, boxShadow: '0 0 6px ' + meta.color }}
      />
      <span className="text-text">{meta.label}</span>
    </span>
  );
}

function IntentRecordCard({ record, index }: { record: IntentRecord; index: number }) {
  const meta = TIER_META[record.tier];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        borderColor: meta.border,
        boxShadow:   '0 12px 36px -16px ' + meta.color.replace('rgb', 'rgba').replace(')', ' / 0.32)'),
      }}
    >
      {/* Header — record identity + intent badge */}
      <div
        className="px-4 py-4 border-b flex items-start gap-3"
        style={{ borderColor: meta.border, background: meta.bg }}
      >
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center text-[13px] font-semibold text-text shrink-0"
          style={{ background: record.gradient, boxShadow: '0 8px 20px -6px rgba(91,140,255,0.40)' }}
        >
          {record.initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span
              className="text-[9.5px] font-mono uppercase tracking-wider"
              style={{ color: meta.color }}
            >
              {record.kind === 'company' ? 'Company' : 'Person'}
            </span>
          </div>
          <div className="text-[14px] font-semibold text-text leading-tight">
            {record.name}
          </div>
          <div
            className="text-[11px] text-text-dim leading-tight mt-0.5"
            dangerouslySetInnerHTML={{ __html: record.subtitle }}
          />
        </div>

        {/* Intent badge */}
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap shrink-0"
          style={{
            color:       meta.color,
            background:  'rgba(13,18,35,0.85)',
            borderColor: meta.border,
          }}
        >
          {record.tier === 'high' && <Flame size={9} />}
          {record.tier === 'rising' && <ArrowUpRight size={9} />}
          {record.tier === 'medium' && <Sparkles size={9} />}
          {meta.label}
        </span>
      </div>

      {/* Body — decomposed contributions */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-dim">
          <BadgeCheck size={10} className="text-accent-bright" />
          <span>Why Bell marked this</span>
        </div>
        <ul className="space-y-2">
          {record.contributions.map((c, i) => {
            const m = CONTRIB_META[c.kind];
            const CIcon = m.icon;
            return (
              <li key={i} className="flex items-start gap-2.5">
                <span
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0 mt-0.5"
                  style={{ background: 'rgba(165,195,255,0.10)', color: 'rgb(165 195 255)' }}
                >
                  <CIcon size={11} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim leading-tight mb-0.5">
                    {m.label}
                  </div>
                  <div
                    className="text-[12px] text-text leading-snug"
                    dangerouslySetInnerHTML={{ __html: c.body }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footer — reach-out CTA */}
      <div
        className="px-4 py-3 border-t flex items-center justify-between"
        style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.015)' }}
      >
        <span className="text-[10.5px] text-text-dim font-mono">
          Bella can draft the opener
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold"
          style={{ color: meta.color }}
        >
          Reach out
          <Send size={11} />
        </span>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. WhatFeedsIntent — 8 input types Bell consumes to recognize intent
// ───────────────────────────────────────────────────────────────────────────

type IntentInput = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  body:    string;
  example: string;
  tint:    string;
};

const INTENT_INPUTS: IntentInput[] = [
  {
    icon:    Cpu,
    label:   'Tech-stack changes',
    body:    'What software a company runs, what they are migrating from or to, vendor mentions in job posts.',
    example: 'Healthcare provider posts a job requiring SAP S/4HANA experience &mdash; they are leaving the legacy stack.',
    tint:    'rgb(91 140 255)',
  },
  {
    icon:    User,
    label:   'Hiring patterns',
    body:    'Net new roles, role-type composition, hiring velocity, sudden growth in a function.',
    example: 'Fintech opens 14 engineering roles in 30 days &mdash; preparing a platform launch.',
    tint:    'rgb(111 207 151)',
  },
  {
    icon:    Crown,
    label:   'Leadership moves',
    body:    'CEO, CFO, CRO, CTO appointments and departures &mdash; the strongest single intent signal.',
    example: 'New CFO from QNB joins a private healthcare network &mdash; an ERP review usually follows.',
    tint:    'rgb(255 196 99)',
  },
  {
    icon:    Linkedin,
    label:   'Public conversations',
    body:    'Decision-makers posting, commenting, speaking at events, engaging with vendor content.',
    example: 'CIO of a logistics co. attends a TMS roundtable &mdash; vendor sourcing is open.',
    tint:    'rgb(196 154 255)',
  },
  {
    icon:    Newspaper,
    label:   'News &amp; press',
    body:    'Coverage of the company, the sector, the person &mdash; in Qatari press and regional media.',
    example: 'Gulf Times article: &ldquo;Qatari banks accelerate digital-banking sandbox participation.&rdquo;',
    tint:    'rgb(165 195 255)',
  },
  {
    icon:    ShieldCheck,
    label:   'Regulatory activity',
    body:    'New licences, filings, ministerial decisions, regulator-published guidance.',
    example: 'QFC issues a new payments-infrastructure licence &mdash; the company is scaling.',
    tint:    'rgb(232 142 168)',
  },
  {
    icon:    TrendingUp,
    label:   'Funding &amp; financial events',
    body:    'Funding rounds, M&amp;A, ESOP, capital raises, balance-sheet events.',
    example: 'Logistics startup closes a Series B &mdash; budget for new systems is now live.',
    tint:    'rgb(111 207 151)',
  },
  {
    icon:    Radar,
    label:   'RFP &amp; tender activity',
    body:    'Open tenders, vendor-sourcing posts, procurement signals, evaluation announcements.',
    example: 'Ministry tender posted for cybersecurity stack &mdash; intent is explicit.',
    tint:    'rgb(255 196 99)',
  },
];

function WhatFeedsIntent() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What feeds intent
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Eight inputs. One intent layer.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Intent doesn&apos;t come from a single signal. Bell weighs
            eight kinds of evidence in parallel, on every Qatari
            company and every named decision-maker, then surfaces the
            records that cross your threshold.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {INTENT_INPUTS.map((input, i) => (
            <InputCard key={input.label} input={input} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function InputCard({ input, index }: { input: IntentInput; index: number }) {
  const Icon = input.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay: index * 0.04 }}
      className="rounded-xl border border-border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
      }}
    >
      <div className="p-4 flex-1 flex flex-col gap-3">
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg"
          style={{
            background: input.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      input.tint,
          }}
        >
          <Icon size={15} />
        </span>
        <div>
          <h3
            className="text-[13.5px] font-semibold text-text leading-snug"
            dangerouslySetInnerHTML={{ __html: input.label }}
          />
          <p
            className="mt-1 text-[12px] text-text-muted leading-relaxed"
            dangerouslySetInnerHTML={{ __html: input.body }}
          />
        </div>
      </div>
      <div
        className="px-4 py-3 border-t border-border/70 text-[11px] text-text-dim italic leading-snug"
        style={{ background: 'rgba(255,255,255,0.015)' }}
        dangerouslySetInnerHTML={{ __html: input.example }}
      />
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. PersonalizedIntent — user-defined intent rules
//    Sample "intent rule builder" view with three example rules.
// ───────────────────────────────────────────────────────────────────────────

type IntentRule = {
  name:       string;
  icp:        string;
  triggers:   string[];
  action:     string;
  tier:       IntentTier;
  enabled:    boolean;
  weight:     number;
};

const SAMPLE_RULES: IntentRule[] = [
  {
    name:    'Healthcare ERP buying intent',
    icp:     'Healthcare provider, 100+ employees, Qatari-licensed',
    triggers:[
      'RFP keyword "ERP" in healthcare sector',
      'OR tech-stack switch from legacy on-prem',
      'OR new CFO appointed within last 18 months',
    ],
    action:  'Mark as HIGH intent. Alert Noora (Sales) immediately.',
    tier:    'high',
    enabled: true,
    weight:  100,
  },
  {
    name:    'Fintech infrastructure expansion',
    icp:     'QFC-licensed fintech, 20-200 employees',
    triggers:[
      'Funding round closed in last 90 days',
      'AND engineering headcount grew 25%+ this quarter',
    ],
    action:  'Mark as RISING intent. Hand off to Maryam (BD) for partnership scope.',
    tier:    'rising',
    enabled: true,
    weight:  85,
  },
  {
    name:    'Logistics digital-ops modernization',
    icp:     'Logistics operator, multi-site, Qatar HQ',
    triggers:[
      'Hiring Head of Digital Operations OR CIO',
      'AND public vendor evaluation on LinkedIn',
    ],
    action:  'Mark as MEDIUM intent. Add to ABM cohort, queue for outreach.',
    tier:    'medium',
    enabled: true,
    weight:  70,
  },
];

function PersonalizedIntent() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Personalized per user
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Intent means what you say it means.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Every user defines their own intent rules &mdash; an ICP,
            the triggers that count, the tier to assign, the action to
            take. Bell evaluates every Qatari company and every
            decision-maker against every rule, every day.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="rounded-2xl border border-border overflow-hidden max-w-4xl mx-auto"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
          }}
        >
          {/* Header bar */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
            <Settings size={12} className="text-accent-bright" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text">
              My intent rules
            </span>
            <span className="text-text-dim text-[11px]">&middot;</span>
            <span className="text-[10.5px] text-text-dim">
              3 rules active &middot; evaluated on 191,000+ companies daily
            </span>
            <div className="flex-1" />
            <span
              className="inline-flex items-center gap-1 text-[10.5px] text-accent-bright font-semibold"
            >
              <Plus size={10} />
              New rule
            </span>
          </div>

          {/* Rules list */}
          <div>
            {SAMPLE_RULES.map((rule, i) => (
              <RuleRow key={rule.name} rule={rule} index={i} last={i === SAMPLE_RULES.length - 1} />
            ))}
          </div>

          {/* Footer */}
          <div
            className="px-5 py-3 border-t border-border flex items-center justify-between text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Rules edited by the owner &middot; replayed against every new signal
            </span>
            <span className="text-text-muted">
              Bella can suggest new rules when patterns emerge.
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function RuleRow({
  rule, index, last,
}: { rule: IntentRule; index: number; last: boolean }) {
  const meta = TIER_META[rule.tier];
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={
        'p-5 grid grid-cols-12 gap-4 items-start ' +
        (last ? '' : 'border-b border-border')
      }
    >
      {/* Toggle + rule name */}
      <div className="col-span-12 md:col-span-4 flex items-start gap-3 min-w-0">
        <span
          className="inline-flex items-center justify-center w-9 h-5 rounded-full shrink-0 mt-0.5"
          style={{
            background: rule.enabled ? 'rgba(111,207,151,0.30)' : 'rgba(165,195,255,0.10)',
            border:     '1px solid ' + (rule.enabled ? 'rgba(111,207,151,0.50)' : 'rgba(165,195,255,0.30)'),
          }}
          aria-hidden="true"
        >
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{
              background: rule.enabled ? 'rgb(111 207 151)' : 'rgb(165 195 255)',
              transform:  rule.enabled ? 'translateX(8px)' : 'translateX(-8px)',
              transition: 'transform 0.2s ease',
            }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-text leading-tight">
            {rule.name}
          </div>
          <div className="text-[10.5px] text-text-dim mt-0.5 font-mono">
            ICP &middot; {rule.icp}
          </div>
        </div>
      </div>

      {/* Triggers */}
      <div className="col-span-12 md:col-span-5">
        <div className="text-[9.5px] uppercase tracking-wider text-text-dim font-mono mb-1.5">
          Triggers
        </div>
        <ul className="space-y-1">
          {rule.triggers.map((t, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11.5px] text-text leading-snug">
              <Check size={10} className="text-accent-bright shrink-0 mt-1" />
              <span className="font-mono">{t}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Action + tier */}
      <div className="col-span-12 md:col-span-3 flex flex-col items-start md:items-end gap-1.5">
        <span
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap"
          style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
        >
          {meta.label}
        </span>
        <div
          className="text-[11px] text-text-muted leading-snug text-left md:text-right"
        >
          {rule.action}
        </div>
        <div className="text-[9.5px] text-text-dim font-mono">
          weight: {rule.weight}
        </div>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. WhereIntentSurfaces — where intent shows up across the platform
// ───────────────────────────────────────────────────────────────────────────

type IntentSurface = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  href:    string;
  body:    string;
  example: string;
  tint:    string;
};

const INTENT_SURFACES: IntentSurface[] = [
  {
    icon:    Inbox,
    label:   'CRM filters',
    href:    '/platform/crm',
    body:    'Filter your accounts and contacts by intent tier. The pipeline view reshuffles around what is hot.',
    example: 'Filter chip: "HIGH intent &middot; healthcare"',
    tint:    'rgb(91 140 255)',
  },
  {
    icon:    ListChecks,
    label:   'Account list view',
    href:    '/platform/crm',
    body:    'Every row in the account list carries an intent badge. Sort by intent in one click.',
    example: 'Badge: "Intent: HIGH" on Doha Health Network row',
    tint:    'rgb(196 154 255)',
  },
  {
    icon:    BellRing,
    label:   'Mobile push alerts',
    href:    '/platform/signals-and-insights',
    body:    'When an account crosses HIGH intent, your phone pages through. Quiet hours respected.',
    example: 'Notification: "Tayyar Fintech moved to HIGH intent &middot; 8 min ago"',
    tint:    'rgb(255 196 99)',
  },
  {
    icon:    Bot,
    label:   'Bella nudges',
    href:    '/platform/bella',
    body:    'Bella sees the threshold cross and proposes the next move: a draft email, a call queued, a meeting requested.',
    example: 'Bella: "Tayyar Fintech crossed HIGH. Want me to draft the opener?"',
    tint:    'rgb(232 142 168)',
  },
  {
    icon:    MapIcon,
    label:   'Map overlay',
    href:    '/platform/map',
    body:    'Render intent geographically. High-intent accounts cluster on the Doha map, tier-colored.',
    example: 'Pulses on the map tinted by intent tier',
    tint:    'rgb(111 207 151)',
  },
  {
    icon:    LayoutDashboard,
    label:   'Dashboard widget',
    href:    '/platform/team',
    body:    'A persistent tile on the team dashboard showing top-tier accounts moving today.',
    example: '"47 HIGH-intent accounts &middot; 12 moved up since yesterday"',
    tint:    'rgb(165 195 255)',
  },
];

function WhereIntentSurfaces() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Where intent surfaces
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Intent is everywhere a record is.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Buyer Intent isn&apos;t a separate dashboard. The moment
            Bell marks a record, the badge lights up on every surface
            that record appears on &mdash; the CRM, the map, the team
            dashboard, the mobile alert, the nudge from Bella.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {INTENT_SURFACES.map((s, i) => (
            <SurfaceCard key={s.label} surface={s} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function SurfaceCard({ surface, index }: { surface: IntentSurface; index: number }) {
  const Icon = surface.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
    >
      <Link
        href={surface.href}
        className="group block h-full rounded-xl border border-border overflow-hidden hover:border-text-dim/50 transition-colors flex flex-col"
        style={{
          background:
            'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        }}
      >
        <div className="p-5 flex-1 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg"
              style={{
                background: surface.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
                color:      surface.tint,
              }}
            >
              <Icon size={17} />
            </span>
            <ArrowRight
              size={13}
              className="text-text-dim opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
            />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-text leading-snug">
              {surface.label}
            </h3>
            <p className="mt-1 text-[12.5px] text-text-muted leading-relaxed">
              {surface.body}
            </p>
          </div>
        </div>
        <div
          className="px-5 py-3 border-t border-border/70 text-[11px] font-mono leading-snug italic flex items-center gap-1.5"
          style={{ background: 'rgba(255,255,255,0.015)', color: surface.tint }}
          dangerouslySetInnerHTML={{ __html: surface.example }}
        />
      </Link>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. ConnectedToPlatform — what Buyer Intent plugs into
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
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  "The raw stream Bell reads. Every signal that lands feeds the intent layer &mdash; if it matches a rule, the record gets marked the same minute.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  Inbox,
    label: 'CRM',
    href:  '/platform/crm',
    body:  "Where intent shows up. Every account and contact record carries its intent badge, decomposed in place, with one-click action.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Bot,
    label: 'Bella',
    href:  '/platform/bella',
    body:  "The acting agent. When an account crosses threshold, Bella drafts, queues, or routes the next move &mdash; subject to your approval mode.",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  Users,
    label: 'Team',
    href:  '/platform/team',
    body:  "Intent rules are personal AND team-scoped. Sales has its rules; BD has theirs; the owner sees everything that fires.",
    tint:  'rgb(165 195 255)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "The macro complement. Buyer Intent says &lsquo;this account is hot.&rsquo; Prediction says &lsquo;this sector is heating up.&rsquo; Different scales, one engine.",
    tint:  'rgb(111 207 151)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What Buyer Intent plugs into
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            One layer, woven through the platform.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Buyer Intent reads Signals, writes to CRM, triggers Bella,
            respects Team scopes, complements Prediction. Five
            connections, one layer.
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
                'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(255,159,180,0.16) 0%, transparent 60%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                You&apos;ve seen the intent layer
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now turn it on for your workspace.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your first intent rule starts evaluating the
                same day.
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
            Five functions act on the intent badge
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Each one has its own page on what they do with it.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Intent is a queue-pre-prioritizer. Sales reaches out
            first. Marketing tailors campaigns. BD scopes
            partnerships. Research deep-dives the hot accounts. GTM
            adjusts the playbook. Same badge, five workflows.
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
// 10. ThreeReader — rep / sales leader / exec
// ───────────────────────────────────────────────────────────────────────────

const INTENT_READERS = [
  {
    icon:  Send,
    label: 'For the rep',
    body:  "Your queue is pre-sorted by intent. Today&apos;s first call is the account that just crossed HIGH. No guessing, no scrolling &mdash; the records that matter are already marked.",
  },
  {
    icon:  BarChart3,
    label: 'For the sales leader',
    body:  "Pipeline reshuffles around what is hot. You see which accounts your team is sleeping on, which signals are driving today&apos;s tier crossings, and where to redirect coverage.",
  },
  {
    icon:  Crown,
    label: 'For the executive',
    body:  "The country&apos;s demand, surfaced as named accounts. You read the market from the named records buying, not from a delayed roll-up. Coverage of intent becomes a metric you can manage.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same intent layer
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes when intent is recognized.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {INTENT_READERS.map((r, i) => {
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
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(255,159,180,0.14) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          Reach out at the moment of intent.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Bell watches every Qatari company and person. The moment one
          of them shows intent the way you defined it, the record gets
          marked, the rep gets paged, and Bella drafts the opener.
          Personalized, decomposable, cited.
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

'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ShieldCheck, ArrowRight, MapPin, Lock, Eye, UserX,
  BadgeCheck, FileText, Sparkles, Server, Cog, Users,
  Landmark, Edit3, History, Download, Check, Mail,
  ChevronDown, Send, AlertCircle,
  Users as UsersIcon, Inbox, Bot, Radar, Workflow,
  Database, Activity, BarChart3, Handshake, Building2,
  Scale,
} from 'lucide-react';

/**
 * TRUST PAGE — capability deep-dive.
 *
 * The governance page in the Data section. Sovereignty-forward
 * (Qatari hosting + Bell-owned infrastructure), with depth on
 * privacy, audit, and the individual's right to see/correct/remove
 * their data.
 *
 * Centerpiece: six trust pillars (Sovereignty / Encryption /
 * Transparency / Privacy / Audit / Removal) as a 3x2 grid.
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. TrustHero          — "Built in Qatar. Yours to remove."
 *     2. TrustActivityBar   — governance counters
 *     3. TheSixTrustPillars — CENTERPIECE — 6 pillar cards
 *
 *   ROUND 2+ (to be added):
 *     4. WhereYourDataLives — sovereignty stack
 *     5. YourRightsAtBell   — 4-5 right cards
 *     6. TheRemovalForm     — embedded mockup form
 *     7. ConnectedToPlatform
 *     8. MidPageCta
 *     9. OtherDataSurfaces
 *    10. ThreeReader        — individual / compliance officer / regulator
 *    11. FinalCta
 */

export function TrustPageSections() {
  return (
    <>
      <TrustHero />
      <TrustActivityBar />
      <TheSixTrustPillars />
      <WhereYourDataLives />
      <YourRightsAtBell />
      <TheRemovalForm />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherDataSurfaces />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. TrustHero — sovereignty-forward opening
// ───────────────────────────────────────────────────────────────────────────

function TrustHero() {
  return (
    <section className="relative pt-28 md:pt-32 pb-20 md:pb-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 0%, rgba(91,140,255,0.16) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/40 backdrop-blur text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-7">
            <ShieldCheck size={12} className="text-accent-bright" />
            <span>Data &middot; Trust</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">Built in Qatar.</span>
            <br />
            <span className="text-text">Yours to remove.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Bell.qa is sovereign-grade by design. Qatari servers,
            Qatari operators, Qatari compliance. Every fact cited to
            source. Every record auditable end to end. Every
            individual entitled to see, correct, and remove their
            data.
          </p>
          <p className="mt-4 text-[13.5px] text-text-dim leading-relaxed max-w-2xl">
            Six pillars: sovereignty, encryption, transparency,
            privacy, audit, removal &mdash; documented in the open
            below.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3">
            <Link
              href="#removal"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-md bg-accent text-white text-sm font-medium hover:brightness-110 transition shadow-lg shadow-accent/30 whitespace-nowrap"
            >
              Request my data removed
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center px-6 py-3 text-sm font-medium rounded-md border border-border text-text-muted hover:text-text whitespace-nowrap"
            >
              Contact us
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. TrustActivityBar — cycling governance counters
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Data residency in Qatar',     value: '100%',   sub: 'every record, every byte'             },
  { label: 'Third-party data sub-processors', value: '0',  sub: 'Bell-owned end to end'                },
  { label: 'Cited facts',                 value: '100%',   sub: 'every datapoint, every record'        },
  { label: 'Removal SLA',                 value: '14 days', sub: 'request to confirmation, maximum'    },
  { label: 'Audit trail coverage',        value: 'every record', sub: 'every change, every viewer'    },
];

function TrustActivityBar() {
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
              Governance posture &middot; sovereign-grade, audited
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
// 3. TheSixTrustPillars — CENTERPIECE — 6 pillar cards in a 3x2 grid
// ───────────────────────────────────────────────────────────────────────────

type TrustPillar = {
  num:    string;
  icon:   React.ComponentType<{ size?: number | string }>;
  label:  string;
  tint:   string;
  body:   string;
  points: string[];
  detail: string;
};

const TRUST_PILLARS: TrustPillar[] = [
  {
    num:   '01',
    icon:  MapPin,
    label: 'Sovereignty',
    tint:  'rgb(91 140 255)',
    body:  'Bell’s data plane is hosted in Qatar, on infrastructure Bell owns. Every byte stays inside the country it describes.',
    points: [
      'Servers physically located in Qatar',
      'Bell-owned hardware, no public-cloud dependency for the core data plane',
      'Operations team resident in Qatar',
    ],
    detail: 'Qatari data, in Qatar, under Qatari law.',
  },
  {
    num:   '02',
    icon:  Lock,
    label: 'Encryption',
    tint:  'rgb(111 207 151)',
    body:  'Every record encrypted at rest and in transit. Key custody under Bell, with hardware-backed protection.',
    points: [
      'AES-256 at rest',
      'TLS 1.3 in transit, modern ciphers only',
      'Key rotation and access logged per request',
    ],
    detail: 'No plaintext at rest. No keys outside Bell.',
  },
  {
    num:   '03',
    icon:  Eye,
    label: 'Transparency',
    tint:  'rgb(255 196 99)',
    body:  'Every fact in the graph carries its source. Every change carries its citation. You can read where any datapoint came from.',
    points: [
      'Source per field, time-stamped',
      'Multi-source corroboration counts surfaced',
      'Disagreement and dissent visible alongside facts',
    ],
    detail: 'No black-box claims. Every datapoint has a paper trail.',
  },
  {
    num:   '04',
    icon:  UserX,
    label: 'Privacy',
    tint:  'rgb(196 154 255)',
    body:  'Bell collects only what business-purpose requires. Personal-density data is anonymized aggregate only — no individual identifiers, no surveillance.',
    points: [
      'Minimum-necessary data principle',
      'People-activity is district-level aggregate, never individual',
      'No personal browsing, location-tracking, or behavioural identifiers',
    ],
    detail: 'Privacy by design, not as an afterthought.',
  },
  {
    num:   '05',
    icon:  BadgeCheck,
    label: 'Audit',
    tint:  'rgb(165 195 255)',
    body:  'Every action against every record is logged. Every viewer, every change, every export — time-stamped, attributable, replayable.',
    points: [
      'Per-record audit log, never truncated',
      'Replay any record to any past date',
      'Workspace-level access events fully traceable',
    ],
    detail: 'Compliance officers see what you see, and when.',
  },
  {
    num:   '06',
    icon:  UserX,
    label: 'Removal',
    tint:  'rgb(232 142 168)',
    body:  'If you are a named individual in the graph and you don’t want to be, Bell will remove your data. Clear right, defined process, fast turnaround.',
    points: [
      'Request via the form below or direct contact',
      'Identity verified within a few business days',
      'Confirmation issued within 14 calendar days, maximum',
    ],
    detail: 'You can leave the graph. Permanently.',
  },
];

function TheSixTrustPillars() {
  return (
    <section className="relative py-16 md:py-20 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The six trust pillars
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Sovereignty. Encryption. Transparency. Privacy. Audit. Removal.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Each pillar is documented in the open below. None of it is
            marketing language &mdash; it&apos;s how Bell.qa is built
            and what it commits to.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {TRUST_PILLARS.map((pillar, i) => (
            <TrustPillarCard key={pillar.num} pillar={pillar} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function TrustPillarCard({ pillar, index }: { pillar: TrustPillar; index: number }) {
  const Icon = pillar.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
        borderColor: pillar.tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
        borderTop:   '2px solid ' + pillar.tint,
        boxShadow:   '0 14px 36px -18px ' + pillar.tint.replace('rgb', 'rgba').replace(')', ' / 0.30)'),
      }}
    >
      {/* Header — pillar number + icon */}
      <div
        className="px-5 py-4 border-b flex items-center justify-between"
        style={{
          background:  pillar.tint.replace('rgb', 'rgba').replace(')', ' / 0.06)'),
          borderColor: pillar.tint.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
            style={{
              background: pillar.tint.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
              color:      pillar.tint,
            }}
          >
            <Icon size={17} />
          </span>
          <div className="min-w-0">
            <div
              className="text-[10.5px] font-mono font-semibold uppercase tracking-wider leading-tight"
              style={{ color: pillar.tint }}
            >
              Pillar {pillar.num}
            </div>
            <div
              className="text-[16px] font-semibold leading-tight"
              style={{ color: pillar.tint }}
            >
              {pillar.label}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-5 flex-1 flex flex-col gap-3">
        <p className="text-[12.5px] text-text leading-relaxed">
          {pillar.body}
        </p>
        <ul className="space-y-1.5 border-t border-border/40 pt-3">
          {pillar.points.map((point) => (
            <li
              key={point}
              className="flex items-start gap-2 text-[11.5px] text-text-muted leading-snug"
            >
              <Sparkles
                size={10}
                className="shrink-0 mt-0.5"
                style={{ color: pillar.tint }}
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Detail footer */}
      <div
        className="px-5 py-3 border-t text-[11.5px] italic leading-snug"
        style={{
          background:  'rgba(255,255,255,0.015)',
          borderColor: 'rgba(255,255,255,0.04)',
          color:       pillar.tint,
        }}
      >
        {pillar.detail}
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. WhereYourDataLives — sovereignty stack
// ───────────────────────────────────────────────────────────────────────────

type StackLayer = {
  num:    string;
  icon:   React.ComponentType<{ size?: number | string }>;
  label:  string;
  body:   string;
  detail: string;
  tint:   string;
};

const SOVEREIGNTY_STACK: StackLayer[] = [
  {
    num:    '05',
    icon:   Landmark,
    label:  'Qatari law &amp; compliance',
    body:   'Bell.qa operates under Qatari data law. NDPL-aligned, locally compliant, accountable to Qatari regulators.',
    detail: 'The legal layer is Qatari, not exported.',
    tint:   'rgb(91 140 255)',
  },
  {
    num:    '04',
    icon:   Users,
    label:  'Qatar-resident operations',
    body:   'The team that runs the data plane is in Qatar. Day-to-day operations, on-call response, compliance reviews &mdash; all locally staffed.',
    detail: 'People who run the system live in the country it describes.',
    tint:   'rgb(196 154 255)',
  },
  {
    num:    '03',
    icon:   Cog,
    label:  'Bell-built software',
    body:   'Every layer of software — collection, processing, storage, query — is Bell-designed and Bell-maintained. No off-the-shelf vendor stacks.',
    detail: 'The code is Bell’s. It stays that way.',
    tint:   'rgb(255 196 99)',
  },
  {
    num:    '02',
    icon:   Server,
    label:  'Bell-owned servers',
    body:   'Hardware Bell owns, in racks Bell controls. No public-cloud dependency for the core data plane.',
    detail: 'Physical control. No shared tenancy at the storage layer.',
    tint:   'rgb(111 207 151)',
  },
  {
    num:    '01',
    icon:   MapPin,
    label:  'Qatari soil',
    body:   'The data physically resides in Qatari data centres. No mirror outside the country. No residency in jurisdictions Bell can’t name.',
    detail: 'Bytes inside the country those bytes describe.',
    tint:   'rgb(255 159 180)',
  },
];

function WhereYourDataLives() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Where your data lives
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Five layers. All Qatari. Top to bottom.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Sovereignty is a stack. Reading from the law down to the
            soil: every layer is Qatari, locally controlled, and
            documented here.
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
          {/* Stack header */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-dim">
              <ShieldCheck size={11} className="text-accent-bright" />
              Sovereignty stack &middot; top → bottom
            </span>
            <div className="flex-1" />
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
              style={{
                color:       'rgb(111 207 151)',
                background:  'rgba(111,207,151,0.10)',
                borderColor: 'rgba(111,207,151,0.30)',
              }}
            >
              <Check size={9} />
              100% Qatari
            </span>
          </div>

          {/* Stack layers — top to bottom */}
          <div className="p-5 md:p-6 space-y-3">
            {SOVEREIGNTY_STACK.map((layer, i) => (
              <SovereigntyLayer key={layer.num} layer={layer} index={i} />
            ))}
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function SovereigntyLayer({ layer, index }: { layer: StackLayer; index: number }) {
  const Icon = layer.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: index * 0.06 }}
      className="rounded-xl border overflow-hidden grid grid-cols-12 gap-0"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
        borderColor: layer.tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
      }}
    >
      {/* Layer number band */}
      <div
        className="col-span-2 md:col-span-1 flex items-center justify-center py-4 border-r"
        style={{
          background:  layer.tint.replace('rgb', 'rgba').replace(')', ' / 0.10)'),
          borderColor: layer.tint.replace('rgb', 'rgba').replace(')', ' / 0.22)'),
        }}
      >
        <span
          className="text-[14px] font-mono font-semibold tracking-wider"
          style={{ color: layer.tint }}
        >
          {layer.num}
        </span>
      </div>

      {/* Icon + label */}
      <div className="col-span-10 md:col-span-4 px-4 py-4 flex items-center gap-3 border-r border-border min-w-0">
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
          style={{
            background: layer.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      layer.tint,
          }}
        >
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <div
            className="text-[14px] font-semibold leading-tight"
            style={{ color: layer.tint }}
            dangerouslySetInnerHTML={{ __html: layer.label }}
          />
          <div className="text-[10.5px] text-text-dim mt-0.5 italic">
            {layer.detail}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="col-span-12 md:col-span-7 px-4 py-4 text-[12.5px] text-text leading-relaxed">
        {layer.body}
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. YourRightsAtBell — 5 rights cards
// ───────────────────────────────────────────────────────────────────────────

type DataRight = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  body:    string;
  howTo:   string;
  tint:    string;
};

const DATA_RIGHTS: DataRight[] = [
  {
    icon:  Eye,
    label: 'Right to see',
    body:  'You can request the data Bell holds on you. Bell will produce it: every field, every source, every last-verified timestamp.',
    howTo: 'Ask via the form below or contact us directly.',
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Edit3,
    label: 'Right to correct',
    body:  'If the data is wrong, you can have it corrected. Bell will verify the correction against the sources and update the record.',
    howTo: 'Submit a correction request with the field and proposed value.',
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  UserX,
    label: 'Right to remove',
    body:  'You can have your name removed from the graph entirely. Bell will identify-verify, then delete — permanently.',
    howTo: 'Use the removal form below. Confirmation issued within 14 days.',
    tint:  'rgb(255 159 180)',
  },
  {
    icon:  History,
    label: 'Right to audit',
    body:  'You can request a complete history of who accessed your record, when, and why. Bell’s audit log is queryable, not theoretical.',
    howTo: 'Submit an audit-request via the form or via direct contact.',
    tint:  'rgb(165 195 255)',
  },
  {
    icon:  Download,
    label: 'Right to export',
    body:  'You can receive a machine-readable export of every datapoint Bell holds on you, with sources attached. Yours to keep.',
    howTo: 'Request export via the form. JSON delivered within 14 days.',
    tint:  'rgb(111 207 151)',
  },
];

function YourRightsAtBell() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Your rights at Bell
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            See it. Correct it. Remove it. Audit it. Export it.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            If you are a named individual in the Bell.qa graph, you
            have five rights. Each one is exercisable, with a defined
            process and a defined SLA.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {DATA_RIGHTS.map((right, i) => (
            <DataRightCard key={right.label} right={right} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function DataRightCard({ right, index }: { right: DataRight; index: number }) {
  const Icon = right.icon;
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
        borderColor: right.tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
        borderTop:   '2px solid ' + right.tint,
      }}
    >
      <div className="p-5 flex-1 flex flex-col gap-3">
        <span
          className="inline-flex items-center justify-center w-10 h-10 rounded-lg"
          style={{
            background: right.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      right.tint,
          }}
        >
          <Icon size={16} />
        </span>
        <div>
          <h3
            className="text-[14px] font-semibold leading-snug"
            style={{ color: right.tint }}
          >
            {right.label}
          </h3>
          <p className="mt-1 text-[12px] text-text-muted leading-relaxed">
            {right.body}
          </p>
        </div>
      </div>
      <div
        className="px-5 py-2.5 border-t text-[10.5px] italic leading-snug"
        style={{
          borderColor: 'rgba(255,255,255,0.04)',
          background:  'rgba(255,255,255,0.015)',
          color:       right.tint,
        }}
      >
        {right.howTo}
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. TheRemovalForm — embedded mockup form (no backend yet)
// ───────────────────────────────────────────────────────────────────────────

type RequestType = 'remove' | 'correct' | 'see' | 'export' | 'audit';

const REQUEST_TYPES: { value: RequestType; label: string }[] = [
  { value: 'remove',  label: 'Remove my data permanently'    },
  { value: 'correct', label: 'Correct information about me'  },
  { value: 'see',     label: 'See what Bell holds on me'     },
  { value: 'export',  label: 'Export my data (JSON)'         },
  { value: 'audit',   label: 'Audit who has accessed my record' },
];

function TheRemovalForm() {
  const [submitted, setSubmitted] = useState(false);
  const [requestType, setRequestType] = useState<RequestType>('remove');
  const [confirmed,   setConfirmed]   = useState(false);

  return (
    <section id="removal" className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Your data, your choice
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Request the removal, correction, or export of your data.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Fill in the form below. Bell will verify your identity,
            process your request, and confirm within 14 calendar
            days. If it&apos;s a removal request, your record is
            deleted permanently the same week the verification
            completes.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="rounded-2xl border border-border overflow-hidden max-w-3xl mx-auto"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
          }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center gap-3 flex-wrap">
            <span
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg"
              style={{
                background: 'rgba(255,159,180,0.14)',
                color:      'rgb(255 159 180)',
              }}
            >
              <ShieldCheck size={15} />
            </span>
            <div>
              <div className="text-[14px] font-semibold text-text leading-tight">
                Data request &middot; Bell.qa
              </div>
              <div className="text-[11px] text-text-dim mt-0.5 font-mono">
                Confidential &middot; reviewed by a human &middot; reply within 14 days
              </div>
            </div>
            <div className="flex-1" />
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
              style={{
                color:       'rgb(111 207 151)',
                background:  'rgba(111,207,151,0.10)',
                borderColor: 'rgba(111,207,151,0.30)',
              }}
            >
              <Check size={9} />
              Secure
            </span>
          </div>

          {/* Form body OR success state */}
          <AnimatePresence mode="wait">
            {!submitted ? (
              <motion.form
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
                className="p-6 md:p-8 space-y-5"
              >
                {/* Request type */}
                <FormField label="Request type">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {REQUEST_TYPES.map((t) => {
                      const active = t.value === requestType;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setRequestType(t.value)}
                          className="text-left rounded-lg border px-3 py-2.5 text-[12px] transition-colors"
                          style={{
                            background: active
                              ? 'rgba(91,140,255,0.10)'
                              : 'rgba(255,255,255,0.02)',
                            borderColor: active
                              ? 'rgba(91,140,255,0.40)'
                              : 'rgba(255,255,255,0.08)',
                            color: active ? 'rgb(220 230 250)' : 'rgb(165 180 210)',
                          }}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-flex items-center justify-center w-4 h-4 rounded-full border-2 shrink-0"
                              style={{
                                borderColor: active
                                  ? 'rgb(91 140 255)'
                                  : 'rgba(165,195,255,0.30)',
                                background: active ? 'rgb(91 140 255)' : 'transparent',
                              }}
                            >
                              {active && <Check size={8} className="text-white" />}
                            </span>
                            <span className="font-medium">{t.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </FormField>

                {/* Two-column: name + email */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Full legal name">
                    <input
                      type="text"
                      required
                      placeholder="Your name, as it appears on ID"
                      className="w-full rounded-md border border-border bg-card/40 px-3 py-2.5 text-[13px] text-text placeholder:text-text-dim outline-none focus:border-accent-bright transition-colors"
                    />
                  </FormField>
                  <FormField label="Email address">
                    <input
                      type="email"
                      required
                      placeholder="you@example.qa"
                      className="w-full rounded-md border border-border bg-card/40 px-3 py-2.5 text-[13px] text-text placeholder:text-text-dim outline-none focus:border-accent-bright transition-colors"
                    />
                  </FormField>
                </div>

                {/* What records */}
                <FormField label="What record(s) does this concern?">
                  <textarea
                    rows={3}
                    placeholder="Your name on Bell.qa, your company record, a specific field — whatever you want addressed."
                    className="w-full rounded-md border border-border bg-card/40 px-3 py-2.5 text-[13px] text-text placeholder:text-text-dim outline-none focus:border-accent-bright transition-colors resize-none"
                  />
                </FormField>

                {/* Additional context */}
                <FormField label="Additional context (optional)">
                  <textarea
                    rows={3}
                    placeholder="Any context you'd like Bell to consider. Not required."
                    className="w-full rounded-md border border-border bg-card/40 px-3 py-2.5 text-[13px] text-text placeholder:text-text-dim outline-none focus:border-accent-bright transition-colors resize-none"
                  />
                </FormField>

                {/* Identity confirmation */}
                <label
                  className="flex items-start gap-3 cursor-pointer rounded-lg px-3 py-3 border"
                  style={{
                    background:  confirmed ? 'rgba(111,207,151,0.06)' : 'rgba(255,255,255,0.02)',
                    borderColor: confirmed ? 'rgba(111,207,151,0.30)' : 'rgba(255,255,255,0.08)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    className="sr-only"
                  />
                  <span
                    className="inline-flex items-center justify-center w-4 h-4 rounded shrink-0 mt-0.5 border-2"
                    style={{
                      borderColor: confirmed ? 'rgb(111 207 151)' : 'rgba(165,195,255,0.30)',
                      background:  confirmed ? 'rgb(111 207 151)' : 'transparent',
                    }}
                  >
                    {confirmed && <Check size={10} className="text-[rgb(13,18,35)]" />}
                  </span>
                  <span className="text-[12px] text-text leading-snug">
                    I confirm this request concerns my own data, or
                    I am authorised to act on behalf of the subject.
                    Identity will be verified before processing.
                  </span>
                </label>

                {/* Disclosure footnote */}
                <div className="flex items-start gap-2 text-[10.5px] text-text-dim leading-snug">
                  <AlertCircle size={11} className="shrink-0 mt-0.5 text-accent-bright" />
                  <span>
                    This form is a placeholder during the launch
                    period. To submit a request now, please email{' '}
                    <Link href="/contact" className="text-accent-bright hover:text-text transition-colors underline decoration-accent-bright/30 underline-offset-2">
                      contact us
                    </Link>
                    {' '}directly. The form will be wired to Bell
                    review shortly.
                  </span>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!confirmed}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-3 rounded-md bg-accent text-white text-sm font-semibold hover:brightness-110 transition shadow-lg shadow-accent/30 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Submit data request
                  <Send size={14} />
                </button>
              </motion.form>
            ) : (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="p-8 md:p-10 text-center"
              >
                <div
                  className="inline-flex items-center justify-center w-14 h-14 rounded-full mx-auto mb-4"
                  style={{
                    background: 'rgba(111,207,151,0.14)',
                    color:      'rgb(111 207 151)',
                  }}
                >
                  <Check size={26} />
                </div>
                <h3 className="text-[19px] font-semibold text-text">
                  Your request has been submitted.
                </h3>
                <p className="mt-3 text-[13px] text-text-muted max-w-md mx-auto leading-relaxed">
                  Bell&apos;s data-protection team will verify your
                  identity within a few business days and confirm
                  the outcome by email within 14 calendar days.
                </p>
                <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-text-dim font-mono">
                  <Mail size={11} />
                  <span>You will receive a confirmation email shortly</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    setConfirmed(false);
                  }}
                  className="mt-6 inline-flex items-center gap-1.5 text-[12px] text-accent-bright hover:text-text transition-colors"
                >
                  Submit another request
                  <ArrowRight size={11} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

      </div>
    </section>
  );
}

function FormField({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10.5px] font-mono font-semibold uppercase tracking-wider text-text-dim mb-1.5">
        {label}
      </div>
      {children}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. ConnectedToPlatform — surfaces that inherit Trust's posture
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
    icon:  UsersIcon,
    label: 'Team',
    href:  '/platform/team',
    body:  "Trust is enforced through Team. Roles, scopes, and access permissions decide who can see, edit, or export which records. Every action attributable to a member.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Inbox,
    label: 'CRM',
    href:  '/platform/crm',
    body:  "Every record in the CRM carries its full audit trail and per-field provenance. Read access, write access, and exports are all logged at the record level.",
    tint:  'rgb(165 195 255)',
  },
  {
    icon:  Bot,
    label: 'Bella',
    href:  '/platform/bella',
    body:  "Bella obeys the same scopes the workspace owner sets. Every action she takes is logged with her as the actor &mdash; the same audit trail applies.",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  "Every routed signal is cited at source and logged at destination. Subscription rules and routing decisions are themselves audited.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  Workflow,
    label: 'Pipeline',
    href:  '/data/pipeline',
    body:  "The pipeline emits a provenance trail for every field, every change, every record. Trust starts at stage one of the build, not as a wrapper around it.",
    tint:  'rgb(111 207 151)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Where Trust shows up
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Trust is enforced everywhere a record is touched.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The pillars above aren&apos;t abstract. Every Bell.qa
            surface inherits them. Team scopes the access. CRM logs
            it. Bella obeys it. Signals route through it. The
            pipeline emits it.
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
                You&apos;ve seen the governance
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now use the platform built to defend it.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Sovereign-grade by the same day you sign on.
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
// 9. OtherDataSurfaces — sibling Data sub-pages (all live)
// ───────────────────────────────────────────────────────────────────────────

type DataSibling = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  href:    string;
  tagline: string;
  body:    string;
};

const DATA_SIBLINGS: DataSibling[] = [
  {
    icon:    Database,
    label:   'Coverage',
    href:    '/data/coverage',
    tagline: 'What Bell sees.',
    body:    'Every Qatari company (130,000+, 35,000+ actively trading), every named decision-maker (240,000+ of 1.6M+ people in the graph), every signal &mdash; 21 record types across five tiers.',
  },
  {
    icon:    Workflow,
    label:   'Pipeline',
    href:    '/data/pipeline',
    tagline: 'The machine behind the data.',
    body:    'A six-stage proprietary pipeline that ingests, cleans, verifies, deduplicates, enriches, and tracks every record live &mdash; on Bell-owned infrastructure.',
  },
  {
    icon:    Activity,
    label:   'Live',
    href:    '/data/live',
    tagline: 'Refreshed by the minute.',
    body:    'Every record polled continuously, every change detected and timestamped, every fact carries its own freshness &mdash; from the 60-second air-traffic ping to the weekly sector report.',
  },
];

function OtherDataSurfaces() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The rest of the data section
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Trust is one of four.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            You&apos;ve just read how Bell protects the data. The
            other three Data surfaces explain what&apos;s in it, how
            it&apos;s built, and why it stays alive.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
          {DATA_SIBLINGS.map((sibling, i) => (
            <DataSiblingCard key={sibling.label} sibling={sibling} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function DataSiblingCard({ sibling, index }: { sibling: DataSibling; index: number }) {
  const Icon = sibling.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
    >
      <Link
        href={sibling.href}
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
              style={{ background: 'rgba(255,196,99,0.14)' }}
            >
              <Icon size={18} />
            </span>
            <ArrowRight
              size={14}
              className="text-text-dim opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
            />
          </div>
          <h3 className="text-base font-semibold text-text leading-tight">{sibling.label}</h3>
          <p className="mt-1 text-[12.5px] text-accent-bright/90 leading-snug">
            {sibling.tagline}
          </p>
          <p
            className="mt-3 text-[12px] text-text-muted leading-relaxed flex-1 border-t border-border pt-3"
            dangerouslySetInnerHTML={{ __html: sibling.body }}
          />
          <div className="mt-3 pt-3 border-t border-border/70 text-[11px] font-semibold text-accent-bright group-hover:text-text transition-colors inline-flex items-center gap-1.5">
            Explore {sibling.label}
            <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 10. ThreeReader — individual / compliance officer / regulator
// ───────────────────────────────────────────────────────────────────────────

const TRUST_READERS = [
  {
    icon:  UserX,
    label: 'For the individual',
    body:  "If you are a named individual in Bell&apos;s graph, you have five rights. Each one is exercisable. The removal request goes through a defined process, with a defined SLA, ending in confirmation by email within 14 days.",
  },
  {
    icon:  BadgeCheck,
    label: 'For the compliance officer',
    body:  "Bell&apos;s audit trail is queryable, not theoretical. Every action against every record is logged: viewers, editors, exporters, time-stamped, attributable. Sovereignty, encryption, transparency are all documented openly above &mdash; no NDA required.",
  },
  {
    icon:  Scale,
    label: 'For the regulator',
    body:  "Bell.qa operates under Qatari data law, on Qatari soil, with Qatari operators. The legal layer, the operational layer, the software, the hardware, and the data are all locally controlled and locally accountable.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same trust posture
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa commits to.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {TRUST_READERS.map((r, i) => {
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
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(91,140,255,0.14) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          Trust isn&apos;t a feature. It&apos;s the foundation.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Sovereign-grade by design. Qatari soil, Qatari servers,
          Qatari operators, Qatari law. Every fact cited. Every
          record auditable. Every individual entitled to see,
          correct, and remove their data &mdash; with a 14-day SLA.
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
            href="#removal"
            className="inline-flex items-center px-6 py-3 text-base font-medium rounded-md text-text-muted hover:text-text"
          >
            Request my data removed →
          </Link>
        </div>
      </div>
    </section>
  );
}

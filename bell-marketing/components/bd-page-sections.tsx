'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Briefcase, ArrowRight, Network, Crown, GitBranch,
  Building2, Users, TrendingUp, Calendar, Target,
  Radar, BadgeCheck, Search, BarChart3, FileSearch,
  Megaphone, ShieldCheck, Coins, MapPin, Handshake,
  CalendarClock, Check, Bot, Map as MapIcon, Inbox,
  BrainCircuit, Microscope, Rocket,
} from 'lucide-react';

/**
 * BUSINESS DEVELOPMENT PAGE — section-by-section build.
 *
 * Concept: The Watchlist Dashboard. BD operates on a quarter+ time
 * horizon, not days (Sales) or weeks (Marketing). The centerpiece is
 * the BD watchlist — a portfolio of target companies being monitored
 * over months, each with signal timelines, warm-path discovery, and
 * recommended next moves. Distinctive primitive vs Sales (timeline)
 * and Marketing (trigger gallery).
 *
 * Persona: Tariq Al-Naimi, VP Corporate Development at Marsa Capital,
 * a Qatari investment firm doing growth-equity + strategic
 * acquisitions across Qatari mid-market companies.
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file currently):
 *     1. BdHero               — "Targets mapped. Paths drawn."
 *     2. BdActivityBar        — quarterly BD stats
 *     3. MeetTariq            — persona intro
 *     4. TheWatchlist         — CENTERPIECE — 6 target cards
 *     5. OneTargetUnpacked    — drill-down view on one target
 *
 *   ROUND 2+ (to be added):
 *     6. TariqsQuarter        — KPI strip at quarterly scale
 *     7. LeaderPivot          — intelligence → deal flow
 *     8. QuarterlyDealFlow    — pipeline at quarterly cadence
 *     9. BdComparison         — Without vs With Bell.qa
 *    10. ConnectedToPlatform  — cross-link tiles
 *    11. MidPageCta
 *    12. OtherFunctions       — Sales / Marketing / Research / GTM
 *    13. ThreeReader          — Founder / Corp Dev / Board
 *    14. FinalCta
 */

export function BdPageSections() {
  return (
    <>
      <BdHero />
      <BdActivityBar />
      <MeetTariq />
      <TheWatchlist />
      <OneTargetUnpacked />
      <TariqsQuarter />
      <LeaderPivot />
      <QuarterlyDealFlow />
      <BdComparison />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Hero
// ───────────────────────────────────────────────────────────────────────────

function BdHero() {
  return (
    <section className="relative pt-28 pb-16 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(91,140,255,0.20) 0%, transparent 70%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(91,140,255,1) 1px, transparent 1px), linear-gradient(90deg, rgba(91,140,255,1) 1px, transparent 1px)',
          backgroundSize: '56px 56px',
        }}
      />

      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-bg-elev-2 border border-border text-text text-xs font-semibold uppercase tracking-wider">
          <Briefcase size={11} />
          For business development
        </div>
        <h1 className="text-display-md md:text-display-lg text-gradient max-w-4xl mx-auto">
          Targets mapped.<br/>Paths drawn.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl mx-auto">
          Every Qatari company you might acquire, partner with, or
          invest in &mdash; with the ownership chains, board overlaps,
          warm-path introductions, and signal timelines a BD team
          needs to move at the right moment. Quarterly cadence. Real
          relationships.
        </p>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Activity bar — quarterly BD stats
// ───────────────────────────────────────────────────────────────────────────

type BdFrame = {
  value: string;
  label: string;
  color: string;
};

const BD_FRAMES: BdFrame[] = [
  { value: '47',    label: 'targets on active watchlists', color: 'rgb(91 140 255)'   },
  { value: '312',   label: 'signals fired this quarter',   color: 'rgb(111 207 151)'  },
  { value: '12',    label: 'strategic engagements opened', color: 'rgb(196 154 255)'  },
  { value: '8',     label: 'term-sheet conversations',     color: 'rgb(255 196 99)'   },
  { value: '2',     label: 'transactions closed Q3',       color: 'rgb(111 207 151)'  },
];
const BD_FRAME_MS = 4500;

function BdActivityBar() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % BD_FRAMES.length), BD_FRAME_MS);
    return () => clearInterval(id);
  }, []);
  const frame = BD_FRAMES[idx];

  return (
    <section
      className="relative w-full border-y border-border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(13,18,35,0.90) 0%, rgba(10,14,26,0.96) 100%)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
      }}
    >
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${frame.color} 50%, transparent 100%)`,
          opacity: 0.55,
          transition: 'background 600ms ease',
        }}
      />

      <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center gap-4 min-h-[60px]">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-text shrink-0">
          <span
            className="w-1.5 h-1.5 rounded-full animate-pulse"
            style={{ background: frame.color, boxShadow: `0 0 8px ${frame.color}` }}
          />
          BD &middot; this quarter
        </span>

        <div className="flex-1 flex items-baseline gap-3 min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`v-${idx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{    opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
              className="text-2xl md:text-3xl font-semibold tabular-nums leading-none"
              style={{ color: frame.color }}
            >
              {frame.value}
            </motion.span>
          </AnimatePresence>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`l-${idx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{    opacity: 0, y: -8 }}
              transition={{ duration: 0.35, delay: 0.04 }}
              className="text-sm md:text-base text-text-muted truncate"
            >
              {frame.label}
            </motion.span>
          </AnimatePresence>
        </div>

        <span className="hidden md:inline text-[11px] font-mono uppercase tracking-wider text-text-dim shrink-0">
          across customer base
        </span>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Meet Tariq — persona intro
// ───────────────────────────────────────────────────────────────────────────

function MeetTariq() {
  return (
    <section className="relative py-20 md:py-24">
      <div className="max-w-screen-xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="max-w-3xl mx-auto"
        >
          <div className="text-center mb-8">
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
              Meet Tariq
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
              The watchlist he runs on Bell.qa.
            </h2>
            <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed max-w-2xl mx-auto">
              Tariq runs corporate development for a Qatari investment
              firm. His job is to know which companies are worth
              acquiring, which founders are worth backing, and which
              moments are worth moving on. Bell.qa is the intelligence
              layer underneath all of it.
            </p>
          </div>

          <div
            className="rounded-2xl border border-border overflow-hidden"
            style={{
              background:
                'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
              boxShadow: '0 18px 50px -20px rgba(0,0,0,0.55)',
            }}
          >
            <div className="p-6 md:p-7 flex flex-col md:flex-row items-start gap-5">
              <div
                className="shrink-0 inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl text-2xl md:text-3xl font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, rgb(255 196 99) 0%, rgb(196 154 255) 100%)',
                  boxShadow:  '0 12px 30px -10px rgba(91,140,255,0.4)',
                }}
              >
                TN
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                  <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                    Tariq Al-Naimi
                  </div>
                  <div className="text-sm text-text-muted">
                    VP Corporate Development &middot; Marsa Capital
                  </div>
                </div>
                <p className="text-[13.5px] text-text-muted leading-relaxed mb-4">
                  Marsa Capital does growth equity and strategic
                  acquisitions across the Qatari mid-market. Tariq runs
                  the target pipeline &mdash; from cold watchlist, through
                  warm engagement, to term-sheet conversation, to close.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <PersonaFact
                    label="ICP"
                    value="Qatari companies, QAR 40&ndash;400M revenue, strategic-fit sectors"
                  />
                  <PersonaFact
                    label="Quarterly target"
                    value="2&ndash;3 closed transactions, 8 active dialogues"
                  />
                  <PersonaFact
                    label="The watchlist"
                    value="47 targets, always being monitored"
                  />
                </div>
              </div>
            </div>

            <div
              className="px-6 md:px-7 py-3 border-t border-border flex items-center justify-between gap-3"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <span className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                The watchlist &middot; six representative targets below
              </span>
              <span className="text-[11px] text-text-muted flex items-center gap-1.5">
                Browse below
                <ArrowRight size={11} />
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function PersonaFact({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg border border-border px-3.5 py-2.5"
      style={{ background: 'rgba(13,18,35,0.6)' }}
    >
      <div className="text-[9px] uppercase tracking-wider text-text-dim font-semibold mb-1">
        {label}
      </div>
      <div
        className="text-[12px] text-text leading-snug"
        dangerouslySetInnerHTML={{ __html: value }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. The Watchlist — centerpiece, six representative target cards
// ───────────────────────────────────────────────────────────────────────────

type WatchStatus = 'monitoring' | 'engaged' | 'dialogue' | 'term-sheet' | 'just-added';

type WatchSignal = {
  when:   string;
  label:  string;
};

type WatchTarget = {
  name:     string;
  sector:   string;
  size:     string;
  status:   WatchStatus;
  signals:  WatchSignal[];
  warmPath: string;
  nextMove: string;
};

const STATUS_META: Record<WatchStatus, { label: string; color: string; bg: string; border: string }> = {
  'monitoring':  { label: 'Monitoring',     color: 'rgb(156 165 185)', bg: 'rgba(156,165,185,0.10)', border: 'rgba(156,165,185,0.28)' },
  'engaged':     { label: 'Engaged',        color: 'rgb(91 140 255)',  bg: 'rgba(91,140,255,0.12)',  border: 'rgba(91,140,255,0.32)' },
  'dialogue':    { label: 'In dialogue',    color: 'rgb(196 154 255)', bg: 'rgba(196,154,255,0.12)', border: 'rgba(196,154,255,0.32)' },
  'term-sheet':  { label: 'Term-sheet',     color: 'rgb(111 207 151)', bg: 'rgba(111,207,151,0.12)', border: 'rgba(111,207,151,0.32)' },
  'just-added':  { label: 'Just added',     color: 'rgb(255 196 99)',  bg: 'rgba(255,196,99,0.12)',  border: 'rgba(255,196,99,0.32)' },
};

const WATCHLIST: WatchTarget[] = [
  {
    name:    'Apex Logistics Holdings',
    sector:  'Logistics',
    size:    '240 employees',
    status:  'monitoring',
    signals: [
      { when: '8w ago', label: 'CFO transition'                    },
      { when: '3w ago', label: 'Series A funding rumour'          },
      { when: '5d ago', label: 'New regional director hired'      },
    ],
    warmPath: '2 board members shared with Marsa portfolio',
    nextMove: 'Warm intro via shared board member &middot; 2 weeks',
  },
  {
    name:    'Doha Health Network',
    sector:  'Healthcare',
    size:    '380 employees',
    status:  'dialogue',
    signals: [
      { when: '11w ago', label: 'Acquired a competitor (small)'   },
      { when: '5w ago',  label: 'Opening 2 new clinics in Lusail' },
      { when: '2w ago',  label: 'Founder spoke on consolidation'  },
    ],
    warmPath: 'Founder is alumnus of Marsa managing partner&apos;s university',
    nextMove: 'Term-sheet conversation already scheduled &middot; this week',
  },
  {
    name:    'Cipher Cloud',
    sector:  'Cybersecurity / B2B SaaS',
    size:    '95 employees',
    status:  'monitoring',
    signals: [
      { when: '6w ago', label: 'New CISO joined from regional bank' },
      { when: '4w ago', label: 'QFC regulatory work expanding'      },
      { when: '1w ago', label: 'Posted Series B preparation roles'  },
    ],
    warmPath: '1 advisor shared with Marsa portfolio',
    nextMove: 'Quarterly review &middot; engage Q4 if signals persist',
  },
  {
    name:    'Verde Real Estate',
    sector:  'Real Estate Developer',
    size:    '180 employees',
    status:  'just-added',
    signals: [
      { when: '2w ago', label: 'Founder keynote on sector consolidation' },
    ],
    warmPath: 'Mutual investor with Marsa via a Saudi LP',
    nextMove: 'Founder outreach &middot; 4&ndash;6 weeks',
  },
  {
    name:    'Atlas Trading Co.',
    sector:  'Commodities Trading',
    size:    '120 employees',
    status:  'engaged',
    signals: [
      { when: '12w ago', label: 'Cross-border expansion to Kuwait'  },
      { when: '6w ago',  label: 'Capital raise discussions in market' },
    ],
    warmPath: 'Direct relationship from prior deal in 2024',
    nextMove: 'Q4 follow-up on expansion-financing thesis',
  },
  {
    name:    'Northern Star Education',
    sector:  'Private Education',
    size:    '450 employees',
    status:  'monitoring',
    signals: [
      { when: '10w ago', label: 'Government contract extension'      },
      { when: '6w ago',  label: 'Long-serving board member departed' },
    ],
    warmPath: 'Departing board member opens a route in',
    nextMove: 'Wait 6 weeks then approach with roll-up thesis',
  },
];

function TheWatchlist() {
  return (
    <section className="relative py-16 md:py-20">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-14">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The watchlist &middot; six representative targets
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Quarter-long monitoring, in one place.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Each card shows a real target shape Tariq monitors. Recent
            signals across the quarter, the warm path that gets him in
            the door, and the next move on the calendar. Forty-one more
            targets sit behind these six.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {WATCHLIST.map((t, i) => (
            <WatchCard key={t.name} target={t} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function WatchCard({ target, index }: { target: WatchTarget; index: number }) {
  const meta = STATUS_META[target.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.2) }}
      className="rounded-2xl border border-border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        boxShadow: '0 12px 30px -16px rgba(0,0,0,0.55)',
      }}
    >
      {/* Header strip — target identity + status pill */}
      <div
        className="px-5 py-4 border-b border-border flex items-start justify-between gap-3"
        style={{ background: 'rgba(255,255,255,0.02)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <Building2 size={13} className="text-text-dim shrink-0" />
            <span className="text-[15px] font-semibold text-text leading-tight truncate">
              {target.name}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span>{target.sector}</span>
            <span className="text-text-dim">&middot;</span>
            <span>{target.size}</span>
          </div>
        </div>
        <span
          className="shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
          style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
        >
          {meta.label}
        </span>
      </div>

      {/* Body — three sections: signals, warm path, next move */}
      <div className="p-5 md:p-6 space-y-5">

        {/* Signals timeline */}
        <div>
          <div className="flex items-center gap-2 mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
            <Radar size={11} />
            Recent signals
          </div>
          <ul className="space-y-2">
            {target.signals.map((s, i) => (
              <li key={i} className="flex items-start gap-3 text-[13px]">
                <span className="shrink-0 inline-flex items-center justify-center w-12 font-mono text-[10px] text-text-dim tabular-nums">
                  {s.when}
                </span>
                <span
                  className="shrink-0 w-1 h-1 rounded-full mt-2"
                  style={{ background: meta.color }}
                  aria-hidden="true"
                />
                <span className="text-text-muted leading-snug">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Warm path */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
            <Network size={11} />
            Warm path in
          </div>
          <div
            className="rounded-md px-3 py-2 text-[12.5px] leading-relaxed text-text"
            style={{
              background:  'rgba(91,140,255,0.06)',
              border:      '1px solid rgba(91,140,255,0.20)',
            }}
            dangerouslySetInnerHTML={{ __html: target.warmPath }}
          />
        </div>

        {/* Next move */}
        <div>
          <div className="flex items-center gap-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-dim">
            <Calendar size={11} />
            Next move
          </div>
          <div
            className="text-[13px] text-text leading-snug font-medium"
            dangerouslySetInnerHTML={{ __html: target.nextMove }}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. One target unpacked — drill-down view on a single watchlist entry
// ───────────────────────────────────────────────────────────────────────────

function OneTargetUnpacked() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            One target, fully unpacked
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa shows behind any watchlist entry.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Each card above is the surface. Behind every one of them
            sits the full BD intelligence picture &mdash; the decision
            unit, the ownership structure, the warm paths in, the
            recommended approach. This is what Tariq sees when he opens
            Doha Health Network.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border border-border overflow-hidden max-w-5xl mx-auto"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
            boxShadow: '0 20px 60px -20px rgba(0,0,0,0.6)',
          }}
        >
          {/* Header — target identity + drill state */}
          <div
            className="px-6 py-4 border-b border-border flex items-start justify-between gap-3"
            style={{ background: 'rgba(196,154,255,0.05)' }}
          >
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <Building2 size={14} className="text-accent-bright shrink-0" />
                <span className="text-base md:text-lg font-semibold text-text leading-tight">
                  Doha Health Network
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-text-muted">
                <span>Healthcare &middot; private clinic operator</span>
                <span className="text-text-dim">&middot;</span>
                <span>380 employees</span>
                <span className="text-text-dim">&middot;</span>
                <span>Founded 2014 &middot; Doha</span>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
              style={{
                color:       STATUS_META['dialogue'].color,
                background:  STATUS_META['dialogue'].bg,
                borderColor: STATUS_META['dialogue'].border,
              }}
            >
              In dialogue
            </span>
          </div>

          {/* Body — 4-section grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">

            {/* Decision unit */}
            <UnpackedSection
              icon={Users}
              label="Decision unit"
              tint="rgb(91 140 255)"
            >
              <ul className="space-y-2">
                <DecisionRow name="Dr. Aisha Al-Sulaiti" role="Founder &amp; CEO" weight="Owner-operator. Final word on any transaction." />
                <DecisionRow name="Yousef Al-Mannai"     role="CFO"               weight="Hired 14 months ago. Has run a prior sale process." />
                <DecisionRow name="Saif Al-Khater"       role="Board, non-exec"   weight="External chair. Bridge to the family-office investor base." />
                <DecisionRow name="Layla Hassan"         role="Board, non-exec"   weight="Sector expert. Often signals deal sentiment first." />
              </ul>
            </UnpackedSection>

            {/* Ownership */}
            <UnpackedSection
              icon={Crown}
              label="Ownership"
              tint="rgb(255 196 99)"
            >
              <ul className="space-y-2.5">
                <OwnershipRow label="Founder &amp; family"      pct={62} tint="rgb(255 196 99)" />
                <OwnershipRow label="Qatari family-office LP"   pct={22} tint="rgb(196 154 255)" />
                <OwnershipRow label="Senior management ESOP"    pct={11} tint="rgb(111 207 151)" />
                <OwnershipRow label="Strategic minority partner" pct={5}  tint="rgb(165 195 255)" />
              </ul>
              <div className="mt-3 text-[11px] text-text-dim leading-relaxed">
                Family-office LP wants liquidity in 12&ndash;18 months &mdash;
                key transaction driver Bell flagged six weeks ago.
              </div>
            </UnpackedSection>

            {/* Warm paths */}
            <UnpackedSection
              icon={Network}
              label="Warm paths in"
              tint="rgb(196 154 255)"
            >
              <ul className="space-y-3">
                <WarmPathRow
                  strength="Strong"
                  body="Marsa managing partner shared university (Qatar University, 1998&ndash;2002) with Dr. Aisha. They sat on the same alumni council 2019&ndash;2021."
                />
                <WarmPathRow
                  strength="Medium"
                  body="One of Marsa&apos;s portfolio companies uses Doha Health Network for their employee health insurance &mdash; CFO-to-CFO route exists."
                />
                <WarmPathRow
                  strength="Indirect"
                  body="Saif Al-Khater (board) is a former co-investor with Marsa in a 2022 transaction."
                />
              </ul>
            </UnpackedSection>

            {/* Recommended approach */}
            <UnpackedSection
              icon={BadgeCheck}
              label="Bella&apos;s recommended approach"
              tint="rgb(111 207 151)"
            >
              <ol className="space-y-2.5">
                <ApproachStep n="01" body="Open via Marsa managing partner &mdash; alumni-council connection. Casual coffee, not pitch. Frame: &lsquo;noticed your consolidation thesis at the recent panel.&rsquo;" />
                <ApproachStep n="02" body="Position Marsa as patient-capital exit for the family-office LP &mdash; not a strategic-acquirer threat to operating control." />
                <ApproachStep n="03" body="Term-sheet conversation positioned at the second meeting, not the first. Calendar already provisionally held." />
                <ApproachStep n="04" body="If founder signals openness, route Yousef (CFO) to Marsa CFO directly for due-diligence runway." />
              </ol>
              <div className="mt-3 text-[11px] text-text-dim leading-relaxed">
                Bella will draft the opener for the managing partner&apos;s
                review on demand.
              </div>
            </UnpackedSection>

          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Last updated &middot; Bella ran refresh 14 minutes ago
            </span>
            <span className="text-text-muted">
              Audit trail attached to every fact above
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Helpers for the unpacked section ───────────────────────────────────────

function UnpackedSection({
  icon: Icon, label, tint, children,
}: {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  tint:    string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-md"
          style={{
            background: tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      tint,
          }}
        >
          <Icon size={13} />
        </span>
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: tint }}
          dangerouslySetInnerHTML={{ __html: label }}
        />
      </div>
      {children}
    </div>
  );
}

function DecisionRow({ name, role, weight }: { name: string; role: string; weight: string }) {
  return (
    <li>
      <div className="flex items-baseline gap-2 mb-0.5">
        <span className="text-[13px] font-semibold text-text leading-tight">{name}</span>
        <span
          className="text-[11px] text-text-dim leading-tight"
          dangerouslySetInnerHTML={{ __html: '&middot; ' + role }}
        />
      </div>
      <div className="text-[12px] text-text-muted leading-snug">
        {weight}
      </div>
    </li>
  );
}

function OwnershipRow({ label, pct, tint }: { label: string; pct: number; tint: string }) {
  return (
    <li>
      <div className="flex items-center justify-between gap-3 mb-1">
        <span
          className="text-[12.5px] text-text-muted"
          dangerouslySetInnerHTML={{ __html: label }}
        />
        <span
          className="text-[12px] font-mono tabular-nums font-semibold"
          style={{ color: tint }}
        >
          {pct}%
        </span>
      </div>
      <div
        className="relative h-1.5 rounded-full overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.04)' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${tint.replace('rgb', 'rgba').replace(')', ' / 0.7)')} 0%, ${tint} 100%)`,
          }}
        />
      </div>
    </li>
  );
}

function WarmPathRow({ strength, body }: { strength: string; body: string }) {
  const tint =
    strength === 'Strong'   ? 'rgb(111 207 151)'
  : strength === 'Medium'   ? 'rgb(255 196 99)'
  :                            'rgb(156 165 185)';
  return (
    <li className="flex items-start gap-3">
      <span
        className="shrink-0 inline-flex items-center text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded mt-0.5"
        style={{
          color:      tint,
          background: tint.replace('rgb', 'rgba').replace(')', ' / 0.12)'),
        }}
      >
        {strength}
      </span>
      <span
        className="text-[12.5px] text-text-muted leading-relaxed"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </li>
  );
}

function ApproachStep({ n, body }: { n: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md font-mono text-[10px] tabular-nums font-semibold"
        style={{
          background: 'rgba(111,207,151,0.14)',
          color:      'rgb(111 207 151)',
          border:     '1px solid rgba(111,207,151,0.30)',
        }}
      >
        {n}
      </span>
      <span
        className="text-[12.5px] text-text-muted leading-relaxed"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </li>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. Tariq's quarter — KPI strip at quarterly scale
// ───────────────────────────────────────────────────────────────────────────

const TARIQ_QUARTER_KPIS = [
  { value: '47',  label: 'Targets monitored',          tint: 'rgb(91 140 255)'   },
  { value: '312', label: 'Signals fired this quarter', tint: 'rgb(165 195 255)'  },
  { value: '18',  label: 'Warm intros made',           tint: 'rgb(196 154 255)'  },
  { value: '8',   label: 'Term-sheet conversations',   tint: 'rgb(255 196 99)'   },
  { value: '2',   label: 'Transactions closed Q3',     tint: 'rgb(111 207 151)'  },
  { value: '0',   label: 'Hours on target-pipeline upkeep', tint: 'rgb(165 195 255)' },
];

function TariqsQuarter() {
  return (
    <section className="relative py-20 md:py-24 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Tariq&apos;s quarter, in numbers
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            One VP. The output of a full corp-dev team.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Strategic firms staff this with four to eight people:
            analyst, associate, vice-president, director. Tariq plus
            Bell.qa runs the same throughput on his own.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="rounded-2xl border border-border overflow-hidden max-w-5xl mx-auto"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <div
            className="px-6 py-4 border-b border-border flex items-center justify-between gap-3"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
              Tariq Al-Naimi &middot; trailing quarter
            </div>
            <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-bg-elev-2 border border-border">
              <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">Live</span>
            </span>
          </div>

          <div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-px"
            style={{ background: 'rgb(42 49 73)' }}
          >
            {TARIQ_QUARTER_KPIS.map((k, i) => (
              <div key={i} className="p-5 bg-bg-elev">
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider mb-3 leading-tight"
                  style={{ color: k.tint }}
                >
                  {k.label}
                </div>
                <div className="text-3xl md:text-4xl font-semibold text-text tabular-nums leading-none">
                  {k.value}
                </div>
              </div>
            ))}
          </div>

          <div className="px-6 py-4 border-t border-border text-center">
            <p className="text-sm text-text-muted">
              The watchlist never goes cold. Bell.qa watches while
              Tariq sits in board meetings, takes his daughter to
              school, sleeps.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. Leader pivot — operational view → boardroom view
// ───────────────────────────────────────────────────────────────────────────

function LeaderPivot() {
  return (
    <section className="relative py-20 md:py-24">
      <div className="max-w-screen-xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="text-center max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border text-[11px] font-semibold uppercase tracking-wider"
            style={{
              color:       'rgb(165 195 255)',
              background:  'rgba(91,140,255,0.10)',
              borderColor: 'rgba(91,140,255,0.35)',
            }}
          >
            <BarChart3 size={11} />
            Now the boardroom view
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold leading-[1.1]">
            <span className="text-gradient">Plays are operational.</span>
            <br/>
            <span className="text-text-muted">Deal flow is strategic.</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-text-muted leading-relaxed max-w-2xl mx-auto">
            Watchlist and warm paths are how a corp-dev VP works. Deal
            flow over multiple quarters is how the firm&apos;s
            investment committee judges whether the team is building
            something durable. Bell.qa gives both views, on the same
            data, with the same audit trail.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. Quarterly Deal Flow — funnel view + 4-quarter trend
// ───────────────────────────────────────────────────────────────────────────

type FunnelStage = {
  number:  string;
  label:   string;
  count:   number;
  tint:    string;
  caption: string;
};

const FUNNEL_STAGES: FunnelStage[] = [
  { number: '01', label: 'Monitoring',    count: 47, tint: 'rgb(156 165 185)', caption: 'Active watchlist, signals being tracked'    },
  { number: '02', label: 'Engaged',       count: 18, tint: 'rgb(91 140 255)',  caption: 'First touch made, conversation opened'      },
  { number: '03', label: 'In dialogue',   count:  8, tint: 'rgb(196 154 255)', caption: 'Multi-meeting dialogue with decision unit'  },
  { number: '04', label: 'Term-sheet',    count:  3, tint: 'rgb(255 196 99)',  caption: 'Term sheet drafted or in negotiation'       },
  { number: '05', label: 'Closed Q3',     count:  2, tint: 'rgb(111 207 151)', caption: 'Transaction signed and closed this quarter' },
];

const MAX_FUNNEL = Math.max(...FUNNEL_STAGES.map(s => s.count));

const QUARTER_TREND = [
  { q: 'Q4 \'24', closed: 1 },
  { q: 'Q1 \'25', closed: 2 },
  { q: 'Q2 \'25', closed: 2 },
  { q: 'Q3 \'25', closed: 2, current: true },
];

function QuarterlyDealFlow() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Deal flow &middot; quarterly view
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Forty-seven targets. Two closed.<br/>The funnel in between.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Where every target on the watchlist sits today. Every
            stage transition is logged with its date and the signal
            that drove it. The kind of trail an investment committee
            actually reads.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="rounded-2xl border border-border overflow-hidden max-w-5xl mx-auto"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
            boxShadow: '0 18px 50px -20px rgba(0,0,0,0.55)',
          }}
        >
          {/* Header */}
          <div
            className="px-6 py-4 border-b border-border flex items-center justify-between gap-3"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
              Deal-flow funnel &middot; Q3 2025
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
              Auto-tracked
            </span>
          </div>

          {/* Funnel — 5 stages, horizontal bars */}
          <div className="p-6 md:p-8 space-y-4">
            {FUNNEL_STAGES.map((stage, i) => (
              <FunnelRow
                key={stage.number}
                stage={stage}
                widthPct={(stage.count / MAX_FUNNEL) * 100}
                index={i}
              />
            ))}
          </div>

          {/* 4-quarter trend strip */}
          <div className="px-6 md:px-8 py-5 border-t border-border">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                Closed transactions &middot; trailing four quarters
              </div>
              <div className="text-[11px] text-text-muted font-mono tabular-nums">
                7 deals total &middot; ~2 per quarter
              </div>
            </div>
            <div className="grid grid-cols-4 gap-3">
              {QUARTER_TREND.map((q, i) => (
                <QuarterBlock key={i} q={q} />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-border text-center">
            <p className="text-sm text-text-muted">
              Every stage transition above survives audit. Every
              signal that drove it has a source, a fetch timestamp,
              and a confidence score. Investment-committee-ready by
              default.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FunnelRow({
  stage, widthPct, index,
}: {
  stage:    FunnelStage;
  widthPct: number;
  index:    number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.06, 0.3) }}
      className="grid grid-cols-12 items-center gap-3"
    >
      {/* Stage number */}
      <div className="col-span-1 font-mono text-[11px] tabular-nums font-semibold" style={{ color: stage.tint }}>
        {stage.number}
      </div>

      {/* Stage name + caption */}
      <div className="col-span-3">
        <div className="text-[13.5px] font-semibold text-text leading-tight">{stage.label}</div>
        <div className="text-[11px] text-text-dim leading-snug mt-0.5">{stage.caption}</div>
      </div>

      {/* The bar */}
      <div className="col-span-6">
        <div
          className="relative h-3 rounded-full overflow-hidden"
          style={{ background: 'rgba(91,140,255,0.06)' }}
        >
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: `${widthPct}%` }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.8, delay: 0.3 + Math.min(index * 0.06, 0.3), ease: [0.22, 0.61, 0.36, 1] }}
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${stage.tint.replace('rgb', 'rgba').replace(')', ' / 0.85)')} 0%, ${stage.tint} 100%)`,
              boxShadow:  `0 0 14px -2px ${stage.tint.replace('rgb', 'rgba').replace(')', ' / 0.55)')}`,
            }}
          />
        </div>
      </div>

      {/* Count */}
      <div className="col-span-2 text-right font-mono tabular-nums">
        <span className="text-xl md:text-2xl font-semibold" style={{ color: stage.tint }}>
          {stage.count}
        </span>
        <span className="text-[10px] uppercase tracking-wider text-text-dim ml-1.5">
          {stage.count === 1 ? 'target' : 'targets'}
        </span>
      </div>
    </motion.div>
  );
}

function QuarterBlock({ q }: { q: { q: string; closed: number; current?: boolean } }) {
  return (
    <div
      className={'rounded-lg border p-3 text-center ' + (q.current ? '' : '')}
      style={{
        background:  q.current ? 'rgba(111,207,151,0.06)' : 'rgba(13,18,35,0.5)',
        borderColor: q.current ? 'rgba(111,207,151,0.32)' : 'rgba(50,58,84,0.7)',
      }}
    >
      <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim mb-1.5">
        {q.q}
        {q.current && (
          <span className="ml-1.5 inline-flex items-center text-[8px] font-semibold uppercase tracking-wider px-1 py-px rounded"
            style={{ color: 'rgb(111 207 151)', background: 'rgba(111,207,151,0.12)' }}
          >
            now
          </span>
        )}
      </div>
      <div
        className="text-2xl font-semibold tabular-nums leading-none"
        style={{ color: q.current ? 'rgb(111 207 151)' : 'rgb(220 230 250)' }}
      >
        {q.closed}
      </div>
      <div className="text-[9px] uppercase tracking-wider text-text-dim mt-1">
        closed
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 9. BdComparison — the before/after table for corporate development
// ───────────────────────────────────────────────────────────────────────────

type BdRow = { capability: string; without: string; with: string };

const BD_COMPARISON_ROWS: BdRow[] = [
  {
    capability: 'Target identification',
    without:    'Bankers, brokers, word-of-mouth — quarterly at best',
    with:       'Every Qatari company under continuous monitoring',
  },
  {
    capability: 'Watchlist coverage',
    without:    '5 to 10 names a desk can keep warm at once',
    with:       '47 targets actively tracked, full intel on each',
  },
  {
    capability: 'Ownership intelligence',
    without:    'Outside counsel + manual filings, three weeks per target',
    with:       'Cap table, family lineage, LP structure mapped on day one',
  },
  {
    capability: 'Warm-path discovery',
    without:    'Cold introduction via banker, hope it lands',
    with:       'Alumni, board overlaps, prior co-investments mapped pre-contact',
  },
  {
    capability: 'Signal monitoring',
    without:    'Ad-hoc Google Alerts and Bloomberg pings',
    with:       'Every regulatory filing, leadership change, raise tracked live',
  },
  {
    capability: 'Decision-unit mapping',
    without:    'Best guess from LinkedIn at the start of the process',
    with:       'Named decision-makers with weight, history, sentiment',
  },
  {
    capability: 'Pipeline visibility',
    without:    'A deal log in a spreadsheet, refreshed for the partner meeting',
    with:       'Live funnel, quarterly trend, every signal cited',
  },
  {
    capability: 'Cost of the function',
    without:    'A full corporate development desk: VP + 2 associates + analyst',
    with:       'One VP, with Bella running the engine underneath',
  },
];

function BdComparison() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The before-and-after for corp dev
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What changes when business development runs on Bell.qa.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Eight rows. The function shifts from periodic to continuous,
            from desk-sized to country-scale.
          </p>
        </div>

        <div
          className="rounded-2xl border border-border overflow-hidden max-w-5xl mx-auto"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          }}
        >
          <div
            className="grid grid-cols-12 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.025)' }}
          >
            <div className="col-span-4 p-4 text-text-dim border-r border-border">
              Dimension
            </div>
            <div className="col-span-4 p-4 text-text-dim border-r border-border">
              Without Bell.qa
            </div>
            <div className="col-span-4 p-4 text-accent-bright">
              With Bell.qa
            </div>
          </div>

          {BD_COMPARISON_ROWS.map((row, i) => (
            <motion.div
              key={row.capability}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={
                'grid grid-cols-12 text-[13px] ' +
                (i < BD_COMPARISON_ROWS.length - 1 ? 'border-b border-border' : '')
              }
            >
              <div className="col-span-4 p-4 text-text font-medium border-r border-border leading-snug">
                {row.capability}
              </div>
              <div className="col-span-4 p-4 text-text-muted border-r border-border leading-snug flex items-start gap-2">
                <CalendarClock size={14} className="shrink-0 mt-0.5 text-text-dim" />
                <span>{row.without}</span>
              </div>
              <div className="col-span-4 p-4 leading-snug flex items-start gap-2">
                <Check size={14} className="shrink-0 mt-0.5 text-accent-bright" />
                <span className="text-text">{row.with}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 10. ConnectedToPlatform — the surfaces BD pulls from
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
    body:  "The autonomous agent that researches each target, drafts openers, and refreshes the watchlist on a quarterly cadence — without Tariq asking.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  "The live signal stream that flagged the family-office LP's liquidity preference six weeks before anyone else heard it.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  "Targets clustered geographically — useful when an acquisition thesis is a roll-up of a region or a sector with a physical footprint.",
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "Probability over the graph. Which targets are likeliest to come to market in the next two quarters — surfaced before bankers package them.",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  Inbox,
    label: 'CRM',
    href:  '/platform/crm',
    body:  "Deal pipeline native to the same graph. Term-sheets, conversations, and decisions logged automatically — no separate dealroom to maintain.",
    tint:  'rgb(165 195 255)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Five surfaces, one VP
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Tariq&apos;s quarter is built on.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Business development pulls from five parts of the Bell.qa
            platform. Each one stands alone and is documented in depth
            &mdash; tap into any of them.
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
          <p className="text-[13px] text-text-muted leading-relaxed flex-1">
            {tile.body}
          </p>
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
// 11. MidPageCta — Get Access band placed after the data-heavy sections
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
                'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(196,154,255,0.18) 0%, transparent 60%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                You&apos;ve seen Tariq&apos;s quarter
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now run yours on the only platform built for corporate
                development in Qatar.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your watchlist is live by tomorrow.
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
// 12. OtherFunctions — cross-links to the other revenue functions
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
      "Campaigns triggered off real-world signals, not the calendar",
      "Attribution back to the signal that surfaced the account",
    ],
  },
  {
    icon:    Microscope,
    team:    'Research',
    href:    '/platform/research',
    tagline: "Hands analysts the report they would have spent days writing.",
    capabilities: [
      "Deep-researches any company, sector, or topic",
      "Every public signal pulled with full citation trail",
      "Structured reports ready for the boardroom",
    ],
  },
  {
    icon:    Rocket,
    team:    'GTM',
    href:    '/platform/gtm',
    tagline: "Plans and runs go-to-market motions across the Qatari market.",
    capabilities: [
      "Supply &amp; demand mapped at country scale",
      "Outreach &amp; channel execution end-to-end",
      "Best fit for expansion or new-market entry",
    ],
  },
];

function OtherFunctions() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Beyond business development
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The other revenue functions Bell.qa accelerates.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Business development is one of four. The same data and the
            same Bella power your sales, marketing, research, and
            go-to-market teams &mdash; on one platform, one CRM, one
            source of truth.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
      transition={{ duration: 0.55, delay: index * 0.06 }}
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
          <p className="mt-2 text-[13px] text-accent-bright/90 leading-snug">{fn.tagline}</p>
          <ul className="mt-4 space-y-1.5 border-t border-border pt-4 flex-1">
            {fn.capabilities.map((cap, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-[12px] text-text-muted leading-relaxed"
              >
                <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-accent" aria-hidden="true" />
                <span dangerouslySetInnerHTML={{ __html: cap }} />
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-border/70 text-[11.5px] font-semibold text-accent-bright group-hover:text-text transition-colors inline-flex items-center gap-1.5">
            Explore {fn.team}
            <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 13. ThreeReader — BD-specific audience block (VP / managing partner / IC)
// ───────────────────────────────────────────────────────────────────────────

const BD_READERS = [
  {
    icon:  Briefcase,
    label: 'For the VP, corp dev',
    body:  "The watchlist runs itself. Ownership is mapped, signals refresh on a quarterly cadence, warm paths show up before a target is contacted. Your hours go to the conversations that actually move a deal.",
  },
  {
    icon:  Crown,
    label: 'For the managing partner',
    body:  "Coverage that no boutique can match without a desk three times the size. Eight term-sheets active in a quarter on the strength of one VP. The function is now a competitive advantage, not a cost line.",
  },
  {
    icon:  ShieldCheck,
    label: 'For the investment committee',
    body:  "Every fact in the deal memo cites a source. Every signal has an audit trail. The basis for moving forward is visible, defensible, and refreshed on the day of the meeting — not the week before.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same workflow
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes for business development.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {BD_READERS.map((r, i) => {
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
                <p className="text-[14px] text-text leading-relaxed">
                  {r.body}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 14. FinalCta — closing Get Access block
// ───────────────────────────────────────────────────────────────────────────

function FinalCta() {
  return (
    <section className="relative py-28">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(196,154,255,0.16) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          Put your BD function on Bell.qa.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Targets mapped. Ownership drawn. Warm paths surfaced. Signals
          watched at quarterly cadence. One VP, the output of a full
          corp-dev team.
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

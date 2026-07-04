'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Inbox, ArrowRight, Building2, Users, Crown, Network,
  Radar, Activity, FileText, Sparkles, Database, Bot,
  Briefcase, Target, Megaphone, Microscope, Rocket,
  Handshake, BadgeCheck, Calendar, ShieldCheck, Eye,
  GitBranch, Layers, Check, ChevronRight, MessageSquare,
  Phone, Mail, Map as MapIcon, BrainCircuit, Zap,
  TrendingUp, ListChecks, Settings, Clock,
  PencilLine, RefreshCw, Newspaper, Linkedin, Scroll,
} from 'lucide-react';

/**
 * CRM PAGE — capability-deep-dive.
 *
 * Two stacked centerpieces:
 *   1. The Living Account Record — one fully-loaded account
 *      (Doha Health Network) showing everything Bell pre-fills
 *      and how Bella participates inside it.
 *   2. The Pipeline View — Khaleej Group's Sales pipeline as a
 *      kanban board with rich deal cards.
 *
 * Differentiator arc, in sequence:
 *   - Hero: no data entry (the graph IS the database)
 *   - Round 2: records that update themselves (auto-enrichment)
 *   - Round 2: Bella as a native participant (her CRM moves)
 *
 * Anchor: Khaleej Group (re-uses Team page workspace for continuity).
 * Doha Health Network appears as the example account — same company
 * targeted by Tariq's BD watchlist and deep-dived by Hassan's
 * Research. Cross-page payoff.
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. CrmHero               — "The CRM that came pre-loaded with Qatar."
 *     2. CrmActivityBar        — workspace CRM stats
 *     3. TheLivingAccountRecord — CENTERPIECE 1
 *     4. ThePipelineView       — CENTERPIECE 2
 *
 *   ROUND 2+ (to be added):
 *     5. RecordsThatUpdate     — auto-enrichment from signals
 *     6. BellaInsideRecords    — Bella as a native CRM participant
 *     7. TeamScopes            — same record, different lenses per team
 *     8. ConnectedToPlatform   — cross-link tiles
 *     9. MidPageCta
 *    10. OtherFunctions
 *    11. ThreeReader           — rev ops / leader / exec
 *    12. FinalCta
 */

export function CrmPageSections() {
  return (
    <>
      <CrmHero />
      <CrmActivityBar />
      <TheLivingAccountRecord />
      <ThePipelineView />
      <RecordsThatUpdate />
      <BellaInsideRecords />
      <TeamScopes />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. CrmHero — opening band: "no data entry" angle
// ───────────────────────────────────────────────────────────────────────────

function CrmHero() {
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
            <Inbox size={12} className="text-accent-bright" />
            <span>Workspace &middot; CRM</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">The CRM that came</span>
            <br />
            <span className="text-text">pre-loaded with Qatar.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Every Qatari company is already a record. Every record
            updates itself as the market moves. Bella works inside
            every one of them &mdash; drafting, logging, summarizing,
            surfacing the next move. The CRM you don&apos;t fill in.
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
// 2. CrmActivityBar — cycling workspace CRM stats
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Pre-loaded accounts',     value: 'every Qatari co.', sub: 'no manual data entry'  },
  { label: 'Records auto-updated',    value: '4,217',  sub: 'this month, from live signals' },
  { label: 'Bella actions in records', value: '1,840', sub: 'this month, across teams'     },
  { label: 'Active deals',            value: '47',     sub: 'across all 5 function teams'   },
  { label: 'Manual data entries',     value: '0',      sub: 'the graph is the database'     },
];

function CrmActivityBar() {
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
              Live workspace &middot; Khaleej Group
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
// 3. TheLivingAccountRecord — CENTERPIECE 1
//    One fully-loaded account record (Doha Health Network).
//    Shows what's pre-filled, who's involved, what's happening,
//    and how Bella participates.
// ───────────────────────────────────────────────────────────────────────────

const OWNERSHIP = [
  { label: 'Founder & family',         pct: 62, tint: 'rgb(255 196 99)'  },
  { label: 'Qatari family-office LP',  pct: 22, tint: 'rgb(196 154 255)' },
  { label: 'Senior management ESOP',   pct: 11, tint: 'rgb(111 207 151)' },
  { label: 'Strategic minority partner', pct: 5, tint: 'rgb(165 195 255)' },
];

const DECISION_UNIT = [
  { initials: 'AS', name: 'Dr. Aisha Al-Sulaiti', role: 'Founder & CEO',     weight: 'Owner-operator. Final word.' },
  { initials: 'YM', name: 'Yousef Al-Mannai',     role: 'CFO',                weight: 'Hired 14 months ago. Has run a sale process before.' },
  { initials: 'SK', name: 'Saif Al-Khater',       role: 'Board, non-exec',    weight: 'External chair. Bridge to LP.' },
  { initials: 'LH', name: 'Layla Hassan',         role: 'Board, non-exec',    weight: 'Sector expert. Signals sentiment early.' },
];

type SignalKind = 'filing' | 'leadership' | 'announcement' | 'liquidity';

const LIVE_SIGNALS: { when: string; kind: SignalKind; body: string }[] = [
  { when: '2 days ago',  kind: 'filing',       body: 'Regulatory filing — healthcare licence renewal at MoPH.' },
  { when: '1 week ago',  kind: 'announcement', body: 'Capacity expansion announced — new clinic in West Bay.' },
  { when: '3 weeks ago', kind: 'leadership',   body: 'New CFO appointed — Yousef Al-Mannai (ex-QNB).' },
  { when: '6 weeks ago', kind: 'liquidity',    body: 'Family-office LP signaled liquidity preference, 12-18 months.' },
];

const SIGNAL_META: Record<SignalKind, { color: string; icon: React.ComponentType<{ size?: number | string }>; label: string }> = {
  filing:       { color: 'rgb(91 140 255)',  icon: FileText, label: 'Filing'       },
  leadership:   { color: 'rgb(111 207 151)', icon: Users,    label: 'Leadership'   },
  announcement: { color: 'rgb(255 196 99)',  icon: Sparkles, label: 'Announcement' },
  liquidity:    { color: 'rgb(196 154 255)', icon: TrendingUp, label: 'Liquidity'  },
};

type ActorKind = 'bella' | 'member';

type ActivityEntry = {
  actor:    ActorKind;
  initials: string;
  name:     string;
  team?:    string;
  when:     string;
  body:     string;
};

const ACTIVITY: ActivityEntry[] = [
  { actor: 'bella',  initials: 'B',  name: 'Bella',                                when: '2h ago',     body: 'Drafted opener for Marsa managing-partner introduction to Dr. Aisha.' },
  { actor: 'member', initials: 'NR', name: 'Noora Al-Rumaihi', team: 'Sales',      when: '4h ago',     body: 'Logged call with Yousef (CFO). Discussed capacity-expansion timing.' },
  { actor: 'bella',  initials: 'B',  name: 'Bella',                                when: '6h ago',     body: 'Refreshed ownership graph. No changes since last update.' },
  { actor: 'member', initials: 'FN', name: 'Fatima Al-Nuaimi', team: 'Research',   when: 'yesterday',  body: 'Delivered company deep-dive (12 sections, 142 citations).' },
  { actor: 'bella',  initials: 'B',  name: 'Bella',                                when: 'yesterday',  body: 'Flagged new regulatory filing affecting healthcare licences.' },
  { actor: 'member', initials: 'MS', name: 'Maryam Al-Suwaidi', team: 'BD',        when: '3 days ago', body: 'Added to BD watchlist as M&A consideration.' },
  { actor: 'bella',  initials: 'B',  name: 'Bella',                                when: '6 days ago', body: 'Logged family-office LP liquidity signal from public statement.' },
];

const OPEN_DEALS_ON_ACCOUNT = [
  { team: 'Sales', value: 'QAR 620k', stage: 'In dialogue', tint: 'rgb(91 140 255)'  },
  { team: 'BD',    value: '—',     stage: 'Watchlist',   tint: 'rgb(196 154 255)' },
];

function TheLivingAccountRecord() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            One record, fully loaded
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What an account record looks like on Bell.qa.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            No one at Khaleej typed Doha Health Network into the CRM.
            The company was already there &mdash; the ownership, the
            decision unit, the signals, the lineage. The members of
            five teams have been working it ever since, and Bella has
            been working it alongside them.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="rounded-2xl border border-border overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
          }}
        >
          {/* Header — account identity + pre-loaded badge */}
          <div className="px-6 py-5 border-b border-border flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <span
                className="inline-flex items-center justify-center w-12 h-12 rounded-lg shrink-0 text-text"
                style={{
                  background: 'linear-gradient(135deg, rgb(91 140 255) 0%, rgb(165 195 255) 100%)',
                  boxShadow:  '0 8px 22px -6px rgba(91,140,255,0.42)',
                }}
              >
                <Building2 size={20} />
              </span>
              <div className="min-w-0">
                <div className="text-[17px] font-semibold text-text leading-tight">
                  Doha Health Network
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-text-muted mt-1">
                  <span>Healthcare &middot; private clinic operator</span>
                  <span className="text-text-dim">&middot;</span>
                  <span>380 employees</span>
                  <span className="text-text-dim">&middot;</span>
                  <span>Founded 2014 &middot; Doha</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                    style={{
                      color:       'rgb(111 207 151)',
                      background:  'rgba(111,207,151,0.12)',
                      borderColor: 'rgba(111,207,151,0.32)',
                    }}
                  >
                    <Sparkles size={9} />
                    Pre-loaded from MOCI
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                    style={{
                      color:       'rgb(91 140 255)',
                      background:  'rgba(91,140,255,0.10)',
                      borderColor: 'rgba(91,140,255,0.30)',
                    }}
                  >
                    <Zap size={9} />
                    Enriched live
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                    style={{
                      color:       'rgb(255 196 99)',
                      background:  'rgba(255,196,99,0.10)',
                      borderColor: 'rgba(255,196,99,0.30)',
                    }}
                  >
                    0 manual entries
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                Touched by
              </div>
              <div className="mt-1 flex items-center justify-end -space-x-1.5">
                {['NR','FN','MS','OT','B'].map((i) => (
                  <span
                    key={i}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-semibold border-2 border-[rgb(13,18,35)]"
                    style={{
                      background: i === 'B'
                        ? 'linear-gradient(135deg, rgb(196 154 255) 0%, rgb(91 140 255) 100%)'
                        : 'rgba(165,195,255,0.20)',
                      color: i === 'B' ? 'rgb(255 255 255)' : 'rgb(220 230 250)',
                    }}
                  >
                    {i}
                  </span>
                ))}
              </div>
              <div className="text-[10.5px] text-text-dim mt-1 font-mono">4 teams + Bella</div>
            </div>
          </div>

          {/* Body — 2x2 grid of panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">

            {/* Overview + Ownership */}
            <RecordSection
              icon={Crown}
              label="Ownership"
              tint="rgb(255 196 99)"
            >
              <ul className="space-y-2.5">
                {OWNERSHIP.map((o) => (
                  <li key={o.label}>
                    <div className="flex items-center justify-between text-[12px] mb-1">
                      <span className="text-text">{o.label}</span>
                      <span className="text-text font-semibold tabular-nums">{o.pct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden bg-card/40">
                      <div
                        className="h-full rounded-full"
                        style={{ width: o.pct + '%', background: o.tint }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-[11px] text-text-dim leading-relaxed">
                Family-office LP wants liquidity in 12&ndash;18 months &mdash;
                surfaced from a public LP statement, attached to the record.
              </div>
            </RecordSection>

            {/* Decision unit */}
            <RecordSection
              icon={Users}
              label="Decision unit"
              tint="rgb(91 140 255)"
            >
              <ul className="space-y-2">
                {DECISION_UNIT.map((p) => (
                  <li
                    key={p.name}
                    className="rounded-lg border border-border/70 px-3 py-2"
                    style={{ background: 'rgba(255,255,255,0.01)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0"
                        style={{ background: 'rgba(91,140,255,0.14)', color: 'rgb(91 140 255)' }}
                      >
                        {p.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-semibold text-text leading-tight">{p.name}</div>
                        <div className="text-[10.5px] text-text-dim leading-tight">{p.role}</div>
                      </div>
                    </div>
                    <div className="mt-1 text-[11px] text-text-muted leading-snug">
                      {p.weight}
                    </div>
                  </li>
                ))}
              </ul>
            </RecordSection>

            {/* Live signals */}
            <RecordSection
              icon={Radar}
              label="Live signals"
              tint="rgb(196 154 255)"
            >
              <ul className="space-y-2">
                {LIVE_SIGNALS.map((s, i) => {
                  const meta = SIGNAL_META[s.kind];
                  const SIcon = meta.icon;
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <span
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0 mt-0.5"
                        style={{
                          background: meta.color.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
                          color:      meta.color,
                        }}
                      >
                        <SIcon size={12} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span
                            className="text-[9.5px] font-mono uppercase tracking-wider"
                            style={{ color: meta.color }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-[10px] text-text-dim font-mono">&middot;</span>
                          <span className="text-[10px] text-text-dim font-mono">{s.when}</span>
                        </div>
                        <div className="text-[12px] text-text leading-snug">{s.body}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 text-[11px] text-text-dim leading-relaxed">
                Bella subscribes the record to anything relevant; new
                signals attach automatically with full provenance.
              </div>
            </RecordSection>

            {/* Activity feed — Bella + members mixed */}
            <RecordSection
              icon={Activity}
              label="Activity feed"
              tint="rgb(111 207 151)"
            >
              <ul className="space-y-2">
                {ACTIVITY.map((a, i) => {
                  const isBella = a.actor === 'bella';
                  return (
                    <li key={i} className="flex items-start gap-3">
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5"
                        style={{
                          background: isBella
                            ? 'linear-gradient(135deg, rgb(196 154 255) 0%, rgb(91 140 255) 100%)'
                            : 'rgba(165,195,255,0.10)',
                          color: isBella ? 'rgb(255 255 255)' : 'rgb(165 195 255)',
                          boxShadow: isBella ? '0 4px 12px -4px rgba(196,154,255,0.45)' : 'none',
                        }}
                      >
                        {a.initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span
                            className="text-[12px] font-semibold leading-tight"
                            style={{ color: isBella ? 'rgb(196 154 255)' : 'rgb(220 230 250)' }}
                          >
                            {a.name}
                          </span>
                          {a.team && (
                            <span className="text-[10px] text-text-dim font-mono">&middot; {a.team}</span>
                          )}
                          <span className="text-[10px] text-text-dim font-mono">&middot; {a.when}</span>
                        </div>
                        <div className="text-[12px] text-text-muted leading-snug">{a.body}</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </RecordSection>

          </div>

          {/* Open deals on this account — strip */}
          <div className="border-t border-border px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
                Open on this account
              </span>
              {OPEN_DEALS_ON_ACCOUNT.map((d, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-[11px]"
                  style={{
                    color:       d.tint,
                    background:  d.tint.replace('rgb', 'rgba').replace(')', ' / 0.08)'),
                    borderColor: d.tint.replace('rgb', 'rgba').replace(')', ' / 0.30)'),
                  }}
                >
                  <span className="font-semibold">{d.team}</span>
                  <span className="text-text-dim">&middot;</span>
                  <span className="text-text font-semibold tabular-nums">{d.value}</span>
                  <span className="text-text-dim">&middot;</span>
                  <span>{d.stage}</span>
                </span>
              ))}
            </div>
            <span className="text-[11px] text-text-dim font-mono">
              Same record, two teams, one source of truth.
            </span>
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Every fact above is cited &middot; click any line to see the underlying source
            </span>
            <span className="text-text-muted">
              Multiply by 191,000+ accounts &mdash; that&apos;s the workspace.
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. ThePipelineView — CENTERPIECE 2 — kanban-style pipeline
// ───────────────────────────────────────────────────────────────────────────

type PipelineDeal = {
  company:    string;
  value:      string;
  owner:      string;
  ageDays:    number;
  signal:     boolean;
};

type PipelineStage = {
  key:    string;
  label:  string;
  tint:   string;
  deals:  PipelineDeal[];
};

const PIPELINE: PipelineStage[] = [
  {
    key:   'engaged',
    label: 'Engaged',
    tint:  'rgb(165 195 255)',
    deals: [
      { company: 'Mwani Qatar',         value: 'QAR 510k', owner: 'AM', ageDays: 4,  signal: true  },
      { company: 'Barwa Real Estate',   value: 'QAR 340k', owner: 'MT', ageDays: 7,  signal: false },
      { company: 'Commercial Bank',     value: 'QAR 290k', owner: 'RA', ageDays: 11, signal: true  },
    ],
  },
  {
    key:   'qualified',
    label: 'Qualified',
    tint:  'rgb(91 140 255)',
    deals: [
      { company: 'Hamad Medical',       value: 'QAR 890k', owner: 'NR', ageDays: 14, signal: true  },
      { company: 'Industries Qatar',    value: 'QAR 1.05M',owner: 'AH', ageDays: 18, signal: false },
      { company: 'GWC Group',           value: 'QAR 620k', owner: 'AM', ageDays: 9,  signal: false },
    ],
  },
  {
    key:   'proposal',
    label: 'Proposal',
    tint:  'rgb(196 154 255)',
    deals: [
      { company: 'Lusail Construction', value: 'QAR 1.2M', owner: 'MT', ageDays: 21, signal: true  },
      { company: 'Doha Bank',           value: 'QAR 480k', owner: 'RA', ageDays: 26, signal: false },
    ],
  },
  {
    key:   'negotiation',
    label: 'Negotiation',
    tint:  'rgb(255 196 99)',
    deals: [
      { company: 'Qatar Energy Svcs',   value: 'QAR 750k', owner: 'AH', ageDays: 32, signal: true  },
      { company: 'Doha Health Network', value: 'QAR 620k', owner: 'NR', ageDays: 28, signal: true  },
    ],
  },
  {
    key:   'closed',
    label: 'Closed-won',
    tint:  'rgb(111 207 151)',
    deals: [
      { company: 'QTerminals',          value: 'QAR 420k', owner: 'AM', ageDays: 1,  signal: false },
      { company: 'Almuftah Group',      value: 'QAR 180k', owner: 'AM', ageDays: 3,  signal: false },
    ],
  },
];

function ThePipelineView() {
  const totalDeals = PIPELINE.reduce((acc, s) => acc + s.deals.length, 0);
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The pipeline view
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Every deal, every stage, on the same graph.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Khaleej&apos;s Sales pipeline. Each card opens the full
            account record above &mdash; same data, no synchronisation,
            no copy-paste between systems. Live-signal indicators
            surface accounts that have moved while you were sleeping.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="rounded-2xl border border-border overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          }}
        >
          {/* Header bar */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-dim">
              <GitBranch size={11} className="text-accent-bright" />
              Pipeline &middot; Sales team &middot; Khaleej Group
            </span>
            <span className="text-text-dim text-[11px]">&middot;</span>
            <span className="text-[10.5px] text-text-dim">
              {totalDeals} active deals &middot; 5 stages &middot; updated by Bella in real time
            </span>
            <div className="flex-1" />
            <span className="text-[10px] text-text-dim font-mono">
              <Radar size={10} className="inline-block mr-1 mb-0.5 text-[rgb(255_196_99)]" />
              live-signal indicator on cards
            </span>
          </div>

          {/* Kanban columns */}
          <div className="overflow-x-auto">
            <div className="min-w-[820px] grid grid-cols-5 divide-x divide-border">
              {PIPELINE.map((stage, si) => (
                <PipelineColumn key={stage.key} stage={stage} index={si} />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px] flex-wrap"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Every card is a record &middot; every record is a graph node &middot; every action is logged
            </span>
            <span className="text-text-muted">
              The other four teams have their own boards. Same accounts, different stages.
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function PipelineColumn({ stage, index }: { stage: PipelineStage; index: number }) {
  const dealTotal = stage.deals.reduce((acc, d) => {
    const n = parseFloat(d.value.replace(/[^\d.]/g, '')) * (d.value.includes('M') ? 1000 : 1);
    return acc + (isNaN(n) ? 0 : n);
  }, 0);
  const totalLabel = dealTotal >= 1000
    ? 'QAR ' + (dealTotal / 1000).toFixed(1) + 'M'
    : 'QAR ' + Math.round(dealTotal) + 'k';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="p-3 flex flex-col gap-2"
    >
      {/* Stage header */}
      <div className="px-1 py-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: stage.tint }}
            aria-hidden="true"
          />
          <span
            className="text-[10.5px] font-semibold uppercase tracking-wider"
            style={{ color: stage.tint }}
          >
            {stage.label}
          </span>
          <span className="text-[10px] text-text-dim font-mono">{stage.deals.length}</span>
        </div>
        <span className="text-[10px] text-text-dim font-mono tabular-nums">{totalLabel}</span>
      </div>

      {/* Deal cards */}
      <div className="space-y-2">
        {stage.deals.map((deal, i) => (
          <DealCard key={i} deal={deal} stageTint={stage.tint} />
        ))}
      </div>
    </motion.div>
  );
}

function DealCard({ deal, stageTint }: { deal: PipelineDeal; stageTint: string }) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      className="rounded-lg border p-3 cursor-default"
      style={{
        background:  'rgba(255,255,255,0.02)',
        borderColor: 'rgba(255,255,255,0.06)',
      }}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="text-[12.5px] font-semibold text-text leading-tight">{deal.company}</div>
        {deal.signal && (
          <span
            className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0"
            style={{ background: 'rgba(255,196,99,0.14)', color: 'rgb(255 196 99)' }}
            title="Live signal on this account"
            aria-label="Live signal"
          >
            <Radar size={9} />
          </span>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-text font-semibold tabular-nums" style={{ color: stageTint }}>
          {deal.value}
        </span>
        <span className="text-text-dim font-mono">{deal.ageDays}d</span>
      </div>
      <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center justify-center w-5 h-5 rounded-md text-[9px] font-semibold"
            style={{ background: 'rgba(165,195,255,0.10)', color: 'rgb(165 195 255)' }}
          >
            {deal.owner}
          </span>
          <span className="text-[10px] text-text-dim">owns</span>
        </div>
        <ChevronRight size={11} className="text-text-dim" />
      </div>
    </motion.div>
  );
}

// ── Shared helper ──────────────────────────────────────────────────────────

function RecordSection({
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
        >
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. RecordsThatUpdate — auto-enrichment story
//    Shows the last 30 days of automatic updates to one record.
//    Every update is signal-driven and cited.
// ───────────────────────────────────────────────────────────────────────────

type UpdateSource =
  | 'moci' | 'press' | 'lp-statement' | 'industry-report'
  | 'linkedin' | 'news' | 'regulatory';

const UPDATE_SOURCE_META: Record<UpdateSource, { label: string; icon: React.ComponentType<{ size?: number | string }>; color: string }> = {
  moci:             { label: 'MoCI filing',       icon: Scroll,    color: 'rgb(91 140 255)'  },
  press:            { label: 'Press release',     icon: Newspaper, color: 'rgb(255 196 99)'  },
  'lp-statement':   { label: 'LP statement',      icon: FileText,  color: 'rgb(196 154 255)' },
  'industry-report':{ label: 'Industry report',   icon: BadgeCheck,color: 'rgb(165 195 255)' },
  linkedin:         { label: 'LinkedIn',          icon: Linkedin,  color: 'rgb(91 140 255)'  },
  news:             { label: 'News article',      icon: Newspaper, color: 'rgb(255 196 99)'  },
  regulatory:       { label: 'Regulatory filing', icon: ShieldCheck,color: 'rgb(111 207 151)' },
};

type AutoUpdate = {
  when:   string;
  source: UpdateSource;
  field:  string;
  before: string;
  after:  string;
};

const AUTO_UPDATES: AutoUpdate[] = [
  {
    when:   '6 days ago',
    source: 'lp-statement',
    field:  'Live signal added',
    before: '—',
    after:  'Family-office LP liquidity preference, 12–18 month horizon',
  },
  {
    when:   '2 weeks ago',
    source: 'moci',
    field:  'Decision unit · CFO',
    before: 'Vacant',
    after:  'Yousef Al-Mannai (ex-QNB)',
  },
  {
    when:   '2 weeks ago',
    source: 'press',
    field:  'Ownership · 5% bucket',
    before: 'Unidentified strategic minority',
    after:  'Strategic minority partner — named, link attached',
  },
  {
    when:   '3 weeks ago',
    source: 'industry-report',
    field:  'Employee count',
    before: '~350',
    after:  '380',
  },
  {
    when:   '3 weeks ago',
    source: 'linkedin',
    field:  'Decision unit · Board',
    before: '3 known members',
    after:  '4 known members (Layla Hassan added)',
  },
  {
    when:   '4 weeks ago',
    source: 'moci',
    field:  'Sector tag',
    before: 'Healthcare',
    after:  'Healthcare · private clinic operator',
  },
  {
    when:   '5 weeks ago',
    source: 'news',
    field:  'Live signal added',
    before: '—',
    after:  'New clinic capacity expansion in West Bay announced',
  },
];

function RecordsThatUpdate() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Differentiator &middot; auto-enrichment
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Records that keep themselves current.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            While Khaleej&apos;s team slept, Bella updated this record
            seven times this month. Every change came from a public
            source on the Bell.qa graph. Every change carries a
            citation.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="rounded-2xl border border-border overflow-hidden max-w-5xl mx-auto"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
          }}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 text-text"
                style={{
                  background: 'linear-gradient(135deg, rgb(91 140 255) 0%, rgb(165 195 255) 100%)',
                }}
              >
                <Building2 size={15} />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold text-text leading-tight">
                  Doha Health Network &middot; last 30 days
                </div>
                <div className="text-[11px] text-text-dim mt-0.5 font-mono">
                  Same record from above &middot; auto-enrichment log
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
                style={{
                  color:       'rgb(111 207 151)',
                  background:  'rgba(111,207,151,0.10)',
                  borderColor: 'rgba(111,207,151,0.30)',
                }}
              >
                <RefreshCw size={9} />
                7 auto-updates
              </span>
              <span
                className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
                style={{
                  color:       'rgb(255 196 99)',
                  background:  'rgba(255,196,99,0.10)',
                  borderColor: 'rgba(255,196,99,0.30)',
                }}
              >
                0 manual edits
              </span>
            </div>
          </div>

          {/* Update rows */}
          <div>
            {AUTO_UPDATES.map((u, i) => (
              <UpdateRow key={i} update={u} index={i} last={i === AUTO_UPDATES.length - 1} />
            ))}
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Every row above is a source on the Bell.qa graph
            </span>
            <span className="text-text-muted">
              Multiply by 191,000+ accounts updating in parallel.
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function UpdateRow({
  update, index, last,
}: { update: AutoUpdate; index: number; last: boolean }) {
  const src = UPDATE_SOURCE_META[update.source];
  const SIcon = src.icon;
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className={
        'px-5 py-4 md:px-6 md:py-4 grid grid-cols-12 gap-4 items-start ' +
        (last ? '' : 'border-b border-border')
      }
    >
      {/* When + source */}
      <div className="col-span-12 md:col-span-3 flex items-start gap-3 min-w-0">
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0 mt-0.5"
          style={{
            background: src.color.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      src.color,
          }}
        >
          <SIcon size={13} />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-text leading-tight">
            {update.when}
          </div>
          <div
            className="text-[10.5px] font-mono uppercase tracking-wider mt-0.5"
            style={{ color: src.color }}
          >
            {src.label}
          </div>
        </div>
      </div>

      {/* Field */}
      <div className="col-span-12 md:col-span-3 text-[12.5px] text-text font-medium leading-snug">
        {update.field}
      </div>

      {/* Before → After */}
      <div className="col-span-12 md:col-span-6 flex items-center gap-2 flex-wrap">
        <span
          className="text-[11.5px] text-text-dim line-through decoration-text-dim/50 font-mono px-2 py-0.5 rounded border border-border/60"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          {update.before}
        </span>
        <ArrowRight size={12} className="text-text-dim shrink-0" />
        <span
          className="text-[11.5px] text-text font-medium px-2 py-0.5 rounded border"
          style={{
            background:  'rgba(111,207,151,0.08)',
            borderColor: 'rgba(111,207,151,0.28)',
          }}
        >
          {update.after}
        </span>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. BellaInsideRecords — six capability cards
//    Bella isn't a sidebar; she's part of the record itself.
// ───────────────────────────────────────────────────────────────────────────

type BellaCapability = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  body:    string;
  example: string;
  tint:    string;
};

const BELLA_CAPABILITIES: BellaCapability[] = [
  {
    icon:    PencilLine,
    label:   'Drafts',
    body:    "Outbound emails, openers, follow-ups — written from the full record context, not a blank page.",
    example: "Drafted the opener for the Marsa managing-partner intro to Dr. Aisha.",
    tint:    'rgb(91 140 255)',
  },
  {
    icon:    Activity,
    label:   'Logs',
    body:    "Meeting notes, call summaries, voice transcripts — into the activity feed, attached to the right people.",
    example: "Logged the 38-minute call with Yousef (CFO) as a 5-line summary.",
    tint:    'rgb(111 207 151)',
  },
  {
    icon:    Layers,
    label:   'Summarizes',
    body:    "Turns a 50-message thread or a six-month engagement into a three-line top-of-record summary.",
    example: "Compressed 47 days of engagement history into 3 bullets at the top.",
    tint:    'rgb(196 154 255)',
  },
  {
    icon:    Sparkles,
    label:   'Surfaces next move',
    body:    "Reads the signals, the activity, the deal stage — and recommends what to do next, on the record.",
    example: "Recommended: schedule second meeting via the Marsa managing partner.",
    tint:    'rgb(255 196 99)',
  },
  {
    icon:    GitBranch,
    label:   'Routes',
    body:    "When the right team for a record changes, Bella hands it off with every email, note, and signal attached.",
    example: "Handed Doha Health Network to BD — full context, zero loss at the seam.",
    tint:    'rgb(165 195 255)',
  },
  {
    icon:    MessageSquare,
    label:   'Answers',
    body:    "Natural-language Q&A on the record — by the team, on any field, with the source linked back.",
    example: "Asked: &ldquo;When did Yousef join?&rdquo; → CFO since 14 months ago, hired from QNB.",
    tint:    'rgb(232 142 168)',
  },
];

function BellaInsideRecords() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Differentiator &middot; Bella as a native participant
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Bella isn&apos;t a sidebar. She&apos;s inside the record.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Where most CRMs bolt AI on as a chat panel, Bella is part
            of the record itself. She drafts, logs, summarizes, routes,
            surfaces, answers &mdash; every action attaches to the
            record&apos;s audit trail, cited and reversible.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BELLA_CAPABILITIES.map((cap, i) => (
            <BellaCapabilityCard key={cap.label} cap={cap} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function BellaCapabilityCard({ cap, index }: { cap: BellaCapability; index: number }) {
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
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg"
            style={{
              background: cap.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
              color:      cap.tint,
            }}
          >
            <Icon size={15} />
          </span>
          <span
            className="inline-flex items-center gap-1 text-[9.5px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(196,154,255,0.10)',
              color:      'rgb(196 154 255)',
            }}
          >
            <Bot size={9} />
            Bella
          </span>
        </div>

        <div>
          <div className="text-[15px] font-semibold text-text leading-snug">
            {cap.label}
          </div>
          <p className="mt-1 text-[12.5px] text-text-muted leading-relaxed">
            {cap.body}
          </p>
        </div>
      </div>

      {/* Example chip */}
      <div
        className="px-5 py-3 border-t border-border text-[11.5px] text-text-muted leading-snug italic"
        style={{ background: 'rgba(255,255,255,0.015)' }}
      >
        <span
          className="text-[9.5px] font-mono uppercase tracking-wider not-italic mr-2"
          style={{ color: cap.tint }}
        >
          On Doha Health Network &middot;
        </span>
        <span dangerouslySetInnerHTML={{ __html: cap.example }} />
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. TeamScopes — same record, different lenses per team
//    Explicit bridge back to the Team page.
// ───────────────────────────────────────────────────────────────────────────

type TeamLens = {
  team:    string;
  href:    string;
  icon:    React.ComponentType<{ size?: number | string }>;
  tint:    string;
  lead:    string;
  sees:    { label: string; value: string }[];
};

const TEAM_LENSES: TeamLens[] = [
  {
    team: 'Sales',
    href: '/platform/sales',
    icon: Target,
    tint: 'rgb(91 140 255)',
    lead: 'Noora Al-Rumaihi',
    sees: [
      { label: 'Deal value',     value: 'QAR 620k'       },
      { label: 'Stage',          value: 'Negotiation' },
      { label: 'Last activity',  value: '4h ago'      },
      { label: 'Next move',      value: 'Schedule 2nd meeting' },
    ],
  },
  {
    team: 'BD',
    href: '/platform/business-development',
    icon: Handshake,
    tint: 'rgb(196 154 255)',
    lead: 'Maryam Al-Suwaidi',
    sees: [
      { label: 'Ownership map',  value: '4 stakeholders' },
      { label: 'Decision unit',  value: '4 named'        },
      { label: 'Warm paths',     value: '3 mapped'       },
      { label: 'M&A signal',     value: 'LP liquidity ▲' },
    ],
  },
  {
    team: 'Marketing',
    href: '/platform/marketing',
    icon: Megaphone,
    tint: 'rgb(255 196 99)',
    lead: 'Hessa Al-Sulaiti',
    sees: [
      { label: 'ABM score',      value: '87 / 100'    },
      { label: 'Touches',        value: '3 this month'},
      { label: 'Content opened', value: '4 pieces'    },
      { label: 'Trigger fired',  value: 'CFO change'  },
    ],
  },
  {
    team: 'Research',
    href: '/platform/research',
    icon: Microscope,
    tint: 'rgb(111 207 151)',
    lead: 'Fatima Al-Nuaimi',
    sees: [
      { label: 'Deep-dive',      value: 'Delivered'   },
      { label: 'Sections',       value: '12'          },
      { label: 'Citations',      value: '142'         },
      { label: 'Source classes', value: '6 pulled'    },
    ],
  },
  {
    team: 'GTM',
    href: '/platform/gtm',
    icon: Rocket,
    tint: 'rgb(165 195 255)',
    lead: 'Sami Al-Kuwari',
    sees: [
      { label: 'Sector cell',    value: 'Healthcare × SI' },
      { label: 'Sector heat',    value: 'Hot'         },
      { label: 'Regulator',      value: 'MoPH live'   },
      { label: 'Cluster',        value: 'West Bay'    },
    ],
  },
];

function TeamScopes() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            One record, five lenses
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Same Doha Health Network. Five different views.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The CRM record doesn&apos;t change. The lens does. Sales
            sees the deal; BD sees the ownership; Marketing sees the
            engagement; Research sees the citation chain; GTM sees the
            market position. One source of truth, five framings of
            it. The mechanism that makes this possible is{' '}
            <Link href="/platform/team" className="text-accent-bright hover:text-text transition-colors underline decoration-accent-bright/30 underline-offset-2">
              Team
            </Link>
            .
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {TEAM_LENSES.map((lens, i) => (
            <TeamLensCard key={lens.team} lens={lens} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function TeamLensCard({ lens, index }: { lens: TeamLens; index: number }) {
  const Icon = lens.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        borderColor: lens.tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
      }}
    >
      {/* Header — team name */}
      <div
        className="px-4 py-3 border-b flex items-center gap-2"
        style={{
          background:  lens.tint.replace('rgb', 'rgba').replace(')', ' / 0.06)'),
          borderColor: lens.tint.replace('rgb', 'rgba').replace(')', ' / 0.20)'),
        }}
      >
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-md"
          style={{
            background: lens.tint.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
            color:      lens.tint,
          }}
        >
          <Icon size={12} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold leading-tight" style={{ color: lens.tint }}>
            {lens.team}
          </div>
          <div className="text-[9.5px] text-text-dim leading-tight font-mono">
            via {lens.lead}
          </div>
        </div>
        <Eye size={11} className="text-text-dim shrink-0" />
      </div>

      {/* What this lens sees */}
      <ul className="p-4 space-y-2 flex-1">
        {lens.sees.map((s) => (
          <li
            key={s.label}
            className="flex items-baseline justify-between gap-3 text-[11.5px] leading-tight"
          >
            <span className="text-text-dim">{s.label}</span>
            <span className="text-text font-semibold text-right">{s.value}</span>
          </li>
        ))}
      </ul>

      {/* Footer link */}
      <Link
        href={lens.href}
        className="group px-4 py-2.5 border-t border-border/60 text-[11px] font-semibold inline-flex items-center justify-between hover:bg-card/30 transition-colors"
        style={{ color: lens.tint }}
      >
        <span>Explore {lens.team}</span>
        <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. ConnectedToPlatform — the surfaces CRM connects to
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
    icon:  Users,
    label: 'Team',
    href:  '/platform/team',
    body:  "The other workspace surface. Team decides who can see and act on what; CRM is what they see and act on. Same workspace, complementary scopes.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Bot,
    label: 'Bella',
    href:  '/platform/bella',
    body:  "Lives inside every record &mdash; drafting, logging, summarizing, surfacing, routing, answering. Every action attaches to the record&apos;s audit trail.",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  "Every signal Bell.qa picks up auto-attaches to the right account record. New filings, leadership changes, market moves &mdash; on the record by the time the team logs in.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "Forecasts at the record level: deal close probability, account churn risk, next-best signal. Surfaced directly on the record, not in a separate report.",
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  "Geographic dimension on the CRM. Every account is a node on Doha. Cluster, filter, route &mdash; all from the same records that drive the pipeline.",
    tint:  'rgb(165 195 255)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What the CRM plugs into
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The CRM doesn&apos;t end at the record edge.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Every record is connected outward to the rest of the
            platform. Team scopes it. Bella works it. Signals attach to
            it. Prediction forecasts on it. Map renders it. One graph,
            five surfaces.
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
// 9. MidPageCta — Get Access band
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
                You&apos;ve seen Khaleej&apos;s CRM
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now put yours on the only CRM pre-loaded with Qatar.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your accounts, contacts, and pipeline are
                live the same day.
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
// 10. OtherFunctions — cross-links to the five function pages
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
            What runs on top of the CRM
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The five teams that work the records.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Each function has its own surface and its own story.
            They all open the same records, write to the same pipeline,
            and pass the same handoffs &mdash; because there&apos;s
            only one CRM.
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
// 11. ThreeReader — rev ops / leader / exec
// ───────────────────────────────────────────────────────────────────────────

const CRM_READERS = [
  {
    icon:  Settings,
    label: 'For the revenue-ops admin',
    body:  "No data import. No deduplication backlog. No custom fields to bolt on. The 191,000+ Qatari companies are already in the database. Bella keeps them current. You configure scopes &mdash; not pipelines.",
  },
  {
    icon:  Crown,
    label: 'For the head of revenue',
    body:  "Every team works the same accounts. Every record carries its own citation. Forecasting reads the live signal stream, not the rep&apos;s gut. Pipeline health is a query, not a quarterly exercise.",
  },
  {
    icon:  BadgeCheck,
    label: 'For the executive sponsor',
    body:  "Your revenue org isn&apos;t spread across five tools and three spreadsheets. It&apos;s one CRM on one graph. Every dollar of pipeline, every account, every action &mdash; one source of truth, defensible end to end.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same CRM
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes for the revenue stack.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {CRM_READERS.map((r, i) => {
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
// 12. FinalCta — closing Get Access block
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
          Put your revenue stack on Bell.qa.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          The CRM that came pre-loaded with Qatar. Records that keep
          themselves current. Bella inside every one of them. Five
          teams working the same accounts. One source of truth.
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

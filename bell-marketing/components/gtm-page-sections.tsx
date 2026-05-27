'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Rocket, ArrowRight, MapPin, Flag, Building2, Ship,
  Wrench, HeartPulse, Coins, HardHat, Users, Handshake,
  Flame, Snowflake, Sparkles, Network, ShieldCheck, Calendar,
  BadgeCheck, Compass, Briefcase, Microscope, Megaphone,
  Target, Bot, Map as MapIcon, Inbox, BrainCircuit, Radar,
  TrendingUp, CalendarClock, Check, BarChart3, Crown,
  Building, Globe, FileSearch, ListChecks, Layers,
} from 'lucide-react';

/**
 * GTM PAGE — section-by-section build.
 *
 * Concept: The Market Entry Map. A 2D matrix of sectors x channels
 * showing where signal, supply, and channel-fit converge — the place
 * a foreign company starts when entering Qatar. Distinct from Sales
 * (day timeline), Marketing (trigger gallery), BD (watchlist),
 * Research (research console).
 *
 * Persona: Sarah Chen, Head of Qatar at a German industrial-software
 * firm. Landed in Doha six weeks ago. Mandate: a market entry that
 * pays for itself within four quarters.
 *
 * Anchor narrative: foreign company entering Qatar. The other two
 * GTM motions (Qatari company expanding to GCC, new product launch
 * in Qatar) get acknowledged in copy + surface in the leader-view.
 *
 * Time scale: per market entry, multi-quarter (longest arc on the
 * platform — Sales=day, Marketing=weeks, BD=quarter, Research=
 * per-deliverable, GTM=multi-quarter).
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. GtmHero               — "Enter Qatar."
 *     2. GtmActivityBar        — multi-quarter entry stats
 *     3. MeetSarah             — persona intro
 *     4. MarketEntryMap        — CENTERPIECE — 6 sectors x 4 channels
 *     5. OneQuadrantUnpacked   — drill-down: Logistics x SI
 *
 *   ROUND 2+ (to be added):
 *     6. SarahsMarketEntry     — multi-quarter KPI strip
 *     7. LeaderPivot           — entry-team → portfolio
 *     8. EntryPlaybook         — leader-data: three GTM motions
 *     9. GtmComparison         — Without vs With Bell.qa
 *    10. ConnectedToPlatform   — cross-link tiles
 *    11. MidPageCta
 *    12. OtherFunctions        — Sales / Marketing / BD / Research
 *    13. ThreeReader           — Entry lead / HQ / Board
 *    14. FinalCta
 */

export function GtmPageSections() {
  return (
    <>
      <GtmHero />
      <GtmActivityBar />
      <MeetSarah />
      <MarketEntryMap />
      <OneQuadrantUnpacked />
      <SarahsMarketEntry />
      <LeaderPivot />
      <EntryPlaybook />
      <GtmComparison />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. GtmHero — opening band
// ───────────────────────────────────────────────────────────────────────────

function GtmHero() {
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
            <Rocket size={12} className="text-accent-bright" />
            <span>For go-to-market</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">Enter Qatar.</span>
            <br />
            <span className="text-text">Don&apos;t guess it.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            The right sectors. The right channels. The right partners.
            The right first hundred accounts. Bell.qa turns market entry
            from a six-month listening tour into a quarter-by-quarter
            plan against a graph of the country&apos;s economy.
          </p>
          <p className="mt-4 text-[13.5px] text-text-dim leading-relaxed max-w-2xl">
            Works the same for Qatari companies expanding into the GCC
            and for new products being launched into the Qatari market
            &mdash; same primitives, different orientation.
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
// 2. GtmActivityBar — cycling multi-quarter entry stats
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Sectors evaluated',     value: '6',    sub: 'across the Qatari economy' },
  { label: 'Channels mapped',       value: '4',    sub: 'direct, SI, gov, events'   },
  { label: 'Target accounts surfaced', value: '247', sub: 'inside the priority cells' },
  { label: 'Partner shortlist drawn', value: '11',  sub: 'system integrators + agents' },
  { label: 'Quarters from kickoff to scale', value: '4', sub: 'Sarah is two quarters in' },
];

function GtmActivityBar() {
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
              Sarah&apos;s entry &middot; live on Bell.qa
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
// 3. MeetSarah — persona intro card
// ───────────────────────────────────────────────────────────────────────────

function MeetSarah() {
  return (
    <section className="relative py-20 md:py-24">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Meet your protagonist
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Sarah landed in Doha six weeks ago. Her plan ships next week.
          </h2>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mx-auto rounded-2xl border border-border overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
          }}
        >
          <div className="p-7 md:p-9 grid grid-cols-1 md:grid-cols-[auto,1fr] gap-7 items-start">
            <div
              className="w-20 h-20 rounded-xl flex items-center justify-center text-2xl font-semibold text-text shrink-0"
              style={{
                background:
                  'linear-gradient(135deg, rgb(255 196 99) 0%, rgb(111 207 151) 100%)',
                boxShadow: '0 12px 32px -8px rgba(255,196,99,0.4)',
              }}
            >
              SC
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2.5">
                <div className="text-xl font-semibold text-text">
                  Sarah Chen
                </div>
                <div className="text-[12px] text-text-dim font-mono">
                  Head of Qatar &middot; German industrial-software firm
                </div>
              </div>
              <p className="text-[14.5px] text-text-muted leading-relaxed">
                Stuttgart for ten years on industrial-control software,
                Singapore for four building APAC. Landed in Doha six
                weeks ago with a four-quarter mandate and no rolodex.
                The first deliverable: a market-entry plan that knows
                where to play, how to reach it, and who to reach first.
              </p>
              <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <PersonaStat label="Weeks in country"   value="6" />
                <PersonaStat label="Local hires"        value="0" sub="just her" />
                <PersonaStat label="Quarter target"     value="Q3" sub="entry ready" />
                <PersonaStat label="Days to plan ship" value="9" sub="vs the old 90" />
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function PersonaStat({
  label, value, sub,
}: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/40 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold text-text leading-none tabular-nums">
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[10.5px] text-text-dim leading-tight">{sub}</div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. MarketEntryMap — CENTERPIECE
//    A 6-sector x 4-channel matrix. Each cell shows demand strength,
//    target account count. The hot cells (where to start) get
//    highlighted with a green border and a "start here" badge.
// ───────────────────────────────────────────────────────────────────────────

type CellHeat = 'hot' | 'warm' | 'cool';

type Sector = {
  key:   string;
  label: string;
  icon:  React.ComponentType<{ size?: number | string }>;
  note:  string;
};

const SECTORS: Sector[] = [
  { key: 'energy',   label: 'Energy & utilities',         icon: Flame,     note: 'QatarEnergy ecosystem'       },
  { key: 'logistics',label: 'Logistics & ports',          icon: Ship,      note: 'Mwani, QTerminals, Milaha'   },
  { key: 'smartcity',label: 'Smart cities & construction',icon: HardHat,   note: 'Lusail, QF, Vision 2030'     },
  { key: 'manufact', label: 'Manufacturing',              icon: Wrench,    note: 'Diversification push'        },
  { key: 'health',   label: 'Healthcare',                 icon: HeartPulse,note: 'Hamad + private network'     },
  { key: 'finance',  label: 'Financial services',         icon: Coins,     note: 'QFC ecosystem, banks'        },
];

type Channel = {
  key:   string;
  label: string;
  short: string;
  icon:  React.ComponentType<{ size?: number | string }>;
};

const CHANNELS: Channel[] = [
  { key: 'direct',   label: 'Direct sales',          short: 'Direct', icon: Briefcase  },
  { key: 'si',       label: 'System integrators',    short: 'SI',     icon: Handshake  },
  { key: 'gov',      label: 'Government procurement',short: 'Gov',    icon: Building   },
  { key: 'events',   label: 'Industry events',       short: 'Events', icon: Megaphone  },
];

type Cell = { heat: CellHeat; count: number; start?: boolean };

const CELLS: Record<string, Record<string, Cell>> = {
  energy: {
    direct: { heat: 'hot',  count: 15 },
    si:     { heat: 'warm', count: 8  },
    gov:    { heat: 'hot',  count: 24, start: true },
    events: { heat: 'warm', count: 12 },
  },
  logistics: {
    direct: { heat: 'warm', count: 12 },
    si:     { heat: 'hot',  count: 38, start: true },
    gov:    { heat: 'warm', count: 9  },
    events: { heat: 'cool', count: 6  },
  },
  smartcity: {
    direct: { heat: 'cool', count: 5  },
    si:     { heat: 'warm', count: 14 },
    gov:    { heat: 'hot',  count: 28, start: true },
    events: { heat: 'warm', count: 16 },
  },
  manufact: {
    direct: { heat: 'warm', count: 22 },
    si:     { heat: 'cool', count: 4  },
    gov:    { heat: 'cool', count: 3  },
    events: { heat: 'warm', count: 18 },
  },
  health: {
    direct: { heat: 'cool', count: 8  },
    si:     { heat: 'warm', count: 11 },
    gov:    { heat: 'warm', count: 9  },
    events: { heat: 'cool', count: 5  },
  },
  finance: {
    direct: { heat: 'cool', count: 4  },
    si:     { heat: 'cool', count: 3  },
    gov:    { heat: 'cool', count: 2  },
    events: { heat: 'warm', count: 14 },
  },
};

const HEAT_META: Record<CellHeat, { label: string; color: string; bg: string; ring: string }> = {
  hot: {
    label: 'Hot',
    color: 'rgb(111 207 151)',
    bg:    'rgba(111,207,151,0.10)',
    ring:  'rgba(111,207,151,0.32)',
  },
  warm: {
    label: 'Warm',
    color: 'rgb(255 196 99)',
    bg:    'rgba(255,196,99,0.08)',
    ring:  'rgba(255,196,99,0.22)',
  },
  cool: {
    label: 'Cool',
    color: 'rgb(140 156 196)',
    bg:    'rgba(140,156,196,0.06)',
    ring:  'rgba(140,156,196,0.18)',
  },
};

function MarketEntryMap() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The market-entry map
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Six sectors, four channels, three places to start.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Bell crosses every sector Sarah might serve with every
            channel she could go through. Each cell carries demand
            signal, target account count, and a recommendation.
            Three cells in green are where signal, supply, and channel
            fit converge &mdash; that&apos;s where the entry starts.
          </p>
        </div>

        {/* Legend */}
        <div className="mb-4 flex flex-wrap items-center justify-center gap-4 text-[11px] text-text-dim">
          <LegendChip heat="hot"  text="Hot &middot; start here" />
          <LegendChip heat="warm" text="Warm &middot; build later" />
          <LegendChip heat="cool" text="Cool &middot; deprioritize" />
        </div>

        {/* Matrix */}
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
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">

              {/* Header row */}
              <div
                className="grid border-b border-border"
                style={{ gridTemplateColumns: '240px repeat(4, 1fr)' }}
              >
                <div className="p-4 text-[10px] font-semibold uppercase tracking-wider text-text-dim border-r border-border flex items-center gap-2">
                  <Layers size={11} />
                  Sector &times; Channel
                </div>
                {CHANNELS.map((ch) => {
                  const CIcon = ch.icon;
                  return (
                    <div
                      key={ch.key}
                      className="p-4 text-center border-r border-border last:border-r-0"
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <span
                          className="inline-flex items-center justify-center w-7 h-7 rounded-md text-text-muted"
                          style={{ background: 'rgba(255,255,255,0.04)' }}
                        >
                          <CIcon size={13} />
                        </span>
                        <span className="text-[11.5px] font-semibold text-text leading-tight">
                          {ch.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Body rows */}
              {SECTORS.map((sec, si) => {
                const SIcon = sec.icon;
                return (
                  <motion.div
                    key={sec.key}
                    initial={{ opacity: 0, y: 6 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.4, delay: si * 0.04 }}
                    className={
                      'grid ' +
                      (si < SECTORS.length - 1 ? 'border-b border-border' : '')
                    }
                    style={{ gridTemplateColumns: '240px repeat(4, 1fr)' }}
                  >
                    {/* Sector label */}
                    <div className="p-4 border-r border-border flex items-start gap-3">
                      <span
                        className="inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0 text-accent-bright"
                        style={{ background: 'rgba(91,140,255,0.10)' }}
                      >
                        <SIcon size={14} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-text leading-tight">
                          {sec.label}
                        </div>
                        <div className="text-[10.5px] text-text-dim mt-0.5 leading-snug">
                          {sec.note}
                        </div>
                      </div>
                    </div>

                    {/* Cells */}
                    {CHANNELS.map((ch) => {
                      const cell = CELLS[sec.key][ch.key];
                      const heat = HEAT_META[cell.heat];
                      return (
                        <div
                          key={ch.key}
                          className="p-3 border-r border-border last:border-r-0 relative"
                          style={{ background: cell.start ? 'rgba(111,207,151,0.05)' : 'transparent' }}
                        >
                          <div
                            className="h-full rounded-lg border p-3 flex flex-col items-center justify-center gap-1.5 text-center transition-colors"
                            style={{
                              background:  heat.bg,
                              borderColor: cell.start ? heat.color : heat.ring,
                              boxShadow:   cell.start ? '0 0 0 1px ' + heat.color : 'none',
                            }}
                          >
                            <div
                              className="text-xl font-semibold tabular-nums leading-none"
                              style={{ color: heat.color }}
                            >
                              {cell.count}
                            </div>
                            <div className="text-[9.5px] uppercase tracking-wider text-text-dim font-semibold">
                              targets
                            </div>
                            <div
                              className="mt-1 inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider"
                              style={{ color: heat.color }}
                            >
                              {cell.heat === 'hot' && <Flame size={9} />}
                              {cell.heat === 'warm' && <Sparkles size={9} />}
                              {cell.heat === 'cool' && <Snowflake size={9} />}
                              <span>{heat.label}</span>
                            </div>
                            {cell.start && (
                              <div
                                className="absolute -top-2 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap"
                                style={{
                                  background:  'rgb(13 18 35)',
                                  color:       heat.color,
                                  border:      '1px solid ' + heat.color,
                                }}
                              >
                                <Flag size={8} />
                                Start here
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px] flex-wrap"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              247 target accounts across all priority cells &middot; refreshed quarterly by Bella
            </span>
            <span className="text-text-muted">
              Cell counts updated as demand signals shift on the graph.
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function LegendChip({ heat, text }: { heat: CellHeat; text: string }) {
  const meta = HEAT_META[heat];
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className="inline-block w-3 h-3 rounded-sm"
        style={{ background: meta.bg, border: '1px solid ' + meta.ring }}
        aria-hidden="true"
      />
      <span dangerouslySetInnerHTML={{ __html: text }} />
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. OneQuadrantUnpacked — drill-down on Logistics & ports x System integrators
// ───────────────────────────────────────────────────────────────────────────

const SI_PARTNERS = [
  {
    name:     'Mannai Corporation',
    rationale:"Qatar's largest IT integrator. Twenty-year SAP and Microsoft track record across logistics and ports.",
    fit:      'Tier-1 partner',
    color:    'rgb(111 207 151)',
  },
  {
    name:     'Qatar Computer Services',
    rationale:'Public-sector strong, including Mwani Qatar. Long-tenured engineering bench for OT/IT integration.',
    fit:      'Tier-1 partner',
    color:    'rgb(111 207 151)',
  },
  {
    name:     'Logix Qatar',
    rationale:'Specialist logistics-tech integrator. Smaller, faster, deeper sector knowledge.',
    fit:      'Specialist partner',
    color:    'rgb(255 196 99)',
  },
];

const FIRST_TEN_ACCOUNTS = [
  'Milaha (Qatar Navigation)',
  'QTerminals',
  'Mwani Qatar',
  'GWC Group',
  'Agility Logistics Qatar',
  'Qatar Logistics & Storage',
  'Hamad Port Logistics',
  'Doha Free Zone Operators',
  'Qatari Diar Logistics',
  'Almuftah Group (logistics arm)',
];

const REG_PATH = [
  { label: 'MOCI commercial registration',     status: 'done',     note: 'Filed week 1, granted week 2'  },
  { label: 'QFC licence (financial-services optional)', status: 'skip', note: 'Not required for this entry' },
  { label: 'Data residency assessment',        status: 'done',     note: 'NDPL Article 18 cleared'       },
  { label: 'GTA tax registration',             status: 'inflight', note: 'In progress, expected week 9'  },
  { label: 'Sector-specific compliance review',status: 'pending',  note: 'Maritime + ports authority'    },
];

function OneQuadrantUnpacked() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            One quadrant, unpacked
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Logistics & ports <span className="text-text">&times;</span> System integrators.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Click any green cell on the map and Bell unpacks it. Here&apos;s
            what&apos;s inside Sarah&apos;s priority quadrant &mdash; the
            38 target accounts, the SI partner shortlist, the regulatory
            path, the ICP definition, and the first 10 names to engage.
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
          {/* Header */}
          <div className="px-6 py-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg shrink-0"
                style={{ background: 'rgba(111,207,151,0.14)', color: 'rgb(111 207 151)' }}
              >
                <Ship size={17} />
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-text leading-snug">
                  Logistics & ports &middot; via System integrators
                </div>
                <div className="text-[11.5px] text-text-dim mt-0.5 font-mono">
                  38 target accounts &middot; 3 SI partners shortlisted &middot; entry path drawn
                </div>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
              style={{
                color:       'rgb(111 207 151)',
                background:  'rgba(111,207,151,0.10)',
                borderColor: 'rgba(111,207,151,0.30)',
              }}
            >
              <Flag size={9} />
              Start here
            </span>
          </div>

          {/* Body — four panels in 2x2 grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">

            {/* ICP definition */}
            <UnpackedSection
              icon={Target}
              label="ICP &mdash; who fits"
              tint="rgb(91 140 255)"
            >
              <ul className="space-y-2.5">
                <IcpRow label="Operator profile" body="Mid-to-large logistics operator, 200&ndash;3,000 staff, multi-site footprint within Qatar." />
                <IcpRow label="Software maturity" body="Already on a TMS/WMS, looking to add real-time visibility, predictive maintenance, or yard automation." />
                <IcpRow label="Decision unit"     body="CIO/CTO as economic buyer. Head of Operations as technical champion. Procurement closes the loop." />
                <IcpRow label="Buying trigger"   body="A capacity expansion, a new terminal coming online, or a regulator-driven reporting requirement." />
              </ul>
            </UnpackedSection>

            {/* SI Partners */}
            <UnpackedSection
              icon={Handshake}
              label="Partners shortlisted"
              tint="rgb(255 196 99)"
            >
              <ul className="space-y-2.5">
                {SI_PARTNERS.map((p) => (
                  <li
                    key={p.name}
                    className="rounded-lg border border-border/70 px-3 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.01)' }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[13.5px] font-semibold text-text">{p.name}</span>
                      <span
                        className="text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap"
                        style={{
                          color:       p.color,
                          background:  p.color.replace('rgb', 'rgba').replace(')', ' / 0.10)'),
                          borderColor: p.color.replace('rgb', 'rgba').replace(')', ' / 0.30)'),
                        }}
                      >
                        {p.fit}
                      </span>
                    </div>
                    <div className="text-[12px] text-text-muted leading-snug">{p.rationale}</div>
                  </li>
                ))}
              </ul>
            </UnpackedSection>

            {/* Regulatory path */}
            <UnpackedSection
              icon={ShieldCheck}
              label="Regulatory path"
              tint="rgb(196 154 255)"
            >
              <ul className="space-y-1.5">
                {REG_PATH.map((r) => (
                  <RegRow key={r.label} step={r} />
                ))}
              </ul>
              <div className="mt-3 text-[11px] text-text-dim leading-relaxed">
                Bell tracks each step against current ministry guidance.
                Bella flags any change as it lands in QFC / QCB / MOCI
                bulletins.
              </div>
            </UnpackedSection>

            {/* First ten accounts */}
            <UnpackedSection
              icon={ListChecks}
              label="First 10 accounts to engage"
              tint="rgb(111 207 151)"
            >
              <ol className="space-y-1.5">
                {FIRST_TEN_ACCOUNTS.map((a, i) => (
                  <li
                    key={a}
                    className="flex items-center gap-3 text-[12.5px] text-text leading-snug"
                  >
                    <span
                      className="inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-mono font-semibold shrink-0"
                      style={{
                        background: 'rgba(111,207,151,0.10)',
                        color:      'rgb(111 207 151)',
                      }}
                    >
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span>{a}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-3 text-[11px] text-text-dim leading-relaxed">
                Each account comes with a decision-unit map, current
                software stack signals, and Sarah&apos;s warm-path
                routes &mdash; auto-built from the Bell.qa graph.
              </div>
            </UnpackedSection>

          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Quadrant assembled by Bella &middot; refreshed every quarter
            </span>
            <span className="text-text-muted">
              When the priority cell changes, the unpacked view follows.
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function IcpRow({ label, body }: { label: string; body: string }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 mt-0.5"
        style={{ background: 'rgba(91,140,255,0.14)', color: 'rgb(91 140 255)' }}
      >
        <Check size={11} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] font-semibold text-text">{label}</div>
        <div className="text-[11.5px] text-text-muted leading-snug">{body}</div>
      </div>
    </li>
  );
}

function RegRow({ step }: { step: { label: string; status: string; note: string } }) {
  const meta: Record<string, { color: string; icon: React.ComponentType<{ size?: number | string }>; label: string }> = {
    done:     { color: 'rgb(111 207 151)', icon: Check,       label: 'Done'      },
    inflight: { color: 'rgb(255 196 99)',  icon: CalendarClock,label: 'In flight' },
    pending:  { color: 'rgb(165 195 255)', icon: Calendar,    label: 'Pending'   },
    skip:     { color: 'rgb(140 156 196)', icon: Snowflake,   label: 'Not required' },
  };
  const m = meta[step.status] || meta.pending;
  const Icon = m.icon;
  return (
    <li className="flex items-start gap-3">
      <span
        className="inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 mt-0.5"
        style={{
          background: m.color.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
          color:      m.color,
        }}
      >
        <Icon size={11} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-[12.5px] text-text font-medium leading-snug">{step.label}</span>
          <span
            className="text-[9.5px] font-mono uppercase tracking-wider whitespace-nowrap"
            style={{ color: m.color }}
          >
            {m.label}
          </span>
        </div>
        <div className="text-[11px] text-text-dim leading-snug">{step.note}</div>
      </div>
    </li>
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

// ───────────────────────────────────────────────────────────────────────────
// 6. SarahsMarketEntry — multi-quarter KPI strip
// ───────────────────────────────────────────────────────────────────────────

const SARAH_KPIS = [
  { value: '6',     label: 'sectors evaluated',  sub: 'across the Qatari economy' },
  { value: '4',     label: 'channels mapped',    sub: 'to-market routes'          },
  { value: '247',   label: 'target accounts',    sub: 'inside priority cells'     },
  { value: '11',    label: 'partners shortlisted', sub: 'SI + commercial agents'  },
  { value: '9 days',label: 'kickoff to plan',    sub: 'vs the legacy 90'          },
  { value: '0',     label: 'local hires needed', sub: 'just Sarah'                },
];

function SarahsMarketEntry() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Sarah&apos;s market entry, in numbers
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            One head of country. No team. A complete entry plan.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            What a foreign entrant used to spend ninety days and a
            three-person team producing &mdash; the country map, the
            account list, the partner shortlist, the regulatory path
            &mdash; Sarah did in nine, alone.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 max-w-5xl mx-auto">
          {SARAH_KPIS.map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.45, delay: i * 0.05 }}
              className="rounded-xl border border-border p-4"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
              }}
            >
              <div className="text-2xl md:text-[26px] font-semibold text-text leading-none tabular-nums">
                {k.value}
              </div>
              <div className="mt-1.5 text-[11px] font-semibold text-text uppercase tracking-wider leading-snug">
                {k.label}
              </div>
              <div className="mt-0.5 text-[10.5px] text-text-dim leading-snug">
                {k.sub}
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. LeaderPivot — band transition: one entry → three motion shapes
// ───────────────────────────────────────────────────────────────────────────

function LeaderPivot() {
  return (
    <section className="relative py-16 md:py-20 border-t border-border/40 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(91,140,255,0.10) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            One entry. Three motion shapes.
          </div>
          <h2 className="text-3xl md:text-[44px] font-semibold leading-[1.1] tracking-tight">
            <span className="text-gradient">Sarah is one orientation.</span>
            <br />
            <span className="text-text">Same map, three directions.</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-text-muted leading-relaxed max-w-2xl mx-auto">
            A foreign company coming in. A Qatari operator going out.
            A new product landing. All three sit on the same Bell.qa
            primitives &mdash; the matrix, the quadrant unpacked, the
            quarter-by-quarter plan. The orientation changes, the
            scaffolding doesn&apos;t.
          </p>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. EntryPlaybook — three GTM motion shapes side-by-side
// ───────────────────────────────────────────────────────────────────────────

type MotionStatus = 'planning' | 'in-flight' | 'live';

type Motion = {
  key:       string;
  direction: string;
  directionIcon: React.ComponentType<{ size?: number | string }>;
  title:     string;
  persona:   string;
  body:      string;
  facts:     { label: string; value: string }[];
  status:    MotionStatus;
  anchor?:   boolean;
  gradient:  string;
};

const MOTIONS: Motion[] = [
  {
    key:       'foreign-in',
    direction: 'From the outside in',
    directionIcon: Globe,
    title:     'Foreign company entering Qatar',
    persona:   'Sarah Chen &middot; German industrial-software firm',
    body:      "Six weeks in country, no rolodex, a four-quarter clock. Bell mapped the sectors, surfaced 247 accounts, shortlisted the SI partners, drew the regulatory path.",
    anchor:    true,
    gradient:  'linear-gradient(135deg, rgb(91 140 255) 0%, rgb(165 195 255) 100%)',
    status:    'in-flight',
    facts: [
      { label: 'Sectors mapped',   value: '6'            },
      { label: 'Priority cells',   value: '3'            },
      { label: 'Target accounts',  value: '247'          },
      { label: 'Partners',         value: '11 shortlisted'},
      { label: 'Current phase',    value: 'Plan shipped, executing Q3'  },
    ],
  },
  {
    key:       'qatari-out',
    direction: 'From the inside out',
    directionIcon: Compass,
    title:     'Qatari company expanding to GCC',
    persona:   'Tayyar Fintech &middot; Doha payments infrastructure',
    body:      "A Qatari payments-infra company taking its rails into the GCC. Bell mapped the sector x channel grid in each market, identified the regulator-friendly entry sequence, surfaced local partners per country.",
    gradient:  'linear-gradient(135deg, rgb(111 207 151) 0%, rgb(165 195 255) 100%)',
    status:    'in-flight',
    facts: [
      { label: 'Markets evaluated', value: 'UAE, KSA, Bahrain' },
      { label: 'Sector maps drawn', value: '3 (one per market)'},
      { label: 'Local partners',    value: '17 shortlisted'    },
      { label: 'Regulatory paths',  value: '3 in flight'       },
      { label: 'Current phase',     value: 'KSA wave Q3, UAE wave Q4'  },
    ],
  },
  {
    key:       'product-launch',
    direction: 'From idea to first 100 customers',
    directionIcon: Rocket,
    title:     'New product launching into Qatar',
    persona:   'QFC-licensed SaaS &middot; product for Qatari SMEs',
    body:      "A QFC-licensed SaaS launching a Qatar-specific product to small and mid-sized businesses. Bell sized the ICP, calibrated pricing to local ARPU, and pre-engaged the launch cohort before day one.",
    gradient:  'linear-gradient(135deg, rgb(255 196 99) 0%, rgb(232 142 168) 100%)',
    status:    'planning',
    facts: [
      { label: 'ICP defined',       value: 'SMEs 20-250 staff'  },
      { label: 'Sized addressable', value: '3,400 accounts'     },
      { label: 'Launch cohort',     value: '60 pre-engaged'     },
      { label: 'Pricing model',     value: 'Calibrated to Qatari ARPU' },
      { label: 'Current phase',     value: 'Soft launch Q3, full Q4'   },
    ],
  },
];

const MOTION_STATUS: Record<MotionStatus, { label: string; color: string; bg: string; border: string }> = {
  planning: {
    label: 'Planning',
    color: 'rgb(165 195 255)',
    bg:    'rgba(165,195,255,0.10)',
    border:'rgba(165,195,255,0.30)',
  },
  'in-flight': {
    label: 'In flight',
    color: 'rgb(255 196 99)',
    bg:    'rgba(255,196,99,0.10)',
    border:'rgba(255,196,99,0.30)',
  },
  live: {
    label: 'Live',
    color: 'rgb(111 207 151)',
    bg:    'rgba(111,207,151,0.10)',
    border:'rgba(111,207,151,0.30)',
  },
};

function EntryPlaybook() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The playbook, all three directions
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Three GTM motions. One platform.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Sarah&apos;s entry is one of three shapes Bell powers. The
            primitives are the same &mdash; the matrix, the quadrant
            unpacked, the regulatory path, the named first cohort.
            What changes is the direction the arrows point.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {MOTIONS.map((m, i) => (
            <MotionCard key={m.key} motion={m} index={i} />
          ))}
        </div>

        <div className="mt-8 text-center text-[12px] text-text-dim max-w-2xl mx-auto leading-relaxed">
          Three personas, three orientations &mdash; one CRM, one set
          of accounts, one set of regulatory paths, one Bella.
          When the matrix shifts, every motion sees it the same day.
        </div>

      </div>
    </section>
  );
}

function MotionCard({ motion: m, index }: { motion: Motion; index: number }) {
  const DIcon  = m.directionIcon;
  const status = MOTION_STATUS[m.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay: index * 0.08 }}
      className="rounded-2xl border border-border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
      }}
    >
      {/* Top band — direction + status */}
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-3 flex-wrap">
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-text shrink-0"
          style={{ background: m.gradient, boxShadow: '0 8px 22px -8px rgba(91,140,255,0.35)' }}
        >
          <DIcon size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-wider font-mono text-text-dim">
            {m.direction}
          </div>
          {m.anchor && (
            <div className="text-[9.5px] uppercase tracking-wider text-accent-bright font-semibold mt-0.5">
              Sarah&apos;s arc &middot; this page
            </div>
          )}
        </div>
        <span
          className="inline-flex items-center text-[9.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap"
          style={{ color: status.color, background: status.bg, borderColor: status.border }}
        >
          {status.label}
        </span>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col flex-1 gap-4">
        <div>
          <h3 className="text-[15.5px] font-semibold text-text leading-snug">
            {m.title}
          </h3>
          <div
            className="text-[11.5px] text-text-dim mt-1 font-mono"
            dangerouslySetInnerHTML={{ __html: m.persona }}
          />
        </div>

        <p className="text-[12.5px] text-text-muted leading-relaxed">
          {m.body}
        </p>

        <ul className="space-y-1.5 border-t border-border/70 pt-3 mt-auto">
          {m.facts.map((f) => (
            <li
              key={f.label}
              className="flex items-baseline justify-between gap-3 text-[12px]"
            >
              <span className="text-text-dim">{f.label}</span>
              <span className="text-text font-semibold text-right">{f.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 9. GtmComparison — the before/after table for go-to-market
// ───────────────────────────────────────────────────────────────────────────

type GtmRow = { capability: string; without: string; with: string };

const GTM_COMPARISON_ROWS: GtmRow[] = [
  {
    capability: 'Time to entry plan',
    without:    'Ninety days with a three-person team and outside consultants',
    with:       'Nine days, one head of country, plan ready to ship',
  },
  {
    capability: 'Sector coverage',
    without:    'One or two sectors evaluated in depth, blind on the rest',
    with:       'Six sectors fully gridded against four channels, no blind spots',
  },
  {
    capability: 'Channel mapping',
    without:    'Sales-only or partner-only thinking, set early and rarely revised',
    with:       'Direct, SI, government, and events all mapped per sector',
  },
  {
    capability: 'Partner shortlist',
    without:    'Based on who the entry lead meets at conferences',
    with:       'Eleven shortlisted on fit, track record, and named-account overlap',
  },
  {
    capability: 'Target accounts',
    without:    'A list bought from a data vendor and cleaned by hand',
    with:       '247 accounts inside the priority cells, each a graph node',
  },
  {
    capability: 'Regulatory path',
    without:    'Outside counsel hired per phase, status lost between hand-offs',
    with:       'Tracked live as ministries publish, Bella flags every change',
  },
  {
    capability: 'Repeating across markets',
    without:    'Each new market starts from scratch with new consultants',
    with:       'Same playbook, different orientation &mdash; Qatar in, Qatar out, or product launch',
  },
  {
    capability: 'Cost of the entry function',
    without:    'An entry team: head of country + 2 associates + consultants',
    with:       'One head of country, with Bella running the planning underneath',
  },
];

function GtmComparison() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The before-and-after for market entry
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What changes when GTM runs on Bell.qa.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Eight rows. The function shifts from a quarterly research
            exercise run by a team to a continuous map that one person
            keeps live.
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

          {GTM_COMPARISON_ROWS.map((row, i) => (
            <motion.div
              key={row.capability}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={
                'grid grid-cols-12 text-[13px] ' +
                (i < GTM_COMPARISON_ROWS.length - 1 ? 'border-b border-border' : '')
              }
            >
              <div className="col-span-4 p-4 text-text font-medium border-r border-border leading-snug">
                {row.capability}
              </div>
              <div className="col-span-4 p-4 text-text-muted border-r border-border leading-snug flex items-start gap-2">
                <CalendarClock size={14} className="shrink-0 mt-0.5 text-text-dim" />
                <span dangerouslySetInnerHTML={{ __html: row.without }} />
              </div>
              <div className="col-span-4 p-4 leading-snug flex items-start gap-2">
                <Check size={14} className="shrink-0 mt-0.5 text-accent-bright" />
                <span className="text-text" dangerouslySetInnerHTML={{ __html: row.with }} />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 10. ConnectedToPlatform — the surfaces GTM pulls from
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
    body:  "The orchestrator. Builds the sector x channel matrix, unpacks priority cells, drafts the regulatory tracker, and updates the plan every quarter without being asked.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  "Geographic dimension on the entry plan. Where the target accounts cluster, where the SI partners have offices, where the regulators sit &mdash; all overlaid on one Doha map.",
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  "Demand signals that move the matrix in real time. A new tender, a leadership change, a regulator-published guidance &mdash; cells warm and cool as Qatar moves.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "Forecasts which cells are about to heat up. Sarah sees the next priority cell coming before the demand fully lands, not after she has lost the window.",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  Inbox,
    label: 'CRM',
    href:  '/platform/crm',
    body:  "Where the 247 target accounts live, where the SI partners get tracked, where every engagement gets logged. The entry plan and the execution share one source of truth.",
    tint:  'rgb(165 195 255)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Five surfaces, one head of country
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Sarah&apos;s entry is built on.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            GTM pulls from five parts of the Bell.qa platform. Each one
            stands alone and is documented in depth &mdash; tap into
            any of them.
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
// 11. MidPageCta — Get Access band
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
                'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(255,196,99,0.16) 0%, transparent 60%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                You&apos;ve seen Sarah&apos;s entry
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now plan yours on the only platform built for Qatar.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your sector x channel map is on screen by
                tomorrow.
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
];

function OtherFunctions() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Beyond go-to-market
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The other revenue functions Bell.qa accelerates.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            GTM is one of four. The same data and the same Bella power
            your sales, marketing, business development, and research
            teams &mdash; on one platform, one CRM, one source of
            truth.
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
// 13. ThreeReader — GTM-specific audience block
// ───────────────────────────────────────────────────────────────────────────

const GTM_READERS = [
  {
    icon:  Compass,
    label: 'For the head of country',
    body:  "The matrix tells you where to play. The unpacked cell tells you how. The plan ships in days, not quarters. Your first hundred days go to relationships, not to homework.",
  },
  {
    icon:  Crown,
    label: 'For the HQ / global GTM leader',
    body:  "Every market entry runs on the same playbook. Defensible plans, repeatable across geographies, comparable across heads of country. Capacity for more entries without a bigger team.",
  },
  {
    icon:  BadgeCheck,
    label: 'For the board / committee',
    body:  "Every claim in the entry plan cites a source. Every priority cell shows the demand signals behind it. The basis for any go/no-go decision is one click away, not buried in a deck.",
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
            What Bell.qa changes for go-to-market.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {GTM_READERS.map((r, i) => {
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
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(255,196,99,0.14) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          Put your market entry on Bell.qa.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Sectors mapped. Channels gridded. Partners shortlisted.
          Accounts named. Regulatory path drawn. From kickoff to plan
          in nine days &mdash; whether you&apos;re coming into Qatar,
          going out of Qatar, or launching a new product inside it.
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

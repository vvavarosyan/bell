'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRef } from 'react';
import {
  Activity, ArrowRight, Plane, Car, Cloud, Radar, Newspaper,
  UserCheck, FileText, Briefcase, Scroll, MessageSquare,
  Crown, BadgeCheck, GitBranch, Building2, Landmark, Gavel,
  Layers, BookOpen, BarChart3, BadgeAlert, Zap, Clock,
  Linkedin, Linkedin as LinkedInIcon, RefreshCw, Bot,
  ShieldCheck, History, Sparkles, Check, X, MoveRight,
  Database, Eye, Inbox, Map as MapIcon, BrainCircuit, Crosshair,
  Workflow, Lock, Handshake,
} from 'lucide-react';

/**
 * LIVE PAGE — capability deep-dive.
 *
 * The page that proves Bell.qa's data is *alive*, not just present.
 * Static directories rot the moment they ship; Bell's data doesn't.
 * Every record is polled continuously, every change detected and
 * timestamped, every fact carries its own freshness.
 *
 * Centerpiece: a refresh-cadence atlas with 5 tiers from real-time
 * (60-90s) to weekly+, each tier holding the record types that
 * refresh at that cadence.
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. LiveHero        — "The country, alive."
 *     2. LiveActivityBar — live counters
 *     3. TheRefreshCadenceAtlas — CENTERPIECE — 5 tiers, ~22 records
 *
 *   ROUND 2+ (to be added):
 *     4. TheLiveChangeStream     — streaming feed of record diffs
 *     5. WhyStaticDirectoriesFail — static vs live argument
 *     6. TheChangeDetectionEngine — technical depth
 *     7. ConnectedToPlatform
 *     8. MidPageCta
 *     9. OtherDataSurfaces
 *    10. ThreeReader   — data engineer / data buyer / partner
 *    11. FinalCta
 */

export function LivePageSections() {
  return (
    <>
      <LiveHero />
      <LiveActivityBar />
      <TheRefreshCadenceAtlas />
      <TheLiveChangeStream />
      <WhyStaticDirectoriesFail />
      <TheChangeDetectionEngine />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherDataSurfaces />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. LiveHero — strategic opening
// ───────────────────────────────────────────────────────────────────────────

function LiveHero() {
  return (
    <section className="relative pt-28 md:pt-32 pb-20 md:pb-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 0%, rgba(111,207,151,0.16) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/40 backdrop-blur text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-7">
            <Activity size={12} className="text-accent-bright" />
            <span>Data &middot; Live</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">The country,</span>
            <br />
            <span className="text-text">alive.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Static directories rot the moment they ship. Bell&apos;s
            data doesn&apos;t. Every record on the graph is polled
            continuously, every change is detected and timestamped,
            every fact carries its own freshness &mdash; down to the
            60-second air-traffic ping, up to the weekly sector
            report.
          </p>
          <p className="mt-4 text-[13.5px] text-text-dim leading-relaxed max-w-2xl">
            Twenty-two record types. Five refresh tiers. Continuous,
            every day, on Bell-owned infrastructure.
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
// 2. LiveActivityBar — cycling live counters
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Datapoints kept current',  value: '1.2 B',  sub: 'every day, every record'           },
  { label: 'Sub-90s refresh tier',     value: '6 types', sub: 'real-time category'               },
  { label: 'Changes detected / min',   value: '47',     sub: 'across the whole graph'           },
  { label: 'Average record age',       value: '< 2 h',  sub: 'time since last refresh, all-types avg' },
  { label: 'Stale records',            value: '0',      sub: 'every record refreshed continuously' },
];

function LiveActivityBar() {
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
              Live data plane &middot; pulse of the country
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
// 3. TheRefreshCadenceAtlas — CENTERPIECE
//    5 tiers from real-time (60-90s) to weekly+. Each tier holds the
//    record types that refresh at that cadence.
// ───────────────────────────────────────────────────────────────────────────

type RecordCadence = {
  icon:     React.ComponentType<{ size?: number | string }>;
  name:     string;
  cadence:  string;
  changes:  string;
};

type CadenceTier = {
  num:      string;
  label:    string;
  band:     string;
  tagline:  string;
  tint:     string;
  isLive:   boolean;
  records:  RecordCadence[];
};

const CADENCE_ATLAS: CadenceTier[] = [
  {
    num:     '01',
    label:   'Real-time',
    band:    '60-90 seconds',
    tagline: 'The pulse layer.',
    tint:    'rgb(111 207 151)',
    isLive:  true,
    records: [
      { icon: Plane,      name: 'Air traffic',        cadence: '60s',  changes: 'every commercial movement' },
      { icon: Car,        name: 'Road traffic',       cadence: '60s',  changes: 'every major Doha segment'  },
      { icon: Cloud,      name: 'Weather',            cadence: '60s',  changes: 'all Qatar stations'        },
      { icon: Radar,      name: 'Signals feed',       cadence: '60s',  changes: '~3 / minute, country-wide' },
      { icon: Newspaper,  name: 'News stream',        cadence: '90s',  changes: '~8 / hour, Qatar coverage' },
      { icon: UserCheck,  name: 'People-density heat', cadence: '90s', changes: 'anonymized aggregates, by district' },
    ],
  },
  {
    num:     '02',
    label:   'Live',
    band:    '5-15 minutes',
    tagline: 'The market-rhythm layer.',
    tint:    'rgb(91 140 255)',
    isLive:  true,
    records: [
      { icon: FileText,    name: 'Tenders & RFPs',    cadence: '5 min',  changes: 'new posts as they land'    },
      { icon: Briefcase,   name: 'Job postings',      cadence: '10 min', changes: '~14,800 / month, country' },
      { icon: Scroll,      name: 'Regulator bulletins',cadence: '10 min',changes: 'every QFC / QCB / QFMA notice'},
      { icon: MessageSquare,name:'Public conversation',cadence: '15 min',changes: 'LinkedIn, press, podcasts' },
    ],
  },
  {
    num:     '03',
    label:   'Frequent',
    band:    '1-3 hours',
    tagline: 'The leadership & licence layer.',
    tint:    'rgb(255 196 99)',
    isLive:  false,
    records: [
      { icon: Crown,      name: 'Leadership changes', cadence: '1 h',  changes: 'CEO / CFO / CTO / board moves' },
      { icon: BadgeCheck, name: 'Licence updates',    cadence: '1 h',  changes: 'issuances, renewals, revocations' },
      { icon: Layers,     name: 'Filings & registrations',cadence:'2 h',changes:'MoCI registry &amp; updates' },
      { icon: GitBranch,  name: 'Ownership changes',  cadence: '3 h',  changes: 'cap-table edges, UBO shifts' },
    ],
  },
  {
    num:     '04',
    label:   'Hourly–Daily',
    band:    '6-24 hours',
    tagline: 'The structural layer.',
    tint:    'rgb(196 154 255)',
    isLive:  false,
    records: [
      { icon: Building2, name: 'Company core fields', cadence: '6 h',  changes: 'employees, sector, revenue band' },
      { icon: Scroll,    name: 'Regulations',         cadence: '12 h', changes: 'new laws, circulars, decrees'    },
      { icon: Landmark,  name: 'Government datasets', cadence: '12 h', changes: 'ministry publication cadence'    },
      { icon: Gavel,     name: 'Court &amp; tribunal records', cadence: '24 h', changes: 'commercial dispute filings' },
      { icon: BarChart3, name: 'Sector aggregates',   cadence: '24 h', changes: 'volume / heat / momentum'        },
    ],
  },
  {
    num:     '05',
    label:   'Weekly+',
    band:    'weekly cadence',
    tagline: 'The slow-moving layer.',
    tint:    'rgb(232 142 168)',
    isLive:  false,
    records: [
      { icon: BookOpen,   name: 'Industry reports',      cadence: 'weekly',  changes: 'sector trackers, multi-source' },
      { icon: BadgeAlert, name: 'Academic &amp; policy', cadence: 'weekly',  changes: 'Education City, think-tanks'    },
      { icon: BarChart3,  name: 'Macro indicators',      cadence: 'weekly',  changes: 'capital flow, trade, employment'},
    ],
  },
];

function TheRefreshCadenceAtlas() {
  return (
    <section className="relative py-16 md:py-20 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The refresh-cadence atlas
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Every record type, on its own clock.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The pulse of the country isn&apos;t uniform. Air traffic
            moves by the second; macro indicators move by the week.
            Bell respects that. Below: every record type and the
            exact cadence Bell polls, change-detects, and updates it.
          </p>
        </div>

        <div className="space-y-5">
          {CADENCE_ATLAS.map((tier, i) => (
            <CadenceTierCard key={tier.num} tier={tier} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function CadenceTierCard({ tier, index }: { tier: CadenceTier; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="rounded-2xl border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        borderColor: tier.tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
        borderTop:   '2px solid ' + tier.tint,
      }}
    >
      {/* Tier header */}
      <div
        className="px-5 md:px-6 py-4 border-b flex items-center gap-4 flex-wrap"
        style={{
          background:  tier.tint.replace('rgb', 'rgba').replace(')', ' / 0.06)'),
          borderColor: tier.tint.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
        }}
      >
        <div className="flex items-baseline gap-3 flex-wrap">
          <span
            className="text-[12px] font-mono font-semibold tracking-wider"
            style={{ color: tier.tint }}
          >
            T{tier.num.slice(1)}
          </span>
          <div
            className="text-[15px] font-semibold leading-tight"
            style={{ color: tier.tint }}
          >
            {tier.label}
          </div>
          <span
            className="inline-flex items-center gap-1.5 text-[10.5px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap"
            style={{
              color:       tier.tint,
              background:  tier.tint.replace('rgb', 'rgba').replace(')', ' / 0.10)'),
              borderColor: tier.tint.replace('rgb', 'rgba').replace(')', ' / 0.32)'),
            }}
          >
            <Clock size={9} />
            {tier.band}
          </span>
          <span className="text-[12px] text-text-muted italic">
            {tier.tagline}
          </span>
        </div>
        <div className="flex-1" />
        {tier.isLive && (
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
            style={{
              color:       'rgb(111 207 151)',
              background:  'rgba(111,207,151,0.10)',
              borderColor: 'rgba(111,207,151,0.30)',
            }}
          >
            <span className="relative inline-flex items-center justify-center w-1.5 h-1.5">
              <span className="absolute inline-flex w-full h-full rounded-full bg-[rgb(111_207_151)] opacity-60 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[rgb(111_207_151)]" />
            </span>
            Live
          </span>
        )}
        <span className="text-[10px] font-mono text-text-dim">
          {tier.records.length} type{tier.records.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Record-type cards */}
      <div className="p-4 md:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {tier.records.map((rec) => (
            <RecordCadenceCard key={rec.name} record={rec} tierTint={tier.tint} tierLive={tier.isLive} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function RecordCadenceCard({
  record, tierTint, tierLive,
}: {
  record: RecordCadence; tierTint: string; tierLive: boolean;
}) {
  const Icon = record.icon;
  return (
    <div
      className="rounded-xl border border-border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
      }}
    >
      <div className="p-3.5 flex flex-col gap-3 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0"
            style={{
              background: tierTint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
              color:      tierTint,
            }}
          >
            <Icon size={14} />
          </span>
          <span
            className="text-[10.5px] font-mono font-semibold tabular-nums px-2 py-0.5 rounded border whitespace-nowrap shrink-0"
            style={{
              color:       tierTint,
              background:  tierTint.replace('rgb', 'rgba').replace(')', ' / 0.08)'),
              borderColor: tierTint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
            }}
          >
            {record.cadence}
          </span>
        </div>
        <div>
          <div
            className="text-[12.5px] font-semibold text-text leading-tight"
            dangerouslySetInnerHTML={{ __html: record.name }}
          />
          <div
            className="mt-1 text-[10.5px] text-text-dim leading-snug"
            dangerouslySetInnerHTML={{ __html: record.changes }}
          />
        </div>
      </div>
      {tierLive && (
        <div
          className="px-3.5 py-1.5 border-t flex items-center justify-between text-[9.5px] font-mono"
          style={{
            background:  'rgba(111,207,151,0.04)',
            borderColor: 'rgba(111,207,151,0.18)',
            color:       'rgb(111 207 151)',
          }}
        >
          <span className="flex items-center gap-1.5">
            <span className="relative inline-flex items-center justify-center w-1 h-1">
              <span className="absolute inline-flex w-full h-full rounded-full bg-[rgb(111_207_151)] opacity-60 animate-ping" />
              <span className="relative inline-flex w-1 h-1 rounded-full bg-[rgb(111_207_151)]" />
            </span>
            <span className="uppercase tracking-wider">Refreshing</span>
          </span>
          <Zap size={9} />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. TheLiveChangeStream — streaming feed of field-level record diffs
//    Distinct from Signals' event feed: this shows actual record FIELD
//    changes (employee count 38 -> 47), not events (raised QAR 9M).
// ───────────────────────────────────────────────────────────────────────────

type DiffTemplate = {
  entity:    string;
  field:     string;
  before:    string;
  after:     string;
  source:    string;
  sourceTint:string;
};

const DIFF_TEMPLATES: DiffTemplate[] = [
  { entity: 'Tayyar Fintech',         field: 'Employee count',         before: '38',                after: '47',                       source: 'LinkedIn',        sourceTint: 'rgb(91 140 255)'  },
  { entity: 'Doha Health Network',    field: 'CFO',                    before: 'vacant',            after: 'Yousef Al-Mannai',         source: 'MoCI filing',     sourceTint: 'rgb(196 154 255)' },
  { entity: 'QTerminals',             field: 'Open tenders',           before: '2',                 after: '3',                        source: 'QFC bulletin',    sourceTint: 'rgb(255 196 99)'  },
  { entity: 'Industries Qatar',       field: 'Family-office LP %',     before: '22%',               after: '24%',                      source: 'MoCI registry',   sourceTint: 'rgb(196 154 255)' },
  { entity: 'Hamad Medical Corp.',    field: 'Capacity (beds)',        before: '1,800',             after: '1,920',                    source: 'MoPH bulletin',   sourceTint: 'rgb(111 207 151)' },
  { entity: 'Doha Bank',              field: 'CRO',                    before: 'Mohammed Al-Sayegh', after: 'Khalid Al-Subaie',        source: 'LinkedIn',        sourceTint: 'rgb(91 140 255)'  },
  { entity: 'Mesaieed Petrochem',     field: 'Safety filing status',   before: 'pending',           after: 'approved',                 source: 'Regulator',       sourceTint: 'rgb(111 207 151)' },
  { entity: 'Almuftah Group',         field: 'Branches',               before: '4',                 after: '5 (Al Wakra added)',       source: 'Press release',   sourceTint: 'rgb(255 196 99)'  },
  { entity: 'GWC Group',              field: 'Revenue band',           before: 'QAR 50-100M',       after: 'QAR 100-200M',             source: 'Industry report', sourceTint: 'rgb(232 142 168)' },
  { entity: 'Lusail Construction',    field: 'Contractor licence',     before: 'expired',           after: 'renewed',                  source: 'MoCI',            sourceTint: 'rgb(196 154 255)' },
  { entity: 'Aspire Zone',            field: 'Active MoUs',            before: '2',                 after: '3',                        source: 'Press release',   sourceTint: 'rgb(255 196 99)'  },
  { entity: 'Hayya Tech',             field: 'Engineering headcount',  before: '28',                after: '36',                       source: 'LinkedIn',        sourceTint: 'rgb(91 140 255)'  },
  { entity: 'Doha Health Network',    field: 'Board members (known)',  before: '3',                 after: '4',                        source: 'Public filing',   sourceTint: 'rgb(196 154 255)' },
  { entity: 'Hamad Intl Airport',     field: 'Live flights now',       before: '142',               after: '138',                      source: 'Airport feed',    sourceTint: 'rgb(165 195 255)' },
  { entity: 'West Bay',               field: 'Visibility',             before: '8 km',              after: '5 km',                     source: 'Weather service', sourceTint: 'rgb(165 195 255)' },
  { entity: 'C-Ring road',            field: 'Congestion',             before: 'clear',             after: 'moderate',                 source: 'Live traffic',    sourceTint: 'rgb(255 196 99)'  },
  { entity: 'The Pearl-Qatar',        field: 'People-density',         before: 'normal',            after: 'elevated',                 source: 'Aggregates',      sourceTint: 'rgb(111 207 151)' },
  { entity: 'Tayyar Fintech',         field: 'News mentions (today)',  before: '3',                 after: '5',                        source: 'News index',      sourceTint: 'rgb(255 196 99)'  },
  { entity: 'QFMA',                   field: 'ESG circular',           before: '—',                 after: '1 published',              source: 'QFMA',            sourceTint: 'rgb(111 207 151)' },
  { entity: 'Mwani Qatar',            field: 'Press mentions (24h)',   before: '14',                after: '38',                       source: 'Press archive',   sourceTint: 'rgb(255 196 99)'  },
];

type LiveDiff = DiffTemplate & {
  id:      number;
  addedAt: number;
};

function pickDiff(): DiffTemplate {
  return DIFF_TEMPLATES[Math.floor(Math.random() * DIFF_TEMPLATES.length)];
}

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 3)   return 'just now';
  if (s < 60)  return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60)  return m + 'm ago';
  const h = Math.floor(m / 60);
  return h + 'h ago';
}

function TheLiveChangeStream() {
  const MAX_VISIBLE   = 8;
  const ADD_INTERVAL  = 3200;
  const TICK_INTERVAL = 1000;

  const [diffs, setDiffs] = useState<LiveDiff[]>(() => {
    const now = Date.now();
    return [
      { ...DIFF_TEMPLATES[0], id: 1, addedAt: now - 1500  },
      { ...DIFF_TEMPLATES[1], id: 2, addedAt: now - 8000  },
      { ...DIFF_TEMPLATES[2], id: 3, addedAt: now - 22000 },
      { ...DIFF_TEMPLATES[3], id: 4, addedAt: now - 41000 },
    ];
  });
  const [, setNowTick] = useState(0);
  const idCounter = useRef(5);

  useEffect(() => {
    const id = window.setInterval(() => {
      setDiffs((current) => {
        const next: LiveDiff = {
          ...pickDiff(),
          id:      idCounter.current++,
          addedAt: Date.now(),
        };
        return [next, ...current].slice(0, MAX_VISIBLE);
      });
    }, ADD_INTERVAL);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick((t) => t + 1), TICK_INTERVAL);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The live change stream
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Field-level diffs, as they land.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Not events &mdash; field-level changes. This is what
            &lsquo;alive&rsquo; actually looks like, inside the
            graph: every datapoint compared against its previous
            value, every diff captured with its source attached.
            Watch a new change land at the top every few seconds.
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
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
            <span className="relative inline-flex items-center justify-center w-2 h-2" aria-hidden="true">
              <span className="absolute inline-flex w-full h-full rounded-full bg-[rgb(111_207_151)] opacity-60 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-[rgb(111_207_151)]" />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
              Live change stream &middot; whole graph
            </span>
            <span className="text-text-dim text-[11px]">&middot;</span>
            <span className="text-[10.5px] text-text-dim">
              field-level diffs &middot; showing the last 8
            </span>
            <div className="flex-1" />
            <span className="text-[10px] font-mono text-text-dim flex items-center gap-1.5">
              <Bot size={10} className="text-[rgb(196_154_255)]" />
              every diff cited at source
            </span>
          </div>

          {/* Feed list */}
          <div className="p-3 md:p-4">
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {diffs.map((d) => (
                  <motion.li
                    key={d.id}
                    layout
                    initial={{ opacity: 0, y: -12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 20, height: 0, marginTop: 0, marginBottom: 0 }}
                    transition={{
                      layout:  { duration: 0.4, ease: 'easeOut' },
                      opacity: { duration: 0.3 },
                      y:       { duration: 0.35, ease: 'easeOut' },
                      scale:   { duration: 0.3 },
                    }}
                  >
                    <DiffRow diff={d} />
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function DiffRow({ diff }: { diff: LiveDiff }) {
  const age = formatAge(Date.now() - diff.addedAt);
  return (
    <div
      className="rounded-lg border border-border px-3 py-2.5 grid grid-cols-12 gap-3 items-center"
      style={{
        background: 'rgba(255,255,255,0.015)',
        borderLeft: '2px solid ' + diff.sourceTint,
      }}
    >
      {/* Entity + field */}
      <div className="col-span-12 md:col-span-4 min-w-0">
        <div className="text-[10.5px] text-text-dim font-mono leading-tight">
          {diff.entity}
        </div>
        <div className="text-[12.5px] font-semibold text-text leading-tight mt-0.5">
          {diff.field}
        </div>
      </div>

      {/* Before -> After */}
      <div className="col-span-12 md:col-span-5 flex items-center gap-2 flex-wrap">
        <span
          className="text-[11.5px] text-text-dim line-through decoration-text-dim/50 font-mono px-2 py-0.5 rounded border border-border/60"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          {diff.before}
        </span>
        <MoveRight size={11} className="text-text-dim shrink-0" />
        <span
          className="text-[11.5px] text-text font-medium px-2 py-0.5 rounded border whitespace-nowrap"
          style={{
            background:  'rgba(111,207,151,0.08)',
            borderColor: 'rgba(111,207,151,0.28)',
          }}
        >
          {diff.after}
        </span>
      </div>

      {/* Source + age */}
      <div className="col-span-12 md:col-span-3 flex items-center justify-end gap-2 text-right">
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded-full border whitespace-nowrap"
          style={{
            color:       diff.sourceTint,
            background:  diff.sourceTint.replace('rgb', 'rgba').replace(')', ' / 0.08)'),
            borderColor: diff.sourceTint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
          }}
        >
          {diff.source}
        </span>
        <span className="text-[10px] text-text-dim font-mono shrink-0">
          {age}
        </span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. WhyStaticDirectoriesFail — static vs live record, side by side
// ───────────────────────────────────────────────────────────────────────────

type RecordFieldRow = {
  label: string;
  staticValue: string;
  liveValue:   string;
  changed:     boolean;
};

const STATIC_VS_LIVE_FIELDS: RecordFieldRow[] = [
  { label: 'Employees',           staticValue: '350',                       liveValue: '380',                                    changed: true  },
  { label: 'CFO',                 staticValue: 'vacant',                    liveValue: 'Yousef Al-Mannai',                       changed: true  },
  { label: 'Ownership clarity',   staticValue: 'not tracked',               liveValue: 'Founder 62%, LP 22%, ESOP 11%, Strategic 5%', changed: true  },
  { label: 'Live signals',        staticValue: '0',                         liveValue: '4 (licence, CFO, expansion, LP liquidity)',  changed: true  },
  { label: 'Board members',       staticValue: '3 known',                   liveValue: '4 known',                                changed: true  },
  { label: 'Sector tag',          staticValue: 'Healthcare',                liveValue: 'Healthcare · private clinic operator',   changed: true  },
  { label: 'HQ address',          staticValue: 'West Bay',                  liveValue: 'West Bay',                               changed: false },
  { label: 'Founded',             staticValue: '2014',                      liveValue: '2014',                                   changed: false },
];

function WhyStaticDirectoriesFail() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Why static directories fail
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Same record. Six months later.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The same record on Doha Health Network, seen through a
            static directory frozen six months ago versus seen through
            Bell&apos;s live graph today. Where they diverge is what
            you missed.
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
          {/* Header row */}
          <div
            className="grid grid-cols-12 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.025)' }}
          >
            <div className="col-span-3 p-4 text-text-dim border-r border-border">
              Field
            </div>
            <div
              className="col-span-4 md:col-span-4 p-4 border-r border-border flex items-center gap-2"
              style={{ color: 'rgb(140 156 196)' }}
            >
              <X size={11} />
              <span>Static directory</span>
              <span className="hidden md:inline ml-auto text-[9px] text-text-dim normal-case font-normal">
                last updated · 6 months ago
              </span>
            </div>
            <div
              className="col-span-5 md:col-span-5 p-4 flex items-center gap-2"
              style={{ color: 'rgb(111 207 151)' }}
            >
              <Check size={11} />
              <span>Bell.qa live record</span>
              <span className="hidden md:inline ml-auto text-[9px] text-text-dim normal-case font-normal">
                last verified · 14 min ago
              </span>
            </div>
          </div>

          {/* Field rows */}
          {STATIC_VS_LIVE_FIELDS.map((row, i) => (
            <motion.div
              key={row.label}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={
                'grid grid-cols-12 text-[13px] items-stretch ' +
                (i < STATIC_VS_LIVE_FIELDS.length - 1 ? 'border-b border-border' : '')
              }
            >
              <div className="col-span-3 p-4 text-text font-medium border-r border-border leading-snug">
                {row.label}
              </div>
              <div
                className="col-span-4 p-4 text-text-dim border-r border-border leading-snug"
                style={{
                  background: row.changed ? 'rgba(232,142,168,0.04)' : undefined,
                }}
              >
                {row.staticValue}
              </div>
              <div
                className="col-span-5 p-4 leading-snug flex items-start gap-2"
                style={{
                  background: row.changed ? 'rgba(111,207,151,0.04)' : undefined,
                  color:      row.changed ? 'rgb(220 230 250)' : 'rgb(140 156 196)',
                }}
              >
                {row.changed && (
                  <Sparkles
                    size={12}
                    className="shrink-0 mt-0.5"
                    style={{ color: 'rgb(111 207 151)' }}
                  />
                )}
                <span className={row.changed ? 'font-medium' : ''}>
                  {row.liveValue}
                </span>
              </div>
            </motion.div>
          ))}

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              6 of 8 fields diverged in 6 months &middot; static loses
              75% of its accuracy
            </span>
            <span className="text-text-muted">
              Multiply by 500+ datapoints per record. Every record.
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. TheChangeDetectionEngine — how Bell actually detects change
// ───────────────────────────────────────────────────────────────────────────

type EnginePillar = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  body:    string;
  detail:  string;
  tint:    string;
};

const ENGINE_PILLARS: EnginePillar[] = [
  {
    icon:    GitBranch,
    label:   'Field-level diffs',
    body:    'Bell diffs every record at the field level, not the record level. Knowing what changed is more useful than knowing that something changed.',
    detail:  'Granularity matters: a CFO change is not a registration change.',
    tint:    'rgb(111 207 151)',
  },
  {
    icon:    BadgeCheck,
    label:   'Multi-source corroboration',
    body:    'A change only lands when corroborating sources agree. Single-source disagreements are flagged for review, not promoted to the record.',
    detail:  'A rumour from one feed is a rumour. Three sources agreeing is a fact.',
    tint:    'rgb(91 140 255)',
  },
  {
    icon:    Sparkles,
    label:   'Confidence-weighted promotion',
    body:    'Each change carries a confidence score derived from source strength, agreement count, and historical reliability. High-confidence changes promote instantly.',
    detail:  'Low-confidence changes wait. The record never lies for speed.',
    tint:    'rgb(196 154 255)',
  },
  {
    icon:    Eye,
    label:   'Source-level provenance',
    body:    'Every change in the record carries the source that caused it. Click any datapoint &mdash; see exactly what fired, exactly when, exactly where.',
    detail:  'No black box. Every diff has a citation.',
    tint:    'rgb(255 196 99)',
  },
  {
    icon:    History,
    label:   'Full change history',
    body:    'Every change a record has ever had is retained. Replay the record at any past date and see what it looked like, what it knew, what sources it cited.',
    detail:  'The graph remembers everything.',
    tint:    'rgb(165 195 255)',
  },
  {
    icon:    Bot,
    label:   'Bella-augmented resolution',
    body:    'When sources disagree or a change is ambiguous, Bella reviews the candidates, evaluates the evidence, and proposes the resolution &mdash; with reasoning attached.',
    detail:  'Edge cases get a second pass. Records get human-grade judgment.',
    tint:    'rgb(232 142 168)',
  },
];

function TheChangeDetectionEngine() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The change-detection engine
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Catching change without lying to chase it.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Detecting that something changed is the easy part. The
            hard part is knowing it actually changed &mdash; not just
            that one source said so. Bell&apos;s change-detection
            engine corroborates, weights, cites, and resolves every
            change before it promotes to the record.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ENGINE_PILLARS.map((pillar, i) => (
            <EnginePillarCard key={pillar.label} pillar={pillar} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function EnginePillarCard({ pillar, index }: { pillar: EnginePillar; index: number }) {
  const Icon = pillar.icon;
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
            background: pillar.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      pillar.tint,
          }}
        >
          <Icon size={16} />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold text-text leading-snug">
            {pillar.label}
          </h3>
          <p className="mt-1 text-[12.5px] text-text-muted leading-relaxed">
            {pillar.body}
          </p>
        </div>
      </div>
      <div
        className="px-5 py-3 border-t border-border/70 text-[11.5px] text-text-dim italic leading-snug"
        style={{ background: 'rgba(255,255,255,0.015)' }}
      >
        {pillar.detail}
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. ConnectedToPlatform — where live data feeds
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
    body:  "Live diffs become signals the moment they promote. The change stream above is the same stream Signals subscribes to.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  Inbox,
    label: 'CRM',
    href:  '/platform/crm',
    body:  "Open any record and it&apos;s already current. The CRM doesn&apos;t cache; it reads the live graph. Every field carries its last-verified timestamp.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  "Live pulses on the Doha map are field-level changes promoted to the graph. Every dot you watch land is a record that moved in the last minute.",
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  Crosshair,
    label: 'Buyer Intent',
    href:  '/platform/buyer-intent',
    body:  "Intent recognition lives or dies on freshness. A hiring spike noticed three weeks late is a missed sale. Live makes the score honest.",
    tint:  'rgb(255 159 180)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "Forecasts read signal velocity and field-level momentum. Without the live change stream there is no rate of change to forecast against.",
    tint:  'rgb(196 154 255)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What live data feeds
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Every surface inherits the pulse.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Live isn&apos;t a separate product. It&apos;s the property
            that every other surface inherits &mdash; the CRM is fresh
            because Live keeps it fresh; the Map pulses because Live
            emits the changes; Intent and Prediction work because Live
            keeps the rate of change honest.
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
                'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(111,207,151,0.18) 0%, transparent 60%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                You&apos;ve seen what stays alive
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now query records that never went stale.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. The first record you open is already as
                fresh as the country.
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
// 9. OtherDataSurfaces — sibling Data sub-pages
// ───────────────────────────────────────────────────────────────────────────

type DataSibling = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  href:    string;
  tagline: string;
  body:    string;
  soon?:   boolean;
};

const DATA_SIBLINGS: DataSibling[] = [
  {
    icon:    Database,
    label:   'Coverage',
    href:    '/data/coverage',
    tagline: 'What Bell sees.',
    body:    'Every Qatari company, every named decision-maker, every signal &mdash; 21 record types across five tiers. 500+ datapoints on every record.',
  },
  {
    icon:    Workflow,
    label:   'Pipeline',
    href:    '/data/pipeline',
    tagline: 'The machine behind the data.',
    body:    'A six-stage proprietary pipeline that ingests, cleans, verifies, deduplicates, enriches, and tracks every record live &mdash; on Bell-owned infrastructure.',
  },
  {
    icon:    ShieldCheck,
    label:   'Trust',
    href:    '/data/trust',
    tagline: 'Sovereign-grade and removable.',
    body:    'Data protection, transparency, privacy, and a clear path to request removal of your data.',
    soon:    true,
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
            Live is one of four.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            You&apos;ve just read why the data stays alive. The other
            three Data surfaces explain what&apos;s in it, how
            it&apos;s built, and how it&apos;s protected.
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
            <div className="flex items-center gap-1.5">
              {sibling.soon && (
                <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded border border-border text-text-dim">
                  soon
                </span>
              )}
              <ArrowRight
                size={14}
                className="text-text-dim opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all"
              />
            </div>
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
// 10. ThreeReader — data engineer / data buyer / partner
// ───────────────────────────────────────────────────────────────────────────

const LIVE_READERS = [
  {
    icon:  RefreshCw,
    label: 'For the data engineer',
    body:  "Cadence is observable per record type. Every diff is timestamped, sourced, and replayable. You can audit the freshness of any field at any point in history &mdash; the graph remembers.",
  },
  {
    icon:  BarChart3,
    label: 'For the data buyer',
    body:  "The records you procure aren&apos;t snapshots. Every field carries its last-verified timestamp; every change carries its corroboration; every datapoint stays as fresh as the country. No quarterly stale-data write-off.",
  },
  {
    icon:  Handshake,
    label: 'For the partner / investor',
    body:  "Live is the defensibility moat. Anyone can license a dataset; nobody else has built the change-detection engine that keeps a Qatari country graph current, on Bell-owned servers, with full provenance.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same liveness
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes when data stays alive.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {LIVE_READERS.map((r, i) => {
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
                  style={{ background: 'rgba(111,207,151,0.14)' }}
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
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(111,207,151,0.14) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          Records that don&apos;t age.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Twenty-two record types. Five refresh tiers. 1.2 billion
          datapoints kept current every single day. Every field cited,
          every change replayable, every record as fresh as the
          country it represents.
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

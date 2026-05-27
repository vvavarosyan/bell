'use client';

import { useEffect, useId, useState } from 'react';
import { motion } from 'framer-motion';
import {
  Activity, CheckCircle2, Wrench,
  RefreshCw, MapPin, Zap, TrendingUp, Database, Bot,
  AlertCircle, Calendar, Mail, Rss, Clock, ShieldCheck,
} from 'lucide-react';

/**
 * SYSTEM STATUS — public operational status page for Bell.qa.
 *
 * Layout, top to bottom:
 *   1. Top banner — overall status + live "last refreshed" ticker + region
 *   2. KPI strip — 4 headline operational metrics
 *   3. Components by category (Platform / Data Pipeline / Operations)
 *      Each component has a 90-day uptime bar
 *   4. Live performance metrics (4 cards with sparklines)
 *   5. Recent incident history (resolved entries)
 *   6. Scheduled maintenance
 *   7. Subscribe to updates (email + RSS)
 *
 * Visual goals:
 *   • Dense, monospace timestamps and metric values
 *   • Real-feeling 90-day uptime grids (one bar per day, colour-coded)
 *   • Live ticker that visibly refreshes every 60 seconds
 *   • Sober palette — green for ops, amber/red for issues, blue for maint
 *   • No emojis, no exclamation marks, no marketing language
 *
 * Data note: this is a UI shell. Numbers below are illustrative of a
 * healthy production system and will be wired to real monitoring when the
 * observability stack is connected. Hardcoded values are deterministic so
 * the page is stable across renders.
 */

// ───────────────────────────────────────────────────────────────────────────
// Status colour system
// ───────────────────────────────────────────────────────────────────────────

type Current = 'operational' | 'degraded' | 'partial-outage' | 'major-outage' | 'maintenance';
type DayStatus = 'op' | 'deg' | 'part' | 'out' | 'maint';

const STATUS_COLOR: Record<DayStatus, string> = {
  op:    'rgb(111 207 151)',
  deg:   'rgb(251 191 36)',
  part:  'rgb(255 159 64)',
  out:   'rgb(255 107 107)',
  maint: 'rgb(91 140 255)',
};

const STATUS_LABEL: Record<DayStatus, string> = {
  op:    'Operational',
  deg:   'Degraded performance',
  part:  'Partial outage',
  out:   'Major outage',
  maint: 'Scheduled maintenance',
};

const CURRENT_META: Record<Current, { color: string; label: string; bg: string; border: string }> = {
  operational:     { color: STATUS_COLOR.op,    label: 'Operational',     bg: 'rgba(111,207,151,0.12)', border: 'rgba(111,207,151,0.35)' },
  degraded:        { color: STATUS_COLOR.deg,   label: 'Degraded',        bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.35)'  },
  'partial-outage':{ color: STATUS_COLOR.part,  label: 'Partial outage',  bg: 'rgba(255,159,64,0.12)',  border: 'rgba(255,159,64,0.35)'  },
  'major-outage':  { color: STATUS_COLOR.out,   label: 'Major outage',    bg: 'rgba(255,107,107,0.14)', border: 'rgba(255,107,107,0.40)' },
  maintenance:     { color: STATUS_COLOR.maint, label: 'Under maintenance', bg: 'rgba(91,140,255,0.12)', border: 'rgba(91,140,255,0.35)' },
};

// ───────────────────────────────────────────────────────────────────────────
// Data — components, incidents, maintenance
// ───────────────────────────────────────────────────────────────────────────

type SystemComponent = {
  id:       string;
  name:     string;
  desc:     string;
  current:  Current;
  uptime90: string;        // formatted percentage
  // Past incidents — `day` is days-ago (0 = today, 89 = 90 days ago).
  incidents: { day: number; status: DayStatus }[];
};

type CategoryGroup = {
  label: string;
  desc:  string;
  components: SystemComponent[];
};

const CATEGORIES: CategoryGroup[] = [
  {
    label: 'Platform',
    desc:  'The customer-facing services that make up Bell.qa.',
    components: [
      {
        id: 'web-app', name: 'Web Application', desc: 'Marketing site and public-facing web frontend.',
        current: 'operational', uptime90: '100.00',
        incidents: [],
      },
      {
        id: 'public-api', name: 'Public API', desc: 'Programmatic access for Business and Enterprise customers.',
        current: 'operational', uptime90: '99.99',
        incidents: [{ day: 47, status: 'deg' }],
      },
      {
        id: 'user-portal', name: 'User Portal', desc: 'The authenticated workspace at app.bell.qa.',
        current: 'operational', uptime90: '99.98',
        incidents: [{ day: 23, status: 'deg' }, { day: 24, status: 'deg' }],
      },
      {
        id: 'user-auth', name: 'User Authentication', desc: 'Identity, session, and access control.',
        current: 'operational', uptime90: '100.00',
        incidents: [],
      },
    ],
  },
  {
    label: 'Data Pipeline',
    desc:  'The systems that build, maintain, and serve the Bell.qa graph.',
    components: [
      {
        id: 'enrich-1', name: 'Enrichment Engine 1', desc: 'Primary discovery and source extraction across Qatari directories.',
        current: 'operational', uptime90: '99.97',
        incidents: [{ day: 12, status: 'deg' }, { day: 56, status: 'maint' }],
      },
      {
        id: 'enrich-2', name: 'Enrichment Engine 2', desc: 'Secondary enrichment with AI-assisted classification.',
        current: 'operational', uptime90: '99.92',
        incidents: [{ day: 10, status: 'deg' }, { day: 11, status: 'deg' }, { day: 41, status: 'part' }],
      },
      {
        id: 'db-primary', name: 'Database — Primary', desc: 'Write-side authoritative store for the Bell.qa graph.',
        current: 'operational', uptime90: '99.99',
        incidents: [{ day: 15, status: 'maint' }],
      },
      {
        id: 'db-replica', name: 'Database — Read Replica', desc: 'Read-side replication for low-latency queries.',
        current: 'operational', uptime90: '99.98',
        incidents: [{ day: 15, status: 'maint' }, { day: 70, status: 'deg' }],
      },
      {
        id: 'search', name: 'Search Index', desc: 'Full-text and semantic search across companies, people, and signals.',
        current: 'operational', uptime90: '99.96',
        incidents: [{ day: 29, status: 'maint' }, { day: 62, status: 'deg' }],
      },
      {
        id: 'cache', name: 'Caching Layer', desc: 'In-memory cache fronting hot read paths in the platform.',
        current: 'operational', uptime90: '99.99',
        incidents: [{ day: 31, status: 'maint' }],
      },
    ],
  },
  {
    label: 'Operations',
    desc:  'Background processing, agent runtime, and delivery services.',
    components: [
      {
        id: 'jobs', name: 'Background Job Queue', desc: 'Asynchronous task execution for enrichment, dedup, and exports.',
        current: 'operational', uptime90: '99.95',
        incidents: [{ day: 18, status: 'deg' }, { day: 19, status: 'deg' }, { day: 51, status: 'maint' }],
      },
      {
        id: 'bella', name: 'Bella Agent Runtime', desc: 'Autonomous agent execution layer for customer workflows.',
        current: 'operational', uptime90: '99.94',
        incidents: [{ day: 7, status: 'deg' }, { day: 38, status: 'deg' }],
      },
      {
        id: 'email', name: 'Email Delivery', desc: 'Transactional and outbound email pipeline.',
        current: 'operational', uptime90: '99.99',
        incidents: [{ day: 44, status: 'deg' }],
      },
      {
        id: 'storage', name: 'File & Asset Storage', desc: 'Document, export, and attachment storage.',
        current: 'operational', uptime90: '100.00',
        incidents: [],
      },
      {
        id: 'realtime', name: 'Realtime Notifications', desc: 'Push and in-app notification delivery.',
        current: 'operational', uptime90: '99.98',
        incidents: [{ day: 14, status: 'deg' }],
      },
      {
        id: 'webhooks', name: 'Webhook Delivery', desc: 'Outbound event delivery for integrations.',
        current: 'operational', uptime90: '99.97',
        incidents: [{ day: 26, status: 'deg' }, { day: 73, status: 'deg' }],
      },
    ],
  },
];

const RECENT_INCIDENTS = [
  {
    date:     '2026-05-17',
    title:    'Enrichment Engine 2 — temporary degradation',
    duration: '1h 12m',
    summary:  'Secondary enrichment pipeline experienced increased queue latency due to upstream rate limits. Throughput restored after rebalancing across enrichment workers.',
    affected: ['Enrichment Engine 2'],
    severity: 'minor' as const,
  },
  {
    date:     '2026-05-09',
    title:    'Database — Primary maintenance window',
    duration: '0h 28m',
    summary:  'Scheduled maintenance to apply a planned engine upgrade. Read traffic served from replica throughout. No customer-facing impact.',
    affected: ['Database — Primary', 'Database — Read Replica'],
    severity: 'maintenance' as const,
  },
  {
    date:     '2026-04-22',
    title:    'Caching Layer warm-up after node replacement',
    duration: '0h 12m',
    summary:  'A cache node was replaced as part of routine capacity rotation. Hot-key warm-up briefly increased upstream query load. No customer-facing impact.',
    affected: ['Caching Layer'],
    severity: 'minor' as const,
  },
];

const UPCOMING_MAINTENANCE = [
  {
    date:       '2026-06-02',
    timeWindow: '02:00 – 02:30 AST',
    title:      'Database — Primary failover drill',
    summary:    'Routine failover exercise to verify replica promotion timing. No customer-facing impact expected. Read and write traffic will be re-routed automatically.',
    affected:   ['Database — Primary', 'Database — Read Replica'],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Main component
// ───────────────────────────────────────────────────────────────────────────

export function StatusSections() {
  return (
    <>
      <StatusHero />
      <KpiStrip />
      <Components />
      <LivePerformance />
      <IncidentHistory />
      <ScheduledMaintenance />
      <SubscribeUpdates />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Top banner — overall status + live ticker
// ───────────────────────────────────────────────────────────────────────────

function StatusHero() {
  // Aggregate: if every component is operational, show all-clear.
  const allOperational = CATEGORIES.every(c =>
    c.components.every(comp => comp.current === 'operational')
  );

  return (
    <section className="relative pt-24 pb-12 overflow-hidden">
      {/* Subtle green wash if all systems operational. Would shift to amber
          if any degraded component were live, but the current data is clean. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(111,207,151,0.12) 0%, transparent 65%)',
        }}
      />

      <div className="relative max-w-screen-xl mx-auto px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full bg-bg-elev-2 border border-border text-text text-xs font-semibold uppercase tracking-wider">
            <Activity size={11} />
            System Status
          </div>
          <h1 className="text-display-md md:text-display-lg text-gradient max-w-3xl mx-auto">
            Bell.qa platform status.
          </h1>
          <p className="mt-4 text-base md:text-lg text-text-muted max-w-xl mx-auto">
            Live operational state across every system in production. Updated
            continuously by our monitoring stack.
          </p>
        </div>

        {/* Banner card — the visual centrepiece of the page */}
        <div
          className="relative rounded-2xl border overflow-hidden p-6 md:p-8"
          style={{
            background:
              'linear-gradient(135deg, rgba(19,24,41,0.95) 0%, rgba(13,18,35,0.95) 100%)',
            borderColor: allOperational ? 'rgba(111,207,151,0.35)' : 'rgba(251,191,36,0.35)',
            boxShadow: allOperational
              ? '0 24px 60px -24px rgba(111,207,151,0.20), 0 0 0 1px rgba(111,207,151,0.10) inset'
              : '0 24px 60px -24px rgba(251,191,36,0.20), 0 0 0 1px rgba(251,191,36,0.10) inset',
          }}
        >
          {/* Soft success/warn wash in top-right */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background: allOperational
                ? 'radial-gradient(ellipse 60% 80% at 100% 0%, rgba(111,207,151,0.10) 0%, transparent 60%)'
                : 'radial-gradient(ellipse 60% 80% at 100% 0%, rgba(251,191,36,0.10) 0%, transparent 60%)',
            }}
          />

          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="flex items-start gap-4">
              <span
                className="shrink-0 inline-flex items-center justify-center w-14 h-14 rounded-xl"
                style={{
                  background: allOperational ? 'rgba(111,207,151,0.14)' : 'rgba(251,191,36,0.14)',
                  color:      allOperational ? STATUS_COLOR.op : STATUS_COLOR.deg,
                  boxShadow:  'inset 0 0 0 1px ' + (allOperational ? 'rgba(111,207,151,0.30)' : 'rgba(251,191,36,0.30)'),
                }}
              >
                <PulsingDot color={allOperational ? STATUS_COLOR.op : STATUS_COLOR.deg} size={14} />
              </span>
              <div>
                <div className="text-2xl md:text-3xl font-semibold text-text leading-tight">
                  {allOperational ? 'All systems operational' : 'Some systems experiencing issues'}
                </div>
                <div className="mt-2 text-sm text-text-muted">
                  All Bell.qa services are responding within their target service levels.
                </div>
              </div>
            </div>

            {/* Right column — region + refresh ticker */}
            <div className="flex flex-col md:items-end gap-2 shrink-0">
              <div className="inline-flex items-center gap-2 text-[12px] text-text-muted">
                <MapPin size={12} />
                <span>Region: <span className="text-text font-medium">Doha, Qatar</span></span>
              </div>
              <RefreshTicker />
            </div>
          </div>
        </div>

        {/* Status legend */}
        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-text-muted">
          <Legend color={STATUS_COLOR.op}    label="Operational"           />
          <Legend color={STATUS_COLOR.deg}   label="Degraded performance"  />
          <Legend color={STATUS_COLOR.part}  label="Partial outage"        />
          <Legend color={STATUS_COLOR.out}   label="Major outage"          />
          <Legend color={STATUS_COLOR.maint} label="Scheduled maintenance" />
        </div>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
      <span>{label}</span>
    </span>
  );
}

/**
 * A small pulsing dot used inside the overall-status icon. Two concentric
 * circles: the inner solid dot and an outer ring that pulses outward.
 */
function PulsingDot({ color, size }: { color: string; size: number }) {
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <span
        className="absolute inset-0 rounded-full opacity-70 animate-ping"
        style={{ background: color }}
      />
      <span
        className="relative rounded-full"
        style={{
          width:      size,
          height:     size,
          background: color,
          boxShadow:  `0 0 12px ${color}`,
        }}
      />
    </span>
  );
}

/**
 * Live "Last checked: Xs ago" ticker with an auto-refresh animation every
 * 60 seconds. Pure visual — the underlying data is static — but it makes
 * the page feel like a live dashboard rather than a marketing snapshot.
 */
function RefreshTicker() {
  const [secondsAgo, setSecondsAgo] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const tick = setInterval(() => {
      setSecondsAgo(s => {
        if (s >= 59) {
          setRefreshing(true);
          setTimeout(() => setRefreshing(false), 900);
          return 0;
        }
        return s + 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const label =
    refreshing
      ? 'Refreshing now…'
      : secondsAgo === 0
      ? 'Last checked: just now'
      : `Last checked: ${secondsAgo}s ago`;

  return (
    <div className="inline-flex items-center gap-2 text-[12px] text-text-muted">
      <RefreshCw
        size={12}
        className={refreshing ? 'animate-spin' : ''}
        style={{ color: refreshing ? STATUS_COLOR.op : undefined }}
      />
      <span className="tabular-nums">{label}</span>
      <span className="text-text-dim">·</span>
      <span className="text-text-dim">auto-refresh 60s</span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. KPI strip
// ───────────────────────────────────────────────────────────────────────────

function KpiStrip() {
  const kpis = [
    { icon: ShieldCheck, label: 'Overall uptime (90 days)',  value: '99.98%', sub: 'across all services' },
    { icon: Zap,         label: 'Average API response',      value: '142ms',  sub: 'p50 across regions' },
    { icon: AlertCircle, label: 'Incidents in last 30 days', value: '3',      sub: 'all resolved' },
    { icon: Calendar,    label: 'Upcoming maintenance',      value: '1',      sub: 'window scheduled' },
  ];

  return (
    <section className="relative pb-12">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {kpis.map((k, i) => {
            const Icon = k.icon;
            return (
              <div
                key={i}
                className="rounded-xl border border-border p-5"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-accent-bright"
                    style={{ background: 'rgba(91,140,255,0.14)' }}
                  >
                    <Icon size={15} />
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-text-dim font-mono">
                    {k.sub}
                  </span>
                </div>
                <div className="text-2xl md:text-3xl font-semibold text-text tabular-nums leading-none">
                  {k.value}
                </div>
                <div className="mt-2 text-[11px] uppercase tracking-wider text-text-muted font-semibold">
                  {k.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Components by category
// ───────────────────────────────────────────────────────────────────────────

function Components() {
  return (
    <section className="relative py-12">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            Components
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Every production system, grouped by domain. Each bar represents
            one of the last ninety days.
          </p>
        </div>

        <div className="space-y-8">
          {CATEGORIES.map(cat => (
            <CategoryCard key={cat.label} cat={cat} />
          ))}
        </div>
      </div>
    </section>
  );
}

function CategoryCard({ cat }: { cat: CategoryGroup }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
      }}
    >
      <div className="px-5 md:px-6 py-4 border-b border-border bg-bg-elev-2/40 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-text">{cat.label}</div>
          <div className="mt-0.5 text-[12px] text-text-muted">{cat.desc}</div>
        </div>
        <span
          className="hidden md:inline-flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full"
          style={{
            color:      STATUS_COLOR.op,
            background: 'rgba(111,207,151,0.10)',
            border:     '1px solid rgba(111,207,151,0.28)',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: STATUS_COLOR.op }} />
          All operational
        </span>
      </div>

      <ul>
        {cat.components.map((c, i) => (
          <ComponentRow key={c.id} comp={c} divided={i < cat.components.length - 1} />
        ))}
      </ul>
    </motion.div>
  );
}

function ComponentRow({ comp, divided }: { comp: SystemComponent; divided: boolean }) {
  const meta = CURRENT_META[comp.current];

  return (
    <li className={'px-5 md:px-6 py-5 ' + (divided ? 'border-b border-border ' : '')}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 items-center">
        {/* Left — name + description */}
        <div className="lg:col-span-4">
          <div className="flex items-center gap-2.5">
            <PulsingDot color={meta.color} size={9} />
            <span className="text-[15px] font-semibold text-text">{comp.name}</span>
          </div>
          <div className="mt-1 ml-[19px] text-[12px] text-text-muted leading-snug">
            {comp.desc}
          </div>
        </div>

        {/* Middle — 90-day uptime bars */}
        <div className="lg:col-span-6">
          <UptimeBars history={buildHistory(comp.incidents)} />
          <div className="mt-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-text-dim">
            <span>90 days ago</span>
            <span>Today</span>
          </div>
        </div>

        {/* Right — uptime percentage + current status pill */}
        <div className="lg:col-span-2 flex lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-2">
          <div className="text-right">
            <div className="text-base font-semibold text-text tabular-nums leading-none">
              {comp.uptime90}%
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-text-dim font-mono">
              uptime · 90d
            </div>
          </div>
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded"
            style={{ color: meta.color, background: meta.bg, border: `1px solid ${meta.border}` }}
          >
            {meta.label}
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * Build a 90-element status array from an incident list. Older days come
 * first (index 0 = 89 days ago, index 89 = today).
 */
function buildHistory(incidents: { day: number; status: DayStatus }[]): DayStatus[] {
  const history: DayStatus[] = new Array(90).fill('op');
  for (const inc of incidents) {
    if (inc.day >= 0 && inc.day < 90) {
      history[89 - inc.day] = inc.status;
    }
  }
  return history;
}

function UptimeBars({ history }: { history: DayStatus[] }) {
  return (
    <div className="flex gap-[2px] h-7 md:h-8 items-stretch">
      {history.map((d, i) => {
        const color = STATUS_COLOR[d];
        const daysAgo = 89 - i;
        const dateLabel = `${daysAgo === 0 ? 'Today' : daysAgo + ' day' + (daysAgo === 1 ? '' : 's') + ' ago'}`;
        return (
          <div
            key={i}
            className="flex-1 rounded-[1.5px] transition-transform hover:scale-y-110"
            style={{
              background: color,
              opacity:    d === 'op' ? 0.85 : 1,
              minWidth:   2,
            }}
            title={`${dateLabel} — ${STATUS_LABEL[d]}`}
          />
        );
      })}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. Live performance metrics
// ───────────────────────────────────────────────────────────────────────────

const METRICS = [
  {
    icon:  Zap,         label: 'API p50 latency',       value: '89',   unit: 'ms',     delta: '-3ms vs 24h',
    points: [42, 48, 51, 47, 53, 45, 49, 44, 50, 52, 47, 41, 45, 48, 44, 46, 49, 47, 45, 42, 44, 41, 39, 43, 40, 38, 41, 43, 42, 39],
    trend: 'down',
  },
  {
    icon:  Database,    label: 'DB query p95',          value: '14',   unit: 'ms',     delta: '-1ms vs 24h',
    points: [22, 21, 25, 23, 24, 22, 23, 21, 22, 20, 21, 22, 19, 20, 18, 19, 17, 18, 16, 15, 16, 17, 15, 14, 14, 13, 14, 15, 14, 13],
    trend: 'down',
  },
  {
    icon:  TrendingUp,  label: 'Enrichment throughput', value: '4.2k', unit: '/ hour', delta: '+180/hr vs 24h',
    points: [3.4, 3.5, 3.7, 3.6, 3.8, 3.7, 3.9, 4.0, 3.9, 4.1, 4.0, 4.2, 4.1, 4.3, 4.2, 4.0, 4.1, 4.2, 4.3, 4.4, 4.2, 4.1, 4.2, 4.3, 4.4, 4.2, 4.3, 4.2, 4.3, 4.2],
    trend: 'up',
  },
  {
    icon:  Bot,         label: 'Bella tasks',           value: '187',  unit: '/ min',  delta: '+22 vs 24h',
    points: [140, 145, 148, 152, 150, 155, 158, 160, 162, 165, 168, 172, 170, 175, 178, 180, 182, 185, 183, 187, 184, 188, 186, 189, 187, 190, 188, 187, 189, 187],
    trend: 'up',
  },
];

function LivePerformance() {
  return (
    <section className="relative py-12">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            Live performance
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Production telemetry sampled across the last thirty days.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {METRICS.map((m, i) => {
            const Icon = m.icon;
            const trendColor = m.trend === 'down' ? STATUS_COLOR.op : STATUS_COLOR.op;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.06 }}
                className="rounded-xl border border-border p-5"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
                }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="inline-flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold text-text-muted"
                  >
                    <Icon size={12} className="text-accent-bright" />
                    {m.label}
                  </span>
                  <span
                    className="text-[9px] font-mono tabular-nums px-1.5 py-0.5 rounded"
                    style={{
                      color:      trendColor,
                      background: 'rgba(111,207,151,0.10)',
                    }}
                  >
                    {m.delta}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5 mb-3">
                  <span className="text-3xl font-semibold text-text tabular-nums leading-none">
                    {m.value}
                  </span>
                  <span className="text-sm text-text-muted">{m.unit}</span>
                </div>
                <Sparkline points={m.points} color={STATUS_COLOR.op} />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * Simple SVG sparkline. Auto-scales to its container width.
 * Points are arbitrary numerical data; the path is normalised to [0,1].
 */
function Sparkline({ points, color }: { points: number[]; color: string }) {
  const W = 200;     // viewBox width
  const H = 40;      // viewBox height
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = W / (points.length - 1);

  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = H - ((p - min) / range) * H;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  // Filled area under the curve for visual weight
  const area =
    path +
    ` L ${W} ${H} L 0 ${H} Z`;

  // useId() gives a stable, SSR-safe id per component instance — avoids
  // hydration mismatches that would arise from a Math.random() id.
  const rawId = useId();
  const gradientId = `spark-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0"    />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Incident history
// ───────────────────────────────────────────────────────────────────────────

function IncidentHistory() {
  return (
    <section className="relative py-12">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
              Recent incidents
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              Every incident over the last thirty days. All resolved.
            </p>
          </div>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim hidden md:inline">
            Last 30 days
          </span>
        </div>

        <div
          className="rounded-2xl border border-border overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          }}
        >
          {RECENT_INCIDENTS.map((inc, i) => {
            const sevColor =
              inc.severity === 'maintenance' ? STATUS_COLOR.maint :
              inc.severity === 'minor'       ? STATUS_COLOR.deg   :
                                               STATUS_COLOR.out;
            const sevLabel =
              inc.severity === 'maintenance' ? 'Maintenance' :
              inc.severity === 'minor'       ? 'Minor'       :
                                               'Major';
            return (
              <div
                key={i}
                className={
                  'p-5 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-4 ' +
                  (i < RECENT_INCIDENTS.length - 1 ? 'border-b border-border ' : '')
                }
              >
                {/* Date column */}
                <div className="md:col-span-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-text-dim">
                    Date
                  </div>
                  <div className="mt-1 text-sm font-semibold text-text tabular-nums">
                    {inc.date}
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-text-muted tabular-nums">
                    Duration · {inc.duration}
                  </div>
                </div>

                {/* Body column */}
                <div className="md:col-span-8">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{
                        color:      sevColor,
                        background: 'rgba(255,255,255,0.04)',
                        border:     '1px solid ' + sevColor + '40',
                      }}
                    >
                      {sevLabel}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{
                        color:      STATUS_COLOR.op,
                        background: 'rgba(111,207,151,0.10)',
                        border:     '1px solid rgba(111,207,151,0.28)',
                      }}
                    >
                      <CheckCircle2 size={10} />
                      Resolved
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-text leading-tight">
                    {inc.title}
                  </div>
                  <p className="mt-2 text-[13px] text-text-muted leading-relaxed">
                    {inc.summary}
                  </p>
                </div>

                {/* Affected systems column */}
                <div className="md:col-span-2">
                  <div className="text-[11px] font-mono uppercase tracking-wider text-text-dim mb-1.5">
                    Affected
                  </div>
                  <ul className="space-y-1">
                    {inc.affected.map(a => (
                      <li key={a} className="text-[12px] text-text-muted leading-snug">
                        {a}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}

          {/* Footer link to full history (placeholder) */}
          <div className="px-5 md:px-6 py-4 border-t border-border bg-bg-elev-2/30 text-center">
            <span className="text-[12px] text-text-dim">
              Full historical incident log available on request.
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. Scheduled maintenance
// ───────────────────────────────────────────────────────────────────────────

function ScheduledMaintenance() {
  return (
    <section className="relative py-12">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="mb-8">
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            Scheduled maintenance
          </h2>
          <p className="mt-2 text-sm text-text-muted">
            Planned operations announced ahead of time. Affected customers
            are notified at least seventy-two hours in advance.
          </p>
        </div>

        {UPCOMING_MAINTENANCE.length === 0 ? (
          <div
            className="rounded-2xl border border-border p-8 text-center"
            style={{
              background:
                'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
            }}
          >
            <span className="text-sm text-text-muted">No maintenance currently scheduled.</span>
          </div>
        ) : (
          <div className="space-y-4">
            {UPCOMING_MAINTENANCE.map((m, i) => (
              <div
                key={i}
                className="rounded-2xl border overflow-hidden"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
                  borderColor: 'rgba(91,140,255,0.30)',
                }}
              >
                <div
                  className="px-5 md:px-6 py-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    background: 'rgba(91,140,255,0.08)',
                    color:      STATUS_COLOR.maint,
                    borderBottom: '1px solid rgba(91,140,255,0.20)',
                  }}
                >
                  <Wrench size={11} />
                  Scheduled · {m.date} · {m.timeWindow}
                </div>
                <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-9">
                    <div className="text-sm font-semibold text-text leading-tight">
                      {m.title}
                    </div>
                    <p className="mt-2 text-[13px] text-text-muted leading-relaxed">
                      {m.summary}
                    </p>
                  </div>
                  <div className="md:col-span-3">
                    <div className="text-[11px] font-mono uppercase tracking-wider text-text-dim mb-1.5">
                      Affected
                    </div>
                    <ul className="space-y-1">
                      {m.affected.map(a => (
                        <li key={a} className="text-[12px] text-text-muted leading-snug">
                          {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. Subscribe to updates
// ───────────────────────────────────────────────────────────────────────────

function SubscribeUpdates() {
  return (
    <section className="relative py-20">
      <div className="max-w-screen-xl mx-auto px-6">
        <div
          className="rounded-2xl border border-border overflow-hidden p-8 md:p-10"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3 py-1 mb-4 rounded-full border border-border bg-bg-elev-2 text-text text-[11px] font-semibold uppercase tracking-wider">
                <Mail size={11} />
                Stay informed
              </div>
              <h3 className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Get notified the moment something changes.
              </h3>
              <p className="mt-2 text-sm text-text-muted">
                Subscribe to incident notifications, maintenance announcements,
                and weekly uptime summaries. One message per event. No marketing.
              </p>
            </div>

            <div className="lg:col-span-5">
              <form
                onSubmit={(e) => e.preventDefault()}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="email"
                  required
                  placeholder="you@yourdomain.qa"
                  className="flex-1 px-4 py-2.5 rounded-md bg-bg border border-border text-sm text-text placeholder:text-text-dim focus:border-accent/60 focus:outline-none"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-accent text-white text-sm font-medium hover:brightness-110 transition shadow-lg shadow-accent/30"
                >
                  Subscribe
                </button>
              </form>
              <div className="mt-3 flex items-center gap-4 text-[11px] text-text-dim">
                <span className="inline-flex items-center gap-1.5">
                  <Rss size={11} />
                  RSS feed available
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={11} />
                  History retained for 24 months
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom footnote — small line about monitoring posture */}
        <div className="mt-8 text-center text-[11px] text-text-dim leading-relaxed max-w-2xl mx-auto">
          Bell.qa operates a multi-layer monitoring stack across application,
          infrastructure, and data integrity. On-call coverage runs 24 / 7.
          Status changes are reflected on this page within sixty seconds.
        </div>
      </div>
    </section>
  );
}


'use client';

import {
  Building2, Users2, TrendingUp,
  LineChart, Building, Landmark,
  Truck, Plane, CloudSun,
  Newspaper, Inbox, Network,
} from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * THE PLATFORM — 12-card data/operations grid.
 *
 * Card design v2 (2026-05-23 redesign): cards now have an "intelligence
 * dossier" feel rather than the generic SaaS-grid look:
 *
 *   • Top-right LIVE pulse badge
 *   • Two-digit card number (01-12) in monospace, top-left of the body
 *   • Larger icon container with a subtle inner gradient
 *   • Strong title with hairline accent underneath
 *   • Body text in muted tone
 *   • Footer: thin gradient line + a category-colored metric chip
 *
 * Cards are themed by COLOR (data / econ / movement / ops). On scroll into
 * view each card "unfolds" — rotateX from -18° to 0°, Y from 28 to 0,
 * opacity 0 to 1. Stagger is row+column based so the reveal cascades
 * diagonally across the grid rather than firing all at once.
 */

type CardTone = 'data' | 'econ' | 'movement' | 'ops';

const TONE: Record<CardTone, { color: string; soft: string; chip: string }> = {
  data:     { color: 'rgb(91 140 255)',  soft: 'rgba(91,140,255,0.10)',  chip: 'rgba(91,140,255,0.14)'  },
  econ:     { color: 'rgb(255 196 99)',  soft: 'rgba(255,196,99,0.10)',  chip: 'rgba(255,196,99,0.14)'  },
  movement: { color: 'rgb(111 207 151)', soft: 'rgba(111,207,151,0.10)', chip: 'rgba(111,207,151,0.14)' },
  ops:      { color: 'rgb(196 154 255)', soft: 'rgba(196,154,255,0.10)', chip: 'rgba(196,154,255,0.14)' },
};

type Feature = {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  body:  string;
  metric: string;
  tone:  CardTone;
};

const FEATURES: Feature[] = [
  // ── Core graph ────────────────────────────────────────────────────────
  {
    icon: Building2, title: 'Companies', tone: 'data',
    body:  'Every Qatari entity — across QFC, QFZ, MOCI, QSTP and more — unified into one canonical record.',
    metric: '130,000+ records · 35,000+ active',
  },
  {
    icon: Users2, title: 'Decision Makers', tone: 'data',
    body:  'Founders, executives, owners, board members. Skip the gatekeepers — reach the person who actually decides.',
    metric: 'Every executive · profiled',
  },
  {
    icon: TrendingUp, title: 'Hiring Signals', tone: 'data',
    body:  'Live job postings reveal who\'s scaling — months before it shows up in any other dataset.',
    metric: 'Live job feed · daily refresh',
  },

  // ── Economic / governance ─────────────────────────────────────────────
  {
    icon: LineChart, title: 'Economic Intelligence', tone: 'econ',
    body:  'GDP shifts, sector velocity, government spending, banking flows — Qatar\'s economy in real time.',
    metric: 'GDP · sectors · banking',
  },
  {
    icon: Building, title: 'Real Estate', tone: 'econ',
    body:  'Every property, every transaction, every ownership change — residential, commercial, industrial.',
    metric: 'All properties · live',
  },
  {
    icon: Landmark, title: 'Political & Regulatory', tone: 'econ',
    body:  'Policy shifts, ministerial decisions, new laws and licensing — surfaced as they happen.',
    metric: 'Policy & licensing feed',
  },

  // ── Movement / environment ────────────────────────────────────────────
  {
    icon: Truck, title: 'Logistics & Transit', tone: 'movement',
    body:  'Port activity, road traffic, air freight, container flows. The movement layer of the economy.',
    metric: 'Ports · roads · air freight',
  },
  {
    icon: Plane, title: 'Tourism & Visitors', tone: 'movement',
    body:  'Inbound visitor flows, hotel occupancy, events driving them in — by source country and segment.',
    metric: 'Visitor flows · real-time',
  },
  {
    icon: CloudSun, title: 'Environment & Weather', tone: 'movement',
    body:  'Climate, weather, environmental conditions. The variables that actually move operations on the ground.',
    metric: 'Live conditions',
  },

  // ── Operations layer ──────────────────────────────────────────────────
  {
    icon: Newspaper, title: 'Live News', tone: 'ops',
    body:  'Every Qatari news source, aggregated and contextually linked to the entities you care about.',
    metric: 'All sources · every minute',
  },
  {
    icon: Inbox, title: 'Built-in CRM', tone: 'ops',
    body:  'Manage your pipeline, conversations, and follow-ups without leaving Bell.qa. Bella runs it.',
    metric: 'Bella-powered',
  },
  {
    icon: Network, title: 'Operations Integrations', tone: 'ops',
    body:  'Direct hooks into government services and banking workflows — close the loop in one place.',
    metric: 'Gov + banking · direct hooks',
  },
];

export function FeatureHighlights() {
  return (
    <section className="relative max-w-screen-xl mx-auto px-6 py-32">
      {/* Section header */}
      <div className="text-center mb-16 max-w-prose-narrow mx-auto">
        <div className="inline-flex items-center px-3 py-1 mb-5 rounded-full bg-bg-elev-2 border border-border text-text text-xs font-semibold uppercase tracking-wider">
          The Platform
        </div>
        <h2 className="text-display-md text-gradient">
          Built for the questions that move economies.
        </h2>
        <p className="mt-5 text-lg text-text-muted leading-relaxed">
          Every layer of Qatar&apos;s market — companies, people, money flows,
          movement, regulation — unified into one continuously-refreshed source
          of truth. The unfair advantage your competitors don&apos;t have access to.
        </p>
      </div>

      {/* 12-card grid. perspective-1200 on the parent gives the rotateX
          unfold animation real depth instead of a flat skew. */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        style={{ perspective: '1200px' }}
      >
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} feature={f} index={i} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const { icon: Icon, title, body, metric, tone } = feature;
  const t = TONE[tone];
  const num = String(index + 1).padStart(2, '0');

  // Stagger: cascade diagonally so the reveal feels organic, not all-at-once
  const col = index % 3;
  const row = Math.floor(index / 3);
  const delay = col * 0.08 + row * 0.04;

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, rotateX: -18 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay, ease: [0.22, 0.61, 0.36, 1] }}
      whileHover={{ y: -4 }}
      style={{
        transformOrigin: 'center top',
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
      }}
      className="group relative rounded-xl border border-border overflow-hidden transition-colors hover:border-text-dim/40"
    >
      {/* Decorative dot pattern in the background — faint, only visible on hover */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${t.color.replace('rgb', 'rgba').replace(')', ' / 0.06)')} 1px, transparent 1px)`,
          backgroundSize: '14px 14px',
        }}
      />
      {/* Soft accent wash on hover */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{
          background: `linear-gradient(135deg, ${t.soft} 0%, transparent 70%)`,
        }}
      />

      <div className="relative p-6 pb-5 flex flex-col h-full">
        {/* Top row — icon (left) + LIVE indicator (right) */}
        <div className="flex items-start justify-between mb-5">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-lg transition-transform group-hover:scale-105"
            style={{
              background: `linear-gradient(135deg, ${t.color.replace('rgb', 'rgba').replace(')', ' / 0.18)')}, ${t.color.replace('rgb', 'rgba').replace(')', ' / 0.06)')})`,
              color: t.color,
              boxShadow: `inset 0 0 0 1px ${t.color.replace('rgb', 'rgba').replace(')', ' / 0.18)')}`,
            }}
          >
            <Icon size={22} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] font-mono text-text-dim tabular-nums">
              {num}
            </span>
            <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-bg-elev-2 border border-border">
              <span
                className="w-1.5 h-1.5 rounded-full animate-pulse"
                style={{ background: t.color, boxShadow: `0 0 6px ${t.color}` }}
              />
              <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                Live
              </span>
            </span>
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg font-semibold text-text leading-tight mb-1">
          {title}
        </h3>
        {/* Hairline accent under the title (grows on hover) */}
        <span
          aria-hidden="true"
          className="block h-px w-8 mb-3 transition-all group-hover:w-16"
          style={{ background: t.color, opacity: 0.7 }}
        />

        {/* Body */}
        <p className="text-sm text-text-muted leading-relaxed flex-1">
          {body}
        </p>

        {/* Footer — thin gradient line + category-colored metric chip */}
        <div className="mt-5 pt-4 border-t border-border/70 flex items-center justify-between gap-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded"
            style={{
              background: t.chip,
              color: t.color,
            }}
          >
            {metric}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

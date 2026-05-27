'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BrainCircuit, ArrowRight, Flame, Handshake, AlertTriangle,
  Crown, TrendingUp, ShieldCheck, Users, Coins,
  Clock, Sparkles, Radar, Crosshair, Network, GitBranch,
  BarChart3, Layers, History, Check, BadgeCheck, Target,
  Megaphone, Microscope, Rocket, MessageSquare, Eye,
  RefreshCw, MinusCircle, PlusCircle,
  Bot, Inbox, Map as MapIcon,
} from 'lucide-react';

/**
 * PREDICTION ENGINE PAGE — capability deep-dive.
 *
 * Macro counterpart to Buyer Intent. Where Buyer Intent says "this
 * account is hot," Prediction Engine says "this sector is heating,"
 * "this deal closes in 60 days," "this competitor moves next quarter,"
 * "this demand wave is forming." Probability-weighted, decomposable,
 * time-horizoned.
 *
 * Centerpiece: an 8-card Forecast Atlas mixing all five forecast
 * categories (sector / deal / churn / competitive / demand). Each card
 * shows the forecast claim, a circular probability gauge, time horizon,
 * contributing factors, and a confidence-interval caption.
 *
 * Tone: strategic hero, operational depth.
 * Anchor: country-scale.
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. PredictionHero        — "See the future of the Qatari market."
 *     2. PredictionActivityBar
 *     3. TheForecastAtlas      — CENTERPIECE — 8 forecasts in a grid
 *
 *   ROUND 2+ (to be added):
 *     4. WhatFeedsPredictions  — inputs Bell consumes
 *     5. ConfidenceAndCitation — methodology / how to trust them
 *     6. HowTeamsActOnForecasts — 5 function-lens cards
 *     7. ConnectedToPlatform
 *     8. MidPageCta
 *     9. OtherFunctions
 *    10. ThreeReader           — analyst / strategy lead / exec
 *    11. FinalCta
 */

export function PredictionEnginePageSections() {
  return (
    <>
      <PredictionHero />
      <PredictionActivityBar />
      <TheForecastAtlas />
      <WhatFeedsPredictions />
      <ConfidenceAndCitation />
      <HowTeamsActOnForecasts />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. PredictionHero — strategic opening
// ───────────────────────────────────────────────────────────────────────────

function PredictionHero() {
  return (
    <section className="relative pt-28 md:pt-32 pb-20 md:pb-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 0%, rgba(111,207,151,0.18) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/40 backdrop-blur text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-7">
            <BrainCircuit size={12} className="text-accent-bright" />
            <span>Intelligence &middot; Prediction Engine</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">See the future</span>
            <br />
            <span className="text-text">of the Qatari market.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Bell weighs every signal, every intent recognition, every
            graph pattern, every macro indicator &mdash; and produces
            probability-weighted forecasts across sectors, deals,
            churn risk, competitive moves, and demand waves.
          </p>
          <p className="mt-4 text-[13.5px] text-text-dim leading-relaxed max-w-2xl">
            Where{' '}
            <Link href="/platform/buyer-intent" className="text-accent-bright hover:text-text transition-colors underline decoration-accent-bright/30 underline-offset-2">
              Buyer Intent
            </Link>
            {' '}says &lsquo;this account is hot,&rsquo; Prediction
            Engine says &lsquo;this sector is heating up,&rsquo;
            &lsquo;this deal closes in 60 days,&rsquo; &lsquo;this
            competitor moves next quarter.&rsquo; Different scales.
            One engine.
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
// 2. PredictionActivityBar — cycling live counters
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Forecasts active',      value: '47',    sub: 'across categories'                  },
  { label: 'Avg confidence',        value: '84%',   sub: 'weighted across active forecasts'   },
  { label: 'Contributing signals',  value: '312',   sub: 'per forecast, typical'              },
  { label: 'Average lead time',     value: '18 days', sub: 'forecast → observed outcome' },
  { label: 'Directional accuracy',  value: '91%',   sub: 'last 90 days'                       },
];

function PredictionActivityBar() {
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
              Live forecast surface &middot; whole Qatari market
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
// 3. TheForecastAtlas — CENTERPIECE — 8 forecasts in a grid
// ───────────────────────────────────────────────────────────────────────────

type ForecastCategory =
  | 'sector' | 'deal' | 'churn' | 'competitive'
  | 'demand' | 'regulatory' | 'labor' | 'capital';

type Forecast = {
  category:   ForecastCategory;
  statement:  string;
  probability:number;   // 0-100
  horizon:    string;
  factors:    string[];
  confidence: string;
};

const CATEGORY_META: Record<ForecastCategory, { label: string; color: string; icon: React.ComponentType<{ size?: number | string }> }> = {
  sector:      { label: 'Sector heat',       color: 'rgb(255 196 99)',  icon: Flame         },
  deal:        { label: 'Deal close',        color: 'rgb(111 207 151)', icon: Handshake     },
  churn:       { label: 'Churn risk',        color: 'rgb(232 142 168)', icon: AlertTriangle },
  competitive: { label: 'Competitive move',  color: 'rgb(196 154 255)', icon: Crown         },
  demand:      { label: 'Demand wave',       color: 'rgb(91 140 255)',  icon: TrendingUp    },
  regulatory:  { label: 'Regulatory shift',  color: 'rgb(165 195 255)', icon: ShieldCheck   },
  labor:       { label: 'Labor market',      color: 'rgb(255 159 180)', icon: Users         },
  capital:     { label: 'Capital flow',      color: 'rgb(111 207 151)', icon: Coins         },
};

const FORECASTS: Forecast[] = [
  {
    category:   'sector',
    statement:  'Qatari private healthcare consolidates into 3 clusters by Q3 2027.',
    probability:74,
    horizon:    'Next 18 months',
    factors:    ['M&A signals at 3 family-office LPs', 'CFO turnover in 4 providers', 'Regulator push toward consolidation'],
    confidence: 'High &middot; 312 contributing signals',
  },
  {
    category:   'deal',
    statement:  'Khaleej x QTerminals expansion deal closes within 60 days.',
    probability:68,
    horizon:    'Next 60 days',
    factors:    ['CIO engaged on calls', 'Tech-stack RFP completed', 'Budget cycle aligned'],
    confidence: 'Medium-high &middot; deal-graph pattern match',
  },
  {
    category:   'churn',
    statement:  'A high-revenue account in your portfolio is at 35% churn risk by year-end.',
    probability:35,
    horizon:    'Next 6 months',
    factors:    ['Engagement frequency dropped 40%', 'Competitor LinkedIn outreach', 'Decision-maker departure'],
    confidence: 'Watch closely &middot; reversible',
  },
  {
    category:   'competitive',
    statement:  'Marsa Capital launches a healthcare-focused fund within 90 days.',
    probability:61,
    horizon:    'Next 90 days',
    factors:    ['Recent hiring of healthcare partner', 'Public statements at 2 panels', 'LP fundraising activity'],
    confidence: 'Medium &middot; 4 corroborating signals',
  },
  {
    category:   'demand',
    statement:  'GCC fintech licence-application wave in Q1 2027.',
    probability:79,
    horizon:    'Next 6-9 months',
    factors:    ['QCB sandbox slots increased', 'Cross-border payment volume growth', 'Regional regulatory harmonization'],
    confidence: 'High &middot; 4 markets, 18 indicators',
  },
  {
    category:   'regulatory',
    statement:  'QFMA tightens ESG disclosure requirements in the next 90 days.',
    probability:82,
    horizon:    'Next 90 days',
    factors:    ['Recent QFMA circular drafts', 'Public commentary period closed', 'Regional regulator alignment'],
    confidence: 'High &middot; near-term, low dissent',
  },
  {
    category:   'labor',
    statement:  'Tech-stack-migration hiring wave in Qatari banks, Q1-Q2.',
    probability:71,
    horizon:    'Next 4-6 months',
    factors:    ['Cloud-modernization job posts up 220%', 'CTO-track openings at 3 banks', 'Vendor RFPs in progress'],
    confidence: 'Medium-high &middot; 220% YoY pattern',
  },
  {
    category:   'capital',
    statement:  'Family-office capital rotates from real estate to healthcare over 6 months.',
    probability:58,
    horizon:    'Next 6 months',
    factors:    ['Public allocation statements at 2 family offices', 'Cooling RE-development pipeline', 'Healthcare M&A interest'],
    confidence: 'Medium &middot; early-signal, watch quarterly',
  },
];

function TheForecastAtlas() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The forecast atlas
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Eight live forecasts. Five categories. One engine.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            What Bell.qa believes is about to happen in the Qatari
            market, right now &mdash; each forecast probability-weighted,
            time-horizoned, and decomposable to the signals driving it.
            Illustrative here; live and cited inside the workspace.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {FORECASTS.map((forecast, i) => (
            <ForecastCard key={i} forecast={forecast} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function ForecastCard({ forecast, index }: { forecast: Forecast; index: number }) {
  const meta = CATEGORY_META[forecast.category];
  const Icon = meta.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        borderColor: meta.color.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
        boxShadow:   '0 12px 32px -16px ' + meta.color.replace('rgb', 'rgba').replace(')', ' / 0.32)'),
      }}
    >
      {/* Header — category + probability gauge */}
      <div
        className="px-4 py-4 border-b flex items-start justify-between gap-3"
        style={{
          borderColor: meta.color.replace('rgb', 'rgba').replace(')', ' / 0.20)'),
          background:  meta.color.replace('rgb', 'rgba').replace(')', ' / 0.06)'),
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
            style={{
              background: meta.color.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
              color:      meta.color,
            }}
          >
            <Icon size={15} />
          </span>
          <div className="min-w-0">
            <div
              className="text-[10px] font-mono font-semibold uppercase tracking-wider leading-tight"
              style={{ color: meta.color }}
            >
              {meta.label}
            </div>
            <div className="text-[10px] text-text-dim mt-0.5 flex items-center gap-1">
              <Clock size={9} />
              <span className="font-mono">{forecast.horizon}</span>
            </div>
          </div>
        </div>

        {/* Probability gauge — SVG ring */}
        <ProbabilityGauge value={forecast.probability} color={meta.color} />
      </div>

      {/* Body — statement + factors */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        <p className="text-[13px] text-text leading-snug font-medium">
          {forecast.statement}
        </p>

        <div>
          <div className="text-[9.5px] font-mono uppercase tracking-wider text-text-dim mb-1.5">
            Contributing factors
          </div>
          <ul className="space-y-1">
            {forecast.factors.map((f, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-[11.5px] text-text-muted leading-snug"
              >
                <span
                  className="mt-1.5 shrink-0 w-1 h-1 rounded-full"
                  style={{ background: meta.color }}
                  aria-hidden="true"
                />
                <span dangerouslySetInnerHTML={{ __html: f }} />
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Footer — confidence */}
      <div
        className="px-4 py-2.5 border-t text-[10.5px] text-text-dim italic flex items-center gap-1.5"
        style={{
          borderColor: 'rgba(255,255,255,0.04)',
          background:  'rgba(255,255,255,0.015)',
        }}
      >
        <Sparkles size={10} style={{ color: meta.color }} />
        <span dangerouslySetInnerHTML={{ __html: forecast.confidence }} />
      </div>
    </motion.div>
  );
}

function ProbabilityGauge({ value, color }: { value: number; color: string }) {
  // SVG arc gauge — 36×36 with stroke-dasharray driving the fill.
  const size       = 44;
  const stroke     = 4;
  const radius     = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - value / 100);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={stroke}
        />
        {/* Progress arc — starts at top, sweeps clockwise */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ filter: 'drop-shadow(0 0 4px ' + color.replace('rgb', 'rgba').replace(')', ' / 0.55)') + ')' }}
        />
      </svg>
      {/* Percentage label in the center */}
      <div
        className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums"
        style={{ color }}
      >
        {value}%
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. WhatFeedsPredictions — eight inputs Bell weighs
// ───────────────────────────────────────────────────────────────────────────

type ForecastInput = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  body:    string;
  example: string;
  tint:    string;
};

const FORECAST_INPUTS: ForecastInput[] = [
  {
    icon:    Radar,
    label:   'Signal stream',
    body:    'Every public-record signal Bell picks up feeds the forecast models. Higher velocity = stronger directional signal.',
    example: 'A spike in QFC fintech licences in 30 days shifts the demand-wave forecast upward.',
    tint:    'rgb(255 196 99)',
  },
  {
    icon:    Crosshair,
    label:   'Intent recognition',
    body:    'Account-level intent scoring rolls up into sector-level probability.',
    example: 'When 8 of 12 logistics operators cross HIGH intent, sector heat moves with them.',
    tint:    'rgb(255 159 180)',
  },
  {
    icon:    Network,
    label:   'Graph patterns',
    body:    'The company graph itself &mdash; ownership clusters, board overlaps, supplier chains, family-office portfolios.',
    example: 'When a family-office LP signals liquidity, all portfolio companies inherit elevated M&A probability.',
    tint:    'rgb(196 154 255)',
  },
  {
    icon:    History,
    label:   'Time-series',
    body:    'Historical patterns: seasonality, cadence, velocity. Bell knows how the Qatari market moves through a year.',
    example: 'Q1 budget cycles produce predictable RFP waves &mdash; modeled three quarters ahead.',
    tint:    'rgb(91 140 255)',
  },
  {
    icon:    Users,
    label:   'Peer-buying patterns',
    body:    'When a peer cluster moves, others follow. Bell tracks adjacency by sector, region, ownership type.',
    example: 'Three Qatari banks adopt a new TMS &mdash; peer forecasts shift for the remaining banks.',
    tint:    'rgb(111 207 151)',
  },
  {
    icon:    BarChart3,
    label:   'Macro indicators',
    body:    'Capital flows, hiring waves, regulatory cadence, sector-level investment direction.',
    example: 'Cooling real-estate development + rising healthcare M&A = capital-rotation forecast.',
    tint:    'rgb(165 195 255)',
  },
  {
    icon:    Crown,
    label:   'Decision-unit movement',
    body:    'CEO/CFO/CTO turnover patterns &mdash; particularly when correlated across a sector.',
    example: 'Three healthcare CFOs change in 6 months &mdash; sector consolidation probability climbs.',
    tint:    'rgb(232 142 168)',
  },
  {
    icon:    TrendingUp,
    label:   'Sector momentum',
    body:    'Aggregate sector signal volume + direction over time &mdash; the velocity dimension.',
    example: 'Logistics signal volume up 38% in 60 days &mdash; sector-heat forecast pushed forward.',
    tint:    'rgb(111 207 151)',
  },
];

function WhatFeedsPredictions() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What feeds the forecasts
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Eight inputs. One probabilistic model.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Forecasts don&apos;t come from a single oracle. Bell weighs
            eight kinds of evidence in parallel, then reconciles them
            into probability-weighted scenarios across the Qatari
            market.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {FORECAST_INPUTS.map((input, i) => (
            <InputCard key={input.label} input={input} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function InputCard({ input, index }: { input: ForecastInput; index: number }) {
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
          <h3 className="text-[13.5px] font-semibold text-text leading-snug">
            {input.label}
          </h3>
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
// 5. ConfidenceAndCitation — methodology / how to trust them
// ───────────────────────────────────────────────────────────────────────────

type MethodPillar = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  body:    string;
  detail:  string;
  tint:    string;
};

const METHOD_PILLARS: MethodPillar[] = [
  {
    icon:    BadgeCheck,
    label:   'Probability, weighted',
    body:    'Every forecast carries an explicit probability &mdash; computed from contributing signals, not declared.',
    detail:  'The number moves as the underlying signals move.',
    tint:    'rgb(111 207 151)',
  },
  {
    icon:    Layers,
    label:   'Confidence interval',
    body:    'Forecasts are tiered: high / medium-high / medium / watch-closely / early-signal.',
    detail:  'Bell tells you when to act on it and when to keep watching.',
    tint:    'rgb(91 140 255)',
  },
  {
    icon:    GitBranch,
    label:   'Contributing signals cited',
    body:    'Every forecast lists the signals that drove it &mdash; clickable, sourced, time-stamped.',
    detail:  'No black box. Trace any forecast back to public-record evidence.',
    tint:    'rgb(196 154 255)',
  },
  {
    icon:    MinusCircle,
    label:   'Dissent shown',
    body:    'Counter-signals that pull the forecast the other way are surfaced alongside the supporting ones.',
    detail:  'You see what would have to change for the forecast to flip.',
    tint:    'rgb(232 142 168)',
  },
  {
    icon:    RefreshCw,
    label:   'Replay from any date',
    body:    'Roll the model backward. See what the forecast would have said 30, 90, 180 days ago.',
    detail:  'Calibrates your trust before you act on a live forecast.',
    tint:    'rgb(255 196 99)',
  },
  {
    icon:    Check,
    label:   'Outcomes tracked',
    body:    '91% directional accuracy last 90 days &mdash; published, not claimed. Every forecast scored at horizon.',
    detail:  'Past performance, public to your team. The number on this page is the actual.',
    tint:    'rgb(165 195 255)',
  },
];

function ConfidenceAndCitation() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Confidence &amp; citation
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Forecasts you can defend in the room.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            A forecast is only as good as its accountability. Bell&apos;s
            engine surfaces the probability, the confidence tier, the
            signals that drove it, the signals that argue against it,
            the replay history, and the outcome score.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {METHOD_PILLARS.map((p, i) => (
            <MethodPillarCard key={p.label} pillar={p} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function MethodPillarCard({ pillar, index }: { pillar: MethodPillar; index: number }) {
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
          <p
            className="mt-1 text-[12.5px] text-text-muted leading-relaxed"
            dangerouslySetInnerHTML={{ __html: pillar.body }}
          />
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
// 6. HowTeamsActOnForecasts — five function-lens cards
// ───────────────────────────────────────────────────────────────────────────

type FunctionLens = {
  team:    string;
  href:    string;
  icon:    React.ComponentType<{ size?: number | string }>;
  tint:    string;
  uses:    string;
  example: string;
};

const FUNCTION_LENSES: FunctionLens[] = [
  {
    team:    'Sales',
    href:    '/platform/sales',
    icon:    Target,
    tint:    'rgb(91 140 255)',
    uses:    'Deal-close probability',
    example: "Layla works the QTerminals deal first &mdash; forecast says 68% close in 60 days.",
  },
  {
    team:    'Marketing',
    href:    '/platform/marketing',
    icon:    Megaphone,
    tint:    'rgb(255 196 99)',
    uses:    'Demand-wave forecasts',
    example: "Khalid pre-positions the fintech campaign for Q1 &mdash; demand wave forecast at 79%.",
  },
  {
    team:    'BD',
    href:    '/platform/business-development',
    icon:    Handshake,
    tint:    'rgb(196 154 255)',
    uses:    'Competitive-move forecasts',
    example: "Tariq scopes the healthcare-fund partnership early &mdash; Marsa Capital launch forecast at 61%.",
  },
  {
    team:    'Research',
    href:    '/platform/research',
    icon:    Microscope,
    tint:    'rgb(111 207 151)',
    uses:    'Sector-heat forecasts',
    example: "Hassan commissions the healthcare consolidation deep-dive ahead of demand &mdash; forecast at 74%.",
  },
  {
    team:    'GTM',
    href:    '/platform/gtm',
    icon:    Rocket,
    tint:    'rgb(165 195 255)',
    uses:    'Macro / regulatory forecasts',
    example: "Sami times the fintech entry into Q1 &mdash; QCB sandbox demand wave + regulator alignment.",
  },
];

function HowTeamsActOnForecasts() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            How the teams act on forecasts
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Five functions. Five horizons. One source.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Each function team reaches for a different category of
            forecast &mdash; deal-close for Sales, demand-wave for
            Marketing, competitive for BD, sector for Research, macro
            for GTM. Same engine, different lens.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {FUNCTION_LENSES.map((lens, i) => (
            <FunctionLensCard key={lens.team} lens={lens} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function FunctionLensCard({ lens, index }: { lens: FunctionLens; index: number }) {
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
        <span
          className="text-[12px] font-semibold leading-tight"
          style={{ color: lens.tint }}
        >
          {lens.team}
        </span>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="text-[10.5px] font-mono uppercase tracking-wider text-text-dim">
          Reaches for
        </div>
        <div className="text-[13px] font-semibold text-text leading-tight">
          {lens.uses}
        </div>
        <p
          className="text-[11.5px] text-text-muted leading-relaxed mt-1"
          dangerouslySetInnerHTML={{ __html: lens.example }}
        />
      </div>

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
// 7. ConnectedToPlatform — what Prediction Engine plugs into
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
    body:  "The raw inputs. Every signal feeds the forecast models; signal velocity and direction move the probability numbers in real time.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  Crosshair,
    label: 'Buyer Intent',
    href:  '/platform/buyer-intent',
    body:  "The account-level complement. Intent says &lsquo;this account is hot;&rsquo; Prediction says &lsquo;this sector is heating.&rsquo; They feed each other.",
    tint:  'rgb(255 159 180)',
  },
  {
    icon:  Inbox,
    label: 'CRM',
    href:  '/platform/crm',
    body:  "Forecasts attach to records. Deal-close probability sits on the deal card; churn risk sits on the account header. Forecast surfaces where work happens.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Bot,
    label: 'Bella',
    href:  '/platform/bella',
    body:  "When a forecast crosses threshold, Bella acts &mdash; flags the deal, queues the briefing, drafts the partnership memo &mdash; subject to approval mode.",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  "Forecasts render geographically too. Sector-heat forecasts overlay onto Doha; emerging clusters glow on the map before they make the news.",
    tint:  'rgb(111 207 151)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What Prediction Engine plugs into
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            One engine. Forecasts everywhere a decision is made.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Prediction Engine reads from Signals, complements Buyer
            Intent, writes to CRM, triggers Bella, and renders onto
            the Map. Five connections, one engine, one source of
            truth.
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
                You&apos;ve seen what Bell forecasts
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now turn it on for your team.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your first forecasts populate the same day.
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
            Five functions act on the forecasts
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Each one has its own page on what they do with them.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Forecasts are the timing layer. Sales sees deal-close
            probabilities. Marketing pre-positions for demand waves.
            BD anticipates competitive moves. Research commissions
            ahead of sector heat. GTM times market entries.
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
// 10. ThreeReader — analyst / strategy lead / exec
// ───────────────────────────────────────────────────────────────────────────

const PREDICTION_READERS = [
  {
    icon:  Eye,
    label: 'For the analyst',
    body:  "Every forecast comes with its signals attached. You walk into the room with the probability AND the evidence, not a gut call. Replay any forecast from any past date to calibrate before you act.",
  },
  {
    icon:  BarChart3,
    label: 'For the strategy lead',
    body:  "Position the org ahead of demand. Pre-fund the team that&apos;s about to ramp. Time the partnership for the quarter the sector heats up. Stop reacting; start positioning.",
  },
  {
    icon:  Crown,
    label: 'For the executive',
    body:  "Board-room confidence with audited probabilities. Every forecast cites its sources, names its dissent, and tracks its outcomes. The conversation moves from opinion to evidence.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same engine
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes when forecasts are sourced.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {PREDICTION_READERS.map((r, i) => {
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
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(111,207,151,0.14) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          Act on what&apos;s about to happen.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Sector heat. Deal close. Churn risk. Competitive moves.
          Demand waves. Eight inputs, five categories, one
          probability-weighted engine &mdash; sourced, decomposable,
          replayable, scored.
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

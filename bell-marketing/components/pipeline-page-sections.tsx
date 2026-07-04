'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Workflow, ArrowRight, DownloadCloud, Sparkles, BadgeCheck,
  GitMerge, Network, Activity, Server, ShieldCheck,
  MoveRight, Clock, Lock, MapPin, Cpu, Wrench, Cog, Globe2,
  Database, FileText, GitBranch, Building2, Crown, Radar,
  Layers, Check, Inbox, Bot, Map as MapIcon, BrainCircuit,
  Crosshair, Eye, BarChart3,
} from 'lucide-react';

/**
 * PIPELINE PAGE — capability deep-dive.
 *
 * The wow page in the Data section. Argues that Bell.qa doesn't
 * license its data — it builds it, on Bell-owned infrastructure,
 * through a six-stage proprietary pipeline. The centerpiece is a
 * horizontal pipeline visual showing data flowing through Ingestion
 * → Cleaning → Verification → Deduplication → Enrichment → Live
 * tracking, with per-stage techniques and throughput stats.
 *
 * Tone: strategic, confident, no vendor names. Mentions general
 * sources (public regulators, press archives, local partnerships),
 * Bell's own collection software, Bell-owned servers in Qatar.
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. PipelineHero        — "The machine behind the data."
 *     2. PipelineActivityBar — live counters
 *     3. ThePipelineDiagram  — CENTERPIECE — 6 stages horizontal
 *
 *   ROUND 2+ (to be added):
 *     4. WhatGoesInWhatComesOut — input/output by stage
 *     5. TheInfrastructure   — Bell-owned servers, sovereign, etc.
 *     6. OneRecordsJourney   — single record walked through all 6 stages
 *     7. ConnectedToPlatform
 *     8. MidPageCta
 *     9. OtherDataSurfaces   — Coverage / Live / Trust cross-links
 *    10. ThreeReader         — data engineer / CTO / investor
 *    11. FinalCta
 */

export function PipelinePageSections() {
  return (
    <>
      <PipelineHero />
      <PipelineActivityBar />
      <ThePipelineDiagram />
      <WhatGoesInWhatComesOut />
      <TheInfrastructure />
      <OneRecordsJourney />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherDataSurfaces />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. PipelineHero — strategic opening
// ───────────────────────────────────────────────────────────────────────────

function PipelineHero() {
  return (
    <section className="relative pt-28 md:pt-32 pb-20 md:pb-24">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 0%, rgba(255,196,99,0.16) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-card/40 backdrop-blur text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-7">
            <Workflow size={12} className="text-accent-bright" />
            <span>Data &middot; Pipeline</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">The machine</span>
            <br />
            <span className="text-text">behind the data.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Bell doesn&apos;t license its data. It builds it. A
            six-stage proprietary pipeline runs continuously on
            Bell-owned servers in Qatar &mdash; ingesting from public
            regulators, local partnerships, and our own collection
            systems, then cleaning, verifying, deduplicating, enriching,
            and tracking every record live.
          </p>
          <p className="mt-4 text-[13.5px] text-text-dim leading-relaxed max-w-2xl">
            Every Qatari company. Every named decision-maker. Every
            signal. Through one pipeline. End to end.
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
// 2. PipelineActivityBar — cycling live counters
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Pipeline stages',          value: '6',     sub: 'running continuously'                  },
  { label: 'Datapoints tracked / day', value: '1.2 B', sub: 'scanned, verified, refreshed'          },
  { label: 'New records ingested',     value: '4,217', sub: 'in the last 24 hours'                  },
  { label: 'Data accuracy',            value: '99.7%', sub: 'verified across sources'               },
  { label: 'Signal-to-record latency', value: '< 60s', sub: 'event lands &rarr; record updated'     },
  { label: 'Third-party data licences', value: '0',    sub: 'Bell owns every byte end to end'       },
];

function PipelineActivityBar() {
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
              Live pipeline &middot; Bell-owned infrastructure
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
                  <div
                    className="text-[10.5px] text-text-dim"
                    dangerouslySetInnerHTML={{ __html: f.sub }}
                  />
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
// 3. ThePipelineDiagram — CENTERPIECE — six-stage horizontal pipeline
// ───────────────────────────────────────────────────────────────────────────

type Stage = {
  num:       string;
  name:      string;
  icon:      React.ComponentType<{ size?: number | string }>;
  tint:      string;
  body:      string;
  technique: string;
  metric:    { value: string; label: string };
};

const STAGES: Stage[] = [
  {
    num:       '01',
    name:      'Ingestion',
    icon:      DownloadCloud,
    tint:      'rgb(91 140 255)',
    body:      'Continuous collection from public regulators, press archives, local partnerships, and Bell’s own collection systems running on Bell-owned servers.',
    technique: 'Multi-source parallel ingestion',
    metric:    { value: '4,217', label: 'new records / 24h' },
  },
  {
    num:       '02',
    name:      'Cleaning',
    icon:      Sparkles,
    tint:      'rgb(196 154 255)',
    body:      'Normalization, format harmonization, encoding fixes, schema validation. Every record passes the same standards regardless of source.',
    technique: 'Proprietary normalization rules per source',
    metric:    { value: '99.8%', label: 'pass validation' },
  },
  {
    num:       '03',
    name:      'Verification',
    icon:      BadgeCheck,
    tint:      'rgb(111 207 151)',
    body:      'Cross-reference across sources, agreement scoring, freshness checks. Bell trusts facts that multiple sources corroborate.',
    technique: 'Multi-source corroboration + confidence scoring',
    metric:    { value: '3.4', label: 'sources / fact, avg' },
  },
  {
    num:       '04',
    name:      'Deduplication',
    icon:      GitMerge,
    tint:      'rgb(255 196 99)',
    body:      'Entity resolution. Identical companies under different names, with different registrations, in different formats — collapsed into a single canonical record.',
    technique: 'Proprietary identity-resolution algorithms',
    metric:    { value: '1.2M', label: 'duplicates resolved' },
  },
  {
    num:       '05',
    name:      'Enrichment',
    icon:      Network,
    tint:      'rgb(165 195 255)',
    body:      'Graph relationships drawn, signals attached, intelligence overlay applied. Records become nodes in the country-wide graph.',
    technique: 'Proprietary graph algorithms + Bella’s AI layer',
    metric:    { value: '28', label: 'enriched fields / record' },
  },
  {
    num:       '06',
    name:      'Live tracking',
    icon:      Activity,
    tint:      'rgb(232 142 168)',
    body:      'Every record polled on a continuous cadence. Change is detected, signals are generated, downstream surfaces (CRM, Map, Intent) light up.',
    technique: 'Continuous polling + change-detection',
    metric:    { value: '< 60s', label: 'signal-to-record latency' },
  },
];

function ThePipelineDiagram() {
  return (
    <section className="relative py-16 md:py-20 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The six-stage pipeline
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Ingest. Clean. Verify. Dedupe. Enrich. Track.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Six stages, end to end, on Bell-owned infrastructure. Every
            Qatari record passes through every stage on its way into
            the graph &mdash; and then stays in stage six forever,
            watched for change.
          </p>
        </div>

        {/* Pipeline panel */}
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
            <span className="relative inline-flex items-center justify-center w-2 h-2" aria-hidden="true">
              <span className="absolute inline-flex w-full h-full rounded-full bg-accent-bright opacity-50 animate-ping" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-accent-bright" />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
              Live data pipeline
            </span>
            <span className="text-text-dim text-[11px]">&middot;</span>
            <span className="text-[10.5px] text-text-dim">
              Bell-owned infrastructure &middot; running 24 / 7 / 365
            </span>
            <div className="flex-1" />
            <span className="text-[10px] text-text-dim font-mono flex items-center gap-1.5">
              <Server size={10} className="text-[rgb(111_207_151)]" />
              hosted in Qatar
            </span>
          </div>

          {/* Stages — horizontally scrollable on smaller screens, full row on xl.
              Grid template alternates 1fr (stage) and auto (connector) for the
              6 stages + 5 connectors = 11 total children. The min-width keeps
              the diagram wide enough that stages stay readable; the wrapper
              scrolls when the viewport is narrower. */}
          <div className="overflow-x-auto">
            <div className="min-w-[1180px] p-5 md:p-6">
              <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr] items-stretch">
                {STAGES.map((stage, i) => (
                  <StageCardWithConnector
                    key={stage.num}
                    stage={stage}
                    index={i}
                    isLast={i === STAGES.length - 1}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Footer band */}
          <div
            className="px-6 py-4 border-t border-border flex items-center justify-between gap-4 text-[11px] flex-wrap"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <div className="flex items-center gap-2 text-text-muted">
              <ShieldCheck size={12} className="text-[rgb(111_207_151)]" />
              <span>
                End-to-end on Bell-owned infrastructure &middot; no
                third-party data licences &middot; no vendor dependencies
              </span>
            </div>
            <div className="flex items-center gap-2 text-text-dim font-mono">
              <Clock size={11} />
              <span>continuous flow, since v1</span>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

// ── Stage card + horizontal connector ──────────────────────────────────────

function StageCardWithConnector({
  stage, index, isLast,
}: { stage: Stage; index: number; isLast: boolean }) {
  return (
    <>
      <StageCard stage={stage} index={index} />
      {!isLast && <Connector tint={stage.tint} nextTint={STAGES[index + 1].tint} />}
    </>
  );
}

function StageCard({ stage, index }: { stage: Stage; index: number }) {
  const Icon = stage.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
      className="rounded-xl border overflow-hidden flex flex-col h-full"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
        borderColor: stage.tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
        borderTop:   '2px solid ' + stage.tint,
        boxShadow:   '0 12px 32px -16px ' + stage.tint.replace('rgb', 'rgba').replace(')', ' / 0.34)'),
      }}
    >
      {/* Header — number + icon */}
      <div
        className="px-3.5 py-3 border-b flex items-center justify-between"
        style={{
          background:  stage.tint.replace('rgb', 'rgba').replace(')', ' / 0.06)'),
          borderColor: stage.tint.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
        }}
      >
        <span
          className="text-[11px] font-mono font-semibold tracking-wider"
          style={{ color: stage.tint }}
        >
          {stage.num}
        </span>
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg"
          style={{
            background: stage.tint.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
            color:      stage.tint,
          }}
        >
          <Icon size={14} />
        </span>
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col gap-3">
        <h3
          className="text-[15px] font-semibold leading-tight"
          style={{ color: stage.tint }}
        >
          {stage.name}
        </h3>
        <p className="text-[11.5px] text-text-muted leading-relaxed">
          {stage.body}
        </p>
        <div
          className="text-[10.5px] text-text-dim italic leading-snug mt-auto pt-2 border-t border-border/40"
        >
          {stage.technique}
        </div>
      </div>

      {/* Metric footer */}
      <div
        className="px-4 py-3 border-t flex items-baseline justify-between"
        style={{
          background:  'rgba(255,255,255,0.015)',
          borderColor: 'rgba(255,255,255,0.04)',
        }}
      >
        <span
          className="text-[16px] font-semibold tabular-nums leading-none"
          style={{ color: stage.tint }}
        >
          {stage.metric.value}
        </span>
        <span className="text-[9.5px] uppercase tracking-wider text-text-dim font-mono text-right leading-tight">
          {stage.metric.label}
        </span>
      </div>
    </motion.div>
  );
}

function Connector({ tint, nextTint }: { tint: string; nextTint: string }) {
  return (
    <div
      className="flex items-center justify-center w-10 relative"
      aria-hidden="true"
    >
      {/* Gradient line at vertical center, full width of the connector cell */}
      <div
        className="absolute left-0 right-0 top-1/2 h-px -translate-y-1/2"
        style={{
          background:
            'linear-gradient(to right, ' +
            tint.replace('rgb', 'rgba').replace(')', ' / 0.50)') +
            ', ' +
            nextTint.replace('rgb', 'rgba').replace(')', ' / 0.50)') +
            ')',
        }}
      />
      {/* Arrow badge — sits above the line */}
      <span
        className="relative inline-flex items-center justify-center w-6 h-6 rounded-full border-2 z-10"
        style={{
          background:  'rgb(13 18 35)',
          borderColor: nextTint.replace('rgb', 'rgba').replace(')', ' / 0.45)'),
        }}
      >
        <MoveRight size={11} style={{ color: nextTint }} />
      </span>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. WhatGoesInWhatComesOut — per-stage IO transformation table
// ───────────────────────────────────────────────────────────────────────────

type IORow = {
  num:   string;
  name:  string;
  tint:  string;
  icon:  React.ComponentType<{ size?: number | string }>;
  in:    string;
  out:   string;
};

const IO_ROWS: IORow[] = [
  {
    num: '01', name: 'Ingestion',     tint: 'rgb(91 140 255)',  icon: DownloadCloud,
    in:  'Raw documents from public regulators, press archives, local partnerships, and Bell&apos;s collection systems &mdash; HTML, PDF, structured feeds, scraped tables.',
    out: 'Normalized JSON records, source-tagged, time-stamped, lineage-attached.',
  },
  {
    num: '02', name: 'Cleaning',      tint: 'rgb(196 154 255)', icon: Sparkles,
    in:  'Normalized records in mixed formats &mdash; multiple character sets, inconsistent date / number / phone formats, scanned-OCR artefacts.',
    out: 'Schema-validated records in canonical formats. Same fields look the same regardless of which source they came from.',
  },
  {
    num: '03', name: 'Verification',  tint: 'rgb(111 207 151)', icon: BadgeCheck,
    in:  'Validated records that may have conflicting facts. Source A says one thing, source B says another, source C is silent.',
    out: 'Records with per-field confidence scores. Each fact carries the count of sources that agree, and the count that disagree.',
  },
  {
    num: '04', name: 'Deduplication', tint: 'rgb(255 196 99)',  icon: GitMerge,
    in:  'Confidence-scored records, often three or four versions of the same real-world entity &mdash; different registrations, different naming conventions, different scripts.',
    out: 'Canonical entity records. One Doha Health Network in the database, no matter how many ways the country writes its name.',
  },
  {
    num: '05', name: 'Enrichment',    tint: 'rgb(165 195 255)', icon: Network,
    in:  'Canonical entity records sitting as flat rows.',
    out: 'Graph-attached records &mdash; linked to owners, parents, subsidiaries, board members, regulators, signals, and intelligence overlays.',
  },
  {
    num: '06', name: 'Live tracking', tint: 'rgb(232 142 168)', icon: Activity,
    in:  'Enriched records, point-in-time.',
    out: 'Live records. Continuously polled, change-detected, signal-generating. The record you read today is what the country says today &mdash; not last quarter.',
  },
];

function WhatGoesInWhatComesOut() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Per stage &middot; in &amp; out
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What goes in. What comes out.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The pipeline transforms data at every stage. Below: the
            shape of what enters each stage on the left, and the shape
            of what leaves it on the right. Read top to bottom to
            follow a record through the machine.
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
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          }}
        >
          {/* Header row */}
          <div
            className="grid grid-cols-12 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: 'rgba(255,255,255,0.025)' }}
          >
            <div className="col-span-3 p-4 text-text-dim border-r border-border">
              Stage
            </div>
            <div className="col-span-4 p-4 text-text-dim border-r border-border flex items-center gap-1.5">
              <ArrowRight size={11} />
              <span>In</span>
            </div>
            <div className="col-span-5 p-4 text-accent-bright flex items-center gap-1.5">
              <span>Out</span>
              <ArrowRight size={11} />
            </div>
          </div>

          {IO_ROWS.map((row, i) => {
            const Icon = row.icon;
            return (
              <motion.div
                key={row.num}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: i * 0.04 }}
                className={
                  'grid grid-cols-12 text-[13px] ' +
                  (i < IO_ROWS.length - 1 ? 'border-b border-border' : '')
                }
              >
                <div className="col-span-3 p-4 border-r border-border leading-snug flex items-start gap-3">
                  <span
                    className="inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0"
                    style={{
                      background: row.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
                      color:      row.tint,
                    }}
                  >
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono font-semibold uppercase tracking-wider" style={{ color: row.tint }}>
                      {row.num}
                    </div>
                    <div className="text-text font-semibold leading-tight">
                      {row.name}
                    </div>
                  </div>
                </div>
                <div
                  className="col-span-4 p-4 text-text-muted border-r border-border leading-snug"
                  dangerouslySetInnerHTML={{ __html: row.in }}
                />
                <div
                  className="col-span-5 p-4 text-text leading-snug"
                  dangerouslySetInnerHTML={{ __html: row.out }}
                />
              </motion.div>
            );
          })}
        </motion.div>

      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. TheInfrastructure — Bell-owned servers, sovereignty, ownership claim
// ───────────────────────────────────────────────────────────────────────────

type InfraPillar = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  body:    string;
  detail:  string;
  tint:    string;
};

const INFRA_PILLARS: InfraPillar[] = [
  {
    icon:    Server,
    label:   'Bell-owned servers',
    body:    'The pipeline runs on hardware Bell owns, hosted in Qatar. No public cloud dependency for the core data plane.',
    detail:  'Resilient, redundant, fully under our control.',
    tint:    'rgb(91 140 255)',
  },
  {
    icon:    Cog,
    label:   'Proprietary collection software',
    body:    'The ingestion layer is software Bell built, tested, and operates &mdash; tuned to every kind of Qatari source we work with.',
    detail:  'No off-the-shelf scrapers, no third-party crawlers, no licensed datasets.',
    tint:    'rgb(196 154 255)',
  },
  {
    icon:    MapPin,
    label:   'Sovereign by design',
    body:    'Data residency in Qatar. Operations team in Qatar. Compliance with local data law before anything else.',
    detail:  'Bell.qa is what it says: built for Qatar, hosted in Qatar.',
    tint:    'rgb(111 207 151)',
  },
  {
    icon:    Lock,
    label:   'End-to-end ownership',
    body:    'Every byte in the pipeline is Bell&apos;s. No third-party data licences. No vendor contracts that could expire and remove your access.',
    detail:  'Your data layer is permanent, not rented.',
    tint:    'rgb(255 196 99)',
  },
];

function TheInfrastructure() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The infrastructure underneath
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Owned, sovereign, permanent.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The pipeline doesn&apos;t sit on borrowed software, borrowed
            servers, or borrowed data. Every layer is Bell&apos;s
            &mdash; designed in Qatar, hosted in Qatar, operated in
            Qatar.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {INFRA_PILLARS.map((pillar, i) => (
            <InfraPillarCard key={pillar.label} pillar={pillar} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function InfraPillarCard({ pillar, index }: { pillar: InfraPillar; index: number }) {
  const Icon = pillar.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
      className="rounded-xl border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
        borderColor: pillar.tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
        borderTop:   '2px solid ' + pillar.tint,
        boxShadow:   '0 14px 36px -18px ' + pillar.tint.replace('rgb', 'rgba').replace(')', ' / 0.30)'),
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
          <Icon size={17} />
        </span>
        <div>
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{ color: pillar.tint }}
          >
            {pillar.label}
          </h3>
          <p
            className="mt-1.5 text-[12.5px] text-text-muted leading-relaxed"
            dangerouslySetInnerHTML={{ __html: pillar.body }}
          />
        </div>
      </div>
      <div
        className="px-5 py-3 border-t text-[11.5px] text-text-dim italic leading-snug"
        style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.015)' }}
      >
        {pillar.detail}
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. OneRecordsJourney — single record walked through all 6 stages
// ───────────────────────────────────────────────────────────────────────────

type JourneyStep = {
  num:     string;
  stage:   string;
  tint:    string;
  icon:    React.ComponentType<{ size?: number | string }>;
  body:    string;
  outcome: string;
};

const JOURNEY: JourneyStep[] = [
  {
    num: '01', stage: 'Ingestion', tint: 'rgb(91 140 255)', icon: DownloadCloud,
    body: 'Pulled from MoCI commercial registry, press archives, a local healthcare-sector partnership, and Bell&apos;s own collection systems. Forty-seven source documents collected, time-stamped, lineage-attached.',
    outcome: '47 source docs · all sources tagged',
  },
  {
    num: '02', stage: 'Cleaning', tint: 'rgb(196 154 255)', icon: Sparkles,
    body: '&ldquo;Doha Health Network&rdquo; vs &ldquo;DOHA HEALTH NETWORK W.L.L.&rdquo; vs the Arabic-script form &mdash; all collapsed to one canonical name. Dates, phone numbers, addresses normalized. Format harmonized across all 47 sources.',
    outcome: '47 → 1 canonical form',
  },
  {
    num: '03', stage: 'Verification', tint: 'rgb(111 207 151)', icon: BadgeCheck,
    body: '3.7 sources agreed on the founded date (2014), 4 on the employee count (380), 5 on the sector (healthcare). One source disagreed on HQ address &mdash; flagged for confidence-weighted review.',
    outcome: 'avg 3.7 sources / fact',
  },
  {
    num: '04', stage: 'Deduplication', tint: 'rgb(255 196 99)', icon: GitMerge,
    body: 'DHN had three separate records on Bell &mdash; one under the trade name, one under the registered parent, one under a historical Arabic-only filing. Entity resolution merged the three into a single canonical record.',
    outcome: '3 records → 1 canonical entity',
  },
  {
    num: '05', stage: 'Enrichment', tint: 'rgb(165 195 255)', icon: Network,
    body: 'Linked to the family-office LP (22% ownership), Dr. Aisha Al-Sulaiti (founder/CEO), Yousef Al-Mannai (CFO), 2 board members. Four live signals attached: regulatory filing, leadership change, expansion, LP liquidity preference.',
    outcome: '8 graph edges · 4 live signals',
  },
  {
    num: '06', stage: 'Live tracking', tint: 'rgb(232 142 168)', icon: Activity,
    body: 'Polled continuously. Within 14 minutes of MoPH publishing the latest healthcare-licence renewal, the record had it. Bella tagged the change and drafted the alert for Maryam (BD).',
    outcome: '< 14 min from MoPH → record updated',
  },
];

function OneRecordsJourney() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            One record, all six stages
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            How Doha Health Network became a Bell record.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            One real-world Qatari company, walked through every stage
            of the pipeline. What started as forty-seven raw documents
            became a single living record, attached to its decision
            unit, its ownership graph, and its live signals.
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
          {/* Header */}
          <div className="px-6 py-5 border-b border-border flex items-center gap-3 flex-wrap">
            <span
              className="inline-flex items-center justify-center w-10 h-10 rounded-lg shrink-0 text-text"
              style={{
                background: 'linear-gradient(135deg, rgb(91 140 255) 0%, rgb(165 195 255) 100%)',
              }}
            >
              <Building2 size={17} />
            </span>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-text leading-tight">
                Doha Health Network
              </div>
              <div className="text-[11px] text-text-dim mt-0.5 font-mono">
                Healthcare &middot; private clinic operator &middot; 380 employees
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
              In the live graph
            </span>
          </div>

          {/* Timeline */}
          <div className="p-5 md:p-6">
            <ol className="relative">
              {/* Vertical timeline line */}
              <div
                aria-hidden="true"
                className="absolute left-[19px] top-2 bottom-2 w-px"
                style={{ background: 'rgba(255,255,255,0.08)' }}
              />
              {JOURNEY.map((step, i) => (
                <JourneyStepRow
                  key={step.num}
                  step={step}
                  index={i}
                  last={i === JOURNEY.length - 1}
                />
              ))}
            </ol>
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              47 raw documents in &rarr; 1 living record out
            </span>
            <span className="text-text-muted">
              Multiply by 76,000+ actively trading Qatari companies (191,000+ in total). Every day.
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function JourneyStepRow({
  step, index, last,
}: { step: JourneyStep; index: number; last: boolean }) {
  const Icon = step.icon;
  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: index * 0.06 }}
      className={'relative pl-12 ' + (last ? '' : 'pb-5')}
    >
      {/* Step number badge — sits on the timeline line */}
      <span
        className="absolute left-0 top-0 inline-flex items-center justify-center w-10 h-10 rounded-full text-[11px] font-mono font-semibold border-2"
        style={{
          background:  'rgb(13 18 35)',
          color:       step.tint,
          borderColor: step.tint.replace('rgb', 'rgba').replace(')', ' / 0.45)'),
          boxShadow:   '0 0 0 4px rgb(13 18 35)',  // mask the line behind
        }}
      >
        <Icon size={13} />
      </span>

      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <span
          className="text-[10px] font-mono font-semibold uppercase tracking-wider"
          style={{ color: step.tint }}
        >
          {step.num} &middot; {step.stage}
        </span>
        <span
          className="text-[10.5px] font-mono px-2 py-0.5 rounded border whitespace-nowrap"
          style={{
            color:       step.tint,
            background:  step.tint.replace('rgb', 'rgba').replace(')', ' / 0.08)'),
            borderColor: step.tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
          }}
        >
          {step.outcome}
        </span>
      </div>
      <p
        className="text-[13px] text-text leading-relaxed"
        dangerouslySetInnerHTML={{ __html: step.body }}
      />
    </motion.li>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. ConnectedToPlatform — what consumes the pipeline output
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
    icon:  Inbox,
    label: 'CRM',
    href:  '/platform/crm',
    body:  "Every record produced by the pipeline lands in the CRM as a living account record. No imports, no syncs, no manual data entry &mdash; the pipeline is the CRM&apos;s database.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  "Stage six of the pipeline emits the signal stream. Every change detected on every record becomes a signal, routed to the right workspace in seconds.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  "Pipeline output renders geographically. Every record carries its coordinates; every signal renders as a live pulse on Doha as it lands.",
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  Crosshair,
    label: 'Buyer Intent',
    href:  '/platform/buyer-intent',
    body:  "Intent recognition reads the pipeline&apos;s enriched fields and live signals. Tech-stack changes, hiring moves, regulatory activity &mdash; all surfaced through the pipeline first.",
    tint:  'rgb(255 159 180)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "Forecasts read the pipeline&apos;s signal velocity, source counts, and graph patterns. Without the pipeline, there is no probability to compute.",
    tint:  'rgb(196 154 255)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What the pipeline feeds
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Five surfaces drink from this pipeline.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Everything else Bell.qa shows you sits downstream of the
            pipeline. CRM is its output. Signals are its sixth stage.
            Map renders its records. Buyer Intent reads its fields.
            Prediction Engine reads its patterns.
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
                'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(255,196,99,0.18) 0%, transparent 60%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                You&apos;ve seen the machine
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now put your team on the data it produces.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your workspace opens onto a database the
                pipeline already filled.
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
    body:    'Every Qatari company. Every named decision-maker. Every signal. The breadth claim, mapped end to end.',
    soon:    true,
  },
  {
    icon:    Activity,
    label:   'Live',
    href:    '/data/live',
    tagline: 'Refreshed by the minute.',
    body:    'Why Bell.qa data is alive. Continuous tracking, change detection, signal generation &mdash; not a quarterly snapshot.',
    soon:    true,
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
            Pipeline is one of four.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The data section covers what Bell sees, how Bell builds
            it, why it&apos;s alive, and how it&apos;s protected.
            You&apos;ve just read the &lsquo;how it&apos;s built&rsquo;
            page. Here are the other three.
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
// 10. ThreeReader — data engineer / CTO / investor
// ───────────────────────────────────────────────────────────────────────────

const PIPELINE_READERS = [
  {
    icon:  Cpu,
    label: 'For the data engineer',
    body:  "Six stages, every stage observable, every transformation auditable, every record citable back to source. Built the way you would build it &mdash; if you had the time to build the whole country.",
  },
  {
    icon:  Lock,
    label: 'For the CTO',
    body:  "Your data layer is owned, not rented. No third-party data licences to renew. No vendor contracts that could remove your access. The pipeline runs on infrastructure you can audit and a software stack Bell controls end to end.",
  },
  {
    icon:  BarChart3,
    label: 'For the investor',
    body:  "Bell.qa&apos;s moat is the pipeline. Anyone can license a dataset. No one else has built the country&apos;s data plane from scratch, owns the hardware, operates the software, and refreshes the records by the minute &mdash; in Qatar.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same pipeline
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes when the data is built, not licensed.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {PIPELINE_READERS.map((r, i) => {
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
                  style={{ background: 'rgba(255,196,99,0.14)' }}
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
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(255,196,99,0.14) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          Data you build is data you keep.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Six stages. Bell-owned servers in Qatar. Bell-built software.
          Zero third-party data licences. Every Qatari record &mdash;
          ingested, cleaned, verified, deduplicated, enriched, and
          tracked live, by the machine we built.
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

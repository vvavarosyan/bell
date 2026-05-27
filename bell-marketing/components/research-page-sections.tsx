'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Microscope, ArrowRight, FileSearch, Building2, User,
  Briefcase, Lightbulb, Globe, ShieldCheck, Database,
  FileText, BookOpen, Quote, Layers, BadgeCheck,
  Newspaper, Building, Scroll, GraduationCap, Gavel,
  Sparkles, Target, Megaphone, Bot, Map as MapIcon,
  Inbox, BrainCircuit, Radar, TrendingUp, Handshake,
  Rocket, CalendarClock, Check, BarChart3, Crown,
  Network,
} from 'lucide-react';

/**
 * RESEARCH PAGE — section-by-section build.
 *
 * Concept: The Research Console. Bell can deep-research anything in
 * the Qatari market — companies, people, sectors, themes, regions,
 * regulations — on demand, structured, cited. The centerpiece is a
 * workspace showing Hassan running multiple distinct research jobs
 * at once. We never show the report prose itself, only the
 * scaffolding around it: prompt, source classes pulled, sections
 * being assembled, citation counts. Honors Val's rule: "make the
 * visitor understand Bell has a powerful tool, don't fabricate a
 * fake report".
 *
 * Persona: Hassan Al-Khalifa, independent strategy advisor in Doha.
 * Ex-Big-Four, now running his own boutique serving sovereign funds,
 * family offices, and ministries. Does in 15 minutes on Bell what
 * was a 2-week analyst project, because Bella deploys multiple
 * research agents per job in parallel.
 *
 * Time scale: per-engagement / per-week (Sales=day, Marketing=weeks,
 * BD=quarter, Research=per-deliverable).
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. ResearchHero          — "Deep research, on demand."
 *     2. ResearchActivityBar   — live research stats
 *     3. MeetHassan            — persona intro
 *     4. TheResearchConsole    — CENTERPIECE — 6 simultaneous jobs
 *     5. OneTopicUnpacked      — drill-down: scaffolding only
 *
 *   ROUND 2+ (to be added):
 *     6. HassansWeek           — KPI strip
 *     7. LeaderPivot           — analyst → engagement
 *     8. EngagementThroughput  — clients, topics, hours-saved
 *     9. ResearchComparison    — Without vs With Bell.qa
 *    10. ConnectedToPlatform   — cross-link tiles
 *    11. MidPageCta
 *    12. OtherFunctions        — Sales / Marketing / BD / GTM
 *    13. ThreeReader           — Consultant / Partner / Client
 *    14. FinalCta
 */

export function ResearchPageSections() {
  return (
    <>
      <ResearchHero />
      <ResearchActivityBar />
      <MeetHassan />
      <TheResearchConsole />
      <OneTopicUnpacked />
      <HassansWeek />
      <LeaderPivot />
      <EngagementThroughput />
      <ResearchComparison />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. ResearchHero — opening band
// ───────────────────────────────────────────────────────────────────────────

function ResearchHero() {
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
            <Microscope size={12} className="text-accent-bright" />
            <span>For research</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">Deep research,</span>
            <br />
            <span className="text-text">on demand. Cited.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Companies. People. Sectors. Themes. Regions. Regulations.
            Anything in the Qatari market, researched at depth and
            delivered as a structured report &mdash; in the time it
            takes to draft the brief.
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
// 2. ResearchActivityBar — live research stats, cycling
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Active research jobs',  value: '6',    sub: 'across 4 engagements'    },
  { label: 'Research agents deployed', value: '17', sub: 'working in parallel'    },
  { label: 'Sources synthesized',   value: '4,712', sub: 'in the last 15 minutes' },
  { label: 'Citations attached',    value: '612',  sub: 'every claim traceable'   },
  { label: 'Average time per report', value: '15 min', sub: 'regardless of depth' },
];

function ResearchActivityBar() {
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
              Live on Bell.qa
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
// 3. MeetHassan — persona intro card
// ───────────────────────────────────────────────────────────────────────────

function MeetHassan() {
  return (
    <section className="relative py-20 md:py-24">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Meet your protagonist
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Hassan turns 2-week studies into 15-minute deliverables.
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
                  'linear-gradient(135deg, rgb(91 140 255) 0%, rgb(165 195 255) 100%)',
                boxShadow: '0 12px 32px -8px rgba(91,140,255,0.4)',
              }}
            >
              HA
            </div>
            <div>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2.5">
                <div className="text-xl font-semibold text-text">
                  Hassan Al-Khalifa
                </div>
                <div className="text-[12px] text-text-dim font-mono">
                  Independent strategy advisor &middot; Doha
                </div>
              </div>
              <p className="text-[14.5px] text-text-muted leading-relaxed">
                Spent twelve years in the strategy practice of a Big-Four
                consultancy before going independent in 2023. Now runs
                a small advisory boutique serving Qatari sovereign funds,
                family offices, and a couple of ministries on demand.
                Every engagement starts with the same question: what
                does the rest of the room not yet know.
              </p>
              <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <PersonaStat label="Active engagements" value="4" />
                <PersonaStat label="Reports this month" value="11" />
                <PersonaStat label="Analyst headcount" value="0" sub="just him" />
                <PersonaStat label="Hours saved / week" value="46" sub="vs old way" />
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
// 4. TheResearchConsole — CENTERPIECE
//    Six simultaneous research jobs of different types.
//    Each card: type icon, prompt, source classes, sections, citations, status
//    Visitor sees: "Bell researches anything, structured, on demand."
// ───────────────────────────────────────────────────────────────────────────

type ResearchType =
  | 'company' | 'person' | 'sector' | 'theme' | 'region' | 'regulation';

type JobStatus = 'gathering' | 'synthesizing' | 'ready';

type ResearchJob = {
  type:     ResearchType;
  typeLabel:string;
  icon:     React.ComponentType<{ size?: number | string }>;
  tint:     string;
  prompt:   string;
  agents:   number | string;
  sources:  number;
  sourceClasses: string[];
  sections: number;
  citations:number;
  status:   JobStatus;
  forClient:string;
  eta:      string;
};

const RESEARCH_JOBS: ResearchJob[] = [
  {
    type:     'company',
    typeLabel:'Company deep-dive',
    icon:     Building2,
    tint:     'rgb(91 140 255)',
    prompt:   "Full operational picture of Doha Health Network — ownership, leadership, financial trajectory, M&A signals.",
    agents:   2,
    sources:  287,
    sourceClasses: ['MOCI filings', 'Press archive', 'Bell.qa graph', 'Industry reports'],
    sections: 12,
    citations:142,
    status:   'ready',
    forClient:'Marsa Capital',
    eta:      'Delivered 6 min ago',
  },
  {
    type:     'person',
    typeLabel:'Person profile',
    icon:     User,
    tint:     'rgb(111 207 151)',
    prompt:   "Career arc, public footprint, and current sphere of influence for Dr. Aisha Al-Sulaiti.",
    agents:   1,
    sources:  124,
    sourceClasses: ['Press archive', 'Public speaking', 'Board registries', 'Academic record'],
    sections: 8,
    citations:67,
    status:   'ready',
    forClient:'Marsa Capital',
    eta:      'Delivered 12 min ago',
  },
  {
    type:     'sector',
    typeLabel:'Sector landscape',
    icon:     Briefcase,
    tint:     'rgb(255 196 99)',
    prompt:   "The full Qatari private healthcare sector — providers, ownership clusters, regulatory direction, M&A activity 2022–present.",
    agents:   5,
    sources:  612,
    sourceClasses: ['Regulatory filings', 'News & press', 'Industry reports', 'Bell.qa graph', 'Academic papers'],
    sections: 18,
    citations:284,
    status:   'synthesizing',
    forClient:'Q-Holdings family office',
    eta:      'ETA 9 min',
  },
  {
    type:     'theme',
    typeLabel:'Thematic deep-dive',
    icon:     Lightbulb,
    tint:     'rgb(196 154 255)',
    prompt:   "How the EU CBAM mechanism will reshape Qatari energy exports through 2030 — exposure, mitigation, peer responses.",
    agents:   4,
    sources:  398,
    sourceClasses: ['Policy papers', 'EU directives', 'Energy reports', 'Trade data', 'Academic literature'],
    sections: 14,
    citations:197,
    status:   'synthesizing',
    forClient:'Ministry of Commerce & Industry',
    eta:      'ETA 11 min',
  },
  {
    type:     'region',
    typeLabel:'Regional cluster',
    icon:     Globe,
    tint:     'rgb(165 195 255)',
    prompt:   "GCC fintech competitive map — Bahrain, UAE, KSA, Qatar — players, funding flows, regulator stance.",
    agents:   4,
    sources:  476,
    sourceClasses: ['Central bank registers', 'Funding databases', 'Press archive', 'Industry reports'],
    sections: 16,
    citations:218,
    status:   'gathering',
    forClient:'Doha Bank',
    eta:      'ETA 13 min',
  },
  {
    type:     'regulation',
    typeLabel:'Regulatory tracking',
    icon:     ShieldCheck,
    tint:     'rgb(232 142 168)',
    prompt:   "Live monitoring of QFC, QCB, QFMA regulatory output — any change affecting our advisory clients.",
    agents:   1,
    sources:  '—' as unknown as number, // continuous, not finite
    sourceClasses: ['QFC bulletins', 'QCB circulars', 'QFMA notices', 'Ministerial decrees'],
    sections: 0,
    citations:0,
    status:   'gathering',
    forClient:'Standing monitor',
    eta:      'Continuous',
  },
];

const STATUS_META: Record<JobStatus, { label: string; color: string; bg: string; border: string; dot: string }> = {
  gathering: {
    label: 'Gathering',
    color: 'rgb(165 195 255)',
    bg:    'rgba(165,195,255,0.10)',
    border:'rgba(165,195,255,0.30)',
    dot:   'rgb(165 195 255)',
  },
  synthesizing: {
    label: 'Synthesizing',
    color: 'rgb(255 196 99)',
    bg:    'rgba(255,196,99,0.10)',
    border:'rgba(255,196,99,0.30)',
    dot:   'rgb(255 196 99)',
  },
  ready: {
    label: 'Ready',
    color: 'rgb(111 207 151)',
    bg:    'rgba(111,207,151,0.12)',
    border:'rgba(111,207,151,0.32)',
    dot:   'rgb(111 207 151)',
  },
};

function TheResearchConsole() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Hassan&apos;s console
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Six research jobs. Seventeen agents. Fifteen minutes each.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Companies, people, sectors, themes, regions, and standing
            regulatory monitors &mdash; each kicked off with a sentence.
            For every job Bella deploys one or more dedicated research
            agents; heavier briefs get more agents working in parallel.
            Time per deliverable stays the same: about fifteen minutes.
          </p>
        </div>

        <div
          className="rounded-2xl border border-border overflow-hidden"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          }}
        >
          {/* Console header */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-dim">
              <Layers size={11} className="text-accent-bright" />
              Research console &middot; live
            </span>
            <span className="text-text-dim text-[11px]">&middot;</span>
            <span className="text-[10.5px] text-text-dim">
              4 engagements &middot; 6 active jobs &middot; 4,712 sources synthesized today
            </span>
            <div className="flex-1" />
            <span className="text-[10px] text-text-dim font-mono">
              Refreshed by Bella, continuously
            </span>
          </div>

          {/* Jobs grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
            {RESEARCH_JOBS.map((job, i) => (
              <JobCard key={job.type} job={job} index={i} />
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}

function JobCard({ job, index }: { job: ResearchJob; index: number }) {
  const Icon   = job.icon;
  const status = STATUS_META[job.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
      className="p-5 border-b lg:border-r border-border last:border-b-0 lg:[&:nth-child(3n)]:border-r-0"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <span
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
          style={{
            background: job.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      job.tint,
          }}
        >
          <Icon size={16} />
        </span>
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border"
          style={{
            color: status.color, background: status.bg, borderColor: status.border,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: status.dot }}
            aria-hidden="true"
          />
          {status.label}
        </span>
      </div>

      <div className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: job.tint }}>
        {job.typeLabel}
      </div>
      <div className="text-[13px] text-text leading-snug mb-3 italic">
        &ldquo;{job.prompt}&rdquo;
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {job.sourceClasses.map((s) => (
          <span
            key={s}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-text-muted"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            {s}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Mini label="Sources"   value={String(job.sources)} />
        <Mini label="Sections"  value={job.sections > 0 ? String(job.sections) : '—'} />
        <Mini label="Citations" value={job.citations > 0 ? String(job.citations) : '—'} />
      </div>

      <div className="flex items-center justify-between text-[10.5px] text-text-dim font-mono pt-3 border-t border-border/70">
        <span className="truncate">For {job.forClient}</span>
        <span className="shrink-0 ml-2" style={{ color: status.color }}>
          {job.eta}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-text-dim font-mono">
        <Bot size={10} className="text-accent-bright" />
        <span>
          <span className="text-text font-semibold">{job.agents}</span>{' '}
          {job.agents === 1 ? 'research agent on this job' : 'research agents working in parallel'}
        </span>
      </div>
    </motion.div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 px-2 py-1.5 text-center">
      <div className="text-[8.5px] uppercase tracking-wider text-text-dim font-semibold">
        {label}
      </div>
      <div className="text-[13px] font-semibold text-text tabular-nums leading-none mt-0.5">
        {value}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. OneTopicUnpacked — drill-down on the sector landscape job
//    Shows SCAFFOLDING only: prompt, source pull, table of contents,
//    citation count. Never the report prose itself.
// ───────────────────────────────────────────────────────────────────────────

const SOURCE_PULL = [
  { icon: Scroll,         label: 'Regulatory filings',     count: 124, tint: 'rgb(91 140 255)'   },
  { icon: Newspaper,      label: 'News & press archive',   count: 198, tint: 'rgb(255 196 99)'   },
  { icon: BookOpen,       label: 'Industry reports',       count:  87, tint: 'rgb(196 154 255)'  },
  { icon: Network,        label: 'Bell.qa graph nodes',    count: 142, tint: 'rgb(111 207 151)'  },
  { icon: GraduationCap,  label: 'Academic literature',    count:  31, tint: 'rgb(165 195 255)'  },
  { icon: Gavel,          label: 'Court & tribunal records', count: 30, tint: 'rgb(232 142 168)' },
];

const REPORT_STRUCTURE = [
  '01 — Executive summary',
  '02 — Sector definition & boundaries',
  '03 — Market sizing & growth trajectory',
  '04 — Ownership clusters & affiliations',
  '05 — Provider taxonomy & comparative profiles',
  '06 — Regulatory environment (QCHP, MoPH, QFC)',
  '07 — M&A activity 2022–present',
  '08 — Competitive dynamics',
  '09 — Demand-side drivers',
  '10 — Supply-side constraints',
  '11 — Investment thesis & risk factors',
  '12 — Outlook 2026–2030',
];

function OneTopicUnpacked() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            One report, unpacked
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What goes into a Bell.qa deep report.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            We&apos;re not going to show you the prose &mdash; the prose
            is your deliverable. We&apos;ll show you the scaffolding
            Bella builds underneath it: the sources pulled, the
            structure assembled, the citations attached to every claim.
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
          {/* Header — the report metadata */}
          <div className="px-6 py-5 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[rgb(255_196_99)]"
                  style={{ background: 'rgba(255,196,99,0.14)' }}
                >
                  <Briefcase size={14} />
                </span>
                <span className="text-[10px] uppercase tracking-wider font-semibold text-[rgb(255_196_99)]">
                  Sector landscape
                </span>
              </div>
              <div className="text-[15px] font-semibold text-text leading-snug">
                Qatari private healthcare sector &mdash; 2022 to present
              </div>
              <div className="text-[11.5px] text-text-dim mt-1 font-mono">
                For Q-Holdings family office &middot; commissioned 6 min ago &middot;{' '}
                <span className="text-accent-bright">5 research agents in parallel</span>
              </div>
            </div>
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
              style={{
                color:        STATUS_META['synthesizing'].color,
                background:   STATUS_META['synthesizing'].bg,
                borderColor:  STATUS_META['synthesizing'].border,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: STATUS_META['synthesizing'].dot }}
                aria-hidden="true"
              />
              Synthesizing &middot; ETA 9 min
            </span>
          </div>

          {/* Body — 3 panels: prompt / sources / structure */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr] divide-y lg:divide-y-0 lg:divide-x divide-border">

            {/* Left column: prompt + sources */}
            <div>
              {/* The prompt */}
              <UnpackSection
                icon={FileSearch}
                label="The brief"
                tint="rgb(91 140 255)"
              >
                <div className="rounded-lg border border-border bg-card/30 px-4 py-3 text-[13px] text-text leading-relaxed">
                  <span className="text-text-dim italic">
                    &ldquo;Give me the full Qatari private healthcare
                    sector. Every provider, ownership clusters,
                    regulatory direction, M&amp;A activity 2022 to
                    present. We&apos;re evaluating a roll-up thesis.&rdquo;
                  </span>
                </div>
                <div className="mt-3 text-[11px] text-text-dim leading-relaxed">
                  Typed by Hassan in 38 seconds. Bella read the brief,
                  decided this was a heavy job, and spawned five
                  research agents &mdash; one per source class &mdash;
                  to work the corners simultaneously.
                </div>
              </UnpackSection>

              {/* Sources pulled */}
              <div className="border-t border-border">
                <UnpackSection
                  icon={Database}
                  label="Sources pulled"
                  tint="rgb(255 196 99)"
                >
                  <ul className="space-y-2">
                    {SOURCE_PULL.map((s) => {
                      const SIcon = s.icon;
                      return (
                        <li
                          key={s.label}
                          className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
                          style={{ background: 'rgba(255,255,255,0.01)' }}
                        >
                          <span
                            className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0"
                            style={{
                              background: s.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
                              color:      s.tint,
                            }}
                          >
                            <SIcon size={13} />
                          </span>
                          <span className="text-[12.5px] text-text flex-1">{s.label}</span>
                          <span className="text-[13px] font-semibold text-text tabular-nums">
                            {s.count}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-text-dim font-mono pt-3 border-t border-border/60">
                    <span>Total sources synthesized</span>
                    <span className="text-text font-semibold tabular-nums">612</span>
                  </div>
                </UnpackSection>
              </div>
            </div>

            {/* Right column: structure + citation proof */}
            <div>
              <UnpackSection
                icon={Layers}
                label="Structure being built"
                tint="rgb(196 154 255)"
              >
                <ul className="space-y-1.5">
                  {REPORT_STRUCTURE.map((row, i) => {
                    const built = i < 8;
                    return (
                      <li
                        key={row}
                        className="flex items-center gap-2.5 text-[12.5px] leading-snug"
                      >
                        <span
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0"
                          style={{
                            background: built
                              ? 'rgba(111,207,151,0.18)'
                              : 'rgba(165,195,255,0.10)',
                            color: built
                              ? 'rgb(111 207 151)'
                              : 'rgb(165 195 255)',
                          }}
                        >
                          {built ? <Check size={9} /> : <span className="w-1 h-1 rounded-full bg-current" />}
                        </span>
                        <span className={built ? 'text-text' : 'text-text-muted'}>
                          {row}
                        </span>
                        {!built && (
                          <span className="ml-auto text-[10px] font-mono text-text-dim">
                            in progress
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-3 text-[11px] text-text-dim leading-relaxed">
                  Bella chose the structure based on the brief and what
                  Q-Holdings has commissioned before. Hassan can reorder
                  or extend sections at any time.
                </div>
              </UnpackSection>

              {/* Citation proof */}
              <div className="border-t border-border">
                <UnpackSection
                  icon={Quote}
                  label="Citations attached"
                  tint="rgb(111 207 151)"
                >
                  <div className="rounded-lg border border-border bg-card/30 p-4">
                    <div className="flex items-baseline gap-3">
                      <span className="text-3xl font-semibold text-text tabular-nums leading-none">
                        284
                      </span>
                      <span className="text-[12.5px] text-text-muted">
                        citations across <span className="text-text font-semibold">8 sections</span> assembled so far
                      </span>
                    </div>
                    <div className="mt-3 text-[11.5px] text-text-dim leading-relaxed">
                      Every claim in the report links back to one of the
                      612 sources. Click any sentence in the final
                      deliverable to see the underlying filing, article,
                      or graph node it came from.
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-[11px] text-text-dim">
                    <BadgeCheck size={12} className="text-accent-bright" />
                    <span>Provenance preserved through to export — DOCX, PDF, web.</span>
                  </div>
                </UnpackSection>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Started 6 min ago &middot; ETA 9 min &middot; Five agents running, Hassan untouched
            </span>
            <span className="text-text-muted">
              Total time from prompt to delivery: about fifteen minutes.
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Helpers for the unpacked section ───────────────────────────────────────

function UnpackSection({
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
// 6. HassansWeek — KPI strip at a weekly/monthly cadence
// ───────────────────────────────────────────────────────────────────────────

const HASSAN_KPIS = [
  { value: '11',     label: 'reports delivered',  sub: 'this month'        },
  { value: '4',      label: 'engagements served', sub: 'simultaneously'    },
  { value: '17',     label: 'research agents',    sub: 'typically deployed'},
  { value: '184',    label: 'hours saved',        sub: 'vs the old way'    },
  { value: '15 min', label: 'per report',         sub: 'regardless of depth'},
  { value: '0',      label: 'analyst headcount',  sub: 'just Hassan'       },
];

function HassansWeek() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Hassan&apos;s month, in numbers
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            One advisor. The throughput of a strategy practice.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            No analysts under him. No bench staff. The deliverables roll
            out at the cadence of a partner-plus-three-associates desk
            &mdash; because the heavy lifting moved to the agents.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 max-w-5xl mx-auto">
          {HASSAN_KPIS.map((k, i) => (
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
// 7. LeaderPivot — band transition: per-report → engagement scale
// ───────────────────────────────────────────────────────────────────────────

function LeaderPivot() {
  return (
    <section className="relative py-16 md:py-20 border-t border-border/40 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 50%, rgba(196,154,255,0.10) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            From the report to the engagement
          </div>
          <h2 className="text-3xl md:text-[44px] font-semibold leading-[1.1] tracking-tight">
            <span className="text-gradient">Reports run themselves.</span>
            <br />
            <span className="text-text">Engagements scale.</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-text-muted leading-relaxed max-w-2xl mx-auto">
            The next section is for the partner above Hassan, or the
            principal who hires him. Same data, different lens &mdash;
            the boutique&apos;s client portfolio as a single dashboard.
          </p>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. EngagementThroughput — the boutique's client portfolio dashboard
// ───────────────────────────────────────────────────────────────────────────

type EngagementMix = {
  type:  ResearchType;
  label: string;
  count: number;
  tint:  string;
};

type Engagement = {
  initials:  string;
  client:    string;
  brief:     string;
  reports:   number;
  sources:   number;
  hoursSaved:number;
  status:    'active' | 'in-flight' | 'standing';
  mix:       EngagementMix[];
  gradient:  string;
};

const ENGAGEMENTS: Engagement[] = [
  {
    initials:  'MC',
    client:    'Marsa Capital',
    brief:     'M&A diligence support — three live targets',
    reports:   4,
    sources:   1240,
    hoursSaved:72,
    status:    'active',
    gradient:  'linear-gradient(135deg, rgb(91 140 255) 0%, rgb(165 195 255) 100%)',
    mix: [
      { type:'company', label:'Company', count:2, tint:'rgb(91 140 255)' },
      { type:'person',  label:'Person',  count:1, tint:'rgb(111 207 151)' },
      { type:'sector',  label:'Sector',  count:1, tint:'rgb(255 196 99)' },
    ],
  },
  {
    initials:  'QH',
    client:    'Q-Holdings family office',
    brief:     'Healthcare roll-up thesis &mdash; sector + adjacencies',
    reports:   3,
    sources:   1420,
    hoursSaved:54,
    status:    'in-flight',
    gradient:  'linear-gradient(135deg, rgb(255 196 99) 0%, rgb(232 142 168) 100%)',
    mix: [
      { type:'sector', label:'Sector', count:1, tint:'rgb(255 196 99)' },
      { type:'theme',  label:'Theme',  count:1, tint:'rgb(196 154 255)' },
      { type:'region', label:'Region', count:1, tint:'rgb(165 195 255)' },
    ],
  },
  {
    initials:  'MO',
    client:    'Ministry of Commerce & Industry',
    brief:     'Trade-policy briefings &mdash; CBAM exposure + GCC alignment',
    reports:   3,
    sources:   1080,
    hoursSaved:42,
    status:    'active',
    gradient:  'linear-gradient(135deg, rgb(111 207 151) 0%, rgb(91 140 255) 100%)',
    mix: [
      { type:'theme',      label:'Theme',      count:2, tint:'rgb(196 154 255)' },
      { type:'regulation', label:'Regulatory', count:1, tint:'rgb(232 142 168)' },
    ],
  },
  {
    initials:  'DB',
    client:    'Doha Bank',
    brief:     'GCC fintech competitive landscape &mdash; sponsoring strategy',
    reports:   1,
    sources:   1060,
    hoursSaved:16,
    status:    'in-flight',
    gradient:  'linear-gradient(135deg, rgb(196 154 255) 0%, rgb(91 140 255) 100%)',
    mix: [
      { type:'region', label:'Region', count:1, tint:'rgb(165 195 255)' },
    ],
  },
];

const ENGAGEMENT_STATUS: Record<Engagement['status'], { label: string; color: string; bg: string; border: string }> = {
  active: {
    label: 'Active',
    color: 'rgb(111 207 151)',
    bg:    'rgba(111,207,151,0.10)',
    border:'rgba(111,207,151,0.30)',
  },
  'in-flight': {
    label: 'In flight',
    color: 'rgb(255 196 99)',
    bg:    'rgba(255,196,99,0.10)',
    border:'rgba(255,196,99,0.30)',
  },
  standing: {
    label: 'Standing',
    color: 'rgb(165 195 255)',
    bg:    'rgba(165,195,255,0.10)',
    border:'rgba(165,195,255,0.30)',
  },
};

function EngagementThroughput() {
  const totals = ENGAGEMENTS.reduce(
    (acc, e) => ({
      reports: acc.reports + e.reports,
      sources: acc.sources + e.sources,
      hoursSaved: acc.hoursSaved + e.hoursSaved,
    }),
    { reports: 0, sources: 0, hoursSaved: 0 },
  );

  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The boutique&apos;s portfolio
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Four clients, eleven reports, this month.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            What a partner&apos;s dashboard looks like when one advisor
            is doing the work of a desk. Every engagement, every
            deliverable, every hour saved &mdash; in one view.
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
          {/* Aggregate banner */}
          <div className="px-6 py-4 border-b border-border grid grid-cols-2 md:grid-cols-4 gap-4">
            <AggregateCell label="Engagements" value={String(ENGAGEMENTS.length)} sub="active this month" />
            <AggregateCell label="Reports delivered" value={String(totals.reports)} sub="from one advisor" />
            <AggregateCell label="Sources synthesized" value={totals.sources.toLocaleString()} sub="across all engagements" />
            <AggregateCell label="Analyst hours saved" value={String(totals.hoursSaved)} sub="vs the old way" highlight />
          </div>

          {/* Engagement rows */}
          <div>
            {ENGAGEMENTS.map((e, i) => (
              <EngagementRow key={e.client} eng={e} index={i} last={i === ENGAGEMENTS.length - 1} />
            ))}
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Updated by Bella as each report lands &middot; no manual logging
            </span>
            <span className="text-text-muted">
              Same dashboard for the partner, the client lead, and the IC.
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function AggregateCell({
  label, value, sub, highlight,
}: { label: string; value: string; sub: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
        {label}
      </div>
      <div
        className="mt-0.5 text-2xl md:text-[26px] font-semibold tabular-nums leading-none"
        style={{ color: highlight ? 'rgb(111 207 151)' : 'rgb(220 230 250)' }}
      >
        {value}
      </div>
      <div className="mt-1 text-[10.5px] text-text-dim">{sub}</div>
    </div>
  );
}

function EngagementRow({
  eng, index, last,
}: { eng: Engagement; index: number; last: boolean }) {
  const meta = ENGAGEMENT_STATUS[eng.status];
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className={
        'px-5 py-4 md:px-6 md:py-5 grid grid-cols-12 gap-4 items-center ' +
        (last ? '' : 'border-b border-border')
      }
    >
      {/* Client identity */}
      <div className="col-span-12 md:col-span-5 flex items-center gap-3.5 min-w-0">
        <div
          className="w-11 h-11 rounded-lg flex items-center justify-center text-[13px] font-semibold text-text shrink-0"
          style={{ background: eng.gradient, boxShadow: '0 8px 22px -8px rgba(91,140,255,0.35)' }}
        >
          {eng.initials}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-text leading-tight">{eng.client}</span>
            <span
              className="inline-flex items-center text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap"
              style={{ color: meta.color, background: meta.bg, borderColor: meta.border }}
            >
              {meta.label}
            </span>
          </div>
          <div
            className="text-[12px] text-text-muted leading-snug mt-0.5"
            dangerouslySetInnerHTML={{ __html: eng.brief }}
          />
        </div>
      </div>

      {/* Type-mix chips */}
      <div className="col-span-6 md:col-span-3 flex flex-wrap gap-1.5">
        {eng.mix.map((m) => (
          <span
            key={m.type}
            className="inline-flex items-center gap-1 text-[10.5px] font-mono px-1.5 py-0.5 rounded border"
            style={{
              color:       m.tint,
              background:  m.tint.replace('rgb', 'rgba').replace(')', ' / 0.10)'),
              borderColor: m.tint.replace('rgb', 'rgba').replace(')', ' / 0.30)'),
            }}
          >
            <span className="text-text font-semibold tabular-nums">{m.count}</span>
            <span>{m.label}</span>
          </span>
        ))}
      </div>

      {/* Throughput stats */}
      <div className="col-span-6 md:col-span-4 grid grid-cols-3 gap-2">
        <RowStat label="Reports"     value={String(eng.reports)} />
        <RowStat label="Sources"     value={eng.sources.toLocaleString()} />
        <RowStat label="Hours saved" value={String(eng.hoursSaved)} accent />
      </div>
    </motion.div>
  );
}

function RowStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-right md:text-left">
      <div className="text-[9.5px] uppercase tracking-wider text-text-dim font-semibold">
        {label}
      </div>
      <div
        className="text-[15px] font-semibold tabular-nums leading-none mt-0.5"
        style={{ color: accent ? 'rgb(111 207 151)' : 'rgb(220 230 250)' }}
      >
        {value}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 9. ResearchComparison — the before/after table for research
// ───────────────────────────────────────────────────────────────────────────

type ResearchRow = { capability: string; without: string; with: string };

const RESEARCH_COMPARISON_ROWS: ResearchRow[] = [
  {
    capability: 'Time per deep report',
    without:    'Two weeks of analyst time, longer for heavy briefs',
    with:       'About 15 minutes from prompt to delivery, depth-agnostic',
  },
  {
    capability: 'Source classes covered',
    without:    'What one analyst can reach in two weeks',
    with:       'Filings, press, academic, graph, registers, court — all in parallel',
  },
  {
    capability: 'Citation chain',
    without:    'Selective footnotes, attached manually at write-up',
    with:       'Every claim traceable to source, end to end',
  },
  {
    capability: 'Concurrent engagements',
    without:    'One or two heavy studies at a time',
    with:       'Four engagements, six jobs, seventeen agents — at once',
  },
  {
    capability: 'Research types',
    without:    'Whatever the analyst is trained for',
    with:       'Company, person, sector, theme, region, regulation — any of them',
  },
  {
    capability: 'Regulatory monitoring',
    without:    'Quarterly review, plus ad-hoc alerts when someone notices',
    with:       'A standing agent watching every QFC / QCB / QFMA bulletin live',
  },
  {
    capability: 'Knowledge retention',
    without:    'Walks out the door with the analyst',
    with:       'Preserved in the Bell.qa graph, available to the next report',
  },
  {
    capability: 'Cost of the function',
    without:    'A research desk: partner + 2 associates + analyst + bench',
    with:       'One advisor, with Bella deploying research agents on demand',
  },
];

function ResearchComparison() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The before-and-after for research
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What changes when research runs on Bell.qa.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Eight rows. The function shifts from a desk of people
            working sequentially to one person directing many agents
            running in parallel.
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

          {RESEARCH_COMPARISON_ROWS.map((row, i) => (
            <motion.div
              key={row.capability}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={
                'grid grid-cols-12 text-[13px] ' +
                (i < RESEARCH_COMPARISON_ROWS.length - 1 ? 'border-b border-border' : '')
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
// 10. ConnectedToPlatform — the surfaces Research pulls from
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
    body:  "The orchestrator. Reads the brief, decides how heavy it is, spawns one or many research agents per job, and synthesizes their output into the final report.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  "Every live market signal feeds the agents. By the time Hassan writes a brief, the Doha Health Network filing this morning is already in the next report.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "Forecasts and probability folded into sector and thematic reports — not as a separate model, but as a section with sources and confidence intervals.",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  "Geographic dimension on demand. Regional clusters, footprint maps, supply-chain proximity — generated alongside the prose, cited the same way.",
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  Inbox,
    label: 'CRM',
    href:  '/platform/crm',
    body:  "Reports land attached to the right client engagement. The principal opens the engagement and sees every deliverable, every source, every claim.",
    tint:  'rgb(165 195 255)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Five surfaces, one advisor
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Hassan&apos;s research engine is built on.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Research pulls from five parts of the Bell.qa platform.
            Each one stands alone and is documented in depth &mdash;
            tap into any of them.
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
                'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(91,140,255,0.18) 0%, transparent 60%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                You&apos;ve seen Hassan&apos;s month
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now run your research function on the only platform
                built for Qatar.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your first report lands the same day.
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
            Beyond research
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The other revenue functions Bell.qa accelerates.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Research is one of four. The same data and the same Bella
            power your sales, marketing, business development, and
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
// 13. ThreeReader — Research-specific audience block
// ───────────────────────────────────────────────────────────────────────────

const RESEARCH_READERS = [
  {
    icon:  FileSearch,
    label: 'For the analyst / consultant',
    body:  "The drudgery moves to the agents. Source-gathering, citation tracking, structural assembly — all handled. The work that remains is the work you got into research for: judgment, narrative, and the call.",
  },
  {
    icon:  Crown,
    label: 'For the head of research',
    body:  "Desk-scale throughput without the desk. Eleven reports a month from one advisor, every claim cited, every deliverable defensible. Capacity multiplies without adding headcount.",
  },
  {
    icon:  BadgeCheck,
    label: 'For the client',
    body:  "What you commissioned arrives in hours, not weeks. Every sentence links back to its source — a filing, an article, a graph node — so the basis for any conclusion is one click away.",
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
            What Bell.qa changes for research.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {RESEARCH_READERS.map((r, i) => {
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
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(91,140,255,0.16) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          Put your research function on Bell.qa.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Companies, people, sectors, themes, regions, regulations
          &mdash; anything in the Qatari market, deep, structured, and
          cited. Fifteen minutes from prompt to report. One advisor,
          the throughput of a desk.
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

'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Target, ArrowRight, Sparkles, Check,
  Sunrise, FileSearch, ListFilter, Send, Map as MapIcon,
  Briefcase, MessageSquare, TrendingUp, Moon,
  Inbox, CalendarClock, Radar, Bot, BarChart3, Users,
} from 'lucide-react';

/**
 * SALES PAGE — section-by-section build.
 *
 * Persona-driven, narrative-first. The page follows Layla Hassan, an
 * Account Executive at MyWeb Systems (a Qatari IT firm doing custom
 * CRM/ERP development for local businesses), through a single day on
 * Bell.qa. The day-in-the-life timeline is the visual centerpiece —
 * different shape from the Bella page (capability moments) so the two
 * sub-pages don't read as templated against each other.
 *
 * Sections (built in rounds — Val signs off after each round):
 *   ROUND 1 (this file currently):
 *     1. SalesHero              — "Sales, end to end. On the Bell.qa graph."
 *     2. SalesActivityBar       — full-width band cycling sales team stats
 *     3. MeetLayla              — persona intro card
 *     4. DayTimeline            — 9 time blocks, vertical timeline
 *
 *   ROUND 2 (to be added):
 *     5. LaylasDayInNumbers     — KPI strip summarising what she shipped
 *     6. LeaderPivot            — "Multiply Layla by N reps..."
 *     7. TeamLevelMath          — monthly team totals stats card
 *
 *   ROUND 3 (to be added):
 *     8. SalesComparison        — Without Bell.qa vs With Bell.qa
 *     9. ConnectedToPlatform    — cross-link tiles to Bella/Map/CRM/Signals
 *
 *   ROUND 4 (to be added):
 *    10. OtherFunctions         — Marketing / BD / Research / GTM cross-links
 *    11. ThreeReader            — For reps / leaders / sales ops
 *    12. MidPageCta             — Get Access band
 *    13. FinalCta               — closing block
 *
 * Visual register inherited from Bella page: brand-blue palette, sticky
 * patterns where useful, button language, eyebrow style. Different
 * primitive: the vertical timeline anchors the centerpiece instead of
 * the capability-moment stack.
 */

export function SalesPageSections() {
  return (
    <>
      <SalesHero />
      <SalesActivityBar />
      <MeetLayla />
      <DayTimeline />
      <LaylasDayInNumbers />
      <LeaderPivot />
      <TeamLevelMath />
      <SalesComparison />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Hero — cinematic, matching Bella page energy
// ───────────────────────────────────────────────────────────────────────────

function SalesHero() {
  return (
    <section className="relative pt-28 pb-16 overflow-hidden">
      {/* Radial accent + subtle grid — same recipe as Bella's hero so the
          two pages share a visual lineage at the opening. */}
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
          <Target size={11} />
          For sales teams
        </div>
        <h1 className="text-display-md md:text-display-lg text-gradient max-w-4xl mx-auto">
          Sales, end to end.<br/>On the Bell.qa graph.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl mx-auto">
          Coverage no one else has. Intelligence no one else has. The
          autonomous agent that does the work no one else&apos;s tool can do.
          Bell.qa gives sales teams everything they need to find, qualify,
          and close Qatari customers &mdash; from cold to closed.
        </p>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Live activity bar — sales-themed, cycles through team stats
// ───────────────────────────────────────────────────────────────────────────

type SalesActivityFrame = {
  value: string;
  label: string;
  color: string;
};

const SALES_ACTIVITY_FRAMES: SalesActivityFrame[] = [
  { value: '1,847', label: 'outreach emails sent today',     color: 'rgb(91 140 255)'   },
  { value: '312',   label: 'replies routed back to reps',    color: 'rgb(111 207 151)'  },
  { value: '47',    label: 'meetings booked since 9 AM',     color: 'rgb(196 154 255)'  },
  { value: '12',    label: 'deals advanced to negotiation',  color: 'rgb(255 196 99)'   },
  { value: '4',     label: 'deals closed since lunch',       color: 'rgb(111 207 151)'  },
];
const SALES_FRAME_DURATION_MS = 4500;

function SalesActivityBar() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setIdx(i => (i + 1) % SALES_ACTIVITY_FRAMES.length);
    }, SALES_FRAME_DURATION_MS);
    return () => clearInterval(id);
  }, []);

  const frame = SALES_ACTIVITY_FRAMES[idx];

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
      {/* Top accent line — color follows the active frame */}
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
          Sales · today
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
          live · across customer base
        </span>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Meet Layla — persona intro card before the timeline
// ───────────────────────────────────────────────────────────────────────────

function MeetLayla() {
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
              Meet Layla
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
              Follow one rep through one day.
            </h2>
            <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed max-w-2xl mx-auto">
              The best way to understand what Bell.qa does for a sales
              team is to ride along for a single day. Meet Layla.
            </p>
          </div>

          {/* Persona card */}
          <div
            className="rounded-2xl border border-border overflow-hidden"
            style={{
              background:
                'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
              boxShadow: '0 18px 50px -20px rgba(0,0,0,0.55)',
            }}
          >
            <div className="p-6 md:p-7 flex flex-col md:flex-row items-start gap-5">
              {/* Avatar */}
              <div
                className="shrink-0 inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl text-2xl md:text-3xl font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, rgb(165 195 255) 0%, rgb(91 140 255) 100%)',
                  boxShadow:  '0 12px 30px -10px rgba(91,140,255,0.4)',
                }}
              >
                LH
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                  <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                    Layla Hassan
                  </div>
                  <div className="text-sm text-text-muted">
                    Account Executive · MyWeb Systems
                  </div>
                </div>
                <p className="text-[13.5px] text-text-muted leading-relaxed mb-4">
                  MyWeb Systems builds custom CRM and ERP software for
                  Qatari businesses. Layla&apos;s job is to find the
                  companies that need bespoke software, get in front of
                  their decision makers, and close the deal.
                </p>

                {/* Quick facts */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <PersonaFact
                    label="ICP"
                    value="Qatari companies, 50&ndash;500 employees, growing or digitising"
                  />
                  <PersonaFact
                    label="Daily targets"
                    value="10 outreaches, 2&ndash;3 meetings, advance pipeline"
                  />
                  <PersonaFact
                    label="Tools today"
                    value="Bell.qa, the CRM, the Map, Bella"
                  />
                </div>
              </div>
            </div>

            {/* Footer — sets up the timeline */}
            <div
              className="px-6 md:px-7 py-3 border-t border-border flex items-center justify-between gap-3"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <span className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                Tuesday morning &middot; Doha
              </span>
              <span className="text-[11px] text-text-muted flex items-center gap-1.5">
                Scroll along
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
// 4. The day timeline — Layla's day on Bell.qa, hour by hour
// ───────────────────────────────────────────────────────────────────────────

type TimelineBlock = {
  time:      string;
  icon:      React.ComponentType<{ size?: number }>;
  title:     string;
  narrative: React.ReactNode;
  surface:   React.ReactNode;
  link?:     { label: string; href: string };
};

/** Inline cross-link rendered inside the timeline narrative. */
function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-accent-bright underline decoration-accent/40 underline-offset-2 hover:decoration-accent transition-colors"
    >
      {children}
    </Link>
  );
}

const DAY_BLOCKS: TimelineBlock[] = [
  {
    time: '8:30 AM',
    icon: Sunrise,
    title: 'The morning brief',
    narrative: (
      <>
        Layla opens Bell.qa over her first coffee. The overnight summary
        shows <strong>24 new signals</strong> matching her ICP, 6 hot
        prospects flagged as priority, and 38 replies waiting from the
        outreach Bella ran overnight. Bell did the watching while Layla
        slept.
      </>
    ),
    surface: (
      <SurfaceCard title="Overnight summary · Tuesday 8:30 AM">
        <SurfaceRow icon={Radar}     label="New signals matched"    value="24"   tint="rgb(91 140 255)"  />
        <SurfaceRow icon={Target}    label="Priority prospects"     value="6"    tint="rgb(255 196 99)"  />
        <SurfaceRow icon={Inbox}     label="Replies pending review" value="38"   tint="rgb(111 207 151)" />
      </SurfaceCard>
    ),
    link: { label: 'See Signals & Insights', href: '/platform/signals-and-insights' },
  },
  {
    time: '9:15 AM',
    icon: FileSearch,
    title: 'Prep for the discovery call',
    narrative: (
      <>
        Discovery call with Apex Holdings at 9:30 AM. Layla types the company
        name into Bell.qa. <strong>Full dossier in 8 seconds</strong>:
        recent news, the decision unit, hiring patterns, sector benchmarks,
        the tech stack on their careers page. She walks in ready.
      </>
    ),
    surface: (
      <SurfaceCard title="Apex Holdings · Dossier" subtle="Generated in 0.8s">
        <SurfaceRow icon={Users}        label="Decision unit identified"   value="6 contacts" tint="rgb(91 140 255)" />
        <SurfaceRow icon={TrendingUp}   label="Active hiring signals"      value="3 roles"    tint="rgb(111 207 151)" />
        <SurfaceRow icon={MessageSquare}label="Recent press / statements"  value="11 items"   tint="rgb(196 154 255)" />
        <SurfaceRow icon={BarChart3}    label="Sector benchmark fit"       value="High"       tint="rgb(255 196 99)" />
      </SurfaceCard>
    ),
  },
  {
    time: '10:45 AM',
    icon: ListFilter,
    title: 'Sourcing the next round',
    narrative: (
      <>
        Call done. Layla filters Qatar by her ICP &mdash;{' '}
        <strong>50&ndash;500 employees, growing or actively digitising,
        any sector that runs operations-heavy</strong>. 247 matches.
        She marks 80 as priority for outreach today.
      </>
    ),
    surface: (
      <SurfaceCard title="Filter · Qatar / ICP match" subtle="247 of every Qatari company">
        <div className="space-y-2 px-4 py-3">
          <FilterChip label="Size: 50–500 employees" />
          <FilterChip label="Growing or digitising (signals)" />
          <FilterChip label="Operations-heavy sectors" />
          <FilterChip label="Tech stack: bespoke fit" />
        </div>
        <div className="px-4 py-3 border-t border-border flex items-center justify-between text-[12px]">
          <span className="text-text-muted">247 companies matched</span>
          <span className="font-semibold text-accent-bright">80 marked priority</span>
        </div>
      </SurfaceCard>
    ),
  },
  {
    time: '11:30 AM',
    icon: Send,
    title: 'Outreach drafted, sent',
    narrative: (
      <>
        Layla hands the 80 to <InlineLink href="/platform/bella">Bella</InlineLink>.
        Bella drafts <strong>80 personalised emails</strong> &mdash;
        different hook per prospect, all in Layla&apos;s voice, every
        one citing a real signal she caught. Layla skims, batch-approves,
        hits send. <strong>Eighty cold opens in twenty minutes.</strong>
      </>
    ),
    surface: (
      <SurfaceCard title="Outreach queue · awaiting approval" subtle="Drafted by Bella · 80 emails">
        <SurfaceRow icon={Sparkles} label="Drafts ready"         value="80"  tint="rgb(165 195 255)" />
        <SurfaceRow icon={Target}   label="Avg. ICP match score" value="91 / 100" tint="rgb(111 207 151)" />
        <SurfaceRow icon={Check}    label="Tone match to Layla"  value="Approved" tint="rgb(111 207 151)" />
      </SurfaceCard>
    ),
    link: { label: 'See how Bella drafts outreach', href: '/platform/bella' },
  },
  {
    time: '1:00 PM',
    icon: MapIcon,
    title: 'Field visit recon',
    narrative: (
      <>
        Layla has a face-to-face in West Bay at 2:00 PM. She opens the{' '}
        <InlineLink href="/platform/map">Map</InlineLink> and sees{' '}
        <strong>8 prospects within 200 m</strong> of her meeting &mdash;
        3 of them warm. After the meeting, she&apos;ll drop in on one.
      </>
    ),
    surface: (
      <SurfaceCard title="Map · 200 m radius · West Bay" subtle="8 prospects, 3 warm">
        <MapMiniature />
      </SurfaceCard>
    ),
    link: { label: 'See the Map', href: '/platform/map' },
  },
  {
    time: '2:30 PM',
    icon: Briefcase,
    title: 'Walk-in, prepared',
    narrative: (
      <>
        Standing in the lobby of one of her warm prospects. Bell.qa
        surfaces what matters before she rides the lift: their new VP of
        Operations started 3 weeks ago, they just expanded to Kuwait,
        their RFP for routing software is open this quarter.{' '}
        <strong>Layla walks in knowing what to pitch.</strong>
      </>
    ),
    surface: (
      <SurfaceCard title="Walk-in brief · before the lift" subtle="Auto-generated on location">
        <ul className="px-4 py-3 space-y-1.5 text-[13px] text-text leading-snug">
          <li>· New VP Operations started 3 weeks ago (LinkedIn).</li>
          <li>· Kuwait expansion announced 11 days ago (press).</li>
          <li>· Open RFP: routing software (MOCI filing).</li>
          <li>· Best pitch: deployment speed + GCC fluency.</li>
        </ul>
      </SurfaceCard>
    ),
  },
  {
    time: '4:00 PM',
    icon: MessageSquare,
    title: 'Replies are landing',
    narrative: (
      <>
        <strong>Forty-six replies</strong> have landed since lunch.
        Bella routed each one back with sentiment tags so Layla sees
        what to act on first: <em>&ldquo;interested, wants demo&rdquo;</em>,
        <em> &ldquo;not now, try Q1&rdquo;</em>, <em>&ldquo;wrong
        contact, forwarded to ops VP&rdquo;</em>.{' '}
        <strong>Nine meetings already auto-booked.</strong>
      </>
    ),
    surface: (
      <SurfaceCard title="Replies · this afternoon" subtle="46 replies · routed and tagged by Bella">
        <ReplyRow contact="Mohammed Al-Marri · COO" tag="Interested, wants demo"   tone="green" />
        <ReplyRow contact="Khalid Al-Mansoori · CFO" tag="Not now, try Q1"          tone="amber" />
        <ReplyRow contact="Saif Al-Kuwari · CEO"     tag="Forwarded to ops VP"      tone="blue"  />
        <div className="px-4 py-2.5 text-[11px] text-text-dim text-center">
          + 43 more &middot; sorted by reply intent
        </div>
      </SurfaceCard>
    ),
  },
  {
    time: '5:30 PM',
    icon: TrendingUp,
    title: 'Pipeline updates itself',
    narrative: (
      <>
        Layla&apos;s pipeline shows <strong>14 deals advanced today</strong>:
        7 to demo stage, 5 to negotiation, 2 closed-won. The{' '}
        <InlineLink href="/platform/crm">CRM</InlineLink> did the
        updating from email replies and calendar bookings &mdash; Layla
        just confirms.
      </>
    ),
    surface: (
      <SurfaceCard title="Pipeline · today's movement" subtle="Auto-updated">
        <PipelineRow label="Discovery → Demo"        count={7} tint="rgb(91 140 255)"  />
        <PipelineRow label="Demo → Negotiation"      count={5} tint="rgb(196 154 255)" />
        <PipelineRow label="Negotiation → Closed-won" count={2} tint="rgb(111 207 151)" />
      </SurfaceCard>
    ),
    link: { label: 'See the CRM', href: '/platform/crm' },
  },
  {
    time: '6:00 PM',
    icon: Moon,
    title: 'Tomorrow is already loaded',
    narrative: (
      <>
        Layla closes the laptop. The morning brief for Wednesday will
        land at 6:00 AM. <InlineLink href="/platform/bella">Bella</InlineLink>{' '}
        will run the follow-up sequence overnight for{' '}
        <strong>the 213 threads</strong> still waiting on a reply.
        Twelve meetings are already booked for tomorrow.{' '}
        <strong>The pipeline doesn&apos;t sleep.</strong>
      </>
    ),
    surface: (
      <SurfaceCard title="Queued overnight" subtle="Bella · autonomous mode">
        <SurfaceRow icon={Send}         label="Follow-ups to run"   value="213 threads" tint="rgb(91 140 255)" />
        <SurfaceRow icon={CalendarClock} label="Meetings tomorrow"   value="12 booked"  tint="rgb(196 154 255)" />
        <SurfaceRow icon={Sunrise}      label="Morning brief due"   value="6:00 AM"     tint="rgb(255 196 99)"  />
      </SurfaceCard>
    ),
  },
];

function DayTimeline() {
  return (
    <section className="relative py-12 md:py-16">
      <div className="max-w-screen-xl mx-auto px-6">

        {/* Section heading */}
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-16">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            A day on Bell.qa
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            08:30 to 18:00, with Bell underneath.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Nine moments. Same eight working hours your team already
            has. A completely different shape of day.
          </p>
        </div>

        {/* Timeline */}
        <div className="relative max-w-5xl mx-auto">
          {/* Continuous vertical line — absolutely positioned, spans all blocks.
              Aligns to the centre of the dot column on lg+ (~80px from left). */}
          <div
            aria-hidden="true"
            className="hidden lg:block absolute top-2 bottom-2 w-px"
            style={{
              left: 110,
              background:
                'linear-gradient(180deg, rgba(91,140,255,0.05) 0%, rgba(91,140,255,0.35) 10%, rgba(91,140,255,0.35) 90%, rgba(91,140,255,0.05) 100%)',
            }}
          />

          <ul className="space-y-10 lg:space-y-14">
            {DAY_BLOCKS.map((block, i) => (
              <TimelineBlockRow key={block.time} block={block} index={i} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function TimelineBlockRow({ block, index }: { block: TimelineBlock; index: number }) {
  const Icon = block.icon;
  return (
    <motion.li
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.55, delay: Math.min(index * 0.05, 0.2) }}
      className="grid grid-cols-12 gap-4 lg:gap-6 items-start"
    >
      {/* LEFT — time column (lg only — collapses on mobile) */}
      <div className="hidden lg:flex lg:col-span-2 flex-col items-end pr-4 pt-2 relative">
        <div className="text-[13px] font-mono tabular-nums text-text font-semibold whitespace-nowrap">
          {block.time}
        </div>
      </div>

      {/* Dot column — sits on the vertical line */}
      <div className="hidden lg:flex lg:col-span-1 justify-center relative">
        <div
          className="relative inline-flex items-center justify-center w-10 h-10 rounded-full mt-1"
          style={{
            background: 'rgb(13 18 35)',
            boxShadow:  '0 0 0 1px rgba(91,140,255,0.35), 0 0 18px -4px rgba(91,140,255,0.45)',
          }}
        >
          <span className="text-accent-bright">
            <Icon size={16} />
          </span>
        </div>
      </div>

      {/* RIGHT — content card (full width on mobile, col-span-9 on lg) */}
      <div className="col-span-12 lg:col-span-9">
        {/* Mobile-only time header (since the time column is hidden on mobile) */}
        <div className="lg:hidden mb-3 flex items-center gap-2">
          <span
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-accent-bright"
            style={{ background: 'rgba(91,140,255,0.14)' }}
          >
            <Icon size={14} />
          </span>
          <span className="text-[12px] font-mono tabular-nums text-text font-semibold">
            {block.time}
          </span>
        </div>

        <h3 className="text-xl md:text-2xl font-semibold text-text leading-tight mb-3">
          {block.title}
        </h3>
        <p className="text-[14.5px] md:text-base text-text-muted leading-relaxed mb-5 max-w-2xl">
          {block.narrative}
        </p>

        {/* Product surface visualization */}
        <div className="max-w-xl">{block.surface}</div>

        {/* Optional deep link */}
        {block.link && (
          <Link
            href={block.link.href}
            className="inline-flex items-center gap-1.5 mt-4 text-[12.5px] font-semibold text-accent-bright hover:text-text transition-colors"
          >
            {block.link.label}
            <ArrowRight size={11} />
          </Link>
        )}
      </div>
    </motion.li>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Surface helpers — small reusable visualizations used inside timeline cards
// ───────────────────────────────────────────────────────────────────────────

function SurfaceCard({
  title, subtle, children,
}: {
  title:    string;
  subtle?:  string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl border border-border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        boxShadow: '0 12px 30px -16px rgba(0,0,0,0.55)',
      }}
    >
      <div
        className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3"
        style={{ background: 'rgba(255,255,255,0.015)' }}
      >
        <div className="text-[11px] font-semibold uppercase tracking-wider text-text">
          {title}
        </div>
        {subtle && (
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
            {subtle}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SurfaceRow({
  icon: Icon, label, value, tint,
}: {
  icon:  React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  tint:  string;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border/60 last:border-b-0">
      <div className="flex items-center gap-2.5">
        <span
          className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md"
          style={{
            background: tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      tint,
          }}
        >
          <Icon size={12} />
        </span>
        <span className="text-[13px] text-text-muted">{label}</span>
      </div>
      <span className="text-[13px] text-text font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function FilterChip({ label }: { label: string }) {
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-[12px] text-text-muted mr-2"
      style={{
        background:  'rgba(91,140,255,0.06)',
        borderColor: 'rgba(91,140,255,0.22)',
      }}
    >
      <ListFilter size={10} className="text-accent-bright" />
      {label}
    </div>
  );
}

function ReplyRow({
  contact, tag, tone,
}: {
  contact: string;
  tag:     string;
  tone:    'green' | 'amber' | 'blue';
}) {
  const toneColor =
    tone === 'green' ? 'rgb(111 207 151)' :
    tone === 'amber' ? 'rgb(255 196 99)'  :
                       'rgb(91 140 255)';
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border/60 last:border-b-0">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md"
          style={{
            background: toneColor.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      toneColor,
          }}
        >
          <MessageSquare size={12} />
        </span>
        <span className="text-[13px] text-text truncate">{contact}</span>
      </div>
      <span
        className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
        style={{
          color:       toneColor,
          background:  toneColor.replace('rgb', 'rgba').replace(')', ' / 0.10)'),
          borderColor: toneColor.replace('rgb', 'rgba').replace(')', ' / 0.30)'),
        }}
      >
        {tag}
      </span>
    </div>
  );
}

function PipelineRow({
  label, count, tint,
}: {
  label: string;
  count: number;
  tint:  string;
}) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-border/60 last:border-b-0">
      <span className="text-[13px] text-text">{label}</span>
      <span
        className="text-[11px] font-mono tabular-nums px-2 py-0.5 rounded"
        style={{
          color:      tint,
          background: tint.replace('rgb', 'rgba').replace(')', ' / 0.12)'),
        }}
      >
        +{count}
      </span>
    </div>
  );
}

/**
 * A compact decorative "map" preview — abstract dots representing
 * prospects within a radius. Not a real map; just a visual cue inside
 * the timeline card. The real Map gets its own deep page.
 */
function MapMiniature() {
  // Deterministic pseudo-random positions so the dots are stable across renders.
  const pins = [
    { x: 18, y: 22, hot: false },
    { x: 36, y: 40, hot: true  },
    { x: 52, y: 18, hot: false },
    { x: 68, y: 58, hot: true  },
    { x: 80, y: 32, hot: false },
    { x: 28, y: 70, hot: false },
    { x: 60, y: 80, hot: true  },
    { x: 44, y: 56, hot: false },
  ];
  return (
    <div
      className="relative h-40 overflow-hidden"
      style={{
        background:
          'radial-gradient(ellipse at 50% 60%, rgba(91,140,255,0.12) 0%, rgba(13,18,35,0.6) 70%)',
      }}
    >
      {/* Concentric ranges to suggest a radius */}
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
        style={{
          width: 200, height: 200,
          borderColor: 'rgba(91,140,255,0.18)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
        style={{
          width: 120, height: 120,
          borderColor: 'rgba(91,140,255,0.28)',
        }}
      />
      {/* Meeting marker — centre */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full"
        style={{
          background: 'rgb(165 195 255)',
          boxShadow:  '0 0 12px rgb(91 140 255)',
        }}
        aria-hidden="true"
      />
      {/* Prospect pins */}
      {pins.map((p, i) => (
        <span
          key={i}
          className="absolute w-2 h-2 rounded-full"
          style={{
            left: `${p.x}%`,
            top:  `${p.y}%`,
            background: p.hot ? 'rgb(255 196 99)' : 'rgb(120 130 152)',
            boxShadow:  p.hot ? '0 0 8px rgba(255,196,99,0.6)' : 'none',
          }}
          aria-hidden="true"
        />
      ))}
      {/* Legend */}
      <div className="absolute bottom-2 left-3 flex items-center gap-3 text-[10px] text-text-dim">
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgb(165 195 255)' }} />
          You
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgb(255 196 99)' }} />
          Warm
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgb(120 130 152)' }} />
          Cold
        </span>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Layla's day in numbers — KPI strip summarising what she shipped
// ───────────────────────────────────────────────────────────────────────────

const LAYLA_DAY_KPIS = [
  { value: '287', label: 'Outreach emails sent',     tint: 'rgb(91 140 255)'   },
  { value: '54',  label: 'Replies received',         tint: 'rgb(111 207 151)'  },
  { value: '11',  label: 'Meetings booked',          tint: 'rgb(196 154 255)'  },
  { value: '2',   label: 'Field visits completed',   tint: 'rgb(255 196 99)'   },
  { value: '14',  label: 'Deals advanced',           tint: 'rgb(111 207 151)'  },
  { value: '0',   label: 'Hours on manual data work',tint: 'rgb(165 195 255)'  },
];

function LaylasDayInNumbers() {
  return (
    <section className="relative py-20 md:py-24 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Layla&apos;s day, in numbers
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            One rep. The output of a twenty-person team.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            All before 6:00 PM. No overtime. No spreadsheets. A normal
            rep without Bell.qa ships a tiny fraction of this in the
            same hours.
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
          <div className="px-6 py-4 border-b border-border flex items-center justify-between gap-3"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
              Layla Hassan &middot; Tuesday &middot; one working day
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
            {LAYLA_DAY_KPIS.map((k, i) => (
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
              Same eight working hours every rep already has. Bell.qa
              and Bella together are why one Layla now does what an
              old-school sales floor of twenty did before lunch.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. Leader pivot — transition from rep view to leader view
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
            Now the leader&apos;s view
          </div>
          <h2 className="text-3xl md:text-5xl font-semibold leading-[1.1]">
            <span className="text-gradient">Multiply Layla by 8 reps.</span>
            <br/>
            <span className="text-text-muted">Multiply by 30 days.</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-text-muted leading-relaxed max-w-2xl mx-auto">
            One rep&apos;s day was the small frame. Here&apos;s what the
            same picture looks like at team scale over a month &mdash;
            the numbers a head of sales actually has to land against.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. Team-level math — monthly team totals on Bell.qa
// ───────────────────────────────────────────────────────────────────────────

const TEAM_MONTHLY_KPIS = [
  {
    icon:  Send,
    value: '68,400',
    label: 'Outreach sent',
    sub:   'across the whole team',
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  MessageSquare,
    value: '11,247',
    label: 'Replies received',
    sub:   '~16% reply rate',
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  CalendarClock,
    value: '1,872',
    label: 'Meetings booked',
    sub:   'auto-scheduled by Bella',
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  TrendingUp,
    value: '412',
    label: 'Deals in pipeline',
    sub:   'active and forecasted',
    tint:  'rgb(255 196 99)',
  },
];

function TeamLevelMath() {
  return (
    <section className="relative py-12 md:py-16">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            Sales team &middot; 30 days on Bell.qa.
          </h2>
          <p className="mt-3 text-base text-text-muted">
            One month, eight reps, Bell.qa underneath every motion.
            This is what the funnel looks like at the leader&apos;s
            level.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
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
          {/* Header strip */}
          <div
            className="px-6 py-4 border-b border-border flex items-center justify-between gap-3"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
              Sales · trailing 30 days
            </div>
            <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-bg-elev-2 border border-border">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'rgb(111 207 151)' }} />
              <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">
                Auto-tracked
              </span>
            </span>
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border">
            {TEAM_MONTHLY_KPIS.map((k, i) => {
              const Icon = k.icon;
              return (
                <div key={i} className="p-6">
                  <div className="flex items-center gap-2 mb-3" style={{ color: k.tint }}>
                    <Icon size={14} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">
                      {k.label}
                    </span>
                  </div>
                  <div className="text-3xl md:text-4xl font-semibold text-text tabular-nums leading-none mb-2">
                    {k.value}
                  </div>
                  <div className="text-[11px] text-text-dim">
                    {k.sub}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Funnel summary */}
          <div className="px-6 py-5 border-t border-border">
            <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-3">
              Funnel shape
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-text-muted">
              <FunnelStep value="68,400" label="sent"      tint="rgb(91 140 255)"  />
              <FunnelArrow />
              <FunnelStep value="11,247" label="replies"   tint="rgb(111 207 151)" />
              <FunnelArrow />
              <FunnelStep value="1,872"  label="meetings"  tint="rgb(196 154 255)" />
              <FunnelArrow />
              <FunnelStep value="412"    label="pipeline"  tint="rgb(255 196 99)"  />
            </div>
          </div>

          {/* Footnote */}
          <div className="px-6 py-4 border-t border-border text-center">
            <p className="text-sm text-text-muted">
              Same eight-rep headcount. Bell.qa underneath every
              motion. Without it, the same team would need{' '}
              <span className="text-text font-semibold">
                a sales floor of 150&ndash;200 people
              </span>{' '}
              to ship anywhere near these numbers &mdash; and even then
              they wouldn&apos;t have the Qatari coverage.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/** Single segment of the inline funnel — number + label, color-tinted. */
function FunnelStep({
  value, label, tint,
}: {
  value: string;
  label: string;
  tint:  string;
}) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-md border"
      style={{
        background:  tint.replace('rgb', 'rgba').replace(')', ' / 0.08)'),
        borderColor: tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
      }}
    >
      <span className="font-mono tabular-nums font-semibold" style={{ color: tint }}>
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
        {label}
      </span>
    </span>
  );
}

function FunnelArrow() {
  return (
    <ArrowRight size={14} className="text-text-dim mx-0.5 shrink-0" aria-hidden="true" />
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. SalesComparison — "Without Bell.qa vs With Bell.qa for sales teams"
// ───────────────────────────────────────────────────────────────────────────

const SALES_COMPARISON_ROWS = [
  {
    capability:  'Daily prospect throughput',
    without:     '10–15 considered emails per rep per day, manually researched',
    with:        '200+ personalised emails per rep per day, drafted by Bella',
  },
  {
    capability:  'Research depth per account',
    without:     '30–60 minutes per prospect, when the calendar allows',
    with:        'Full dossier in seconds — signals, decision unit, sector benchmarks',
  },
  {
    capability:  'Outreach personalisation',
    without:     'Merge-field templates that everyone sees through',
    with:        'Tailored per recipient — different hook per prospect, all in the rep’s voice',
  },
  {
    capability:  'Follow-up consistency',
    without:     'Threads drop when the week gets heavy. Closed-lost stays cold.',
    with:        'Every sequence runs end-to-end. No thread left behind.',
  },
  {
    capability:  'Pipeline visibility',
    without:     'CRM data is stale, partial, or simply not entered',
    with:        'Auto-updated from email replies and calendar bookings',
  },
  {
    capability:  'Ramp time for new hires',
    without:     '3–6 months to learn the market, the ICP, the contacts',
    with:        'Two weeks. Bell carries the institutional knowledge for them.',
  },
  {
    capability:  'Time on manual data work',
    without:     'Most of the rep’s week',
    with:        'Zero. Bella does it in the background.',
  },
  {
    capability:  'Cost per qualified meeting',
    without:     'Hundreds in fully-loaded rep time, per booked meeting',
    with:        'A fraction of that, after Bell.qa subscription is netted out',
  },
];

function SalesComparison() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The before-and-after for sales
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What changes when sales runs on Bell.qa.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Eight rows. Every one of them moves by a factor, not a
            percent.
          </p>
        </div>

        <div
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

          {/* Rows */}
          {SALES_COMPARISON_ROWS.map((row, i) => (
            <motion.div
              key={row.capability}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={
                'grid grid-cols-12 text-[13px] ' +
                (i < SALES_COMPARISON_ROWS.length - 1 ? 'border-b border-border' : '')
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
// 9. ConnectedToPlatform — cross-link tiles to the platform features sales uses
// ───────────────────────────────────────────────────────────────────────────

type PlatformLink = {
  icon:  React.ComponentType<{ size?: number }>;
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
    body:  'The autonomous agent that drafts, sends, follows up, and routes replies on Layla’s behalf.',
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  'Field-selling superpower. Prospects within radius, with full intel before Layla walks in.',
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  Inbox,
    label: 'CRM',
    href:  '/platform/crm',
    body:  'Native pipeline, contacts, conversations. Auto-updated from email replies and meetings.',
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  'Buying-intent signals across the Qatari market. The morning brief Layla opens to.',
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  TrendingUp,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  'Forecasting and probability over the graph. Tells Layla which deals close next.',
    tint:  'rgb(165 195 255)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Five surfaces, one rep
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Layla&apos;s day is built on.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Sales pulls from five parts of the Bell.qa platform. Each
            one stands alone and is documented in depth &mdash; tap into
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
// 10. MidPageCta — Get Access band, placed after the data-heavy sections
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
                You&apos;ve seen Layla&apos;s day
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now run yours on the only platform built for selling
                into Qatar.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your team is on Bell.qa by tomorrow.
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
// 11. OtherFunctions — cross-links to the other revenue functions on Bell.qa
// ───────────────────────────────────────────────────────────────────────────

type OtherFunctionCard = {
  icon:    React.ComponentType<{ size?: number }>;
  team:    string;
  href:    string;
  tagline: string;
  capabilities: string[];
};

const OTHER_FUNCTIONS: OtherFunctionCard[] = [
  {
    icon:    Target,
    team:    'Marketing',
    href:    '/platform/marketing',
    tagline: 'Reaches the right Qatari accounts at the right moment.',
    capabilities: [
      'Target lists that update themselves as the market shifts',
      'Campaigns triggered off real-world signals',
      'Attribution back to the signal that surfaced the account',
    ],
  },
  {
    icon:    Briefcase,
    team:    'Business Development',
    href:    '/platform/business-development',
    tagline: 'Surfaces partnerships and M&A targets before the market does.',
    capabilities: [
      'Maps ownership chains, board overlaps, corporate relationships',
      'Tracks strategic moves &mdash; acquisitions, new licences, expansion',
      'Watchlists that surface change automatically',
    ],
  },
  {
    icon:    FileSearch,
    team:    'Research',
    href:    '/platform/research',
    tagline: 'Hands analysts the report they would have spent days writing.',
    capabilities: [
      'Deep-researches any company, sector, or topic',
      'Every public signal pulled with full citation trail',
      'Structured reports ready for the boardroom',
    ],
  },
  {
    icon:    TrendingUp,
    team:    'GTM',
    href:    '/platform/gtm',
    tagline: 'Plans and runs go-to-market motions across the Qatari market.',
    capabilities: [
      'Supply &amp; demand mapped at country scale',
      'Outreach &amp; channel execution end-to-end',
      'Best fit for expansion or new-market entry',
    ],
  },
];

function OtherFunctions() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Beyond sales
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The other revenue functions Bell.qa accelerates.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Sales is one of four. The same data and the same Bella
            power your marketing, business development, research, and
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
// 12. ThreeReader — sales-specific audience block (rep / leader / sales ops)
// ───────────────────────────────────────────────────────────────────────────

const SALES_READERS = [
  {
    icon:  Briefcase,
    label: 'For the rep',
    body:  "Less admin, more wins. Bella handles the drafting, sending, follow-ups, and CRM logging. You stay on conversations that actually move the deal.",
  },
  {
    icon:  BarChart3,
    label: 'For the sales leader',
    body:  'Pipeline that builds itself. Ramp time goes to two weeks instead of two quarters. Capacity multiplied without adding headcount.',
  },
  {
    icon:  Check,
    label: 'For sales ops',
    body:  'Clean CRM by default. Attribution that holds up because every email, reply, and meeting is logged. No third-party integrations to babysit.',
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
            What Bell.qa changes for sales.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {SALES_READERS.map((r, i) => {
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
// 13. FinalCta — closing Get Access block
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
          Put your sales team on Bell.qa.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          The same hours, a completely different shape of day. Coverage
          your competitors don&apos;t have, Bella running the engine,
          the pipeline building itself.
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

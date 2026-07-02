'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Search, Send, CalendarCheck, Microscope,
  Sparkles, ArrowRight, Mail, Clock, CheckCircle2,
  Inbox, MessageSquare, CalendarDays, TrendingUp,
} from 'lucide-react';

/**
 * BELLA — cinematic, value-led showcase. Six beats top to bottom:
 *
 *   1. Headline block — what Bella is
 *   2. Capability cards — four teams she supports
 *   3. Example email + follow-up sequence — what hyper-personalisation actually
 *      looks like, with Bella invisible to the recipient
 *   4. CRM activity snapshot — what running at scale looks like
 *   5. Your team alone vs your team with Bella — the comparison
 *   6. CTA
 *
 * Tone: not selling, not replacement-coded. Bella is framed as augmentation —
 * an autonomous teammate that takes the operational lift off humans so they
 * can do the work only humans can do. Reads like a product reveal. Concrete
 * examples, no superlatives, no "join thousands of customers" language.
 */

// ───────────────────────────────────────────────────────────────────────────
// 2. Capability cards data
// ───────────────────────────────────────────────────────────────────────────

type Replaces = {
  icon: React.ComponentType<{ size?: number | string }>;
  team: string;
  tagline: string;
  capabilities: string[];
};

const REPLACES: Replaces[] = [
  {
    icon: Search,
    team: 'Research & BDR Teams',
    tagline: 'Hands them every prospect, pre-qualified.',
    capabilities: [
      'Filters all of Qatar by your ICP in seconds',
      'Deep-researches each company, financials, signals, weaknesses',
      'Identifies the right person to reach, plus their direct contact',
    ],
  },
  {
    icon: Send,
    team: 'Sales Development',
    tagline: 'Handles the outreach so reps can focus on closing.',
    capabilities: [
      'Crafts outreach tailored to each prospect',
      'Sends, tracks opens, follows up automatically',
      'Drips multi-touch sequences for unanswered threads',
    ],
  },
  {
    icon: CalendarCheck,
    team: 'Marketing Operations',
    tagline: 'Keeps the CRM clean, the calendar full, the pipeline moving.',
    capabilities: [
      'Schedules meetings end-to-end with prospects',
      'Manages the pipeline inside Bell\'s built-in CRM',
      'Surfaces the highest-priority opportunities daily',
    ],
  },
  {
    icon: Microscope,
    team: 'Strategy & Analysis',
    tagline: 'Hands analysts the signals they\'d take days to find.',
    capabilities: [
      'Pulls every signal on a company in seconds',
      'Maps the decision unit and recommends the opener',
      'Identifies weaknesses and the right way to approach',
    ],
  },
];

// ───────────────────────────────────────────────────────────────────────────
// 5. Comparison rows
// ───────────────────────────────────────────────────────────────────────────

const COMPARISON_ROWS = [
  {
    capability: 'Knowledge of every Qatari company & decision-maker',
    traditional:'Bounded by each person\'s network and time to research',
    bella:      'All 130,000+ Qatari companies and their decision-makers, surfaced instantly',
  },
  {
    capability: 'Research depth per prospect',
    traditional:'30 to 60 minutes per account when the calendar allows it',
    bella:      'Thousands of data points cross-referenced in seconds',
  },
  {
    capability: 'Personal context (interests, news, recent moves)',
    traditional:'Hard to capture consistently. Often falls back to templates.',
    bella:      'Woven into every email, never twice the same',
  },
  {
    capability: 'Outreach volume',
    traditional:'A handful of considered emails per person, per day',
    bella:      'Thousands per day, every one tailored',
  },
  {
    capability: 'Follow-up consistency',
    traditional:'Threads can slip when the week gets heavy',
    bella:      'Every sequence runs end-to-end, no thread left behind',
  },
  {
    capability: 'Hours of operation',
    traditional:'09:00 to 18:00, weekdays, with rest in between',
    bella:      'Working in the background 24 / 7, even while the team sleeps',
  },
  {
    capability: 'Time spent on manual data work',
    traditional:'A large share of the week goes to research, list-building, data entry',
    bella:      'Taken off the team\'s plate, freeing them for judgment-heavy work',
  },
  {
    capability: 'Capacity to scale up',
    traditional:'New volume usually means new hires, new ramp time, new overhead',
    bella:      'Scales instantly without adding headcount or onboarding',
  },
];

// ───────────────────────────────────────────────────────────────────────────
// Main component
// ───────────────────────────────────────────────────────────────────────────

export function BellaSection() {
  return (
    <section className="relative py-32 overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(91,140,255,0.20) 0%, transparent 60%), ' +
            'linear-gradient(180deg, rgb(13 18 35) 0%, rgb(10 14 26) 100%)',
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

      <div className="relative max-w-screen-xl mx-auto px-6">
        <Headline />
        <CapabilityCards />
        <EmailDemo />
        <CrmActivity />
        <Comparison />
        <FinalCallToAction />
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Headline
// ───────────────────────────────────────────────────────────────────────────

function Headline() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.7 }}
      className="text-center max-w-3xl mx-auto"
    >
      <div className="inline-flex items-center px-3 py-1 mb-5 rounded-full border border-accent/40 bg-accent/10 text-accent-bright text-xs font-semibold uppercase tracking-wider">
        Meet Bella
      </div>
      <h2 className="text-display-md md:text-display-lg text-gradient">
        An AI partner for every <br/>revenue team you run.
      </h2>
      <p className="mt-6 text-lg md:text-xl text-text-muted leading-relaxed">
        Bella is an autonomous agent with full access to Bell.qa&apos;s
        data, tools, and intelligence. She works alongside your marketing,
        sales, business development, and research teams, taking on the
        heavy operational lift so people can focus on what only people
        can do.
      </p>
      <p className="mt-4 text-base text-text-dim leading-relaxed">
        Always on. In your voice. At scale.
      </p>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Capability cards
// ───────────────────────────────────────────────────────────────────────────

function CapabilityCards() {
  return (
    <div
      className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
      style={{ perspective: '1200px' }}
    >
      {REPLACES.map((r, i) => (
        <CapabilityCard key={r.team} item={r} index={i} />
      ))}
    </div>
  );
}

function CapabilityCard({ item, index }: { item: Replaces; index: number }) {
  const { icon: Icon, team, tagline, capabilities } = item;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, rotateX: -14 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.6, delay: index * 0.08, ease: [0.22, 0.61, 0.36, 1] }}
      whileHover={{ y: -4 }}
      style={{
        transformOrigin: 'center top',
        background: 'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
      className="group relative rounded-xl border border-border overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(91,140,255,0.5)' }}
      />
      <div className="relative p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
            Works for
          </span>
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-accent-bright"
            style={{ background: 'rgba(91,140,255,0.14)' }}
          >
            <Icon size={17} />
          </span>
        </div>
        <h3 className="text-base font-semibold text-text leading-tight">{team}</h3>
        <p className="mt-2 text-sm text-accent-bright/90 leading-snug">{tagline}</p>
        <ul className="mt-4 space-y-1.5 border-t border-border pt-4">
          {capabilities.map(cap => (
            <li key={cap} className="flex items-start gap-2 text-xs text-text-muted leading-relaxed">
              <span className="mt-1.5 shrink-0 w-1 h-1 rounded-full bg-accent" aria-hidden="true" />
              <span>{cap}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Email demo + follow-up sequence
// ───────────────────────────────────────────────────────────────────────────

const ANNOTATIONS = [
  {
    n: '01',
    title: 'Mapped his public footprint',
    body: 'Scanned news, social posts, interviews, statements, and event appearances from the last 30 days. Selected the LinkedIn post as the highest-leverage opener.',
  },
  {
    n: '02',
    title: 'Mapped the decision unit',
    body: 'Identified the four people inside Example Corp who influence group coverage. Hamad is the only one whose signature is required.',
  },
  {
    n: '03',
    title: 'Tracked the expansion in real time',
    body: 'Cross-referenced last week\'s hiring posts, regulatory filings, and Example Corp\'s own announcements. Confirmed scale and timeline.',
  },
  {
    n: '04',
    title: 'Pulled a peer benchmark',
    body: 'Compared coverage tier and cost across twelve firms in the same headcount band. The 18% figure is real, anonymised at the group level.',
  },
  {
    n: '05',
    title: 'Calibrated tone to Hamad',
    body: 'Read his writing across interviews, posts, and statements. Matched register: direct, factual, no superlatives.',
  },
  {
    n: '06',
    title: 'Optimised the ask',
    body: '"15 minutes later this week" tested against thousands of past replies as the highest-converting variant for senior Qatari decision-makers.',
  },
];

function EmailDemo() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.7 }}
      className="mt-32"
    >
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border border-border bg-bg-elev-2 text-text text-[11px] font-semibold uppercase tracking-wider">
          <Mail size={11} />
          An example: outreach the way Bella writes it
        </div>
        <h3 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
          Hyper-personalised, in your voice, signed by you.
        </h3>
        <p className="mt-3 text-base text-text-muted">
          The recipient never knows Bella exists. The email lands as if you
          wrote it yourself, after 45 minutes of research.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
        <div className="lg:col-span-3">
          <EmailMock />
          <FollowUpSequence />
        </div>

        <div className="lg:col-span-2 space-y-5">
          {ANNOTATIONS.map((a, i) => (
            <motion.div
              key={a.n}
              initial={{ opacity: 0, x: 16 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="flex gap-4"
            >
              <span
                className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg font-mono text-xs font-semibold"
                style={{
                  background: 'rgba(91,140,255,0.14)',
                  color: 'rgb(165 195 255)',
                  border: '1px solid rgba(91,140,255,0.32)',
                }}
              >
                {a.n}
              </span>
              <div>
                <div className="text-sm font-semibold text-text leading-tight">{a.title}</div>
                <div className="mt-1 text-[13px] text-text-muted leading-relaxed">{a.body}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function EmailMock() {
  // Sample outreach from an insurance-firm manager to a Qatari decision-maker.
  // Bella drafts and sends. The recipient sees only "Sarah Chen" the manager.
  // No em-dashes (Val flagged them as AI tells).
  return (
    <div
      className="rounded-xl border border-border overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, rgba(19,24,41,0.95) 0%, rgba(13,18,35,0.95) 100%)',
        boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
      }}
    >
      {/* Email header */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-3 bg-bg-elev-2/40">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent/20 text-accent-bright text-[10px] font-semibold">
          SC
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-text leading-tight">
            <span className="font-semibold">Sarah Chen</span>
            <span className="text-text-muted"> &lt;manager@yourdomain.qa&gt;</span>
          </div>
          <div className="text-[11px] text-text-dim leading-tight">
            to Hamad Al-Thani &lt;h.althani@example-corp.qa&gt;
          </div>
        </div>
        <div className="text-[11px] text-text-dim font-mono">07:42</div>
      </div>

      <div className="px-5 pt-5 pb-3">
        <div className="text-base font-semibold text-text">
          Your logistics post landed
        </div>
      </div>

      <div className="px-5 pb-6 text-[14px] text-text leading-relaxed space-y-3.5">
        <p>Hi Hamad,</p>
        <p>
          Read{' '}
          <Highlight>your LinkedIn post last week on Qatar&apos;s logistics push</Highlight>.
          The point about benchmarking against regional carriers stuck, particularly on cost discipline.
        </p>
        <p>
          I&apos;m reaching out because{' '}
          <Highlight>Example Corp&apos;s expansion into logistics</Highlight>{' '}
          this quarter caught my attention. Companies scaling at that pace
          usually run into the same blind spot, the group health and liability
          coverage hasn&apos;t been benchmarked since the headcount moved.
        </p>
        <p>
          We work with{' '}
          <Highlight>twelve firms at roughly your scale across Qatar</Highlight>, and our last
          benchmark put most of them around 18% above market for the same coverage tier.
        </p>
        <p>
          Would{' '}
          <Highlight>15 minutes</Highlight>{' '}
          later this week be useful? Happy to share where Example Corp likely
          sits on that curve.
        </p>
        <p>
          Best,<br/>
          Sarah Chen
        </p>
      </div>

      {/* Meta footer — Bella's signature is invisible to recipient, shown here for the marketing visitor */}
      <div
        className="px-5 py-3 border-t border-border flex items-center justify-between text-[10px] text-text-dim"
        style={{ background: 'rgba(255,255,255,0.015)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Drafted by Bella · 12s · tailored from 400+ data points · invisible to recipient
        </span>
        <span className="font-mono">SENT</span>
      </div>
    </div>
  );
}

function Highlight({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        background:    'rgba(91,140,255,0.16)',
        color:         'rgb(220 232 255)',
        padding:       '1px 4px',
        borderRadius:  3,
        boxShadow:     'inset 0 -1px 0 rgba(91,140,255,0.45)',
      }}
    >
      {children}
    </span>
  );
}

/**
 * Mini timeline rendered just under the email card. Communicates that
 * Bella runs a multi-touch sequence automatically, with no manual lift.
 */
function FollowUpSequence() {
  const steps = [
    { day: 'Day 0', label: 'Initial email sent',  done: true  },
    { day: 'Day 2', label: 'Follow-up #1',        done: false, conditional: 'if no reply' },
    { day: 'Day 5', label: 'Follow-up #2',        done: false, conditional: 'if no reply' },
    { day: 'Day 9', label: 'Final touch',         done: false, conditional: 'if no reply' },
  ];
  return (
    <div className="mt-4 rounded-xl border border-border p-5"
      style={{ background: 'rgba(19,24,41,0.55)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Clock size={13} className="text-text-muted" />
        <span className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
          Bella will also run the follow-up sequence
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {steps.map((s, i) => (
          <div key={i} className="flex flex-col items-start gap-1.5">
            <div className="flex items-center gap-2 w-full">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{
                  background: s.done ? 'rgb(111 207 151)' : 'rgba(91,140,255,0.45)',
                  boxShadow:  s.done ? '0 0 6px rgba(111,207,151,0.6)' : 'none',
                }}
              />
              {i < steps.length - 1 && (
                <span className="flex-1 h-px bg-border" aria-hidden="true" />
              )}
            </div>
            <div className="text-[11px] font-semibold text-text">{s.day}</div>
            <div className="text-[10px] text-text-muted leading-tight">{s.label}</div>
            {s.conditional && (
              <div className="text-[9px] text-text-dim italic">{s.conditional}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. CRM activity snapshot
// ───────────────────────────────────────────────────────────────────────────

function CrmActivity() {
  const stats = [
    { icon: Inbox,         value: '21,847', label: 'Outreach emails sent',      tone: 'data'     },
    { icon: MessageSquare, value: '3,476',  label: 'Replies received',          tone: 'data'     },
    { icon: CalendarDays,  value: '612',    label: 'Meetings scheduled',        tone: 'movement' },
    { icon: TrendingUp,    value: '184',    label: 'Deals in active pipeline',  tone: 'econ'     },
  ];

  const TONE_COLOR: Record<string, string> = {
    data:     'rgb(91 140 255)',
    movement: 'rgb(111 207 151)',
    econ:     'rgb(255 196 99)',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.7 }}
      className="mt-32"
    >
      <div className="text-center max-w-2xl mx-auto mb-10">
        <h3 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
          One month of Bella, in the CRM.
        </h3>
        <p className="mt-3 text-base text-text-muted">
          What a team running with Bella looks like at scale. Every action logged,
          every thread tracked, every reply routed, so your people can spend their
          time on the conversations that actually need them.
        </p>
      </div>

      <div
        className="rounded-2xl border border-border p-6 md:p-8 max-w-4xl mx-auto"
        style={{
          background: 'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      >
        <div className="flex items-center justify-between mb-6">
          <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
            Sample · Last 30 days
          </div>
          <span className="inline-flex items-center gap-1.5 px-2 py-[3px] rounded-full bg-bg-elev-2 border border-border">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[9px] font-semibold uppercase tracking-wider text-text-muted">Live</span>
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px"
          style={{ background: 'rgb(42 49 73)' }}
        >
          {stats.map((s, i) => {
            const Icon = s.icon;
            const color = TONE_COLOR[s.tone];
            return (
              <div key={i} className="p-5 bg-bg-elev">
                <div className="flex items-center gap-2 mb-3" style={{ color }}>
                  <Icon size={14} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    {s.label}
                  </span>
                </div>
                <div className="text-3xl md:text-4xl font-semibold text-text tabular-nums leading-none">
                  {s.value}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 pt-5 border-t border-border text-center">
          <p className="text-sm text-text-muted">
            Same month without Bella: a fraction of the volume, with most of the
            week spent on manual research and admin instead of selling.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Comparison table
// ───────────────────────────────────────────────────────────────────────────

function Comparison() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{ duration: 0.7 }}
      className="mt-32"
    >
      <div className="text-center max-w-2xl mx-auto mb-10">
        <h3 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
          What your team does alone. What your team does with Bella.
        </h3>
        <p className="mt-3 text-base text-text-muted">
          Even great teams run into the same ceilings: time, scale, and reach.
          Bella sits underneath them and lifts those ceilings, so the people
          you already have can do far more of what they&apos;re great at.
        </p>
      </div>

      <div
        className="rounded-2xl border border-border overflow-hidden max-w-5xl mx-auto"
        style={{
          background: 'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
        }}
      >
        {/* Header row */}
        <div className="grid grid-cols-12 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: 'rgba(255,255,255,0.025)' }}
        >
          <div className="col-span-4 p-4 text-text-dim border-r border-border">
            Capability
          </div>
          <div className="col-span-4 p-4 text-text-dim border-r border-border">
            Your team alone
          </div>
          <div className="col-span-4 p-4 text-accent-bright">
            Your team with Bella
          </div>
        </div>

        {/* Rows */}
        {COMPARISON_ROWS.map((row, i) => (
          <motion.div
            key={row.capability}
            initial={{ opacity: 0, y: 8 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: i * 0.04 }}
            className={
              'grid grid-cols-12 text-[13px] ' +
              (i < COMPARISON_ROWS.length - 1 ? 'border-b border-border' : '')
            }
          >
            <div className="col-span-4 p-4 text-text font-medium border-r border-border leading-snug">
              {row.capability}
            </div>
            <div className="col-span-4 p-4 text-text-muted border-r border-border leading-snug flex items-start gap-2">
              <Clock size={14} className="shrink-0 mt-0.5 text-text-dim" />
              <span>{row.traditional}</span>
            </div>
            <div className="col-span-4 p-4 leading-snug flex items-start gap-2">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-accent-bright" />
              <span className="text-text">{row.bella}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. Final CTA
// ───────────────────────────────────────────────────────────────────────────

function FinalCallToAction() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.7 }}
      className="mt-24 text-center"
    >
      <p className="text-xl md:text-2xl text-text font-medium max-w-2xl mx-auto leading-snug">
        Give your team the leverage of an always-on operator.<br/>
        <span className="text-accent-bright">So your people can focus on the work only they can do.</span>
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
          href="/platform"
          className="inline-flex items-center px-6 py-3 text-base font-medium rounded-md text-text-muted hover:text-text"
        >
          See the platform →
        </Link>
      </div>
    </motion.div>
  );
}

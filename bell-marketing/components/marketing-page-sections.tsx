'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Megaphone, ArrowRight, Zap, Users, Mail, BarChart3,
  TrendingUp, UserPlus, Briefcase, Globe2, FileSearch,
  ShieldCheck, AlertTriangle, RefreshCw,
  Building2, Landmark, Newspaper, Linkedin, FileSpreadsheet,
  Radar, Database, ListChecks,
} from 'lucide-react';

/**
 * MARKETING PAGE — section-by-section build.
 *
 * Concept: Trigger Gallery. The page is anchored by a gallery of
 * trigger-based campaign playbooks Bell.qa makes possible — each card
 * pairs a real-world Qatari signal with the campaign that auto-fires
 * off it and the outcome it produces. Distinctive visual primitive
 * (gallery of plays) vs Bella (capability moments) and Sales (vertical
 * timeline) — three sub-pages, three different shapes.
 *
 * Persona: Khalid Al-Marri, Head of Marketing at Cipher Cloud, a
 * Qatari cybersecurity firm selling enterprise-grade security to
 * financial services, healthcare, government, energy, and logistics.
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file currently):
 *     1. MarketingHero          — "Campaigns no one else can run."
 *     2. MarketingActivityBar   — campaigns-running team stats
 *     3. MeetKhalid             — persona intro card
 *     4. TriggerGallery         — the centerpiece — 8 playbook cards
 *     5. SignalSources          — what feeds the triggers
 *
 *   ROUND 2+ (to be added):
 *     6. KhalidsMonth           — KPI strip summarising month of plays
 *     7. LeaderPivot            — "From triggers to attribution"
 *     8. AttributionView        — pipeline contribution by trigger
 *     9. MarketingComparison    — Without vs With Bell.qa
 *    10. ConnectedToPlatform    — cross-link tiles
 *    11. MidPageCta             — Get Access band
 *    12. OtherFunctions         — Sales / BD / Research / GTM
 *    13. ThreeReader            — Manager / Leader / RevOps
 *    14. FinalCta               — closing block
 */

export function MarketingPageSections() {
  return (
    <>
      <MarketingHero />
      <MarketingActivityBar />
      <MeetKhalid />
      <TriggerGallery />
      <SignalSources />
      <KhalidsMonth />
      <LeaderPivot />
      <AttributionView />
      <MarketingComparison />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Hero
// ───────────────────────────────────────────────────────────────────────────

function MarketingHero() {
  return (
    <section className="relative pt-28 pb-16 overflow-hidden">
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
          <Megaphone size={11} />
          For marketing teams
        </div>
        <h1 className="text-display-md md:text-display-lg text-gradient max-w-4xl mx-auto">
          Campaigns no one else<br/>can run.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl mx-auto">
          Trigger-based marketing at the depth of every Qatari company,
          every decision maker, every signal that matters. Bell.qa
          gives you the plays, the audiences, and the autonomous
          execution to fire campaigns the moment the market moves.
        </p>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Activity bar — cycles through marketing team stats
// ───────────────────────────────────────────────────────────────────────────

type MarketingFrame = {
  value: string;
  label: string;
  color: string;
};

const MARKETING_FRAMES: MarketingFrame[] = [
  { value: '37',    label: 'trigger-based campaigns running right now', color: 'rgb(91 140 255)'   },
  { value: '186',   label: 'signals fired into campaigns this week',    color: 'rgb(111 207 151)'  },
  { value: '24,318',label: 'touches sent across all live campaigns',    color: 'rgb(196 154 255)'  },
  { value: '1,247', label: 'MQLs sourced this month',                   color: 'rgb(255 196 99)'   },
  { value: '63%',   label: 'of pipeline now marketing-sourced',         color: 'rgb(111 207 151)'  },
];
const MARKETING_FRAME_MS = 4500;

function MarketingActivityBar() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % MARKETING_FRAMES.length), MARKETING_FRAME_MS);
    return () => clearInterval(id);
  }, []);
  const frame = MARKETING_FRAMES[idx];

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
          Marketing · live
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
          across customer base
        </span>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Meet Khalid — persona intro
// ───────────────────────────────────────────────────────────────────────────

function MeetKhalid() {
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
              Meet Khalid
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
              The playbook he runs on Bell.qa.
            </h2>
            <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed max-w-2xl mx-auto">
              Khalid runs marketing for a Qatari cybersecurity firm.
              Every campaign he ships is keyed to a real-world signal
              Bell catches the moment it happens. The gallery below is
              his actual playbook.
            </p>
          </div>

          <div
            className="rounded-2xl border border-border overflow-hidden"
            style={{
              background:
                'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
              boxShadow: '0 18px 50px -20px rgba(0,0,0,0.55)',
            }}
          >
            <div className="p-6 md:p-7 flex flex-col md:flex-row items-start gap-5">
              <div
                className="shrink-0 inline-flex items-center justify-center w-16 h-16 md:w-20 md:h-20 rounded-2xl text-2xl md:text-3xl font-semibold text-white"
                style={{
                  background: 'linear-gradient(135deg, rgb(196 154 255) 0%, rgb(91 140 255) 100%)',
                  boxShadow:  '0 12px 30px -10px rgba(91,140,255,0.4)',
                }}
              >
                KM
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                  <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                    Khalid Al-Marri
                  </div>
                  <div className="text-sm text-text-muted">
                    Head of Marketing · Cipher Cloud
                  </div>
                </div>
                <p className="text-[13.5px] text-text-muted leading-relaxed mb-4">
                  Cipher Cloud sells enterprise-grade cybersecurity to
                  Qatari businesses in financial services, healthcare,
                  government, energy, and logistics. Khalid&apos;s job
                  is to make sure the right account is hearing from
                  Cipher Cloud the moment they have a security reason
                  to buy.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <PersonaFact
                    label="ICP"
                    value="Qatari enterprises 200+ employees, regulated sectors"
                  />
                  <PersonaFact
                    label="Monthly target"
                    value="100+ MQLs, 60% of pipeline from marketing"
                  />
                  <PersonaFact
                    label="The plays"
                    value="8 trigger-based campaigns &mdash; all live below"
                  />
                </div>
              </div>
            </div>

            <div
              className="px-6 md:px-7 py-3 border-t border-border flex items-center justify-between gap-3"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <span className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                The playbook &middot; eight plays, always running
              </span>
              <span className="text-[11px] text-text-muted flex items-center gap-1.5">
                Browse below
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
// 4. Trigger Gallery — the centerpiece (8 trigger-based campaign playbooks)
// ───────────────────────────────────────────────────────────────────────────

type TriggerPlay = {
  number:   string;
  type:     string;
  icon:     React.ComponentType<{ size?: number }>;
  tint:     string;
  trigger:  string;
  audience: string;
  campaign: string;
  outcome:  string;
};

const TRIGGER_PLAYS: TriggerPlay[] = [
  {
    number:   '01',
    type:     'Funding event',
    icon:     TrendingUp,
    tint:     'rgb(111 207 151)',
    trigger:  'A Qatari company raises Series B or later.',
    audience: 'Roughly 6&ndash;10 companies per month, mostly fintech, healthtech, and SaaS.',
    campaign: 'Within 6 hours: a warm intro email from a sector veteran citing the funding and the predictable new attack surface that comes with scale. LinkedIn touch from your CEO at +24 hours.',
    outcome:  'Roughly 3 in 10 book a meeting in week one.',
  },
  {
    number:   '02',
    type:     'New security exec',
    icon:     UserPlus,
    tint:     'rgb(91 140 255)',
    trigger:  'A CTO, CISO, or Head of Information Security joins a target account.',
    audience: 'Roughly 8&ndash;14 transitions per month across your ICP.',
    campaign: 'Within 48 hours: a first-90-days pitch positioning Cipher Cloud as the partner that helps them ship a visible quick-win in their first quarter.',
    outcome:  'Highest open rate of any play. New leaders read everything.',
  },
  {
    number:   '03',
    type:     'Hiring signal',
    icon:     Briefcase,
    tint:     'rgb(196 154 255)',
    trigger:  'A company posts a DevSecOps, Security Engineer, or Security Architect role.',
    audience: 'Roughly 18&ndash;25 postings per month in the Qatari market.',
    campaign: 'Within 24 hours: a sales-friendly email explaining that this hire usually triggers a vendor evaluation, with a free architecture review on offer.',
    outcome:  'Vendor evaluations land on your shortlist before competitors notice.',
  },
  {
    number:   '04',
    type:     'Cross-border expansion',
    icon:     Globe2,
    tint:     'rgb(255 196 99)',
    trigger:  'A company announces expansion into a new GCC market.',
    audience: 'Roughly 4&ndash;7 expansions per month, mostly into UAE, Saudi, and Kuwait.',
    campaign: 'A market-entry pitch focused on the new compliance footprint they just inherited and the security implications of operating across multiple jurisdictions.',
    outcome:  'Average deal size is 2x baseline because scope grew with them.',
  },
  {
    number:   '05',
    type:     'Security RFP released',
    icon:     FileSearch,
    tint:     'rgb(111 207 151)',
    trigger:  'A public tender for security audit, pen-test, or managed-security work is released.',
    audience: 'Roughly 12&ndash;18 tenders per month from MOCI portals and government RFP feeds.',
    campaign: 'Same-day response with a tailored capability brief, a similar-scope case study, and a request for a technical Q&amp;A inside the tender window.',
    outcome:  'Hit rate on shortlists is materially higher when you respond in 24 hours.',
  },
  {
    number:   '06',
    type:     'Regulatory deadline',
    icon:     ShieldCheck,
    tint:     'rgb(91 140 255)',
    trigger:  'A new QFC, QCB, or sector regulator publishes a cyber requirement with a compliance deadline.',
    audience: 'Every Qatari company subject to the regulation &mdash; sometimes hundreds at once.',
    campaign: 'A "ready or not" readiness assessment offer with a deadline-aware countdown. Bella personalises the email per recipient.',
    outcome:  'Volume play. Reliably surfaces 20&ndash;40 net-new opportunities per regulatory cycle.',
  },
  {
    number:   '07',
    type:     'Competitor signal',
    icon:     RefreshCw,
    tint:     'rgb(196 154 255)',
    trigger:  'An incumbent security vendor raises prices, exits a segment, or has a public outage.',
    audience: 'Their visible customer base in Qatar &mdash; usually 30&ndash;80 accounts.',
    campaign: 'A migration-window outreach with a no-friction switch path and a price-lock guarantee for new customers in the next 30 days.',
    outcome:  'Closed-won rates spike during competitor instability windows. Bella catches them.',
  },
  {
    number:   '08',
    type:     'Sector incident',
    icon:     AlertTriangle,
    tint:     'rgb(255 196 99)',
    trigger:  'A public security incident is reported in a sector you serve.',
    audience: 'Other companies in the same sector who likely share the same exposure.',
    campaign: 'A tactful readiness-review offer framed as "we noticed this incident, would a 30-minute check-in on your posture be useful?". No pressure, no fear-mongering.',
    outcome:  'Tone is everything here. Done right, it surfaces real, urgent conversations.',
  },
];

function TriggerGallery() {
  return (
    <section className="relative py-16 md:py-20">
      <div className="max-w-screen-xl mx-auto px-6">

        {/* Section heading */}
        <div className="text-center max-w-2xl mx-auto mb-12 md:mb-14">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The playbook &middot; eight plays
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Eight signals. Eight campaigns.<br/>All running, all the time.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Each card pairs a real-world Qatari signal Bell catches with
            the campaign that auto-fires off it. Khalid built these
            once. They run on their own from now on.
          </p>
        </div>

        {/* Gallery — 2-column grid on desktop, 1-column on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {TRIGGER_PLAYS.map((play, i) => (
            <TriggerCard key={play.number} play={play} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function TriggerCard({ play, index }: { play: TriggerPlay; index: number }) {
  const Icon = play.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.2) }}
      className="rounded-2xl border border-border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        boxShadow: '0 12px 30px -16px rgba(0,0,0,0.55)',
      }}
    >
      {/* Header strip — number + type + icon */}
      <div
        className="px-5 py-3 border-b border-border flex items-center justify-between gap-3"
        style={{ background: play.tint.replace('rgb', 'rgba').replace(')', ' / 0.06)') }}
      >
        <div className="flex items-center gap-3">
          <span
            className="font-mono text-[11px] tabular-nums font-semibold"
            style={{ color: play.tint }}
          >
            {play.number}
          </span>
          <span className="text-[12px] font-semibold uppercase tracking-wider text-text">
            {play.type}
          </span>
        </div>
        <span
          className="inline-flex items-center justify-center w-8 h-8 rounded-md"
          style={{
            background: play.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      play.tint,
          }}
        >
          <Icon size={15} />
        </span>
      </div>

      {/* Body — 4 rows: trigger / audience / campaign / outcome */}
      <div className="p-5 md:p-6 space-y-4">
        <PlayRow icon={Zap}        label="The trigger"  body={play.trigger}  tint={play.tint} />
        <PlayRow icon={Users}      label="The audience" body={play.audience} tint="rgb(165 195 255)" />
        <PlayRow icon={Mail}       label="The campaign" body={play.campaign} tint="rgb(165 195 255)" />
        <PlayRow icon={BarChart3}  label="The outcome"  body={play.outcome}  tint={play.tint}
          emphasized
        />
      </div>
    </motion.div>
  );
}

function PlayRow({
  icon: Icon, label, body, tint, emphasized = false,
}: {
  icon:        React.ComponentType<{ size?: number }>;
  label:       string;
  body:        string;
  tint:        string;
  emphasized?: boolean;
}) {
  return (
    <div>
      <div
        className="flex items-center gap-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: tint }}
      >
        <Icon size={11} />
        {label}
      </div>
      <p
        className={
          'leading-relaxed ' +
          (emphasized ? 'text-[13.5px] text-text font-medium' : 'text-[13px] text-text-muted')
        }
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Signal Sources — what feeds the trigger gallery above
// ───────────────────────────────────────────────────────────────────────────

const SIGNAL_SOURCES = [
  { icon: Building2,        label: 'QSE filings',                  hint: 'Material disclosures from Qatar Stock Exchange'    },
  { icon: Landmark,         label: 'MOCI &amp; QFC registry',      hint: 'Commercial registrations and director changes'    },
  { icon: FileSearch,       label: 'Government RFP portals',       hint: 'Public tenders across ministries and authorities' },
  { icon: Linkedin,         label: 'Public LinkedIn',              hint: 'Hiring signals and leadership transitions'        },
  { icon: Newspaper,        label: 'Qatari press &amp; news',      hint: 'Aggregated across every major Qatari outlet'      },
  { icon: ShieldCheck,      label: 'Regulatory publications',      hint: 'QFC, QCB, and sector regulator announcements'     },
  { icon: FileSpreadsheet,  label: 'Job boards',                   hint: 'Direct careers pages and aggregated boards'       },
  { icon: Radar,            label: 'Industry intelligence',        hint: 'Sector reports, analyst notes, conference filings'},
];

function SignalSources() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What feeds the playbook
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Every play above runs on real data.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Bell.qa pulls every signal in the playbook from sources
            like these &mdash; typically within 24 hours of the event,
            often within an hour. None of it is guessed at.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {SIGNAL_SOURCES.map((src, i) => {
            const Icon = src.icon;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.45, delay: i * 0.05 }}
                className="rounded-xl border border-border p-4 flex items-start gap-3"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
                }}
              >
                <span
                  className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md text-accent-bright"
                  style={{ background: 'rgba(91,140,255,0.14)' }}
                >
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <div
                    className="text-[13px] font-semibold text-text leading-tight"
                    dangerouslySetInnerHTML={{ __html: src.label }}
                  />
                  <div
                    className="mt-1 text-[12px] text-text-muted leading-snug"
                    dangerouslySetInnerHTML={{ __html: src.hint }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-[12px] text-text-dim leading-relaxed max-w-2xl mx-auto">
          Every signal carries its source, fetch timestamp, and
          confidence score. The same audit trail your IT and legal
          teams expect from a production system.
        </p>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. Khalid's month — KPI strip summarising what the playbook produced
// ───────────────────────────────────────────────────────────────────────────

const KHALID_MONTH_KPIS = [
  { value: '8',     label: 'Playbook campaigns live',    tint: 'rgb(91 140 255)'   },
  { value: '47',    label: 'Triggers fired',             tint: 'rgb(165 195 255)'  },
  { value: '4,287', label: 'Personalised touches sent',  tint: 'rgb(196 154 255)'  },
  { value: '612',   label: 'Replies received',           tint: 'rgb(111 207 151)'  },
  { value: '187',   label: 'Marketing-qualified opps',   tint: 'rgb(255 196 99)'   },
  { value: '0',     label: 'Hours on manual campaign ops', tint: 'rgb(165 195 255)' },
];

function KhalidsMonth() {
  return (
    <section className="relative py-20 md:py-24 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Khalid&apos;s month, in numbers
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            One marketer. The output of a campaign agency.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Eight plays. Built once, running on their own. A normal
            marketing team would need a campaign manager, a copywriter,
            a demand-gen specialist, an ops engineer, and an analyst
            to ship anywhere near this.
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
          <div
            className="px-6 py-4 border-b border-border flex items-center justify-between gap-3"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
              Khalid Al-Marri &middot; trailing 30 days
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
            {KHALID_MONTH_KPIS.map((k, i) => (
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
              All while Khalid is in meetings, on holiday, asleep. The
              plays don&apos;t stop because he stops.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. Leader pivot — playbook view → attribution view
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
            <span className="text-gradient">Plays are nice.</span>
            <br/>
            <span className="text-text-muted">Attribution is what closes the boardroom.</span>
          </h2>
          <p className="mt-6 text-base md:text-lg text-text-muted leading-relaxed max-w-2xl mx-auto">
            Every touch from every play is logged against the signal
            that fired it. Bell.qa turns trigger-based marketing into
            the only attribution view that actually holds up &mdash;
            the one a CMO can defend to a CFO.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. Attribution view — pipeline contribution by trigger (last quarter)
// ───────────────────────────────────────────────────────────────────────────

type AttributionRow = {
  number:    string;
  trigger:   string;
  opps:      number;
  meetingRate: number;  // percentage
  tint:      string;
};

const ATTRIBUTION_ROWS: AttributionRow[] = [
  { number: '01', trigger: 'Funding event',          opps: 47, meetingRate: 62, tint: 'rgb(111 207 151)' },
  { number: '02', trigger: 'New security exec',      opps: 38, meetingRate: 71, tint: 'rgb(91 140 255)'  },
  { number: '03', trigger: 'Hiring signal',          opps: 31, meetingRate: 44, tint: 'rgb(196 154 255)' },
  { number: '04', trigger: 'Regulatory deadline',    opps: 26, meetingRate: 38, tint: 'rgb(91 140 255)'  },
  { number: '05', trigger: 'Security RFP',           opps: 19, meetingRate: 52, tint: 'rgb(111 207 151)' },
  { number: '06', trigger: 'Cross-border expansion', opps: 12, meetingRate: 58, tint: 'rgb(255 196 99)'  },
  { number: '07', trigger: 'Competitor signal',      opps:  9, meetingRate: 67, tint: 'rgb(196 154 255)' },
  { number: '08', trigger: 'Sector incident',        opps:  5, meetingRate: 40, tint: 'rgb(255 196 99)'  },
];

const TRIGGER_OPPS_TOTAL  = ATTRIBUTION_ROWS.reduce((s, r) => s + r.opps, 0); // 187
const MANUAL_OPPS         = 23;
const ALL_MARKETING_OPPS  = TRIGGER_OPPS_TOTAL + MANUAL_OPPS; // 210
const TRIGGER_SHARE_PCT   = Math.round((TRIGGER_OPPS_TOTAL / ALL_MARKETING_OPPS) * 100); // 89%
const MAX_OPPS            = Math.max(...ATTRIBUTION_ROWS.map(r => r.opps));

function AttributionView() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        {/* Heading */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Attribution &middot; last quarter
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Every opportunity, tracked back to the signal.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            What 187 marketing-sourced opportunities actually came
            from. Every touch attributable to the trigger that fired it.
          </p>
        </div>

        {/* Attribution panel */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
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
          {/* Top summary band */}
          <div
            className="px-6 py-5 border-b border-border grid grid-cols-1 md:grid-cols-3 gap-6"
            style={{ background: 'rgba(255,255,255,0.02)' }}
          >
            <SummaryStat
              label="Marketing-sourced opps"
              value={String(ALL_MARKETING_OPPS)}
              sub="across all sources, trailing quarter"
              tint="rgb(165 195 255)"
            />
            <SummaryStat
              label="From trigger plays"
              value={String(TRIGGER_OPPS_TOTAL)}
              sub={`${TRIGGER_SHARE_PCT}% of all marketing pipeline`}
              tint="rgb(111 207 151)"
            />
            <SummaryStat
              label="From manual outreach"
              value={String(MANUAL_OPPS)}
              sub="the residual non-triggered work"
              tint="rgb(120 130 152)"
            />
          </div>

          {/* Column headers */}
          <div className="hidden md:grid grid-cols-12 px-6 py-3 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-text-dim">
            <div className="col-span-1">#</div>
            <div className="col-span-3">Trigger</div>
            <div className="col-span-5">Pipeline share</div>
            <div className="col-span-2 text-right">Opps</div>
            <div className="col-span-1 text-right">Meeting rate</div>
          </div>

          {/* Attribution rows */}
          <ul>
            {ATTRIBUTION_ROWS.map((row, i) => (
              <AttributionBar
                key={row.number}
                row={row}
                widthPct={(row.opps / MAX_OPPS) * 100}
                divided={i < ATTRIBUTION_ROWS.length - 1}
                index={i}
              />
            ))}
          </ul>

          {/* Footer note */}
          <div className="px-6 py-4 border-t border-border text-center">
            <p className="text-sm text-text-muted">
              Every row above survives audit because every touch is
              keyed to a real, dated signal &mdash; not a last-click
              default or an out-of-the-box attribution guess.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function SummaryStat({
  label, value, sub, tint,
}: {
  label: string;
  value: string;
  sub:   string;
  tint:  string;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-dim mb-2">
        {label}
      </div>
      <div
        className="text-3xl md:text-4xl font-semibold tabular-nums leading-none mb-2"
        style={{ color: tint }}
      >
        {value}
      </div>
      <div className="text-[11px] text-text-dim leading-snug">
        {sub}
      </div>
    </div>
  );
}

function AttributionBar({
  row, widthPct, divided, index,
}: {
  row:      AttributionRow;
  widthPct: number;
  divided:  boolean;
  index:    number;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.2) }}
      className={
        'grid grid-cols-1 md:grid-cols-12 px-6 py-4 items-center gap-3 ' +
        (divided ? 'border-b border-border/60 ' : '')
      }
    >
      {/* Number + trigger name (stacked on mobile) */}
      <div className="md:col-span-1 font-mono text-[11px] tabular-nums font-semibold" style={{ color: row.tint }}>
        {row.number}
      </div>
      <div className="md:col-span-3 text-[13.5px] font-semibold text-text">
        {row.trigger}
      </div>

      {/* The bar */}
      <div className="md:col-span-5">
        <div
          className="relative h-2.5 rounded-full overflow-hidden"
          style={{ background: 'rgba(91,140,255,0.06)' }}
        >
          <motion.div
            initial={{ width: 0 }}
            whileInView={{ width: `${widthPct}%` }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.8, delay: 0.2 + Math.min(index * 0.04, 0.2), ease: [0.22, 0.61, 0.36, 1] }}
            className="h-full rounded-full"
            style={{
              background: `linear-gradient(90deg, ${row.tint.replace('rgb', 'rgba').replace(')', ' / 0.85)')} 0%, ${row.tint} 100%)`,
              boxShadow:  `0 0 12px -2px ${row.tint.replace('rgb', 'rgba').replace(')', ' / 0.55)')}`,
            }}
          />
        </div>
      </div>

      {/* Opps count */}
      <div className="md:col-span-2 text-right text-[13.5px] font-mono tabular-nums font-semibold text-text">
        {row.opps} <span className="text-text-dim font-normal text-[11px]">opps</span>
      </div>

      {/* Meeting rate chip */}
      <div className="md:col-span-1 text-right">
        <span
          className="inline-flex items-center text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded"
          style={{
            color:      row.tint,
            background: row.tint.replace('rgb', 'rgba').replace(')', ' / 0.10)'),
          }}
        >
          {row.meetingRate}%
        </span>
      </div>
    </motion.li>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 9. MarketingComparison — Without Bell.qa vs With Bell.qa for marketing
// ───────────────────────────────────────────────────────────────────────────

const MARKETING_COMPARISON_ROWS = [
  {
    capability: 'ABM at Qatari scale',
    without:    'Limited to LinkedIn ads or whatever your DSP covers — fragments of the market',
    with:       'Every Qatari company in your TAM is reachable, with verified decision-maker contact',
  },
  {
    capability: 'Trigger-based campaigns',
    without:    'Rare, expensive, requires a data-engineering team and a real-time platform stack',
    with:       'Built in across 30+ signal types — wire a play once, it runs forever',
  },
  {
    capability: 'Audience freshness',
    without:    'Lists go stale in weeks. People change roles, companies pivot, contacts churn.',
    with:       'Every audience is a live query. Updates in real-time as the market moves.',
  },
  {
    capability: 'Personalisation at scale',
    without:    'Merge fields and "Hi {{first_name}}" templates that everyone sees through',
    with:       'Bella tailors per recipient — different hook per prospect, all in your voice',
  },
  {
    capability: 'Attribution that holds up',
    without:    'Gaps everywhere. Last-click defaults. Pipeline disputes with sales.',
    with:       'Every touch logged with the signal source that fired it. Audit-ready by default.',
  },
  {
    capability: 'Time to launch a new play',
    without:    'Weeks. Brief, build segment, build campaign, get IT to wire the trigger.',
    with:       'Hours. The signal is already there. The audience is already there. Bella drafts.',
  },
  {
    capability: 'Coverage of the Qatari market',
    without:    '10–20% via paid tools that focus on global accounts and miss the local ones',
    with:       '100%. Every Qatari company in the graph, regardless of size or visibility.',
  },
  {
    capability: 'Headcount the engine needs',
    without:    'Campaign manager, copywriter, demand-gen, ops engineer, analyst — five+ people',
    with:       'One marketer. Bella runs the execution.',
  },
];

function MarketingComparison() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The before-and-after for marketing
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What changes when marketing runs on Bell.qa.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Eight rows. Every one of them moves by a factor, not a percent.
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

          {MARKETING_COMPARISON_ROWS.map((row, i) => (
            <motion.div
              key={row.capability}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.4, delay: i * 0.04 }}
              className={
                'grid grid-cols-12 text-[13px] ' +
                (i < MARKETING_COMPARISON_ROWS.length - 1 ? 'border-b border-border' : '')
              }
            >
              <div className="col-span-4 p-4 text-text font-medium border-r border-border leading-snug">
                {row.capability}
              </div>
              <div className="col-span-4 p-4 text-text-muted border-r border-border leading-snug flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5 text-text-dim" />
                <span>{row.without}</span>
              </div>
              <div className="col-span-4 p-4 leading-snug flex items-start gap-2">
                <Zap size={14} className="shrink-0 mt-0.5 text-accent-bright" />
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
// 10. ConnectedToPlatform — cross-link tiles to platform features marketing uses
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
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  'The triggers themselves. Every signal type that feeds the playbook above is detected, tagged, and routed here first.',
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  Database,
    label: 'Bella',
    href:  '/platform/bella',
    body:  'Drafts the personalised email per recipient, sends it, follows up, routes replies back. Your campaign’s execution layer.',
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  ListChecks,
    label: 'CRM',
    href:  '/platform/crm',
    body:  'Where MQLs hand off to sales. Every touch logged. Attribution survives the audit by default.',
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  TrendingUp,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  'Tells you which trigger plays to prioritise this quarter based on what’s actually converting.',
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  Globe2,
    label: 'Map',
    href:  '/platform/map',
    body:  'Geographic targeting. Run a campaign against every healthcare facility in West Bay, or every logistics firm near the port.',
    tint:  'rgb(165 195 255)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Five surfaces, one marketer
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What the playbook is built on.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Marketing pulls from five parts of the Bell.qa platform.
            Each one stands alone and is documented in depth.
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
// 11. MidPageCta — Get Access band, after the data-heavy sections
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
                You&apos;ve seen the playbook
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now wire your own trigger plays into the Qatari market.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your first play can be live by tomorrow.
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
// 12. OtherFunctions — cross-links to the other revenue functions on Bell.qa
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
    icon:    Briefcase,
    team:    'Sales',
    href:    '/platform/sales',
    tagline: 'Pipeline that builds itself, from cold to closed.',
    capabilities: [
      'Filter Qatar by ICP, in seconds',
      'Bella drafts, sends, follows up &mdash; in your voice',
      'Field selling with full intel before walking in',
    ],
  },
  {
    icon:    UserPlus,
    team:    'Business Development',
    href:    '/platform/business-development',
    tagline: 'Partnerships, JVs, and M&A surfaced before the market knows.',
    capabilities: [
      'Maps ownership chains, board overlaps, corporate relationships',
      'Tracks strategic moves &mdash; acquisitions, expansions, licences',
      'Watchlists that surface change automatically',
    ],
  },
  {
    icon:    FileSearch,
    team:    'Research',
    href:    '/platform/research',
    tagline: 'Hands analysts the report they’d have spent days writing.',
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
            Beyond marketing
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The other revenue functions Bell.qa accelerates.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Marketing is one of four. The same data and the same Bella
            power your sales, business development, research, and
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
// 13. ThreeReader — marketing-specific audience block (manager / leader / RevOps)
// ───────────────────────────────────────────────────────────────────────────

const MARKETING_READERS = [
  {
    icon:  Megaphone,
    label: 'For the marketing manager',
    body:  'More plays, faster iteration, less waste. Wire a trigger once, it runs forever. Spend your week on the strategy, not the production line.',
  },
  {
    icon:  BarChart3,
    label: 'For the marketing leader',
    body:  'Pipeline contribution that holds up to scrutiny. ABM at country scale. The CFO conversation gets easier because every touch is keyed to a signal.',
  },
  {
    icon:  ListChecks,
    label: 'For RevOps',
    body:  'Attribution that survives audit. No third-party stitching. Marketing-to-sales handoff lives in the same CRM. Clean ICP enforcement by default.',
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same playbook
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes for marketing.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {MARKETING_READERS.map((r, i) => {
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
          Run campaigns no one else can.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Wire your first trigger play this week. Every commercial plan
          includes the full marketing surface, Bella, and the signal
          stream that fires it all.
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

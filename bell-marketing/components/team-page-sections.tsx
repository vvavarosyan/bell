'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Users, ArrowRight, Crown, Shield, UserPlus, Activity,
  ChevronDown, Briefcase, Megaphone, Microscope, Rocket,
  Handshake, Target, Bot, Inbox, BadgeCheck, MessageSquare,
  GitBranch, Layers, Sparkles, ShieldCheck, Eye, FileText,
  ListChecks, Settings, Calendar, Check, ArrowDown,
  Mail, Zap, Radio, MoveRight,
  Map as MapIcon, BrainCircuit, Radar,
} from 'lucide-react';

/**
 * TEAM PAGE — capability-deep-dive.
 *
 * Different shape from the function pages (which follow a named
 * persona through a workflow). This is a capability surface — the
 * workspace where every function meets. Centerpiece is a live
 * three-tier org chart of an example Bell.qa customer.
 *
 * Example workspace: Khaleej Group, a Doha-based Qatari holding
 * company with multiple business lines. Workspace owner is Layan
 * Al-Mansoori (CCO). Five function leads underneath, members under
 * each.
 *
 * Tone: collaborative / team-forward. Not sovereign-grade security
 * pitch — about how teams co-operate on one source of truth.
 * Audience: layered (admin → security → exec).
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. TeamHero               — "One workspace. The whole team."
 *     2. TeamActivityBar        — workspace stats
 *     3. TheWorkspaceOrgChart   — CENTERPIECE — three-tier tree
 *     4. OneTeamUnpacked        — drill-down on Sales team
 *
 *   ROUND 2+ (to be added):
 *     5. HowTeamsWorkTogether   — cross-team handoff scenarios
 *     6. RolesAndScopes         — 5 role cards
 *     7. InviteFlow             — admin-warmth pitch
 *     8. ConnectedToPlatform    — cross-link tiles
 *     9. MidPageCta
 *    10. OtherFunctions         — links to the 5 function pages
 *    11. ThreeReader            — admin / security / exec
 *    12. FinalCta
 */

export function TeamPageSections() {
  return (
    <>
      <TeamHero />
      <TeamActivityBar />
      <TheWorkspaceOrgChart />
      <OneTeamUnpacked />
      <HowTeamsWorkTogether />
      <RolesAndScopes />
      <InviteFlow />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. TeamHero — opening band
// ───────────────────────────────────────────────────────────────────────────

function TeamHero() {
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
            <Users size={12} className="text-accent-bright" />
            <span>Workspace &middot; team</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">One workspace.</span>
            <br />
            <span className="text-text">The whole team.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Sales is on the same accounts BD is tracking, the same
            companies Marketing is reaching, the same reports Research
            has just delivered. Team is how all of that gets organized
            &mdash; members, roles, handoffs, in one place.
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
// 2. TeamActivityBar — cycling workspace stats
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Workspace members',     value: '21',  sub: 'across 5 functions'              },
  { label: 'Function teams',        value: '5',   sub: 'one shared graph'                },
  { label: 'Handoffs this month',   value: '247', sub: 'across teams'                    },
  { label: 'Audit-trail coverage',  value: '100%', sub: 'every action visible'           },
  { label: 'IT tickets to invite',  value: '0',   sub: 'roles inherited from teams'      },
];

function TeamActivityBar() {
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
              Live workspace &middot; example: Khaleej Group
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
// 3. TheWorkspaceOrgChart — CENTERPIECE — three-tier live tree
// ───────────────────────────────────────────────────────────────────────────

type Role = 'owner' | 'lead' | 'member' | 'admin' | 'viewer';

type Member = { initials: string; name: string; subRole: string };

type FunctionLead = {
  key:        string;
  fnLabel:    string;
  fnHref:     string;
  icon:       React.ComponentType<{ size?: number | string }>;
  tint:       string;
  leadName:   string;
  leadInitials:string;
  members:    Member[];
};

const OWNER = {
  initials: 'LM',
  name:     'Layan Al-Mansoori',
  title:    'Chief Commercial Officer',
  org:      'Khaleej Group',
};

const FUNCTION_LEADS: FunctionLead[] = [
  {
    key:     'sales',
    fnLabel: 'Sales',
    fnHref:  '/platform/sales',
    icon:    Target,
    tint:    'rgb(91 140 255)',
    leadName:    'Yousef Al-Hajiri',
    leadInitials:'YH',
    members: [
      { initials: 'AM', name: 'Aisha Al-Mutawa',    subRole: 'Logistics & Industrial' },
      { initials: 'AH', name: 'Abdulla Bin Hamad',  subRole: 'Energy & Utilities'     },
      { initials: 'NR', name: 'Noora Al-Rumaihi',   subRole: 'Healthcare & Public'    },
      { initials: 'MT', name: 'Mansoor Al-Thani',   subRole: 'Construction & RE'      },
      { initials: 'RA', name: 'Reem Al-Attiyah',    subRole: 'Financial Services'     },
      { initials: 'SS', name: 'Saif Al-Subaie',     subRole: 'SDR'                    },
      { initials: 'MK', name: 'Mariam Al-Khalifa',  subRole: 'Sales Ops'              },
    ],
  },
  {
    key:     'bd',
    fnLabel: 'Business Development',
    fnHref:  '/platform/business-development',
    icon:    Handshake,
    tint:    'rgb(196 154 255)',
    leadName:    'Maryam Al-Suwaidi',
    leadInitials:'MS',
    members: [
      { initials: 'KA', name: 'Khaled Al-Ansari',   subRole: 'Partnerships'  },
      { initials: 'JT', name: 'Jasim Al-Thani',     subRole: 'M&A associate' },
      { initials: 'NA', name: 'Nasser Al-Ali',      subRole: 'M&A associate' },
    ],
  },
  {
    key:     'marketing',
    fnLabel: 'Marketing',
    fnHref:  '/platform/marketing',
    icon:    Megaphone,
    tint:    'rgb(255 196 99)',
    leadName:    'Omar Al-Tamimi',
    leadInitials:'OT',
    members: [
      { initials: 'HS', name: 'Hessa Al-Sulaiti',   subRole: 'ABM lead'        },
      { initials: 'YJ', name: 'Yara Al-Jaber',      subRole: 'Campaigns'       },
      { initials: 'AN', name: 'Ali Al-Nuaimi',      subRole: 'Content & brand' },
    ],
  },
  {
    key:     'research',
    fnLabel: 'Research',
    fnHref:  '/platform/research',
    icon:    Microscope,
    tint:    'rgb(111 207 151)',
    leadName:    'Fatima Al-Nuaimi',
    leadInitials:'FN',
    members: [
      { initials: 'RD', name: 'Rashid Al-Dosari',   subRole: 'Sector analyst' },
      { initials: 'AB', name: 'Asma Al-Buainain',   subRole: 'Macro analyst'  },
    ],
  },
  {
    key:     'gtm',
    fnLabel: 'GTM',
    fnHref:  '/platform/gtm',
    icon:    Rocket,
    tint:    'rgb(165 195 255)',
    leadName:    'Sami Al-Kuwari',
    leadInitials:'SK',
    members: [
      { initials: 'HM', name: 'Hamad Al-Mansour',   subRole: 'New markets'    },
      { initials: 'NK', name: 'Noora Al-Kaabi',     subRole: 'Product launch' },
    ],
  },
];

function TheWorkspaceOrgChart() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The workspace
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            One organization, every function, one workspace.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            A real Bell.qa workspace looks something like this. Khaleej
            Group is a Doha-based holding company with five revenue
            functions reporting up to one Chief Commercial Officer.
            They all work on the same graph &mdash; same accounts,
            same contacts, same source of truth.
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
          {/* Header */}
          <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-dim">
              <Layers size={11} className="text-accent-bright" />
              Org chart &middot; live
            </span>
            <span className="text-text-dim text-[11px]">&middot;</span>
            <span className="text-[10.5px] text-text-dim">
              21 members &middot; 5 function teams &middot; 1 workspace owner
            </span>
            <div className="flex-1" />
            <span className="text-[10px] text-text-dim font-mono">
              Khaleej Group
            </span>
          </div>

          {/* Tier 1 — Owner */}
          <div className="p-6 md:p-8 flex justify-center">
            <OwnerCard />
          </div>

          {/* Connector — line down from owner */}
          <div aria-hidden="true" className="flex justify-center -mt-1 mb-2">
            <ArrowDown size={14} className="text-text-dim" />
          </div>

          {/* Tier 2 + 3 — function teams */}
          <div className="grid grid-cols-1 md:grid-cols-5 border-t border-border">
            {FUNCTION_LEADS.map((fn) => (
              <FunctionColumn key={fn.key} fn={fn} />
            ))}
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px] flex-wrap"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Roles inherited from team membership &middot; owner can override any time
            </span>
            <span className="text-text-muted">
              Click any function to see what that team works on.
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function OwnerCard() {
  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{
        background:    'linear-gradient(180deg, rgba(255,196,99,0.08) 0%, rgba(13,18,35,0.94) 100%)',
        borderColor:   'rgba(255,196,99,0.32)',
        boxShadow:     '0 12px 36px -10px rgba(255,196,99,0.32)',
      }}
    >
      <div className="px-5 py-4 flex items-center gap-4 min-w-[280px]">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-semibold text-text shrink-0"
          style={{
            background: 'linear-gradient(135deg, rgb(255 196 99) 0%, rgb(232 142 168) 100%)',
            boxShadow:  '0 8px 22px -6px rgba(255,196,99,0.45)',
          }}
        >
          {OWNER.initials}
        </div>
        <div className="min-w-0">
          <div className="text-[14px] font-semibold text-text leading-tight">{OWNER.name}</div>
          <div className="text-[11.5px] text-text-muted mt-0.5 leading-snug">{OWNER.title}</div>
          <div className="text-[10.5px] text-text-dim mt-0.5 font-mono">{OWNER.org}</div>
        </div>
        <RoleChip role="owner" />
      </div>
    </div>
  );
}

function FunctionColumn({ fn }: { fn: FunctionLead }) {
  const Icon = fn.icon;
  return (
    <div className="p-4 md:p-5 border-b md:border-b-0 md:border-r border-border last:border-r-0 last:border-b-0">
      {/* Function header */}
      <Link
        href={fn.fnHref}
        className="group flex items-center gap-2 mb-3 hover:text-text transition-colors"
      >
        <span
          className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0"
          style={{
            background: fn.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      fn.tint,
          }}
        >
          <Icon size={11} />
        </span>
        <span
          className="text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: fn.tint }}
        >
          {fn.fnLabel}
        </span>
        <ArrowRight size={10} className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
      </Link>

      {/* Lead card */}
      <div
        className="rounded-lg border px-3 py-2.5 flex items-center gap-2.5"
        style={{
          background:  fn.tint.replace('rgb', 'rgba').replace(')', ' / 0.06)'),
          borderColor: fn.tint.replace('rgb', 'rgba').replace(')', ' / 0.30)'),
        }}
      >
        <div
          className="w-9 h-9 rounded-md flex items-center justify-center text-[12px] font-semibold text-text shrink-0"
          style={{
            background: fn.tint.replace('rgb', 'rgba').replace(')', ' / 0.20)'),
            color:      fn.tint,
          }}
        >
          {fn.leadInitials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-text leading-tight">
            {fn.leadName}
          </div>
          <div className="text-[10px] text-text-dim mt-0.5">Head of {fn.fnLabel}</div>
        </div>
        <RoleChip role="lead" small />
      </div>

      {/* Members */}
      <div className="mt-3 pl-4 border-l border-border space-y-1.5">
        {fn.members.map((m) => (
          <div key={m.name} className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded-md flex items-center justify-center text-[9.5px] font-semibold shrink-0"
              style={{
                background: 'rgba(165,195,255,0.08)',
                color:      'rgb(165 195 255)',
              }}
            >
              {m.initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[11.5px] text-text leading-tight truncate">{m.name}</div>
              <div className="text-[9.5px] text-text-dim leading-tight truncate">{m.subRole}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 pl-4 text-[10px] text-text-dim font-mono">
        {fn.members.length} member{fn.members.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}

function RoleChip({ role, small }: { role: Role; small?: boolean }) {
  const meta: Record<Role, { label: string; color: string; bg: string; border: string }> = {
    owner:  { label: 'Owner',  color: 'rgb(255 196 99)',  bg: 'rgba(255,196,99,0.12)',  border: 'rgba(255,196,99,0.32)' },
    admin:  { label: 'Admin',  color: 'rgb(91 140 255)',  bg: 'rgba(91,140,255,0.12)',  border: 'rgba(91,140,255,0.32)' },
    lead:   { label: 'Lead',   color: 'rgb(111 207 151)', bg: 'rgba(111,207,151,0.12)', border: 'rgba(111,207,151,0.32)' },
    member: { label: 'Member', color: 'rgb(165 195 255)', bg: 'rgba(165,195,255,0.10)', border: 'rgba(165,195,255,0.28)' },
    viewer: { label: 'Viewer', color: 'rgb(140 156 196)', bg: 'rgba(140,156,196,0.10)', border: 'rgba(140,156,196,0.28)' },
  };
  const m = meta[role];
  return (
    <span
      className={
        'inline-flex items-center font-semibold uppercase tracking-wider rounded-full border whitespace-nowrap ' +
        (small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5')
      }
      style={{ color: m.color, background: m.bg, borderColor: m.border }}
    >
      {m.label}
    </span>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. OneTeamUnpacked — drill-down on the Sales team
// ───────────────────────────────────────────────────────────────────────────

const SHARED_RESOURCES = [
  { icon: Target,      label: 'Account lists',       count: '14',  note: 'Live, sector-segmented'             },
  { icon: GitBranch,   label: 'Pipeline stages',     count: '7',   note: 'From discovery through close'       },
  { icon: Inbox,       label: 'Shared inboxes',      count: '3',   note: 'Channel, public sector, replies'    },
  { icon: ListChecks,  label: 'Dashboards',          count: '5',   note: 'Pipeline, ramp, coverage, attribution, ABM' },
];

const TEAM_HANDOFFS = [
  {
    from: 'Marketing',
    to:   'Sales',
    body: 'When an ABM target hits the qualification bar, ownership shifts to a rep automatically. Marketing keeps visibility.',
    tint: 'rgb(255 196 99)',
  },
  {
    from: 'Sales',
    to:   'BD',
    body: 'A rep tags a deal as "potential partnership" instead of pure sales. The deal routes to Maryam (BD) with all signals attached.',
    tint: 'rgb(196 154 255)',
  },
  {
    from: 'Sales',
    to:   'Research',
    body: 'For deals above QAR 500k, Sales requests a deep-dive on the buying organization. Research delivers in 15 minutes.',
    tint: 'rgb(111 207 151)',
  },
  {
    from: 'GTM',
    to:   'Sales',
    body: 'When a new market entry crosses the readiness threshold, the named accounts and partner shortlist land in the Sales workspace.',
    tint: 'rgb(165 195 255)',
  },
];

const RECENT_ACTIVITY = [
  { who: 'AM', name: 'Aisha Al-Mutawa',  action: 'closed a QAR 420k deal with QTerminals', when: '14 min ago' },
  { who: 'YH', name: 'Yousef Al-Hajiri', action: 'reassigned 3 accounts to Saif (SDR)', when: '38 min ago' },
  { who: 'NR', name: 'Noora Al-Rumaihi', action: 'opened a new dialogue with Hamad Medical', when: '1h 12m ago' },
  { who: 'OT', name: 'Omar Al-Tamimi',   action: 'handed off 14 hot accounts to the Sales team', when: '2h 4m ago' },
  { who: 'MK', name: 'Mariam Al-Khalifa', action: 'refreshed the coverage dashboard',  when: '3h 22m ago' },
];

function OneTeamUnpacked() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            One team, unpacked
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Inside the Sales team.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Click any function in the chart and the whole team opens
            up &mdash; roster, what they share, who hands off to and
            from them, and what they&apos;ve done in the last few
            hours. Here&apos;s Yousef&apos;s Sales team, as it looks
            right now.
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
                style={{ background: 'rgba(91,140,255,0.14)', color: 'rgb(91 140 255)' }}
              >
                <Target size={17} />
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-text leading-snug">
                  Sales &middot; Khaleej Group
                </div>
                <div className="text-[11.5px] text-text-dim mt-0.5 font-mono">
                  8 members &middot; led by Yousef Al-Hajiri &middot; reports to Layan
                </div>
              </div>
            </div>
            <Link
              href="/platform/sales"
              className="inline-flex items-center gap-1.5 text-[12px] text-accent-bright hover:text-text transition-colors whitespace-nowrap"
            >
              Explore the Sales surface
              <ArrowRight size={12} />
            </Link>
          </div>

          {/* Body — 4 panels: roster / shared / handoffs / activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border">

            {/* Roster */}
            <UnpackedSection
              icon={Users}
              label="Roster &amp; roles"
              tint="rgb(91 140 255)"
            >
              <ul className="space-y-1.5">
                {/* Lead first */}
                <li className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-semibold text-accent-bright shrink-0"
                    style={{ background: 'rgba(111,207,151,0.16)', color: 'rgb(111 207 151)' }}
                  >
                    YH
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold text-text leading-tight">Yousef Al-Hajiri</div>
                    <div className="text-[10.5px] text-text-dim leading-tight">Head of Sales</div>
                  </div>
                  <RoleChip role="lead" small />
                </li>
                {FUNCTION_LEADS[0].members.map((m) => (
                  <li key={m.name} className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-semibold shrink-0"
                      style={{ background: 'rgba(165,195,255,0.10)', color: 'rgb(165 195 255)' }}
                    >
                      {m.initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] text-text leading-tight">{m.name}</div>
                      <div className="text-[10.5px] text-text-dim leading-tight">{m.subRole}</div>
                    </div>
                    <RoleChip role="member" small />
                  </li>
                ))}
              </ul>
            </UnpackedSection>

            {/* Shared resources */}
            <UnpackedSection
              icon={GitBranch}
              label="What they share"
              tint="rgb(111 207 151)"
            >
              <ul className="space-y-2">
                {SHARED_RESOURCES.map((r) => {
                  const RIcon = r.icon;
                  return (
                    <li
                      key={r.label}
                      className="flex items-center gap-3 rounded-lg border border-border/70 px-3 py-2"
                      style={{ background: 'rgba(255,255,255,0.01)' }}
                    >
                      <span
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0"
                        style={{ background: 'rgba(111,207,151,0.14)', color: 'rgb(111 207 151)' }}
                      >
                        <RIcon size={13} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12.5px] text-text font-semibold leading-tight">{r.label}</div>
                        <div className="text-[10.5px] text-text-dim leading-tight">{r.note}</div>
                      </div>
                      <span className="text-[14px] font-semibold text-text tabular-nums">{r.count}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 text-[11px] text-text-dim leading-relaxed">
                Every member sees the same lists, the same stages, the
                same dashboards. No copy-pasted spreadsheets.
              </div>
            </UnpackedSection>

            {/* Handoffs */}
            <UnpackedSection
              icon={Handshake}
              label="Handoffs in &amp; out"
              tint="rgb(196 154 255)"
            >
              <ul className="space-y-2.5">
                {TEAM_HANDOFFS.map((h) => (
                  <li
                    key={h.from + '->' + h.to}
                    className="rounded-lg border border-border/70 px-3 py-2.5"
                    style={{ background: 'rgba(255,255,255,0.01)' }}
                  >
                    <div className="flex items-center gap-2 mb-1.5 text-[10.5px] font-mono uppercase tracking-wider">
                      <span style={{ color: h.tint }}>{h.from}</span>
                      <ArrowRight size={10} className="text-text-dim" />
                      <span className="text-text">{h.to}</span>
                    </div>
                    <div className="text-[12px] text-text-muted leading-relaxed">{h.body}</div>
                  </li>
                ))}
              </ul>
            </UnpackedSection>

            {/* Recent activity */}
            <UnpackedSection
              icon={Activity}
              label="Recent activity"
              tint="rgb(255 196 99)"
            >
              <ul className="space-y-2">
                {RECENT_ACTIVITY.map((a, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <div
                      className="w-7 h-7 rounded-md flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5"
                      style={{
                        background: 'rgba(255,196,99,0.10)',
                        color:      'rgb(255 196 99)',
                      }}
                    >
                      {a.who}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] text-text leading-snug">
                        <span className="font-semibold">{a.name}</span> {a.action}
                      </div>
                      <div className="text-[10px] text-text-dim mt-0.5 font-mono">{a.when}</div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-3 text-[11px] text-text-dim leading-relaxed">
                Visible to the team lead and to Layan. Bella sees it too.
              </div>
            </UnpackedSection>

          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Same panels open under any function team &middot; one workspace, five teams
            </span>
            <span className="text-text-muted">
              Every action above is one row in the audit trail.
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ── Shared helper ──────────────────────────────────────────────────────────

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
// 5. HowTeamsWorkTogether — four cross-team handoff scenarios
// ───────────────────────────────────────────────────────────────────────────

type Scenario = {
  key:       string;
  fromTeam:  string;
  toTeam:    string;
  fromTint:  string;
  toTint:    string;
  title:     string;
  steps:     { icon: React.ComponentType<{ size?: number | string }>; label: string; body: string }[];
  outcome:   string;
};

const SCENARIOS: Scenario[] = [
  {
    key:      'mkt-to-sales',
    fromTeam: 'Marketing',
    toTeam:   'Sales',
    fromTint: 'rgb(255 196 99)',
    toTint:   'rgb(91 140 255)',
    title:    'An ABM target gets qualified.',
    steps: [
      { icon: Radio,       label: 'Trigger',  body: 'Hessa (ABM lead) sees Doha Health Network engage with three campaign touches.' },
      { icon: GitBranch,   label: 'Routing',  body: 'Account auto-routes to the Sales team. Noora (Healthcare rep) gets it with full context.' },
      { icon: BadgeCheck,  label: 'Outcome',  body: 'Noora opens a dialogue inside the hour. Hessa keeps visibility on the deal.' },
    ],
    outcome: 'Marketing&apos;s spend earns attribution; Sales never starts from cold.',
  },
  {
    key:      'sales-to-bd',
    fromTeam: 'Sales',
    toTeam:   'BD',
    fromTint: 'rgb(91 140 255)',
    toTint:   'rgb(196 154 255)',
    title:    'A deal is bigger than a deal.',
    steps: [
      { icon: Radio,       label: 'Trigger',  body: 'Abdulla (Energy rep) tags a Q-Energy conversation as &ldquo;potential partnership.&rdquo;' },
      { icon: GitBranch,   label: 'Routing',  body: 'Deal hands over to Maryam (BD) with every email, meeting note, and signal attached.' },
      { icon: BadgeCheck,  label: 'Outcome',  body: 'BD frames a partnership, Sales stays in the loop. No context is dropped at the seam.' },
    ],
    outcome: 'The right team has it at the right moment, with everything before still attached.',
  },
  {
    key:      'sales-to-research',
    fromTeam: 'Sales',
    toTeam:   'Research',
    fromTint: 'rgb(91 140 255)',
    toTint:   'rgb(111 207 151)',
    title:    'A QAR 500k deal needs a deep-dive.',
    steps: [
      { icon: Radio,       label: 'Trigger',  body: 'Yousef (Head of Sales) requests a company deep-dive on a healthcare prospect.' },
      { icon: GitBranch,   label: 'Routing',  body: 'Fatima (Research) gets the brief. Bella spawns two agents and starts gathering.' },
      { icon: BadgeCheck,  label: 'Outcome',  body: 'A 12-section report with 142 citations lands in Sales 15 minutes later.' },
    ],
    outcome: 'Sales never goes into a high-stakes deal without research backing.',
  },
  {
    key:      'gtm-to-sales',
    fromTeam: 'GTM',
    toTeam:   'Sales',
    fromTint: 'rgb(165 195 255)',
    toTint:   'rgb(91 140 255)',
    title:    'A new market entry crosses the line.',
    steps: [
      { icon: Radio,       label: 'Trigger',  body: 'Sami (GTM) marks the GCC fintech entry plan as &ldquo;ready to execute.&rdquo;' },
      { icon: GitBranch,   label: 'Routing',  body: 'Named accounts + the SI partner shortlist land in the Sales workspace.' },
      { icon: BadgeCheck,  label: 'Outcome',  body: 'Yousef assigns the 38 priority accounts to Abdulla and Reem the same day.' },
    ],
    outcome: 'The handoff from planning to selling takes minutes, not weeks.',
  },
];

function HowTeamsWorkTogether() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            How the teams work together
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The seams don&apos;t leak.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Most workspaces lose context at every handoff &mdash; the
            email thread the new owner can&apos;t see, the signal that
            never makes it across the org chart, the spreadsheet that
            replaces the system. On Bell, the handoff is the system.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SCENARIOS.map((s, i) => (
            <ScenarioCard key={s.key} scenario={s} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function ScenarioCard({ scenario: s, index }: { scenario: Scenario; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, delay: index * 0.06 }}
      className="rounded-xl border border-border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
      }}
    >
      {/* Header band — from/to teams */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <span
          className="text-[10.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap"
          style={{
            color:       s.fromTint,
            background:  s.fromTint.replace('rgb', 'rgba').replace(')', ' / 0.10)'),
            borderColor: s.fromTint.replace('rgb', 'rgba').replace(')', ' / 0.30)'),
          }}
        >
          {s.fromTeam}
        </span>
        <MoveRight size={12} className="text-text-dim" />
        <span
          className="text-[10.5px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap"
          style={{
            color:       s.toTint,
            background:  s.toTint.replace('rgb', 'rgba').replace(')', ' / 0.10)'),
            borderColor: s.toTint.replace('rgb', 'rgba').replace(')', ' / 0.30)'),
          }}
        >
          {s.toTeam}
        </span>
      </div>

      {/* Body */}
      <div className="p-5 flex flex-col gap-4 flex-1">
        <h3 className="text-[15.5px] font-semibold text-text leading-snug">
          {s.title}
        </h3>

        <ol className="space-y-2.5">
          {s.steps.map((step, i) => {
            const SIcon = step.icon;
            const isLast = i === s.steps.length - 1;
            return (
              <li key={step.label} className="flex items-start gap-3">
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0 mt-0.5"
                  style={{
                    background: isLast
                      ? 'rgba(111,207,151,0.14)'
                      : 'rgba(165,195,255,0.10)',
                    color: isLast ? 'rgb(111 207 151)' : 'rgb(165 195 255)',
                  }}
                >
                  <SIcon size={12} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wider text-text-dim leading-tight mb-0.5">
                    {step.label}
                  </div>
                  <div
                    className="text-[12.5px] text-text leading-snug"
                    dangerouslySetInnerHTML={{ __html: step.body }}
                  />
                </div>
              </li>
            );
          })}
        </ol>

        <div
          className="mt-auto rounded-md border-l-2 px-3 py-2 text-[11.5px] text-text-muted leading-snug italic"
          style={{ borderColor: 'rgb(111 207 151)', background: 'rgba(111,207,151,0.04)' }}
          dangerouslySetInnerHTML={{ __html: s.outcome }}
        />
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. RolesAndScopes — the 5-role model with example holders from Khaleej
// ───────────────────────────────────────────────────────────────────────────

type RoleCard = {
  role:        Role;
  icon:        React.ComponentType<{ size?: number | string }>;
  shortDesc:   string;
  capabilities:string[];
  example:     { name: string; subtitle: string };
};

const ROLE_CARDS: RoleCard[] = [
  {
    role:      'owner',
    icon:      Crown,
    shortDesc: 'Full control of the workspace.',
    capabilities: [
      'Add and remove anyone',
      'Change billing and seats',
      'Transfer ownership',
      'Override any role or scope',
    ],
    example: { name: 'Layan Al-Mansoori', subtitle: 'CCO &middot; Khaleej Group' },
  },
  {
    role:      'admin',
    icon:      Shield,
    shortDesc: 'Runs the workspace for the owner.',
    capabilities: [
      'Invite and remove members',
      'Manage roles and teams',
      'Configure workspace settings',
      'Review the audit trail',
    ],
    example: { name: 'Faisal Al-Mahmoud', subtitle: 'Chief of Staff' },
  },
  {
    role:      'lead',
    icon:      Briefcase,
    shortDesc: 'Runs one function team.',
    capabilities: [
      'Manage their team&apos;s roster',
      'Configure their team&apos;s workflows',
      'Approve high-impact actions',
      'See everything their team does',
    ],
    example: { name: 'Yousef Al-Hajiri', subtitle: 'Head of Sales' },
  },
  {
    role:      'member',
    icon:      Users,
    shortDesc: 'Does the work.',
    capabilities: [
      'Act on assigned accounts and deals',
      'Share lists, dashboards, and reports',
      'Trigger Bella on any task',
      'Receive handoffs from other teams',
    ],
    example: { name: 'Aisha Al-Mutawa', subtitle: 'Sales rep &middot; Logistics' },
  },
  {
    role:      'viewer',
    icon:      Eye,
    shortDesc: 'Read-only, by invitation.',
    capabilities: [
      'Read assigned dashboards',
      'See public lists and reports',
      'No write actions',
      'Audit trail of every view',
    ],
    example: { name: 'Reema Al-Saadi', subtitle: 'External advisor' },
  },
];

function RolesAndScopes() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Roles &amp; scopes
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Five roles. Every workspace, the same model.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            One role to start the workspace. One role to run it for the
            owner. One per function. One for the people doing the work.
            One for everyone else who needs to see, not touch. That&apos;s
            it.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {ROLE_CARDS.map((r, i) => (
            <RoleCardView key={r.role} card={r} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function RoleCardView({ card, index }: { card: RoleCard; index: number }) {
  const Icon = card.icon;
  const meta: Record<Role, { color: string; bg: string; border: string }> = {
    owner:  { color: 'rgb(255 196 99)',  bg: 'rgba(255,196,99,0.08)',  border: 'rgba(255,196,99,0.32)'  },
    admin:  { color: 'rgb(91 140 255)',  bg: 'rgba(91,140,255,0.08)',  border: 'rgba(91,140,255,0.32)'  },
    lead:   { color: 'rgb(111 207 151)', bg: 'rgba(111,207,151,0.08)', border: 'rgba(111,207,151,0.32)' },
    member: { color: 'rgb(165 195 255)', bg: 'rgba(165,195,255,0.08)', border: 'rgba(165,195,255,0.32)' },
    viewer: { color: 'rgb(140 156 196)', bg: 'rgba(140,156,196,0.06)', border: 'rgba(140,156,196,0.28)' },
  };
  const m = meta[card.role];
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
        borderColor: m.border,
      }}
    >
      {/* Header */}
      <div
        className="p-4 border-b"
        style={{ background: m.bg, borderColor: m.border }}
      >
        <div className="flex items-center justify-between mb-2">
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg"
            style={{
              background: m.color.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
              color:      m.color,
            }}
          >
            <Icon size={15} />
          </span>
          <RoleChip role={card.role} small />
        </div>
        <div className="text-[12.5px] text-text leading-snug">
          {card.shortDesc}
        </div>
      </div>

      {/* Capabilities */}
      <div className="p-4 flex-1">
        <ul className="space-y-1.5">
          {card.capabilities.map((c) => (
            <li key={c} className="flex items-start gap-2 text-[12px] text-text-muted leading-snug">
              <Check size={11} className="shrink-0 mt-0.5" style={{ color: m.color }} />
              <span dangerouslySetInnerHTML={{ __html: c }} />
            </li>
          ))}
        </ul>
      </div>

      {/* Example */}
      <div
        className="px-4 py-3 border-t text-[10.5px] text-text-dim"
        style={{ background: 'rgba(255,255,255,0.015)', borderColor: 'rgba(255,255,255,0.04)' }}
      >
        <div className="text-[9.5px] uppercase tracking-wider font-semibold text-text-dim mb-0.5">
          On Khaleej&apos;s workspace
        </div>
        <div className="text-[11.5px] text-text font-semibold leading-tight">
          {card.example.name}
        </div>
        <div
          className="text-[10.5px] text-text-dim leading-tight"
          dangerouslySetInnerHTML={{ __html: card.example.subtitle }}
        />
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. InviteFlow — admin warmth: invite in seconds, role inherited, day one
// ───────────────────────────────────────────────────────────────────────────

function InviteFlow() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Day one
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Invite. Pick a team. They&apos;re working.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            No IT ticket. No permissions matrix to configure. No
            three-week onboarding. Pick the team, and the role, the
            scopes, the dashboards, and the inboxes inherit.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr] gap-6 max-w-5xl mx-auto">

          {/* Invite mockup */}
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
            <div className="px-5 py-3 border-b border-border flex items-center gap-2">
              <UserPlus size={13} className="text-accent-bright" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text">
                Invite a member
              </span>
              <div className="flex-1" />
              <span className="text-[10px] font-mono text-text-dim">
                Workspace &middot; Khaleej Group
              </span>
            </div>

            <div className="p-5 space-y-4">
              {/* Email */}
              <div>
                <div className="text-[10.5px] uppercase tracking-wider font-semibold text-text-dim mb-1.5">
                  Email
                </div>
                <div className="rounded-md border border-border px-3 py-2.5 flex items-center gap-2 bg-card/40">
                  <Mail size={13} className="text-text-dim shrink-0" />
                  <span className="text-[13px] text-text font-mono">
                    abdulla.hajiri@khaleej.qa
                  </span>
                </div>
              </div>

              {/* Team picker */}
              <div>
                <div className="text-[10.5px] uppercase tracking-wider font-semibold text-text-dim mb-1.5">
                  Team
                </div>
                <div
                  className="rounded-md border px-3 py-2.5 flex items-center gap-2"
                  style={{
                    background:  'rgba(91,140,255,0.06)',
                    borderColor: 'rgba(91,140,255,0.30)',
                  }}
                >
                  <Target size={13} className="text-accent-bright shrink-0" />
                  <span className="text-[13px] text-text font-semibold">Sales</span>
                  <ChevronDown size={11} className="text-text-dim ml-auto shrink-0" />
                </div>
              </div>

              {/* Inheritance preview */}
              <div className="rounded-md border border-border bg-card/30 p-3">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-text-dim mb-2 flex items-center gap-1.5">
                  <Sparkles size={10} className="text-accent-bright" />
                  Will inherit from Sales team
                </div>
                <ul className="space-y-1">
                  <InheritRow label="Role"      value="Member" />
                  <InheritRow label="Scope"     value="14 account lists, 7 pipeline stages" />
                  <InheritRow label="Inboxes"   value="Channel + replies" />
                  <InheritRow label="Dashboards" value="Pipeline + ramp + coverage" />
                  <InheritRow label="Lead"      value="Yousef Al-Hajiri" />
                </ul>
              </div>

              {/* Send button */}
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-accent text-white text-[13px] font-semibold cursor-default opacity-90"
                style={{ boxShadow: '0 8px 24px -8px rgba(91,140,255,0.45)' }}
              >
                Send invitation
                <ArrowRight size={13} />
              </button>
            </div>
          </motion.div>

          {/* Right column: capability tiles + outcome */}
          <div className="space-y-4">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55, delay: 0.1 }}
              className="grid grid-cols-2 gap-3"
            >
              <InviteTile
                icon={Zap}
                label="Invite in seconds"
                body="One email, one team. The whole permission model is inherited."
                tint="rgb(255 196 99)"
              />
              <InviteTile
                icon={Sparkles}
                label="Role inherited"
                body="No matrix to configure. Member of Sales? Sees what Sales sees."
                tint="rgb(91 140 255)"
              />
              <InviteTile
                icon={Settings}
                label="No IT ticket"
                body="Admins or leads can invite. No queue to anyone&apos;s desk."
                tint="rgb(111 207 151)"
              />
              <InviteTile
                icon={Activity}
                label="Day-one ready"
                body="Dashboards live. Lists shared. Bella introduced. Hours, not weeks."
                tint="rgb(196 154 255)"
              />
            </motion.div>

            {/* Big-number outcome */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.55, delay: 0.2 }}
              className="rounded-2xl border border-border overflow-hidden p-5 md:p-6"
              style={{
                background:
                  'linear-gradient(135deg, rgba(91,140,255,0.10) 0%, rgba(111,207,151,0.06) 100%)',
              }}
            >
              <div className="flex items-baseline gap-3">
                <span className="text-4xl md:text-5xl font-semibold text-text leading-none tabular-nums">
                  30s
                </span>
                <div>
                  <div className="text-[12px] font-semibold text-text uppercase tracking-wider leading-tight">
                    average time to a new member working
                  </div>
                  <div className="text-[11px] text-text-dim mt-0.5">
                    From invite-sent to dashboard-open.
                  </div>
                </div>
              </div>
              <div className="mt-3 text-[12px] text-text-muted leading-relaxed">
                The legacy IT-ticket-and-permissions-spreadsheet onboarding
                used to take a Khaleej manager about two weeks. On Bell, the
                next rep starts the same day.
              </div>
            </motion.div>
          </div>
        </div>

      </div>
    </section>
  );
}

function InheritRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-[11.5px]">
      <span className="text-text-dim">{label}</span>
      <span className="text-text font-medium text-right">{value}</span>
    </li>
  );
}

function InviteTile({
  icon: Icon, label, body, tint,
}: {
  icon:  React.ComponentType<{ size?: number | string }>;
  label: string;
  body:  string;
  tint:  string;
}) {
  return (
    <div
      className="rounded-xl border border-border p-4"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
      }}
    >
      <span
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg mb-3"
        style={{
          background: tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
          color:      tint,
        }}
      >
        <Icon size={14} />
      </span>
      <div className="text-[12.5px] font-semibold text-text leading-snug">
        {label}
      </div>
      <div
        className="mt-1 text-[11.5px] text-text-muted leading-snug"
        dangerouslySetInnerHTML={{ __html: body }}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. ConnectedToPlatform — the surfaces Team sits underneath
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
    body:  "The other workspace surface. Accounts, contacts, and deals live in CRM; Team decides who can see and act on what. Same workspace, complementary scopes.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Bot,
    label: 'Bella',
    href:  '/platform/bella',
    body:  "Every member can delegate to Bella. The handoffs between teams are the kind of work she runs end-to-end &mdash; routing, drafting, summarizing, surfacing.",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  "Signals route to the right team automatically. A regulatory change reaches Marketing&apos;s ABM lead and Sales&apos;s public-sector rep in the same minute.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "Forecasts are scoped per team. Layan sees the whole pipeline; Yousef sees Sales&apos; pipeline; Aisha sees her own deals &mdash; same engine, different lens.",
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  "Geographic view scoped per team. Sales sees their accounts on the map; BD sees their targets; the whole workspace sees the company-wide footprint.",
    tint:  'rgb(165 195 255)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What the workspace plugs into
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Team sits underneath the rest of the platform.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Every surface on Bell.qa respects the workspace structure
            you set in Team. The CRM scopes by team; Bella obeys
            roles; Signals route by ownership; Prediction filters by
            membership. One model, applied everywhere.
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
// 9. MidPageCta — Get Access band
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
                'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(91,140,255,0.16) 0%, transparent 60%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                You&apos;ve seen Khaleej&apos;s workspace
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now put your whole team on Bell.qa.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your owner, leads, and members are working
                from one source of truth by tomorrow.
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
// 10. OtherFunctions — the five teams that live in the workspace
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
            The five teams that live in the workspace
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Each function has its own page. Each one shares this team.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The org chart you saw above is the workspace. The five
            columns under it are the function surfaces &mdash; each
            documented in depth, each running on the same members,
            roles, and handoffs.
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
// 11. ThreeReader — three-layered audience: admin / security / exec
// ───────────────────────────────────────────────────────────────────────────

const TEAM_READERS = [
  {
    icon:  Settings,
    label: 'For the workspace admin',
    body:  "Invite in seconds, role inherited from team, no IT ticket. The members you add this morning are working from the same lists, dashboards, and inboxes their lead uses by lunchtime.",
  },
  {
    icon:  ShieldCheck,
    label: 'For the security / compliance officer',
    body:  "Every action is logged. Every member is scoped to what their team owns. Revoking access is one click. The audit trail outlives the person, the project, and the engagement.",
  },
  {
    icon:  Crown,
    label: 'For the executive sponsor',
    body:  "Your revenue functions are no longer five tools and five spreadsheets. They&apos;re one workspace with one org chart, one source of truth, and one Bella running underneath all of it.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same workspace
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes for the team.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {TEAM_READERS.map((r, i) => {
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
// 12. FinalCta — closing Get Access block
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
          Put your whole team on Bell.qa.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          One workspace. Five function teams. Members, roles, handoffs
          in one place. Sales on the same accounts BD is tracking, on
          the same companies Marketing is reaching, on the same reports
          Research has just delivered. One source of truth, one Bella.
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

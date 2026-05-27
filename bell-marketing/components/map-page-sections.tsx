'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Map as MapIcon, ArrowRight, Radar, Layers, Compass,
  Sparkles, MapPin, Target, Megaphone, Handshake,
  Microscope, Rocket, Network, Crown, Building2,
  ShieldCheck, Globe, Flame, Eye, ZoomIn,
  Inbox, Users, Bot, BrainCircuit, BarChart3, BadgeCheck,
} from 'lucide-react';
import { MapPageLive } from '@/components/map-page-live';

/**
 * MAP PAGE — capability-deep-dive.
 *
 * Centerpiece is a real Mapbox embed (<MapPageLive/>), Doha-locked, with
 * continuous annotated signal pulses. Tone arc: strategic at the top
 * (country at a glance), operational in deeper sections (how each
 * function reads the map).
 *
 * Scope: visualize only — no filter / query / route promised.
 * Anchor: the whole Qatari market (no workspace lens).
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. MapHero               — "Qatar, mapped."
 *     2. MapActivityBar        — live map stats
 *     3. TheLiveMap            — CENTERPIECE — real Mapbox embed
 *
 *   ROUND 2+ (to be added):
 *     4. HowTeamsReadTheMap    — 5 mini cards, one per function
 *     5. OverlaysGallery       — what views are available
 *     6. OneZoomCloseUp        — a deeper static view
 *     7. ConnectedToPlatform   — cross-link tiles
 *     8. MidPageCta
 *     9. OtherFunctions
 *    10. ThreeReader           — field rep / BD scout / exec
 *    11. FinalCta
 */

export function MapPageSections() {
  return (
    <>
      <MapHero />
      <MapActivityBar />
      <TheLiveMap />
      <HowTeamsReadTheMap />
      <OverlaysGallery />
      <OneZoomCloseUp />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherFunctions />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. MapHero — strategic opening
// ───────────────────────────────────────────────────────────────────────────

function MapHero() {
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
            <MapIcon size={12} className="text-accent-bright" />
            <span>Intelligence &middot; Map</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">Qatar, mapped.</span>
            <br />
            <span className="text-text">Live, on one canvas.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Every Qatari company is a node on Doha. Every signal Bell
            picks up is a pulse on the map. Sectors cluster where
            capital and people cluster &mdash; visible at a glance,
            updated as the country moves.
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
// 2. MapActivityBar — cycling live map stats
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Accounts on the map',  value: 'every Qatari co.', sub: 'one node per company'        },
  { label: 'Signals plotted today', value: '847',  sub: 'across Doha & beyond'                    },
  { label: 'Sector clusters',      value: '12',   sub: 'visible at a glance'                      },
  { label: 'Overlays available',   value: '6',    sub: 'sector, signals, ownership, more'         },
  { label: 'Update latency',       value: '< 60s', sub: 'signal to map'                           },
];

function MapActivityBar() {
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
              Live map &middot; whole Qatari market
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
// 3. TheLiveMap — CENTERPIECE — embedded Mapbox component
// ───────────────────────────────────────────────────────────────────────────

function TheLiveMap() {
  return (
    <section className="relative py-12 md:py-16 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Live map of Doha
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell sees, right now.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The same map a Bell.qa workspace opens to. Every pulse is
            a signal that landed on the graph in the last few hours
            &mdash; a licence issued, a leadership change, an
            expansion announced, a tender opened. Pan around. Watch
            them appear.
          </p>
        </div>

        <MapPageLive />

        {/* Footnote — what the visitor is looking at */}
        <div className="mt-4 flex items-center gap-2 text-[11px] text-text-dim">
          <Sparkles size={11} className="text-accent-bright shrink-0" />
          <span>
            Signals are illustrative on this public page &middot; inside the
            workspace, every pulse is a real event with a cited source.
          </span>
        </div>

      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. HowTeamsReadTheMap — five function lenses on the same map
// ───────────────────────────────────────────────────────────────────────────

type ReaderCard = {
  team:    string;
  href:    string;
  icon:    React.ComponentType<{ size?: number | string }>;
  tint:    string;
  reads:   string;
  example: string;
};

const READERS: ReaderCard[] = [
  {
    team:    'Sales',
    href:    '/platform/sales',
    icon:    Target,
    tint:    'rgb(91 140 255)',
    reads:   'Territory + drive time',
    example: "Layla opens the map at her location, sees every account within 30 minutes by car, picks the next visit.",
  },
  {
    team:    'Marketing',
    href:    '/platform/marketing',
    icon:    Megaphone,
    tint:    'rgb(255 196 99)',
    reads:   'Audience reach, geographically',
    example: "Khalid sees which Doha districts an ABM campaign has hit, where coverage is thin, where to push next.",
  },
  {
    team:    'BD',
    href:    '/platform/business-development',
    icon:    Handshake,
    tint:    'rgb(196 154 255)',
    reads:   'Ownership clusters',
    example: "Tariq toggles on family-office portfolios &mdash; sees which holdings cluster in which districts.",
  },
  {
    team:    'Research',
    href:    '/platform/research',
    icon:    Microscope,
    tint:    'rgb(111 207 151)',
    reads:   'Sector geography',
    example: "Fatima drops the map into a sector report &mdash; healthcare clinics shown clustered around Hamad.",
  },
  {
    team:    'GTM',
    href:    '/platform/gtm',
    icon:    Rocket,
    tint:    'rgb(165 195 255)',
    reads:   'Sector x geography',
    example: "Sami crosses sector heat with geographic clustering &mdash; finds the priority district for entry.",
  },
];

function HowTeamsReadTheMap() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            How the teams read the map
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            One map. Five different jobs to do on it.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The same Doha. The same nodes. Different framing depending on
            who&apos;s opening the workspace. Every function reaches
            for the map for its own reason &mdash; and gets there in a
            click.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {READERS.map((r, i) => (
            <ReaderCardView key={r.team} card={r} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function ReaderCardView({ card, index }: { card: ReaderCard; index: number }) {
  const Icon = card.icon;
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
        borderColor: card.tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
      }}
    >
      <div
        className="px-4 py-3 border-b flex items-center gap-2"
        style={{
          background:  card.tint.replace('rgb', 'rgba').replace(')', ' / 0.06)'),
          borderColor: card.tint.replace('rgb', 'rgba').replace(')', ' / 0.20)'),
        }}
      >
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-md"
          style={{
            background: card.tint.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
            color:      card.tint,
          }}
        >
          <Icon size={12} />
        </span>
        <span
          className="text-[12px] font-semibold leading-tight"
          style={{ color: card.tint }}
        >
          {card.team}
        </span>
      </div>

      <div className="p-4 flex-1 flex flex-col gap-2">
        <div className="text-[10.5px] font-mono uppercase tracking-wider text-text-dim">
          Reads it for
        </div>
        <div className="text-[13px] font-semibold text-text leading-tight">
          {card.reads}
        </div>
        <p
          className="text-[11.5px] text-text-muted leading-relaxed mt-1"
          dangerouslySetInnerHTML={{ __html: card.example }}
        />
      </div>

      <Link
        href={card.href}
        className="group px-4 py-2.5 border-t border-border/60 text-[11px] font-semibold inline-flex items-center justify-between hover:bg-card/30 transition-colors"
        style={{ color: card.tint }}
      >
        <span>Explore {card.team}</span>
        <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. OverlaysGallery — what views are available on the map
// ───────────────────────────────────────────────────────────────────────────

type Overlay = {
  icon:  React.ComponentType<{ size?: number | string }>;
  label: string;
  body:  string;
  tint:  string;
};

const OVERLAYS: Overlay[] = [
  {
    icon:  Flame,
    label: 'Sector density',
    body:  "Heat-style overlay showing where one sector concentrates. Logistics around the port. Finance in West Bay. Healthcare around Hamad.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  Crown,
    label: 'Ownership clusters',
    body:  "Toggle on family-office or sovereign portfolios &mdash; their holdings render as a coloured cluster across the city.",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  Radar,
    label: 'Signal density',
    body:  "Where the most market signals fire over a chosen window. The hottest districts surface as bright clusters.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  ShieldCheck,
    label: 'Regulator footprint',
    body:  "Show which authority licences each company &mdash; QFC, QFMA, QCB, MoCI. Useful for compliance-scoped outreach.",
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  Network,
    label: 'Decision-unit density',
    body:  "Where the most named, mapped decision-makers concentrate. Sales, BD, and Marketing all push toward these clusters.",
    tint:  'rgb(255 159 180)',
  },
  {
    icon:  Globe,
    label: 'GCC context',
    body:  "Zoom out to Doha-in-region. See the Qatari market in the context of UAE, KSA, Bahrain &mdash; useful for GTM&apos;s expand-out motion.",
    tint:  'rgb(165 195 255)',
  },
];

function OverlaysGallery() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Six overlays you can render
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The same Doha, six different ways.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The live map above shows signals. Inside the workspace,
            the same canvas re-tints in seconds &mdash; sector heat,
            ownership clusters, signal density, regulator footprint.
            One map, many lenses.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {OVERLAYS.map((o, i) => (
            <OverlayCard key={o.label} overlay={o} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function OverlayCard({ overlay: o, index }: { overlay: Overlay; index: number }) {
  const Icon = o.icon;
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
      {/* Stylized map mini-preview — abstract dots/clusters, not a real map */}
      <div
        className="relative h-32 border-b border-border overflow-hidden"
        style={{
          background:
            'radial-gradient(ellipse 90% 70% at 50% 60%, rgba(91,140,255,0.08) 0%, rgba(13,18,35,1) 70%)',
        }}
      >
        {/* Abstract cluster dots */}
        {[
          { top: '42%', left: '32%', size: 14, op: 0.85 },
          { top: '34%', left: '46%', size: 10, op: 0.65 },
          { top: '50%', left: '52%', size: 18, op: 0.95 },
          { top: '60%', left: '38%', size: 8,  op: 0.50 },
          { top: '46%', left: '64%', size: 12, op: 0.75 },
          { top: '56%', left: '70%', size: 9,  op: 0.45 },
          { top: '38%', left: '24%', size: 7,  op: 0.40 },
        ].map((d, i) => (
          <span
            key={i}
            className="absolute rounded-full"
            style={{
              top:        d.top,
              left:       d.left,
              width:      d.size,
              height:     d.size,
              background: o.tint,
              opacity:    d.op,
              boxShadow:  '0 0 ' + (d.size * 1.4) + 'px ' + o.tint.replace('rgb', 'rgba').replace(')', ' / 0.55)'),
            }}
          />
        ))}
        {/* Subtle grid */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.5) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Icon badge */}
        <span
          className="absolute top-3 left-3 inline-flex items-center justify-center w-7 h-7 rounded-md"
          style={{
            background: o.tint.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
            color:      o.tint,
          }}
        >
          <Icon size={13} />
        </span>
        <span
          className="absolute top-3 right-3 inline-flex items-center gap-1 text-[9.5px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border"
          style={{
            color:       o.tint,
            background:  'rgba(13,18,35,0.85)',
            borderColor: o.tint.replace('rgb', 'rgba').replace(')', ' / 0.30)'),
          }}
        >
          <Eye size={9} />
          Overlay
        </span>
      </div>

      <div className="p-5 flex-1">
        <h3 className="text-[15px] font-semibold text-text leading-tight">
          {o.label}
        </h3>
        <p
          className="mt-2 text-[12.5px] text-text-muted leading-relaxed"
          dangerouslySetInnerHTML={{ __html: o.body }}
        />
      </div>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. OneZoomCloseUp — deeper static view of a single cluster
// ───────────────────────────────────────────────────────────────────────────

const CLUSTER_ACCOUNTS = [
  { name: 'Doha Health Network',          subRole: 'Founder-led network',   x: '34%', y: '42%' },
  { name: 'Hamad Medical Corp.',          subRole: 'Public anchor',         x: '48%', y: '38%' },
  { name: 'Al-Ahli Hospital',             subRole: 'Specialty hospital',    x: '52%', y: '52%' },
  { name: 'The View Hospital',            subRole: 'New private build',     x: '38%', y: '58%' },
  { name: 'Al Emadi Hospital',            subRole: 'Family-owned',          x: '60%', y: '46%' },
  { name: 'Future Medical Center',        subRole: 'Multi-specialty',       x: '64%', y: '60%' },
  { name: 'Aster Clinics',                subRole: 'Regional chain',        x: '44%', y: '64%' },
];

function OneZoomCloseUp() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            One cluster, zoomed in
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Zoom to West Bay. Seven healthcare providers in 4&nbsp;km².
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Bell.qa shows you the cluster, names the providers, and
            unfolds each into its full record. The same gesture works
            for any cluster, anywhere &mdash; finance in West Bay,
            logistics around the port, education along Al-Mearad.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.55 }}
          className="rounded-2xl border border-border overflow-hidden grid grid-cols-1 lg:grid-cols-[1.4fr,1fr]"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
          }}
        >
          {/* Left — stylized "zoom" panel with the cluster */}
          <div
            className="relative min-h-[420px] border-b lg:border-b-0 lg:border-r border-border overflow-hidden"
            style={{
              background:
                'radial-gradient(ellipse 80% 70% at 50% 50%, rgba(91,140,255,0.10) 0%, rgba(13,18,35,1) 70%)',
            }}
          >
            {/* Subtle road-grid */}
            <div
              aria-hidden="true"
              className="absolute inset-0 opacity-[0.07]"
              style={{
                backgroundImage:
                  'linear-gradient(to right, rgba(165,195,255,0.6) 1px, transparent 1px), linear-gradient(to bottom, rgba(165,195,255,0.6) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />
            {/* Cluster ring — visualizes the 4 km² radius */}
            <div
              aria-hidden="true"
              className="absolute"
              style={{
                top: '50%',
                left: '50%',
                width: 360,
                height: 360,
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: '1px dashed rgba(111,207,151,0.30)',
                background:
                  'radial-gradient(circle, rgba(111,207,151,0.10) 0%, transparent 70%)',
              }}
            />
            {/* District label */}
            <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-3 z-10">
              <div
                className="rounded-lg border border-border px-3 py-2"
                style={{ background: 'rgba(13,18,35,0.85)', backdropFilter: 'blur(8px)' }}
              >
                <div className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
                  Zoom &middot; West Bay
                </div>
                <div className="text-[12px] font-semibold text-text leading-tight mt-0.5">
                  Healthcare cluster &middot; 7 accounts
                </div>
              </div>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border"
                style={{
                  color:       'rgb(111 207 151)',
                  background:  'rgba(111,207,151,0.12)',
                  borderColor: 'rgba(111,207,151,0.32)',
                }}
              >
                <ZoomIn size={10} />
                4&nbsp;km&sup2;
              </span>
            </div>
            {/* Account markers */}
            {CLUSTER_ACCOUNTS.map((a, i) => (
              <motion.div
                key={a.name}
                initial={{ opacity: 0, scale: 0.6 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: 0.1 + i * 0.05 }}
                className="absolute"
                style={{ top: a.y, left: a.x, transform: 'translate(-50%, -50%)' }}
              >
                <div className="relative">
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{
                      background: 'rgb(111 207 151)',
                      boxShadow:  '0 0 12px rgb(111 207 151)',
                    }}
                  />
                  <span
                    className="absolute left-4 top-[-4px] whitespace-nowrap text-[10px] font-mono text-text px-1.5 py-0.5 rounded"
                    style={{
                      background:  'rgba(13,18,35,0.92)',
                      border:      '1px solid rgba(111,207,151,0.30)',
                      backdropFilter: 'blur(4px)',
                    }}
                  >
                    {a.name}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Right — list of the 7 accounts as an "expanded" record snippet */}
          <div className="p-5 md:p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Building2 size={13} className="text-accent-bright" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text-dim">
                Accounts in cluster
              </span>
            </div>

            <ul className="space-y-2 flex-1">
              {CLUSTER_ACCOUNTS.map((a) => (
                <li
                  key={a.name}
                  className="rounded-lg border border-border/70 px-3 py-2 flex items-center gap-3"
                  style={{ background: 'rgba(255,255,255,0.01)' }}
                >
                  <span
                    className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[10px] font-semibold shrink-0"
                    style={{ background: 'rgba(111,207,151,0.14)', color: 'rgb(111 207 151)' }}
                  >
                    <MapPin size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-text leading-tight">
                      {a.name}
                    </div>
                    <div className="text-[10.5px] text-text-dim leading-tight">
                      {a.subRole}
                    </div>
                  </div>
                  <ArrowRight size={11} className="text-text-dim shrink-0" />
                </li>
              ))}
            </ul>

            <div className="mt-4 pt-4 border-t border-border text-[11px] text-text-dim leading-relaxed">
              Click any account on the map and the full CRM record
              opens &mdash; ownership, decision unit, signals, activity,
              pipeline.
              {' '}
              <Link href="/platform/crm" className="text-accent-bright hover:text-text transition-colors underline decoration-accent-bright/30 underline-offset-2">
                See what&apos;s in a record &rarr;
              </Link>
            </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. ConnectedToPlatform — what Map plugs into
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
    body:  "Every dot on the map is a record in the CRM. Click a dot &mdash; the full account record opens. The map is just the spatial way into the same data.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  Users,
    label: 'Team',
    href:  '/platform/team',
    body:  "Your team&apos;s scope decides what you see on the map. Sales sees the Sales pipeline overlay; BD sees their watchlist; the owner sees everything.",
    tint:  'rgb(165 195 255)',
  },
  {
    icon:  Bot,
    label: 'Bella',
    href:  '/platform/bella',
    body:  "Bella can drop pins, draw clusters, and narrate the map &mdash; &ldquo;here are the seven healthcare providers in West Bay, ranked by current signal.&rdquo;",
    tint:  'rgb(196 154 255)',
  },
  {
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  "The pulses on the map ARE signals. Every signal Bell.qa picks up has a location attached, so it appears on the map within seconds.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "Forecasts render geographically too. Where will the next sector cluster hot up. Where will the next deal close. Visible on the map.",
    tint:  'rgb(111 207 151)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            What the map plugs into
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            The map isn&apos;t a separate product.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            It&apos;s a view onto the same graph that powers everything
            else. CRM records, team scopes, Bella, signals, predictions
            &mdash; all rendered spatially on Doha.
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
                'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(91,140,255,0.18) 0%, transparent 60%)',
            }}
          />
          <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div className="max-w-xl">
              <div className="text-[11px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                You&apos;ve seen the map
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now open it on your own workspace.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. Your accounts, your overlays, your signals
                &mdash; on the same Doha canvas by tomorrow.
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
            Five functions reach for the map
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Each one has its own page on what they do with it.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The map is one surface across five revenue functions.
            Each function has a dedicated page showing how the platform
            powers their day-to-day &mdash; the map shows up in every
            one of them.
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
// 10. ThreeReader — field rep / operations leader / exec
// ───────────────────────────────────────────────────────────────────────────

const MAP_READERS = [
  {
    icon:  Compass,
    label: 'For the field operator',
    body:  "Open the map on a tablet, anywhere in Doha. See every account around you with the freshest signal attached. The next visit is one click away.",
  },
  {
    icon:  BarChart3,
    label: 'For the operations leader',
    body:  "Coverage at a glance. Where the team is concentrated, where they aren&apos;t. Which sectors crowd into which districts. Which territories need a body.",
  },
  {
    icon:  BadgeCheck,
    label: 'For the executive',
    body:  "The Qatari market on one canvas, updated as it moves. Capital, leadership, sector activity &mdash; rendered geographically so you can read the country at a glance.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same map
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes when the country is mapped.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {MAP_READERS.map((r, i) => {
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
            'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(91,140,255,0.16) 0%, transparent 65%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight max-w-2xl mx-auto">
          See Qatar on one canvas.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Every Qatari company a node. Every signal a pulse. Six
          overlays, one map, one source of truth. The country, the way
          your operators and your leadership both need to see it.
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

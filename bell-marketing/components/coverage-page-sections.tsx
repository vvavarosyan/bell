'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Database, ArrowRight, Building2, Landmark, Crown, Layers,
  Users, Star, Network, Briefcase, FileText, Newspaper,
  Radar, Scroll, BadgeCheck, Vote, MapPin, GitBranch,
  Plane, Car, Cloud, UserCheck, Sparkles, Activity,
  ShieldCheck, Lock, Globe, BadgeAlert, Handshake, Cog,
  BookOpen, Eye, Check, BarChart3,
  Inbox, Bot, Map as MapIcon, BrainCircuit, Crosshair,
  Workflow,
} from 'lucide-react';

/**
 * COVERAGE PAGE — capability deep-dive.
 *
 * The breadth claim for Bell.qa's data layer. Argues that Bell sees
 * not just companies and people, but every observable surface of
 * Qatar — organizations, people, activity, governance, and the live
 * country (geo / traffic / weather / aggregate people-activity).
 *
 * Centerpiece: a 5-tier Record Type Taxonomy, ~21 record-type cards,
 * each with icon, name, count (where applicable), 3-4 representative
 * fields, and a LIVE indicator for the dynamic record types.
 *
 * Tone: strategic, country-scale, cinematic. Privacy framing on the
 * people-activity record type (anonymized aggregates, not individual
 * tracking).
 *
 * Sections (built in rounds):
 *   ROUND 1 (this file):
 *     1. CoverageHero        — "The country, recorded."
 *     2. CoverageActivityBar — live counters
 *     3. TheRecordTypeTaxonomy — CENTERPIECE — 5 tiers, 21 records
 *
 *   ROUND 2+ (to be added):
 *     4. OneRecordFullyUnpacked — Doha Health Network: every field
 *     5. TheLivingCountry    — geo / traffic / weather / activity
 *     6. WhereTheDataComesFrom — general source classes (no vendors)
 *     7. ConnectedToPlatform
 *     8. MidPageCta
 *     9. OtherDataSurfaces  — Pipeline / Live / Trust cross-links
 *    10. ThreeReader        — analyst / data buyer / partner
 *    11. FinalCta
 */

export function CoveragePageSections() {
  return (
    <>
      <CoverageHero />
      <CoverageActivityBar />
      <TheRecordTypeTaxonomy />
      <OneRecordFullyUnpacked />
      <TheLivingCountry />
      <WhereTheDataComesFrom />
      <ConnectedToPlatform />
      <MidPageCta />
      <OtherDataSurfaces />
      <ThreeReader />
      <FinalCta />
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. CoverageHero — strategic opening
// ───────────────────────────────────────────────────────────────────────────

function CoverageHero() {
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
            <Database size={12} className="text-accent-bright" />
            <span>Data &middot; Coverage</span>
          </div>
          <h1 className="text-4xl md:text-6xl font-semibold leading-[1.05] tracking-tight">
            <span className="text-gradient">The country,</span>
            <br />
            <span className="text-text">recorded.</span>
          </h1>
          <p className="mt-7 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl">
            Companies, people, jobs, signals, regulations, ownership
            graphs, sectors, tenders, news, air &amp; road traffic,
            weather, geo data, government data, political data
            &mdash; every observable surface of Qatar, captured as
            structured records.
          </p>
          <p className="mt-4 text-[13.5px] text-text-dim leading-relaxed max-w-2xl">
            Twenty-one record types across five tiers. Around{' '}
            <span className="text-text font-semibold">500+ datapoints on every record</span>.{' '}
            <span className="text-text font-semibold">1.2 billion datapoints</span>{' '}
            scanned, tracked, and updated every day &mdash; all on one
            graph, all cited end to end.
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
// 2. CoverageActivityBar — cycling live counters
// ───────────────────────────────────────────────────────────────────────────

const ACTIVITY_FRAMES = [
  { label: 'Datapoints tracked daily', value: '1.2 B', sub: 'scanned &amp; updated, every day' },
  { label: 'Datapoints per record',    value: '500+',  sub: 'depth, on every entity'           },
  { label: 'Qatari companies',         value: '191,000+', sub: '76,000+ actively trading'      },
  { label: 'Decision-makers',          value: 'All',      sub: 'across Qatar’s economy'         },
  { label: 'Record types tracked',     value: '21',    sub: 'across 5 tiers'                   },
  { label: 'Live record types',        value: '6',     sub: 'refreshed continuously'           },
];

function CoverageActivityBar() {
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
              Live data plane &middot; whole Qatari surface
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
// 3. TheRecordTypeTaxonomy — CENTERPIECE — 5-tier stack, ~21 record types
// ───────────────────────────────────────────────────────────────────────────

type RecordType = {
  icon:    React.ComponentType<{ size?: number | string }>;
  name:    string;
  count?:  string;
  live?:   boolean;
  fields:  string[];
  note?:   string;
};

type TaxonomyTier = {
  num:      string;
  label:    string;
  tagline:  string;
  tint:     string;
  records:  RecordType[];
};

const TAXONOMY: TaxonomyTier[] = [
  {
    num:     '01',
    label:   'Organizations',
    tagline: 'Who exists.',
    tint:    'rgb(91 140 255)',
    records: [
      { icon: Building2, name: 'Private companies',     count: '191,000+ (76,000+ active)', fields: ['Name & registrations', 'Sector & sub-sector', 'Employees & revenue band', 'Leadership & board', 'Ownership cap table'] },
      { icon: Landmark,  name: 'Government bodies',     count: '180+',    fields: ['Ministry / agency name', 'Mandate & jurisdiction', 'Leadership', 'Publication cadence'] },
      { icon: Crown,     name: 'Semi-government',       count: '90+',     fields: ['Name & parent', 'Sector', 'Ownership structure', 'Leadership'] },
      { icon: Layers,    name: 'Sectors',               count: '12',      fields: ['Taxonomy & sub-sectors', 'Primary regulator', 'Market size', 'Growth velocity'] },
    ],
  },
  {
    num:     '02',
    label:   'People',
    tagline: 'Who runs them.',
    tint:    'rgb(111 207 151)',
    records: [
      { icon: Users,     name: 'People',                count: '1.6M+ (all decision-makers)', fields: ['Name & role', 'Organization & tenure', 'Decision weight', 'Public profile', 'Contact paths'] },
      { icon: Star,      name: 'Public figures',        count: '8,400+',   fields: ['Name & role', 'Public presence', 'Recent appearances', 'Network position'] },
      { icon: Network,   name: 'Networks & relationships', count: '1.4M edges', fields: ['Board overlaps', 'Alumni links', 'Co-investments', 'Family ties'] },
    ],
  },
  {
    num:     '03',
    label:   'Activity',
    tagline: 'What is happening.',
    tint:    'rgb(255 196 99)',
    records: [
      { icon: Briefcase, name: 'Jobs',                  count: '14,800 / mo', fields: ['Title & level', 'Employer & sector', 'Tech stack mentioned', 'Posted date'], live: true },
      { icon: FileText,  name: 'Tenders & RFPs',        count: '420 / mo',    fields: ['Title & issuer', 'Sector', 'Value range', 'Deadline & eligibility'], live: true },
      { icon: Newspaper, name: 'News',                  count: '12,000 / mo', fields: ['Title & source', 'Date', 'Entities mentioned', 'Sentiment & topic'], live: true },
      { icon: Radar,     name: 'Signals',               count: '4,127 / day', fields: ['Kind & source', 'Affected entity', 'Time-stamp', 'Downstream routing'], live: true },
    ],
  },
  {
    num:     '04',
    label:   'Governance',
    tagline: 'The rules &amp; oversight.',
    tint:    'rgb(196 154 255)',
    records: [
      { icon: Scroll,    name: 'Regulations',           count: '3,200+', fields: ['Authority & title', 'Type & effective date', 'Affected sectors', 'Compliance status'] },
      { icon: BadgeCheck,name: 'Licences',              count: '11,400+',fields: ['Type & holder', 'Issuer & validity', 'Status & history'] },
      { icon: Vote,      name: 'Political data',        count: '—',      fields: ['Policy area', 'Public positions', 'Statements', 'Sectoral alignment'] },
      { icon: Landmark,  name: 'Government datasets',   count: '180+',   fields: ['Ministry & publication', 'Dataset & schema', 'Release cadence', 'Last updated'] },
    ],
  },
  {
    num:     '05',
    label:   'The living country',
    tagline: 'The live world Bell records.',
    tint:    'rgb(165 195 255)',
    records: [
      { icon: GitBranch, name: 'Ownership graph',       count: '1.2M edges', fields: ['Nodes & edges', 'Ownership %', 'Ultimate beneficial owner', 'Change history'], live: true },
      { icon: MapPin,    name: 'Geo data',              count: 'every Doha address', fields: ['Lat/lon & address', 'District & area', 'Building type', 'Accessibility'] },
      { icon: Plane,     name: 'Air traffic',           count: 'live feed', fields: ['Flight & airline', 'Origin & destination', 'Time & status', 'Aircraft & cargo class'], live: true },
      { icon: Car,       name: 'Road traffic',          count: 'live feed', fields: ['Road segment', 'Congestion level', 'Incidents', 'Average speed'], live: true },
      { icon: Cloud,     name: 'Weather',               count: 'live feed', fields: ['Temperature & humidity', 'Wind & visibility', 'Alerts', 'Forecast windows'], live: true },
      { icon: UserCheck, name: 'People-activity heat',  count: 'live aggregates', note: 'Anonymized aggregates only — district-level density, no individual tracking.', fields: ['Density per district', 'Time-of-day pattern', 'Day-of-week pattern'], live: true },
    ],
  },
];

function TheRecordTypeTaxonomy() {
  return (
    <section className="relative py-16 md:py-20 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The record type taxonomy
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Five tiers. Twenty-one record types. One graph.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Bell models the country in five tiers, from the
            organizations that exist down to the live world they
            operate in. Every record type below carries the fields
            shown on its card, with full source lineage and
            continuous refresh where the data is live.
          </p>
        </div>

        <div className="space-y-5">
          {TAXONOMY.map((tier, i) => (
            <TaxonomyTierCard key={tier.num} tier={tier} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function TaxonomyTierCard({ tier, index }: { tier: TaxonomyTier; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.5, delay: index * 0.05 }}
      className="rounded-2xl border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
        borderColor: tier.tint.replace('rgb', 'rgba').replace(')', ' / 0.28)'),
        borderTop:   '2px solid ' + tier.tint,
      }}
    >
      {/* Tier header */}
      <div
        className="px-5 md:px-6 py-4 border-b flex items-center gap-4 flex-wrap"
        style={{
          background:  tier.tint.replace('rgb', 'rgba').replace(')', ' / 0.06)'),
          borderColor: tier.tint.replace('rgb', 'rgba').replace(')', ' / 0.18)'),
        }}
      >
        <div className="flex items-baseline gap-3">
          <span
            className="text-[12px] font-mono font-semibold tracking-wider"
            style={{ color: tier.tint }}
          >
            {tier.num}
          </span>
          <div
            className="text-[15px] font-semibold leading-tight"
            style={{ color: tier.tint }}
          >
            {tier.label}
          </div>
          <span
            className="text-[12px] text-text-muted italic leading-tight"
            dangerouslySetInnerHTML={{ __html: tier.tagline }}
          />
        </div>
        <div className="flex-1" />
        <span className="text-[10px] font-mono text-text-dim">
          {tier.records.length} record type{tier.records.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Record-type grid */}
      <div className="p-4 md:p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {tier.records.map((rec) => (
            <RecordTypeCard key={rec.name} record={rec} tierTint={tier.tint} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function RecordTypeCard({ record, tierTint }: { record: RecordType; tierTint: string }) {
  const Icon = record.icon;
  return (
    <div
      className="rounded-xl border border-border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
      }}
    >
      {/* Header */}
      <div className="p-3.5 border-b border-border/70 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0"
            style={{
              background: tierTint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
              color:      tierTint,
            }}
          >
            <Icon size={14} />
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-text leading-tight">
              {record.name}
            </div>
            {record.count && (
              <div className="text-[10.5px] text-text-dim font-mono leading-tight mt-0.5">
                {record.count}
              </div>
            )}
          </div>
        </div>
        {record.live && (
          <span
            className="inline-flex items-center gap-1 text-[8.5px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap shrink-0"
            style={{
              color:       'rgb(111 207 151)',
              background:  'rgba(111,207,151,0.10)',
              borderColor: 'rgba(111,207,151,0.30)',
            }}
          >
            <span
              className="inline-block w-1 h-1 rounded-full"
              style={{ background: 'rgb(111 207 151)', boxShadow: '0 0 4px rgb(111 207 151)' }}
            />
            Live
          </span>
        )}
      </div>

      {/* Fields */}
      <div className="p-3.5 flex-1 flex flex-col">
        <div className="text-[9.5px] font-mono uppercase tracking-wider text-text-dim mb-1.5">
          Fields
        </div>
        <ul className="space-y-1">
          {record.fields.map((f) => (
            <li
              key={f}
              className="flex items-start gap-1.5 text-[11.5px] text-text-muted leading-snug"
            >
              <span
                className="mt-1.5 shrink-0 w-1 h-1 rounded-full"
                style={{ background: tierTint }}
                aria-hidden="true"
              />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        {record.note && (
          <div className="mt-3 pt-3 border-t border-border/40 text-[10.5px] text-text-dim italic leading-snug">
            {record.note}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. OneRecordFullyUnpacked — Doha Health Network with every field group
//    Anchors the "500+ datapoints per record" claim visibly.
// ───────────────────────────────────────────────────────────────────────────

type FieldGroup = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  tint:    string;
  count:   number;
  fields:  string[];
};

const RECORD_FIELD_GROUPS: FieldGroup[] = [
  {
    icon: Building2, label: 'Identity', tint: 'rgb(91 140 255)', count: 28,
    fields: [
      'Trade name (Arabic + English)', 'Legal name', 'MoCI commercial registration',
      'QFC licence number', 'Other registrations & licences', 'Tax registration',
      'Founded date', 'Trading status', 'Aliases & historical names',
    ],
  },
  {
    icon: MapPin, label: 'Location & footprint', tint: 'rgb(165 195 255)', count: 34,
    fields: [
      'HQ address & district', 'Geo coordinates', 'Building details',
      'Branch locations', 'Geographic catchment', 'Accessibility & transit',
    ],
  },
  {
    icon: Crown, label: 'Ownership cap table', tint: 'rgb(255 196 99)', count: 42,
    fields: [
      'Owners & percentage held', 'Parent entity', 'Subsidiaries',
      'Family-office links', 'Ultimate beneficial owner', 'Historical changes',
      'Pledged shares', 'Voting structure',
    ],
  },
  {
    icon: Users, label: 'Decision unit', tint: 'rgb(111 207 151)', count: 56,
    fields: [
      'CEO, CFO, CTO, COO', 'Board members & tenure', 'Department heads',
      'Decision-weight scores', 'Tenure & prior roles', 'Public-profile signals',
      'Contact paths', 'Network connections',
    ],
  },
  {
    icon: BarChart3, label: 'Financials & scale', tint: 'rgb(196 154 255)', count: 38,
    fields: [
      'Revenue band', 'Employee count (current + trend)', 'Growth rate',
      'Funding history', 'Reported assets', 'Sector benchmarks', 'Multi-year history',
    ],
  },
  {
    icon: Briefcase, label: 'Hiring & jobs', tint: 'rgb(255 159 180)', count: 47,
    fields: [
      'Open roles', 'Hiring velocity', 'Technologies hiring for',
      'Hiring patterns by function', 'Recent leadership hires', 'Departure signals',
    ],
  },
  {
    icon: Cog, label: 'Tech stack', tint: 'rgb(91 140 255)', count: 31,
    fields: [
      'Software in use (vendor signals)', 'Cloud / infra footprint',
      'Migration signals', 'Integration partners', 'Public-API usage',
    ],
  },
  {
    icon: Radar, label: 'Live signals', tint: 'rgb(255 196 99)', count: 64,
    fields: [
      'Filings & regulatory events', 'Leadership changes', 'Expansion / capacity',
      'RFP / tender activity', 'Funding events', 'Partnership announcements',
      'News mentions', 'Sentiment trail',
    ],
  },
  {
    icon: ShieldCheck, label: 'Regulatory & compliance', tint: 'rgb(196 154 255)', count: 39,
    fields: [
      'Sector licences held', 'Compliance status', 'Court / tribunal record',
      'Sanctions / PEP screening', 'Audit findings', 'Required filings',
    ],
  },
  {
    icon: Network, label: 'Graph relationships', tint: 'rgb(165 195 255)', count: 52,
    fields: [
      'Customer relationships', 'Supplier chain', 'Partnerships & JVs',
      'Competitor set', 'Board overlaps', 'Alumni connections',
      'Family-office co-investments',
    ],
  },
  {
    icon: BadgeAlert, label: 'Intelligence overlay', tint: 'rgb(111 207 151)', count: 45,
    fields: [
      'Buyer-intent score', 'Churn-risk score', 'Sector-heat alignment',
      'ICP fit per workspace', 'Bella recommendations',
      'Forecast probability bundles',
    ],
  },
  {
    icon: Activity, label: 'Provenance & lineage', tint: 'rgb(232 142 168)', count: 32,
    fields: [
      'Source per field', 'First-seen timestamp', 'Last-verified timestamp',
      'Agreeing-source count', 'Dissenting-source count',
      'Update history & replay',
    ],
  },
];

function OneRecordFullyUnpacked() {
  const total = RECORD_FIELD_GROUPS.reduce((acc, g) => acc + g.count, 0);
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            One record, fully unpacked
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            500+ datapoints, on every record.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            What &lsquo;500+ datapoints per record&rsquo; actually
            looks like. Below is Doha Health Network &mdash; one
            Qatari company, twelve field groups, every datapoint
            tracked, verified, and updated continuously by the
            pipeline.
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
                className="inline-flex items-center justify-center w-11 h-11 rounded-lg shrink-0 text-text"
                style={{
                  background: 'linear-gradient(135deg, rgb(91 140 255) 0%, rgb(165 195 255) 100%)',
                  boxShadow:  '0 8px 22px -6px rgba(91,140,255,0.42)',
                }}
              >
                <Building2 size={19} />
              </span>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold text-text leading-tight">
                  Doha Health Network
                </div>
                <div className="text-[11.5px] text-text-dim mt-0.5">
                  Healthcare &middot; private clinic operator &middot; 380 employees
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border whitespace-nowrap"
                style={{
                  color:       'rgb(111 207 151)',
                  background:  'rgba(111,207,151,0.10)',
                  borderColor: 'rgba(111,207,151,0.30)',
                }}
              >
                <Check size={9} />
                Live record
              </span>
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold tracking-wider px-2.5 py-1 rounded-full border whitespace-nowrap"
                style={{
                  color:       'rgb(255 196 99)',
                  background:  'rgba(255,196,99,0.10)',
                  borderColor: 'rgba(255,196,99,0.32)',
                }}
              >
                {total}+ datapoints
              </span>
            </div>
          </div>

          {/* Field-group grid */}
          <div className="p-5 md:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {RECORD_FIELD_GROUPS.map((group, i) => (
                <FieldGroupCard key={group.label} group={group} index={i} />
              ))}
            </div>
          </div>

          {/* Footer */}
          <div
            className="px-6 py-3 border-t border-border flex items-center justify-between gap-3 text-[11px]"
            style={{ background: 'rgba(255,255,255,0.015)' }}
          >
            <span className="text-text-dim font-mono">
              Total: {total}+ datapoints &middot; every one tracked,
              verified, and refreshed continuously
            </span>
            <span className="text-text-muted">
              Multiply by 76,000+ actively trading Qatari companies (191,000+ in total).
            </span>
          </div>
        </motion.div>

      </div>
    </section>
  );
}

function FieldGroupCard({ group, index }: { group: FieldGroup; index: number }) {
  const Icon = group.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: index * 0.03 }}
      className="rounded-xl border border-border overflow-hidden flex flex-col"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
      }}
    >
      <div className="p-3.5 border-b border-border/70 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="inline-flex items-center justify-center w-8 h-8 rounded-md shrink-0"
            style={{
              background: group.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
              color:      group.tint,
            }}
          >
            <Icon size={14} />
          </span>
          <div className="text-[12.5px] font-semibold text-text leading-tight truncate">
            {group.label}
          </div>
        </div>
        <span
          className="text-[10.5px] font-mono font-semibold tabular-nums shrink-0"
          style={{ color: group.tint }}
        >
          {group.count} fields
        </span>
      </div>

      <ul className="p-3.5 space-y-1 flex-1">
        {group.fields.map((f) => (
          <li
            key={f}
            className="flex items-start gap-1.5 text-[11px] text-text-muted leading-snug"
          >
            <span
              className="mt-1.5 shrink-0 w-1 h-1 rounded-full"
              style={{ background: group.tint }}
              aria-hidden="true"
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. TheLivingCountry — special focus on the live-environment layer
// ───────────────────────────────────────────────────────────────────────────

type LivingFacet = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  body:    string;
  example: string;
  tint:    string;
};

const LIVING_FACETS: LivingFacet[] = [
  {
    icon:    Plane,
    label:   'Air traffic',
    body:    'Every commercial flight in and out of Qatar, live &mdash; airline, aircraft, route, time, status, cargo class.',
    example: 'Flight delays at Hamad International, by carrier, on a 60-second refresh.',
    tint:    'rgb(91 140 255)',
  },
  {
    icon:    Car,
    label:   'Road traffic',
    body:    'Live congestion across major Doha corridors and ring roads. Incidents, average speeds, segment-level health.',
    example: 'C-Ring at rush hour, every minute. Routes to Lusail, alternatives suggested.',
    tint:    'rgb(255 196 99)',
  },
  {
    icon:    Cloud,
    label:   'Weather',
    body:    'Live weather across Qatar &mdash; temperature, humidity, wind, visibility, dust, alerts, multi-window forecasts.',
    example: 'Visibility drops below 2 km in Mesaieed &mdash; operational signal for logistics.',
    tint:    'rgb(165 195 255)',
  },
  {
    icon:    UserCheck,
    label:   'People-activity heat',
    body:    'Anonymized aggregate density of where people are across Doha, by district and time. No individual tracking, no personal identifiers.',
    example: 'West Bay foot-traffic patterns by hour, day of week, season.',
    tint:    'rgb(111 207 151)',
  },
  {
    icon:    MapPin,
    label:   'Geo & address graph',
    body:    'Every Doha address, every building, every district resolved to coordinates &mdash; cross-referenced with the company graph.',
    example: 'Cluster the 7 healthcare providers in 4 km² around Hamad. Render on the map.',
    tint:    'rgb(196 154 255)',
  },
  {
    icon:    GitBranch,
    label:   'Live ownership graph',
    body:    'Cap tables, parent-subsidiary edges, family-office holdings &mdash; refreshed as filings and statements land.',
    example: 'The family-office LP&apos;s liquidity preference announcement &mdash; on the graph 6 minutes after disclosure.',
    tint:    'rgb(232 142 168)',
  },
];

function TheLivingCountry() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            The living country layer
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Not just records. The world they operate in.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Most data products stop at the entity. Bell goes one step
            further &mdash; capturing the live environment those
            entities operate in. Air, road, weather, people-density,
            geo, ownership: the moving picture of Qatar, recorded as
            structured data alongside everything else.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {LIVING_FACETS.map((facet, i) => (
            <LivingFacetCard key={facet.label} facet={facet} index={i} />
          ))}
        </div>

        {/* Privacy footnote */}
        <div className="mt-6 max-w-3xl mx-auto text-center text-[12px] text-text-dim leading-relaxed flex items-center justify-center gap-2 flex-wrap">
          <Lock size={11} className="text-accent-bright" />
          <span>
            People-activity is captured as district-level anonymous
            aggregates only &mdash; no individual identifiers, no
            personal data, no surveillance.
            {' '}
            <Link href="/data/trust" className="text-accent-bright hover:text-text transition-colors underline decoration-accent-bright/30 underline-offset-2">
              Read more about how Bell handles privacy &rarr;
            </Link>
          </span>
        </div>

      </div>
    </section>
  );
}

function LivingFacetCard({ facet, index }: { facet: LivingFacet; index: number }) {
  const Icon = facet.icon;
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
        <div className="flex items-center justify-between">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg"
            style={{
              background: facet.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
              color:      facet.tint,
            }}
          >
            <Icon size={17} />
          </span>
          <span
            className="inline-flex items-center gap-1 text-[8.5px] font-mono font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full border whitespace-nowrap"
            style={{
              color:       'rgb(111 207 151)',
              background:  'rgba(111,207,151,0.10)',
              borderColor: 'rgba(111,207,151,0.30)',
            }}
          >
            <span
              className="inline-block w-1 h-1 rounded-full"
              style={{ background: 'rgb(111 207 151)', boxShadow: '0 0 4px rgb(111 207 151)' }}
            />
            Live
          </span>
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-text leading-snug">
            {facet.label}
          </h3>
          <p
            className="mt-1 text-[12.5px] text-text-muted leading-relaxed"
            dangerouslySetInnerHTML={{ __html: facet.body }}
          />
        </div>
      </div>
      <div
        className="px-5 py-3 border-t border-border/70 text-[11.5px] text-text-dim italic leading-snug"
        style={{ background: 'rgba(255,255,255,0.015)' }}
        dangerouslySetInnerHTML={{ __html: facet.example }}
      />
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. WhereTheDataComesFrom — general source classes (no vendor names)
// ───────────────────────────────────────────────────────────────────────────

type SourceClass = {
  icon:    React.ComponentType<{ size?: number | string }>;
  label:   string;
  body:    string;
  examples:string;
  tint:    string;
};

const SOURCE_CLASSES: SourceClass[] = [
  {
    icon:    Landmark,
    label:   'Public regulators',
    body:    'Every authoritative regulator in Qatar that publishes machine-readable records or bulletins.',
    examples:'MoCI, QFC, QCB, QFMA, MoPH, MoFA, GTA, MoI, judiciary &amp; tribunals.',
    tint:    'rgb(91 140 255)',
  },
  {
    icon:    Newspaper,
    label:   'Press &amp; media archive',
    body:    'Continuous ingestion of Qatari and GCC press coverage &mdash; long-form, daily, and live.',
    examples:'Gulf Times, Peninsula, Tribune, Al-Sharq, plus regional and international coverage of Qatar.',
    tint:    'rgb(255 196 99)',
  },
  {
    icon:    Handshake,
    label:   'Local partnerships',
    body:    'Trusted local partnerships in sectors where partnership unlocks granularity public sources can&apos;t reach.',
    examples:'Sector-specific data partners with whom Bell has formal agreements; jointly maintained, audit-trail attached.',
    tint:    'rgb(196 154 255)',
  },
  {
    icon:    Cog,
    label:   'Bell&apos;s own collection',
    body:    'Proprietary collection systems Bell designed, built, and operates &mdash; running on Bell-owned servers in Qatar.',
    examples:'No off-the-shelf scrapers. No licensed third-party datasets. Software Bell owns end to end.',
    tint:    'rgb(111 207 151)',
  },
  {
    icon:    BookOpen,
    label:   'Academic &amp; policy',
    body:    'Qatari and regional think-tank publications, academic literature, white papers, and policy analyses.',
    examples:'Education City research, regional policy institutes, multilateral organization reports.',
    tint:    'rgb(165 195 255)',
  },
  {
    icon:    Globe,
    label:   'Open international datasets',
    body:    'Public international datasets relevant to Qatar &mdash; trade flows, sanctions lists, macro indicators, transport feeds.',
    examples:'Official international body publications, treaty data, cross-border trade statistics.',
    tint:    'rgb(232 142 168)',
  },
];

function WhereTheDataComesFrom() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Where the data comes from
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Six source classes. One graph.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Coverage at this scale doesn&apos;t come from one place.
            Bell pulls from six distinct source classes, weighs them
            against each other, and reconciles the result into a
            single canonical record per entity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {SOURCE_CLASSES.map((src, i) => (
            <SourceClassCard key={src.label} src={src} index={i} />
          ))}
        </div>

      </div>
    </section>
  );
}

function SourceClassCard({ src, index }: { src: SourceClass; index: number }) {
  const Icon = src.icon;
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
            background: src.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
            color:      src.tint,
          }}
        >
          <Icon size={17} />
        </span>
        <div>
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{ color: src.tint }}
            dangerouslySetInnerHTML={{ __html: src.label }}
          />
          <p
            className="mt-1 text-[12.5px] text-text-muted leading-relaxed"
            dangerouslySetInnerHTML={{ __html: src.body }}
          />
        </div>
      </div>
      <div
        className="px-5 py-3 border-t border-border/70 text-[11px] text-text-dim italic leading-snug"
        style={{ background: 'rgba(255,255,255,0.015)' }}
        dangerouslySetInnerHTML={{ __html: src.examples }}
      />
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. ConnectedToPlatform — where records are consumed
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
    body:  "Every record above IS a CRM record. Open the workspace and the 21 record types are already there &mdash; queryable, filterable, attached to your accounts.",
    tint:  'rgb(91 140 255)',
  },
  {
    icon:  MapIcon,
    label: 'Map',
    href:  '/platform/map',
    body:  "Coverage rendered geographically. Every record with coordinates becomes a node on Doha; the live country layer renders as overlays.",
    tint:  'rgb(111 207 151)',
  },
  {
    icon:  Radar,
    label: 'Signals & Insights',
    href:  '/platform/signals-and-insights',
    body:  "Signals attach to records as they land. The activity tier of the taxonomy &mdash; jobs, tenders, news &mdash; flows into Signals continuously.",
    tint:  'rgb(255 196 99)',
  },
  {
    icon:  Crosshair,
    label: 'Buyer Intent',
    href:  '/platform/buyer-intent',
    body:  "Intent recognition reads the 500+ datapoints on each record. The intelligence overlay group is computed against your ICP rules.",
    tint:  'rgb(255 159 180)',
  },
  {
    icon:  BrainCircuit,
    label: 'Prediction Engine',
    href:  '/platform/prediction-engine',
    body:  "Forecasts read across record types, sector aggregates, and the live country layer. Coverage is the surface; Prediction reads the patterns.",
    tint:  'rgb(196 154 255)',
  },
];

function ConnectedToPlatform() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-4">
            Where records are consumed
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Every platform surface drinks from this coverage.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            The 21 record types and 500+ fields per record don&apos;t
            sit in a vault. They surface in the workspace as the
            substrate every platform tool runs on.
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
                You&apos;ve seen what Bell holds
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Now query it.
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Activation runs from 1 to 24 hours from your access
                request. The 21 record types open on your workspace
                the same day.
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
    icon:    Workflow,
    label:   'Pipeline',
    href:    '/data/pipeline',
    tagline: 'The machine behind the data.',
    body:    'A six-stage proprietary pipeline that ingests, cleans, verifies, deduplicates, enriches, and tracks every record live &mdash; on Bell-owned infrastructure.',
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
            Coverage is one of four.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            You&apos;ve just read what Bell holds. The other three
            Data surfaces explain how it gets built, why it stays
            alive, and how it&apos;s protected.
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
// 10. ThreeReader — analyst / data buyer / partner
// ───────────────────────────────────────────────────────────────────────────

const COVERAGE_READERS = [
  {
    icon:  Eye,
    label: 'For the analyst',
    body:  "Twenty-one record types you can query, cross-reference, and pull citations from. Every field has its source, every datapoint has its last-verified timestamp. The country, in a database you can interrogate.",
  },
  {
    icon:  BarChart3,
    label: 'For the data buyer',
    body:  "191,000+ Qatari companies (76,000+ actively trading). 1.6M+ people in the graph, all of them named decision-makers. 500+ datapoints on every record. 1.2 billion datapoints scanned and updated every day. Coverage you can defend in procurement.",
  },
  {
    icon:  Handshake,
    label: 'For the partner / investor',
    body:  "Bell hasn&apos;t licensed Qatar &mdash; Bell has built it. The data layer is owned, hosted in-country, and refreshed continuously by an infrastructure stack Bell controls end to end. A defensible moat.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/40">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same coverage
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bell.qa changes when the country is a database.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {COVERAGE_READERS.map((r, i) => {
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
          The country, in one database.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Organizations. People. Activity. Governance. The living
          country. Twenty-one record types, 500+ datapoints each, 1.2
          billion datapoints kept current every single day &mdash;
          all on one graph, all cited, all yours to query.
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

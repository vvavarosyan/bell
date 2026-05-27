'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Radar, Scroll, Newspaper, Linkedin, Building, Gavel,
  BadgeCheck, GraduationCap, ShieldCheck, FileText,
  TrendingUp, Sparkles, Users, Bot, ArrowRight,
  Flame, MapPin,
} from 'lucide-react';

/**
 * Live streaming signal feed for /platform/signals-and-insights.
 *
 * Every ~3 seconds a new signal is prepended to the top of the visible
 * stack and the others slide down via framer-motion layout animation.
 * The list caps at 8 visible — oldest signals drop off the bottom.
 *
 * Each signal's age stamp updates every second so the visitor sees
 * "just now → 4s ago → 12s ago → 1m ago" tick by in real time.
 *
 * Signal templates below are illustrative — when wired to the real
 * Bell.qa data API, swap MAP_TEMPLATES for the live stream.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type SignalKind =
  | 'licence' | 'leadership' | 'funding' | 'expansion'
  | 'rfp' | 'partnership' | 'regulatory';

type SignalSource =
  | 'moci' | 'qfc' | 'qcb' | 'qfma' | 'moph'
  | 'press' | 'linkedin' | 'tenders' | 'industry-report'
  | 'court' | 'academic';

type SignalTemplate = {
  kind:     SignalKind;
  source:   SignalSource;
  body:     string;
  company:  string;
  routedTo: string;
};

type LiveSignal = SignalTemplate & {
  id:      number;
  addedAt: number;
};

// ── Static config ──────────────────────────────────────────────────────────

const KIND_META: Record<SignalKind, { label: string; color: string }> = {
  licence:     { label: 'LICENCE',     color: 'rgb(255 159 180)' },
  leadership:  { label: 'LEADERSHIP',  color: 'rgb(111 207 151)' },
  funding:     { label: 'FUNDING',     color: 'rgb(255 196 99)'  },
  expansion:   { label: 'EXPANSION',   color: 'rgb(91 140 255)'  },
  rfp:         { label: 'RFP',         color: 'rgb(196 154 255)' },
  partnership: { label: 'PARTNERSHIP', color: 'rgb(165 195 255)' },
  regulatory:  { label: 'REGULATORY',  color: 'rgb(232 142 168)' },
};

const SOURCE_META: Record<SignalSource, { label: string; icon: React.ComponentType<{ size?: number | string }> }> = {
  moci:             { label: 'MoCI',            icon: Scroll       },
  qfc:              { label: 'QFC',             icon: BadgeCheck   },
  qcb:              { label: 'QCB',             icon: Building     },
  qfma:             { label: 'QFMA',            icon: ShieldCheck  },
  moph:             { label: 'MoPH',            icon: ShieldCheck  },
  press:            { label: 'Press archive',   icon: Newspaper    },
  linkedin:         { label: 'LinkedIn',        icon: Linkedin     },
  tenders:          { label: 'Tender portal',   icon: FileText     },
  'industry-report':{ label: 'Industry report', icon: TrendingUp   },
  court:            { label: 'Court record',    icon: Gavel        },
  academic:         { label: 'Academic paper',  icon: GraduationCap},
};

// 25 templates covering the kind × source matrix. Drawn from at random
// each tick so the feed feels varied but reproducible.
const TEMPLATES: SignalTemplate[] = [
  { kind:'licence',     source:'qfc',              body:'New QFC licence issued',                               company:'Tayyar Fintech',          routedTo:'Maryam (BD) + Hessa (Marketing)' },
  { kind:'leadership',  source:'linkedin',         body:'New CFO appointed at Doha Health Network',             company:'Doha Health Network',     routedTo:'Noora (Sales) + Tariq (BD)'      },
  { kind:'funding',     source:'press',            body:'Mwani-backed logistics startup closed QAR 80M Series B',company:'Q-Logistics',             routedTo:'Hessa (Marketing)'                },
  { kind:'expansion',   source:'press',            body:'Capacity expansion announced — new clinic in West Bay',company:'The View Hospital',       routedTo:'Noora (Sales)'                    },
  { kind:'rfp',         source:'tenders',          body:'Hospital chain sourcing ERP vendor',                   company:'Hamad Medical Corp.',     routedTo:'Yousef (Sales lead)'              },
  { kind:'partnership', source:'press',            body:'University partners with fintech accelerator',         company:'Qatar University',        routedTo:'Sami (GTM)'                       },
  { kind:'regulatory',  source:'qfma',             body:'QFMA published new ESG disclosure circular',           company:'All listed issuers',      routedTo:'Fatima (Research)'                },
  { kind:'licence',     source:'moci',             body:'MoCI commercial registration granted',                 company:'Almuftah Group (logistics)', routedTo:'Mansoor (Sales)'              },
  { kind:'funding',     source:'press',            body:'Energy startup secured QAR 60M growth round',          company:'Ras Laffan Energy Svcs.', routedTo:'Hessa (Marketing) + Yousef'       },
  { kind:'leadership',  source:'linkedin',         body:'New CEO appointed',                                    company:'Almuftah Group',          routedTo:'Tariq (BD)'                       },
  { kind:'expansion',   source:'press',            body:'Retail group opens 3rd Al Wakra store',               company:'Sulaiman Retail',         routedTo:'Hessa (Marketing)'                },
  { kind:'regulatory',  source:'qcb',              body:'QCB issued new circular on digital-banking sandbox',   company:'All banks',               routedTo:'Sami (GTM) + Fatima (Research)'   },
  { kind:'rfp',         source:'tenders',          body:'Sports body sourcing media-rights agency',             company:'Aspire Zone Foundation',  routedTo:'Hessa (Marketing)'                },
  { kind:'partnership', source:'press',            body:'Cross-border cargo JV signed',                          company:'Qatar Aviation Services', routedTo:'Sami (GTM)'                       },
  { kind:'licence',     source:'moph',             body:'Healthcare licence renewed',                            company:'Aster Clinics Qatar',     routedTo:'Noora (Sales)'                    },
  { kind:'funding',     source:'press',            body:'Fintech raises QAR 9M seed round',                     company:'Hayya Tech',              routedTo:'Tariq (BD)'                       },
  { kind:'leadership',  source:'linkedin',         body:'Chief Investment Officer joins',                        company:'Q-Holdings family office',routedTo:'Maryam (BD)'                      },
  { kind:'expansion',   source:'industry-report',  body:'Logistics co. opens northern hub at Al Khor',          company:'GWC Group',               routedTo:'Mansoor (Sales)'                  },
  { kind:'regulatory',  source:'moph',             body:'New private-clinic licensing guideline published',     company:'Healthcare operators',    routedTo:'Fatima (Research)'                },
  { kind:'rfp',         source:'tenders',          body:'Ministry sourcing cybersecurity stack',                company:'Ministry of Interior',    routedTo:'Yousef (Sales) + Sami (GTM)'      },
  { kind:'partnership', source:'press',            body:'Strategic MoU signed for AI infrastructure',            company:'QatarEnergy',             routedTo:'Tariq (BD)'                       },
  { kind:'licence',     source:'qfc',              body:'New QFC payments-infra licence issued',                company:'Tasdeed Holdings',        routedTo:'Maryam (BD)'                      },
  { kind:'leadership',  source:'press',            body:'CTO transition announced',                              company:'Doha Bank',               routedTo:'Reem (Sales)'                     },
  { kind:'expansion',   source:'press',            body:'Doha to Dukhan expansion — third regional office',     company:'Tayyar Fintech',          routedTo:'Sami (GTM)'                       },
  { kind:'funding',     source:'academic',         body:'Government-backed grant awarded',                       company:'Education City spinout',  routedTo:'Fatima (Research)'                },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function pickRandomTemplate(): SignalTemplate {
  return TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
}

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 3)   return 'just now';
  if (s < 60)  return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60)  return m + 'm ago';
  const h = Math.floor(m / 60);
  return h + 'h ago';
}

// ── Component ──────────────────────────────────────────────────────────────

const MAX_VISIBLE   = 8;
const ADD_INTERVAL  = 3200;  // ms between new signals
const TICK_INTERVAL = 1000;  // ms between age-stamp updates

export function SignalsPageLiveFeed() {
  const [signals, setSignals] = useState<LiveSignal[]>(() => {
    // Seed with 4 signals so the feed isn't empty on first paint.
    const now = Date.now();
    return [
      { ...TEMPLATES[0], id: 1, addedAt: now -  1500 },
      { ...TEMPLATES[1], id: 2, addedAt: now -  8000 },
      { ...TEMPLATES[2], id: 3, addedAt: now - 22000 },
      { ...TEMPLATES[3], id: 4, addedAt: now - 41000 },
    ];
  });
  const [, setNowTick] = useState(0);
  const idCounter = useRef(5);

  // Add a new signal every ADD_INTERVAL ms
  useEffect(() => {
    const id = window.setInterval(() => {
      setSignals((current) => {
        const template = pickRandomTemplate();
        const next: LiveSignal = {
          ...template,
          id:      idCounter.current++,
          addedAt: Date.now(),
        };
        const updated = [next, ...current].slice(0, MAX_VISIBLE);
        return updated;
      });
    }, ADD_INTERVAL);
    return () => window.clearInterval(id);
  }, []);

  // Tick every second to refresh "Xs ago" labels
  useEffect(() => {
    const id = window.setInterval(() => setNowTick((t) => t + 1), TICK_INTERVAL);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div
      className="rounded-2xl border border-border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
      }}
    >
      {/* Header strip */}
      <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <span className="relative inline-flex items-center justify-center w-2 h-2" aria-hidden="true">
          <span className="absolute inline-flex w-full h-full rounded-full bg-accent-bright opacity-50 animate-ping" />
          <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-accent-bright" />
        </span>
        <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim">
          Live signal stream &middot; Qatar
        </span>
        <span className="text-text-dim text-[11px]">&middot;</span>
        <span className="text-[10.5px] text-text-dim">
          new signal every ~3 seconds &middot; showing the last 8
        </span>
        <div className="flex-1" />
        <span className="text-[10px] font-mono text-text-dim flex items-center gap-1.5">
          <Bot size={10} className="text-[rgb(196_154_255)]" />
          routed by Bella
        </span>
      </div>

      {/* Feed list */}
      <div className="p-3 md:p-4">
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {signals.map((s) => (
              <motion.li
                key={s.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 20, height: 0, marginTop: 0, marginBottom: 0 }}
                transition={{
                  layout:  { duration: 0.4, ease: 'easeOut' },
                  opacity: { duration: 0.3 },
                  y:       { duration: 0.35, ease: 'easeOut' },
                  scale:   { duration: 0.3 },
                }}
              >
                <FeedRow signal={s} />
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function FeedRow({ signal }: { signal: LiveSignal }) {
  const kind   = KIND_META[signal.kind];
  const source = SOURCE_META[signal.source];
  const SrcIcon = source.icon;
  const age = formatAge(Date.now() - signal.addedAt);

  return (
    <div
      className="rounded-lg border border-border px-3 py-2.5 grid grid-cols-12 gap-3 items-center"
      style={{
        background: 'rgba(255,255,255,0.015)',
        borderLeft: '2px solid ' + kind.color,
      }}
    >
      {/* Source + kind + age — left */}
      <div className="col-span-12 md:col-span-3 flex items-center gap-2 min-w-0">
        <span
          className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0"
          style={{ background: 'rgba(165,195,255,0.10)', color: 'rgb(165 195 255)' }}
        >
          <SrcIcon size={12} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="text-[9.5px] font-mono font-semibold uppercase tracking-wider leading-tight truncate"
            style={{ color: kind.color }}
          >
            {kind.label}
          </div>
          <div className="text-[10px] text-text-dim font-mono leading-tight truncate">
            {source.label} &middot; {age}
          </div>
        </div>
      </div>

      {/* Body + company — middle */}
      <div className="col-span-12 md:col-span-6 min-w-0">
        <div className="text-[12.5px] text-text leading-snug">
          {signal.body}
        </div>
        <div className="mt-0.5 text-[11px] text-text-muted leading-tight flex items-center gap-1.5">
          <MapPin size={9} className="text-text-dim shrink-0" />
          <span className="truncate">{signal.company}</span>
        </div>
      </div>

      {/* Routed-to — right */}
      <div className="col-span-12 md:col-span-3 flex items-center justify-end gap-1.5">
        <span
          className="inline-flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded-full border whitespace-nowrap"
          style={{
            color:       'rgb(196 154 255)',
            background:  'rgba(196,154,255,0.08)',
            borderColor: 'rgba(196,154,255,0.28)',
          }}
        >
          <Users size={9} />
          <span className="text-text">{signal.routedTo}</span>
        </span>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, FileText, HelpCircle,
  Wrench,   PenLine,  Newspaper,
  Users,    Compass,  LifeBuoy,
  Bot,      Workflow, Inbox,
  Plug,     Layers,   Database,
  Activity, Landmark, CreditCard,
  Target,   Megaphone, Handshake, Microscope,
  Rocket,   Users2,    Map,        Radar,     BrainCircuit,
  Crosshair, ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import type { MegaColumn, MegaFooter } from '@/content/navigation';

/**
 * Big megamenu panel — dark glassmorphism, anchored under a header
 * trigger. 3 columns × N items, each item is a lucide icon in a tinted
 * disc + title + 1-line description + SOON badge. Reused across multiple
 * top-level nav items (Platform, Resources, …) — each instance gets its
 * own columns and optional footer.
 *
 * Behaviour:
 *   - Renders inside an AnimatePresence so it fades + slides in/out
 *   - Centered under the trigger; positioned absolutely just below the nav
 *   - Sticky-nav-friendly: parent passes `open` state, parent handles all
 *     hover/click open-close logic (so the trigger LI and the panel can
 *     share an enter/leave boundary without flicker)
 */

/** Map the string `icon` from navigation.ts → an actual Lucide component.
 *  Add new keys here when navigation.ts introduces a new icon string. */
const MEGA_ICONS: Record<string, React.ComponentType<{ size?: number | string }>> = {
  // Resources megamenu icons
  'book-open':   BookOpen,
  'file-text':   FileText,
  'help-circle': HelpCircle,
  'wrench':      Wrench,
  'pen-line':    PenLine,
  'newspaper':   Newspaper,
  'users':       Users,
  'compass':     Compass,
  'life-buoy':   LifeBuoy,
  // Platform megamenu icons
  'bot':           Bot,
  'workflow':      Workflow,
  'inbox':         Inbox,
  'plug':          Plug,
  'layers':        Layers,
  'database':      Database,
  'activity':      Activity,
  'landmark':      Landmark,
  'credit-card':   CreditCard,
  'target':        Target,        // Sales
  'megaphone':     Megaphone,     // Marketing
  'handshake':     Handshake,     // Business Development
  'microscope':    Microscope,    // Research
  'rocket':        Rocket,        // GTM
  'users-2':       Users2,        // Team
  'map':           Map,           // Map
  'radar':         Radar,         // Signals & Insights
  'crosshair':     Crosshair,     // Buyer Intent
  'brain-circuit': BrainCircuit,  // Prediction Engine
  'shield-check':  ShieldCheck,   // Data · Trust
};

/** Per-column accent color so the icons feel themed by section. */
const COLUMN_TINT: Record<string, string> = {
  // Resources columns
  'Documentation':         'rgb(91 140 255)',     // brand blue
  'Tools & Insights':      'rgb(196 154 255)',    // violet
  'Company':               'rgb(111 207 151)',    // green
  // Platform columns
  'Functions':             'rgb(91 140 255)',     // brand blue
  'Workspace':             'rgb(196 154 255)',    // violet
  'Intelligence':          'rgb(111 207 151)',    // green
  // Data megamenu column
  'The data':              'rgb(255 196 99)',     // amber
};

type Props = {
  open:    boolean;
  columns: MegaColumn[];
  /** Accessibility label for the panel — usually the trigger label. */
  ariaLabel?: string;
  /** Optional footer band — short note + optional CTA on the right. */
  footer?: MegaFooter;
  onRequestClose: () => void;
  /** Forwarded to the outer panel so the parent can keep the hover boundary
      open when the user moves their cursor from the trigger into the panel. */
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

export function Megamenu({
  open, columns, ariaLabel = 'Menu', footer,
  onRequestClose, onMouseEnter, onMouseLeave,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onRequestClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onRequestClose]);

  // Total horizontal "slots" the megamenu takes. Each column is 1 slot by
  // default; a `wide` column takes 2 (its items render in a 2-column
  // subgrid). Drives both the outer grid template and the panel width.
  const totalSlots = columns.reduce((sum, c) => sum + (c.wide ? 2 : 1), 0);
  // Width per slot (px) — tuned so a 3-slot megamenu lands at the
  // historical Resources width (~880px) and 4-slot lands at ~1160px.
  const SLOT_PX  = 280;
  const PADDING  = 48;
  const panelMaxPx = totalSlots * SLOT_PX + PADDING;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={panelRef}
          // IMPORTANT: framer-motion sets `transform` inline when animating.
          // Tailwind's `-translate-x-1/2` was being overwritten by its own
          // transform, which pushed the panel off-center to the right.
          // Letting framer-motion own BOTH the X centering (`x: '-50%'`,
          // constant — doesn't animate) and the Y fade (`y: -8 → 0`) means
          // the transform never gets clobbered.
          initial={{ opacity: 0, x: '-50%', y: -8 }}
          animate={{ opacity: 1, x: '-50%', y: 0  }}
          exit={{    opacity: 0, x: '-50%', y: -8 }}
          transition={{ duration: 0.18, ease: [0.22, 0.61, 0.36, 1] }}
          className="absolute left-1/2 top-full mt-1 z-50"
          // Width grows with the number of slots. Capped at viewport - 32px
          // so it never overflows the screen on smaller laptops.
          style={{ width: `min(${panelMaxPx}px, calc(100vw - 32px))` }}
          role="menu"
          aria-label={ariaLabel}
          onMouseEnter={onMouseEnter}
          onMouseLeave={onMouseLeave}
        >
          {/* Outer glow shell */}
          <div
            className="relative rounded-2xl border border-border overflow-hidden"
            style={{
              background:     'rgba(13, 18, 35, 0.92)',
              backdropFilter: 'blur(18px) saturate(160%)',
              WebkitBackdropFilter: 'blur(18px) saturate(160%)',
              boxShadow:      '0 30px 80px -20px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset',
            }}
          >
            {/* Top accent glow */}
            <div
              aria-hidden="true"
              className="absolute -top-12 left-1/2 -translate-x-1/2 pointer-events-none"
              style={{
                width: '60%',
                height: 120,
                background: 'radial-gradient(ellipse at center top, rgba(91,140,255,0.4) 0%, transparent 70%)',
                filter: 'blur(8px)',
              }}
            />

            {/* Outer grid uses `totalSlots` columns. A normal column takes
                1 slot; a `wide` column takes 2 (via gridColumn span). */}
            <div
              className="relative grid gap-3 p-6"
              style={{ gridTemplateColumns: `repeat(${totalSlots}, minmax(0, 1fr))` }}
            >
              {columns.map(col => {
                const tint = COLUMN_TINT[col.label] || 'rgb(91 140 255)';
                return (
                  <div
                    key={col.label}
                    style={col.wide ? { gridColumn: 'span 2' } : undefined}
                  >
                    <div
                      className="text-[10px] font-semibold uppercase tracking-[0.12em] mb-3 pl-3"
                      style={{ color: tint }}
                    >
                      {col.label}
                    </div>
                    {/* Wide columns render items in a 2-col subgrid with
                        COLUMN-major flow so the left column fills first.
                        Default row count = (N-1) → left-heavy 4-1 layout
                        used by Platform / Functions. Pass `subgridRows`
                        on the column to override — e.g. 4 items with
                        subgridRows:2 produces a balanced 2x2.
                        Normal columns keep flex-col layout. */}
                    <ul
                      className={
                        col.wide
                          ? 'grid grid-cols-2 grid-flow-col gap-1'
                          : 'flex flex-col gap-1'
                      }
                      style={
                        col.wide
                          ? {
                              gridTemplateRows:
                                'repeat(' +
                                Math.max(col.subgridRows ?? col.items.length - 1, 1) +
                                ', minmax(0, auto))',
                            }
                          : undefined
                      }
                    >
                      {col.items.map(item => {
                        const Icon = MEGA_ICONS[item.icon] || BookOpen;
                        // Honor `dividerBefore` only on non-wide columns
                        // (the wide subgrid layout would render the divider
                        // in the wrong place across columns).
                        const showDivider = !col.wide && item.dividerBefore;
                        return (
                          <li key={item.href}>
                            {showDivider && (
                              <div
                                aria-hidden="true"
                                className="my-2 mx-3 h-px"
                                style={{
                                  background:
                                    'linear-gradient(to right, transparent, rgba(255,255,255,0.08) 30%, rgba(255,255,255,0.08) 70%, transparent)',
                                }}
                              />
                            )}
                            <Link
                              href={item.href}
                              onClick={onRequestClose}
                              role="menuitem"
                              className="group flex items-start gap-3 p-3 rounded-lg transition-colors hover:bg-white/[0.04]"
                            >
                              <span
                                className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md transition-colors"
                                style={{
                                  background: tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
                                  color:      tint,
                                }}
                              >
                                <Icon size={17} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-1.5">
                                  <span className="text-[13px] font-semibold text-text leading-tight">
                                    {item.label}
                                  </span>
                                  {item.comingSoon && (
                                    <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded border border-border text-text-dim">
                                      soon
                                    </span>
                                  )}
                                  <ArrowUpRight
                                    size={12}
                                    className="text-text-dim opacity-0 group-hover:opacity-100 transition-opacity ml-auto shrink-0"
                                  />
                                </span>
                                <span className="block mt-0.5 text-[12px] text-text-muted leading-snug">
                                  {item.description}
                                </span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>

            {/* Soft footer band — optional. Per-megamenu copy passed by parent. */}
            {footer && (
              <div
                className="flex items-center justify-between gap-4 px-6 py-3 border-t border-border"
                style={{ background: 'rgba(255,255,255,0.015)' }}
              >
                <span className="text-[12px] text-text-muted">
                  {footer.text}
                </span>
                {footer.cta && (
                  <Link
                    href={footer.cta.href}
                    onClick={onRequestClose}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-bright hover:text-text"
                  >
                    {footer.cta.label}
                    <ArrowUpRight size={12} />
                  </Link>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

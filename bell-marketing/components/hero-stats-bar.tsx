'use client';

import { motion } from 'framer-motion';
import { CAMERA_ARRIVAL_MS } from '@/content/hero-signals';

/**
 * Slim stats bar at the bottom of the hero — header-height (~64px),
 * glassmorphism, three columns separated by vertical dividers. Slides up
 * from below and fades in with the same timing as the last text-overlay
 * element so it lands in sync with the rest of the reveal.
 *
 * Replaces the old vertical 3-column grid that sat under the CTAs. The bar
 * format reads as a permanent intelligence footer ("here's what we cover")
 * rather than a sales-pitch stat block.
 */

const ARRIVAL = CAMERA_ARRIVAL_MS / 1000;
const STAGGER = 0.3;

const STATS = [
  { value: 'EVERY', label: 'Qatari company, mapped'   },
  { value: 'EVERY', label: 'Decision maker, verified' },
  { value: '27',    label: 'Data operation layers'    },
];

export function HeroStatsBar() {
  return (
    <motion.div
      // Slides up from below. Lands at the same moment the stats grid used
      // to fade in (ARRIVAL + STAGGER * 4 in hero-overlay.tsx).
      initial={{ opacity: 0, y: 36 }}
      animate={{ opacity: 1, y: 0  }}
      transition={{ duration: 0.7, delay: ARRIVAL + STAGGER * 4, ease: [0.22, 0.61, 0.36, 1] }}
      className="absolute left-0 right-0 bottom-0 z-30 pointer-events-none px-6 pb-6"
    >
      <div className="max-w-content mx-auto">
        <div
          className="relative h-16 rounded-xl border border-border flex items-stretch pointer-events-auto overflow-hidden"
          style={{
            background:     'rgba(13, 18, 35, 0.78)',
            backdropFilter: 'blur(14px) saturate(160%)',
            WebkitBackdropFilter: 'blur(14px) saturate(160%)',
            boxShadow:      '0 10px 40px -10px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset',
          }}
        >
          {/* Thin accent line along the top edge */}
          <div
            aria-hidden="true"
            className="absolute top-0 left-0 right-0 h-px"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, rgba(91,140,255,0.4) 50%, transparent 100%)',
            }}
          />

          {STATS.map((stat, i) => (
            <div key={i} className="flex-1 flex items-center justify-center relative">
              {i > 0 && (
                <div
                  aria-hidden="true"
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-8 w-px bg-border"
                />
              )}
              <Stat value={stat.value} label={stat.label} />
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  // Value uses tabular-nums + slight letter-spacing to feel like data.
  // Label is small caps, muted — supporting metadata not headline noise.
  const isNumber = /^\d/.test(value);
  return (
    <div className="flex items-center gap-3 px-3 md:px-5 min-w-0">
      <span
        className={
          'text-text font-semibold tabular-nums shrink-0 ' +
          (isNumber ? 'text-2xl md:text-3xl' : 'text-base md:text-lg tracking-wider')
        }
        style={{
          textShadow: '0 1px 8px rgba(0,0,0,0.4)',
        }}
      >
        {value}
      </span>
      <span
        className="text-[10px] md:text-[11px] uppercase tracking-wider text-text-muted leading-tight max-w-[160px]"
      >
        {label}
      </span>
    </div>
  );
}

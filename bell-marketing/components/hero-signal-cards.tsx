'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HERO_SIGNALS,
  SIGNAL_COLORS,
  LOOP_SECONDS,
  CAMERA_ARRIVAL_MS,
  type HeroSignal,
} from '@/content/hero-signals';

/**
 * Side-drawer "intelligence feed" — replaces the on-map text popups.
 *
 * Why side cards instead of on-map popups:
 *   - On-map labels were small and got covered by the centered text overlay
 *   - Cards have room to show full sentences + a location label + a kind
 *     badge with a colored accent
 *   - They make the hero feel like a live operations center rather than
 *     a marketing illustration
 *
 * Layout:
 *   - Left column: even-indexed signals (0, 2, 4, 6)
 *   - Right column: odd-indexed signals (1, 3, 5, 7)
 *   - Each column is absolutely positioned at the edge of the hero section
 *   - Cards stack vertically; AnimatePresence handles slide-in/out
 *
 * Hidden on viewports < 1024px (lg breakpoint) so they don't collide with
 * the centered text overlay on tablet/mobile. On those sizes only the map
 * dots remain visible — still atmospheric, just simpler.
 */
export function HeroSignalCards() {
  const [active, setActive] = useState<HeroSignal[]>([]);

  useEffect(() => {
    // Mirrors the marker logic in HeroGlobe so the cards and the map dots
    // appear in lockstep. We use the same constants from hero-signals.ts.
    const start = Date.now();
    const cameraArrivedSec = CAMERA_ARRIVAL_MS / 1000;

    const tick = () => {
      const elapsed  = (Date.now() - start) / 1000;
      const loopTime = (elapsed - cameraArrivedSec) % LOOP_SECONDS;
      if (loopTime < 0) {
        setActive(prev => prev.length ? [] : prev);
        return;
      }
      const next = HERO_SIGNALS.filter(s =>
        loopTime >= s.appearAt && loopTime <= s.appearAt + s.visibleFor
      );
      // Only update when the set of active signals actually changes — avoids
      // re-renders every 250ms when nothing's changed.
      setActive(prev => {
        if (prev.length === next.length && prev.every((p, i) => p === next[i])) return prev;
        return next;
      });
    };

    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, []);

  const leftSignals  = active.filter(s => HERO_SIGNALS.indexOf(s) % 2 === 0);
  const rightSignals = active.filter(s => HERO_SIGNALS.indexOf(s) % 2 === 1);

  return (
    <>
      {/* LEFT column */}
      <div
        className="hidden lg:flex absolute top-1/2 -translate-y-1/2 flex-col gap-3 z-20 pointer-events-none"
        style={{ left: 24, width: 280 }}
        aria-hidden="true"
      >
        <AnimatePresence>
          {leftSignals.map(signal => (
            <SignalCard key={signal.text} signal={signal} side="left" />
          ))}
        </AnimatePresence>
      </div>

      {/* RIGHT column */}
      <div
        className="hidden lg:flex absolute top-1/2 -translate-y-1/2 flex-col gap-3 z-20 pointer-events-none"
        style={{ right: 24, width: 280 }}
        aria-hidden="true"
      >
        <AnimatePresence>
          {rightSignals.map(signal => (
            <SignalCard key={signal.text} signal={signal} side="right" />
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}

function SignalCard({ signal, side }: { signal: HeroSignal; side: 'left' | 'right' }) {
  const color = SIGNAL_COLORS[signal.kind];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: side === 'left' ? -32 : 32 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{    opacity: 0, x: side === 'left' ? -24 : 24 }}
      transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
      style={{
        backgroundColor: 'rgba(10, 14, 26, 0.82)',
        backdropFilter:  'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        borderRadius: 10,
        border: '1px solid rgba(var(--border), 0.7)',
        borderLeft:  side === 'left'  ? `3px solid ${color}` : '1px solid rgba(var(--border), 0.7)',
        borderRight: side === 'right' ? `3px solid ${color}` : '1px solid rgba(var(--border), 0.7)',
        padding: '11px 14px',
        boxShadow: '0 10px 24px -10px rgba(0,0,0,0.6)',
        pointerEvents: 'auto',
      }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: color,
            boxShadow: `0 0 8px ${color}`,
          }}
        />
        <span
          className="text-[10px] font-semibold tracking-wider tabular-nums"
          style={{ color, letterSpacing: '0.08em' }}
        >
          {signal.kindLabel}
        </span>
        <span className="ml-auto text-[10px] text-text-dim uppercase tracking-wider">
          live
        </span>
      </div>
      <div className="text-[13px] text-text leading-snug">
        {signal.text}
      </div>
      <div className="mt-1.5 text-[11px] text-text-muted">
        📍 {signal.location}
      </div>
    </motion.div>
  );
}

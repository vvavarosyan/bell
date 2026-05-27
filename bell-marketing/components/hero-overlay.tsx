'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { CAMERA_ARRIVAL_MS } from '@/content/hero-signals';

/**
 * Hero text overlay — sits on top of <HeroGlobe/> and <HeroSignalCards/>.
 *
 * Animation timeline:
 *   T=0        Globe appears
 *   T=0.3      Globe begins a 360° spin (4s easeInOut)
 *   T=3.7      At 85% spin, flyTo Qatar starts (6s cinematic ease, overlaps
 *              the tail of the rotation)
 *   T=9.7      Camera settles over Qatar
 *   T=9.7      Signals + text overlay BOTH start immediately (no gap)
 *              with a 0.3s stagger between text elements so it still
 *              choreographs nicely without feeling slammed
 *
 * All text delays are derived from CAMERA_ARRIVAL_MS so adjusting the
 * intro timing in hero-signals.ts ripples through automatically.
 */
const ARRIVAL = CAMERA_ARRIVAL_MS / 1000;       // seconds
const STAGGER = 0.3;                            // seconds between text elements

export function HeroOverlay() {
  return (
    <div className="relative max-w-screen-xl mx-auto px-6 text-center">
      {/* Glassmorphism backdrop — semi-transparent dark panel with blur.
          Makes the headline read against the lighter colorful map. Centered,
          constrained width so the side cards remain visible at the edges. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: ARRIVAL }}
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 pointer-events-none"
        style={{
          width: 'min(840px, 92%)',
          height: '460px',
          background:
            'radial-gradient(ellipse at center, rgba(10,14,26,0.85) 0%, rgba(10,14,26,0.65) 55%, rgba(10,14,26,0) 100%)',
          filter: 'blur(0.5px)',
        }}
      />

      {/* Eyebrow chip */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: ARRIVAL + STAGGER * 0 }}
        className="inline-flex items-center gap-2 px-3 py-1 mb-8 rounded-full bg-bg-elev-2/90 border border-border text-text text-xs font-semibold uppercase tracking-wider backdrop-blur-md"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
        Qatar's Intelligence Backbone
      </motion.div>

      {/* Headline — full-strength white with text-shadow so it pops against
          any map color underneath, not the gradient-fade that was washing out. */}
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: ARRIVAL + STAGGER * 1 }}
        className="text-display-lg md:text-display-xl max-w-4xl mx-auto"
        style={{
          color: 'rgb(255 255 255)',
          textShadow: '0 2px 24px rgba(0,0,0,0.45), 0 0 1px rgba(0,0,0,0.6)',
          fontWeight: 700,
          letterSpacing: '-0.03em',
        }}
      >
        The intelligence layer for{' '}
        <span style={{
          background: 'linear-gradient(135deg, rgb(165 195 255) 0%, rgb(91 140 255) 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          color: 'transparent',
        }}>
          Qatar
        </span>
        .
      </motion.h1>

      {/* Subheadline */}
      <motion.p
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: ARRIVAL + STAGGER * 2 }}
        className="mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
        style={{
          color: 'rgb(230 237 255)',
          textShadow: '0 1px 12px rgba(0,0,0,0.5)',
        }}
      >
        Every Qatari company. Every decision maker. Every move that matters.
        Continuously mapped, verified, and refreshed — built for those who
        shape this market.
      </motion.p>

      {/* CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: ARRIVAL + STAGGER * 3 }}
        className="mt-10 flex flex-col sm:flex-row gap-3 items-center justify-center"
      >
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium rounded-md bg-accent text-white hover:brightness-110 transition shadow-lg shadow-accent/40"
        >
          Get in touch
          <ArrowRight size={16} />
        </Link>
        <Link
          href="/platform"
          className="inline-flex items-center gap-2 px-6 py-3 text-base font-medium rounded-md text-white border border-white/40 hover:border-white hover:bg-white/10 bg-bg/40 backdrop-blur-md transition"
        >
          See what's inside
        </Link>
      </motion.div>

      {/* (The stats strip used to live here as a grid. It's been replaced
          by <HeroStatsBar/> — a slim header-height bar at the bottom of
          the hero. Lives as a sibling in app/page.tsx so it can position
          itself absolute to the hero section.) */}
    </div>
  );
}

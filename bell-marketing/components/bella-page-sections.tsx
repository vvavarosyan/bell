'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot, Search, ArrowRight, Sparkles, Check, Loader2, ShieldCheck, X,
  Landmark, FileCheck, Banknote, Receipt, Briefcase, CalendarClock,
  TrendingUp, Users, Radar, Mail, PencilLine,
  Send, Activity, MessageSquare, RefreshCw,
  FileSearch, BookOpen, Globe2, Database, Settings2, Plug,
  Target, Megaphone, Handshake, Microscope,
  Inbox, BarChart3, MapPin, ListChecks, Server, KeyRound,
} from 'lucide-react';

/**
 * BELLA PAGE — section-by-section build.
 *
 * Designed and shipped one section at a time, deliberately not templated.
 * Each section has its own purpose-built visual shape — no recurring
 * card-grid pattern.
 *
 * Currently in this file:
 *   1. Hero          — "Not a chatbot. An operator."
 *   2. LiveStatusBar — full-width band that cycles through real Bella
 *                      states (Working / Awaiting approval / Idle)
 *   3. Moment01     — She doesn't just answer. (question + action button)
 *   4. Moment02     — She turns a market into a shortlist. (ICP funnel)
 *   5. Moment03     — You decide how much rope she gets. (approve/autonomous toggle)
 *   6. Moment04     — She does the work Qatar requires. (WPS filing)
 *   7. Moment05     — She doesn't wait. She acts. (signal acted on)
 *   8. Moment06     — She runs the whole loop. (24-hour dashboard)
 *   9. Moment07     — She researches what would take you weeks. (deep research)
 *  10. SurfaceArea  — Every part of Bell.qa is in her toolkit.
 *  11. Departments  — Which revenue functions Bella accelerates (cross-links)
 *  12. EmailDemo    — Annotated outreach example (different scenario from homepage)
 *  13. CrmStats     — One month of Bella, in the CRM.
 *  14. Comparison   — What your team does alone vs with Bella.
 *  15. ThreeReader  — Operator / IT / Executive closing block
 *  16. FinalCta     — Strategic Get Access CTA at the very end
 *
 * Section eyebrows use the format "Capability NN / 07" — consistent
 * digits across all seven (no mixed letters / numerals).
 *
 * No final CTA. Bella is part of the platform, not a separate product.
 */

export function BellaPageSections() {
  return (
    <>
      <Hero />
      <LiveStatusBar />
      <Moment01 />
      <Moment02 />
      <Moment03 />
      <Moment04 />
      <Moment05 />
      <Moment06 />
      <Moment07 />
      <MidPageCta />
      <SurfaceArea />
      <Departments />
      <BellaEmailDemo />
      <CrmStats />
      <Comparison />
      <ThreeReader />
      <FinalCta />
      {/* End of page composition. */}
    </>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Hero
// ───────────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative pt-28 pb-12 overflow-hidden">
      {/* Soft radial accent — matches the visual register of other cinematic
          page openings (homepage, pricing). Bleeds down past the hero so it
          connects visually into the status bar below. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(91,140,255,0.18) 0%, transparent 70%)',
        }}
      />
      <div className="relative max-w-screen-xl mx-auto px-6 text-center">
        <div className="inline-flex items-center px-3 py-1 mb-6 rounded-full border border-accent/40 bg-accent/10 text-accent-bright text-xs font-semibold uppercase tracking-wider">
          Meet Bella
        </div>
        <h1 className="text-display-md md:text-display-lg text-gradient max-w-3xl mx-auto">
          Not a chatbot.<br/>An operator.
        </h1>
        <p className="mt-6 text-lg md:text-xl text-text-muted leading-relaxed max-w-2xl mx-auto">
          Most AI assistants suggest. Bella does. She has full access to
          every part of Bell.qa and the authority — given by you — to act
          on your behalf.
        </p>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 2. Live status bar — cycles through real Bella states
// ───────────────────────────────────────────────────────────────────────────

type BellaState = 'working' | 'awaiting' | 'idle';

type StatusFrame = {
  state:  BellaState;
  label:  string;     // "Working" / "Awaiting approval" / "Idle"
  text:   string;     // plain-English description of current work
  action: string;     // contextual action chip label
  /** Initial seconds-in-state. The bar counts up from here while the
   *  frame is visible, so the time feels live. */
  baseSeconds: number;
};

const STATE_COLORS: Record<BellaState, { color: string; bg: string; border: string }> = {
  working:  { color: 'rgb(111 207 151)', bg: 'rgba(111,207,151,0.16)', border: 'rgba(111,207,151,0.30)' },
  awaiting: { color: 'rgb(255 196 99)',  bg: 'rgba(255,196,99,0.16)',  border: 'rgba(255,196,99,0.30)'  },
  idle:     { color: 'rgb(156 165 185)', bg: 'rgba(156,165,185,0.10)', border: 'rgba(156,165,185,0.25)' },
};

const FRAMES: StatusFrame[] = [
  { state: 'working',  label: 'Working',           text: 'Drafting follow-up to Mohammed Al-Marri about logistics expansion', action: 'View',     baseSeconds: 6  },
  { state: 'awaiting', label: 'Awaiting approval', text: 'Ready to send 14 outreach emails. Awaiting your approval.',          action: 'Review',   baseSeconds: 12 },
  { state: 'working',  label: 'Working',           text: 'Filing WPS for May payroll · 84 employees',                          action: 'View',     baseSeconds: 9  },
  { state: 'idle',     label: 'Idle',              text: 'Standing by',                                                        action: 'Ask Bella', baseSeconds: 0 },
  { state: 'working',  label: 'Working',           text: 'Researching 6 companies matched to your ICP',                        action: 'View',     baseSeconds: 4 },
  { state: 'awaiting', label: 'Awaiting approval', text: 'DNS records updated. Send test email to verify?',                    action: 'Confirm',  baseSeconds: 3 },
];

const FRAME_DURATION_MS = 6000;

function LiveStatusBar() {
  const [frameIndex, setFrameIndex] = useState(0);
  // tickSeconds = seconds elapsed since the current frame began rendering.
  // Added to the frame's baseSeconds for the displayed mm:ss, so the
  // counter feels live (ticks up by one each second).
  const [tickSeconds, setTickSeconds] = useState(0);

  // Advance to the next frame every FRAME_DURATION_MS.
  useEffect(() => {
    const id = setInterval(() => {
      setFrameIndex(i => (i + 1) % FRAMES.length);
      setTickSeconds(0);
    }, FRAME_DURATION_MS);
    return () => clearInterval(id);
  }, []);

  // Per-second tick while a frame is visible.
  useEffect(() => {
    const id = setInterval(() => setTickSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const frame = FRAMES[frameIndex];
  const palette = STATE_COLORS[frame.state];
  const isIdle = frame.state === 'idle';
  // Bella's work is fast. Always show seconds only — never minutes —
  // because anything in the 1m+ range leaves the wrong impression of how
  // long her tasks actually take.
  const totalSeconds = frame.baseSeconds + tickSeconds;
  const displayedTime = isIdle ? '—' : `${totalSeconds}s`;

  return (
    <section
      // Full-width band. Bleeds the hero's gradient downward into the bar
      // visually, so the two read as one composition.
      className="relative w-full border-y border-border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(13,18,35,0.90) 0%, rgba(10,14,26,0.96) 100%)',
        backdropFilter: 'blur(14px) saturate(160%)',
        WebkitBackdropFilter: 'blur(14px) saturate(160%)',
      }}
    >
      {/* Thin accent line along the top — matches the homepage stats bar */}
      <div
        aria-hidden="true"
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${palette.color} 50%, transparent 100%)`,
          opacity: 0.6,
          transition: 'background 600ms ease',
        }}
      />

      <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center gap-4 md:gap-6 min-h-[64px]">
        {/* Left — state badge with pulsing dot */}
        <div className="flex items-center gap-3 shrink-0">
          <span
            className="relative inline-flex items-center justify-center w-2.5 h-2.5"
            aria-hidden="true"
          >
            <span
              className="absolute inset-0 rounded-full opacity-70 animate-ping"
              style={{ background: palette.color }}
            />
            <span
              className="relative rounded-full w-2.5 h-2.5"
              style={{
                background: palette.color,
                boxShadow:  `0 0 8px ${palette.color}`,
              }}
            />
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider">
            <span className="text-text">BELLA</span>
            <span className="text-text-dim">·</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={frame.label + frameIndex}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{    opacity: 0, y: -4 }}
                transition={{ duration: 0.3 }}
                style={{ color: palette.color }}
              >
                {frame.label}
              </motion.span>
            </AnimatePresence>
          </span>
        </div>

        {/* Center — current activity text. Cross-fades on frame change. */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={frame.text + frameIndex}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{    opacity: 0, y: -6 }}
              transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
              className="text-[13px] md:text-sm text-text leading-snug truncate"
            >
              {frame.text}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right — time-in-state + action chip */}
        <div className="flex items-center gap-3 md:gap-4 shrink-0">
          <span className="hidden sm:inline text-[11px] font-mono tabular-nums text-text-muted whitespace-nowrap">
            {displayedTime}
          </span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={frame.action + frameIndex}
              initial={{ opacity: 0, x: 4 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{    opacity: 0, x: -4 }}
              transition={{ duration: 0.3 }}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider px-2.5 py-1.5 rounded-md border whitespace-nowrap"
              style={{
                color:       palette.color,
                background:  palette.bg,
                borderColor: palette.border,
              }}
            >
              {frame.action}
              <span aria-hidden="true">→</span>
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 3. Moment 01 — A question, answered with hands
// ───────────────────────────────────────────────────────────────────────────

/**
 * Two-column moment. Left: sticky eyebrow + heading + body prose. Right:
 * a fully-choreographed Bella interaction:
 *
 *   1. Question types in character-by-character
 *   2. Bella's response card appears with TWO buttons
 *        — "Open sequence builder" (secondary, user does it themselves)
 *        — "Do it for me"          (primary, Bella does it autonomously)
 *   3. A small SVG cursor flies in from the top-right, glides to the
 *      "Do it for me" button (measured via ref so it lands exactly), and
 *      presses it
 *   4. The autonomous-mode story plays out below:
 *        — "Bella · Working" card appears with progress steps ticking off
 *        — Transitions to "Bella · Done" card with the result
 *   5. Annotation fades in at the bottom
 *
 * Sequence plays once on viewport entry. The whole right column ends up
 * substantially taller than the left, so the left's sticky positioning
 * actually has runway to feel meaningful.
 *
 * Both buttons are styled like real product buttons but are intentionally
 * non-interactive. The page is the demonstration; engagement comes from
 * the page-level CTAs elsewhere.
 */

type Moment01Stage =
  | 'idle'
  | 'typing'
  | 'response-in'
  | 'buttons-in'
  | 'cursor-in'
  | 'cursor-moving'
  | 'cursor-pressed'
  | 'working-in'
  | 'done-in'
  | 'finished';

const MOMENT_01_QUESTION = "I want to follow up with leads who didn't reply.";
const TYPE_INTERVAL_MS   = 28;  // per character — feels like real-time typing

const WORK_STEPS = [
  'Pulled 47 unreplied threads',
  'Built no-reply sequence template',
  'Scheduled first touch',
  'Set follow-up sequence (3 / 7 / 14 days)',
];
const WORK_STEP_INTERVAL_MS = 450;

function Moment01() {
  const [stage, setStage] = useState<Moment01Stage>('idle');
  const [typedLen, setTypedLen] = useState(0);
  const [workStep, setWorkStep] = useState(0);

  // Refs for: section (viewport detection), the right-column container
  // (cursor anchoring), and the "Do it for me" button (precise landing).
  const sectionRef    = useRef<HTMLElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const doItButtonRef = useRef<HTMLButtonElement>(null);

  // Cursor positions measured at runtime so the cursor lands exactly on
  // the "Do it for me" button regardless of viewport width.
  const [cursorStart,  setCursorStart]  = useState<{x: number, y: number}>({ x: 0, y: 0 });
  const [cursorTarget, setCursorTarget] = useState<{x: number, y: number}>({ x: 0, y: 0 });

  // Trigger the sequence once the section enters the viewport.
  useEffect(() => {
    if (!sectionRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && stage === 'idle') setStage('typing');
      },
      { threshold: 0.3 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [stage]);

  // Typewriter — adds one character at a time while typing stage is active.
  useEffect(() => {
    if (stage !== 'typing') return;
    if (typedLen >= MOMENT_01_QUESTION.length) {
      const t = setTimeout(() => setStage('response-in'), 450);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTypedLen(l => l + 1), TYPE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [stage, typedLen]);

  // Stage progression after typing completes.
  useEffect(() => {
    if (stage === 'response-in')   return delay(setStage, 'buttons-in',    550);
    if (stage === 'buttons-in')    return delay(setStage, 'cursor-in',     400);
    if (stage === 'cursor-in')     return delay(setStage, 'cursor-moving', 300);
    if (stage === 'cursor-moving') return delay(setStage, 'cursor-pressed',850);
    if (stage === 'cursor-pressed')return delay(setStage, 'working-in',    500);
    if (stage === 'working-in')    {
      // Working stage runs through WORK_STEPS one at a time, then advances.
      const total = WORK_STEPS.length * WORK_STEP_INTERVAL_MS;
      return delay(setStage, 'done-in', total + 600);
    }
    if (stage === 'done-in')       return delay(setStage, 'finished',      900);
  }, [stage]);

  // Step ticker inside the "Working" card.
  useEffect(() => {
    if (stage !== 'working-in') return;
    setWorkStep(0);
    const id = setInterval(() => {
      setWorkStep(s => {
        if (s >= WORK_STEPS.length) {
          clearInterval(id);
          return s;
        }
        return s + 1;
      });
    }, WORK_STEP_INTERVAL_MS);
    return () => clearInterval(id);
  }, [stage]);

  // Measure cursor start + target once the buttons have rendered.
  useEffect(() => {
    if (stage !== 'buttons-in' && stage !== 'cursor-in') return;
    if (!doItButtonRef.current || !containerRef.current) return;
    // Wait a frame so layout has settled after the buttons mount.
    const id = requestAnimationFrame(() => {
      if (!doItButtonRef.current || !containerRef.current) return;
      const b = doItButtonRef.current.getBoundingClientRect();
      const c = containerRef.current.getBoundingClientRect();
      // Cursor icon is 22x22 — offset so its TIP (top-left point) sits on
      // the button's centre rather than the cursor's bounding-box origin.
      setCursorTarget({
        x: b.left - c.left + b.width / 2 - 6,
        y: b.top  - c.top  + b.height / 2 - 4,
      });
      setCursorStart({
        x: c.width - 30,
        y: 24,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [stage]);

  // Visibility flags derived from the stage machine.
  const sIdx = STAGE_ORDER.indexOf(stage);
  const past = (s: Moment01Stage) => sIdx >= STAGE_ORDER.indexOf(s);

  const showResponseHeader = past('response-in');
  const showButtons        = past('buttons-in');
  const showCursor         = stage === 'cursor-in' || stage === 'cursor-moving' || stage === 'cursor-pressed';
  const cursorAtButton     = stage === 'cursor-moving' || stage === 'cursor-pressed';
  const cursorPressed      = stage === 'cursor-pressed';
  const doItPressed        = stage === 'cursor-pressed';
  const showWorking        = past('working-in');
  const showDone           = past('done-in');
  const showAnnotation     = stage === 'finished';

  const displayedQuestion   = MOMENT_01_QUESTION.slice(0, typedLen);
  const showTypewriterCaret = stage === 'typing' || stage === 'idle';

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">

          {/* Left — prose, sticky on desktop. */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-5 lg:sticky lg:top-24"
          >
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
              Capability 01 / 07
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
              She doesn&apos;t just answer.
            </h2>
            <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed max-w-md">
              Every answer Bella gives has the next action attached. Ask
              her where something lives, she&apos;ll take you there. Ask
              her how to do something, she&apos;ll either show you, or
              do it for you.
            </p>
            <p className="mt-4 text-[13px] md:text-sm text-text-dim leading-relaxed max-w-md">
              You pick: take the wheel yourself, or hand it to her.
            </p>
          </motion.div>

          {/* Right — the full demonstration. Position relative so the
              absolutely-positioned cursor anchors to this column. */}
          <div ref={containerRef} className="lg:col-span-7 relative">

            {/* Question input */}
            <div
              className="rounded-xl border border-border px-4 py-3.5 flex items-center gap-3 min-h-[52px]"
              style={{
                background: 'rgba(19,24,41,0.55)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <Search size={16} className="text-text-dim shrink-0" />
              <span className="flex-1 text-sm md:text-base text-text leading-snug">
                {displayedQuestion}
                {showTypewriterCaret && (
                  <span
                    className="inline-block w-[2px] h-[1.05em] align-[-2px] ml-[1px] animate-pulse"
                    style={{ background: 'rgb(165 195 255)' }}
                    aria-hidden="true"
                  />
                )}
              </span>
              <span
                className="text-[10px] font-mono uppercase tracking-wider text-text-dim border border-border rounded px-1.5 py-0.5"
              >
                ↵
              </span>
            </div>

            {/* Bella's initial response card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={showResponseHeader ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
              className="mt-4 rounded-xl border border-border overflow-hidden"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,24,41,0.95) 0%, rgba(13,18,35,0.95) 100%)',
                boxShadow: '0 18px 50px -20px rgba(0,0,0,0.6)',
              }}
            >
              {/* Header */}
              <div
                className="px-5 py-3 border-b border-border flex items-center gap-2.5"
                style={{ background: 'rgba(255,255,255,0.015)' }}
              >
                <PulseDot color="rgb(111 207 151)" size={8} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text">BELLA</span>
                <span className="text-text-dim text-[11px]">·</span>
                <span className="text-[11px] text-text-muted">Answered in 0.4s</span>
              </div>

              {/* Body */}
              <div className="p-5 md:p-6">
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={showResponseHeader ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ duration: 0.35, delay: 0.1 }}
                  className="text-sm md:text-base text-text mb-4"
                >
                  Set up a no-reply sequence in the CRM:
                </motion.p>

                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={showResponseHeader ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                  transition={{ duration: 0.35, delay: 0.2 }}
                  className="rounded-lg px-4 py-3 inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[13px] md:text-sm"
                  style={{
                    background:  'rgba(91,140,255,0.08)',
                    border:      '1px solid rgba(91,140,255,0.20)',
                  }}
                >
                  <span className="text-text-muted">CRM</span>
                  <span className="text-text-dim">→</span>
                  <span className="text-text-muted">Sequences</span>
                  <span className="text-text-dim">→</span>
                  <span className="text-text font-semibold">New (no-reply trigger)</span>
                </motion.div>

                {/* Two-button row. Secondary on the left, primary (cursor
                    target) on the right. Wrapped in their own block with
                    explicit top margin so they don't crowd the path block. */}
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  {/* Secondary — user does it themselves */}
                  <motion.button
                    type="button"
                    tabIndex={-1}
                    aria-disabled="true"
                    initial={{ opacity: 0, y: 8 }}
                    animate={showButtons ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                    transition={{ duration: 0.35 }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13.5px] font-semibold text-text-muted border border-border cursor-default select-none"
                    style={{
                      background: 'rgba(255,255,255,0.02)',
                      pointerEvents: 'none',
                    }}
                  >
                    Open sequence builder
                    <ArrowRight size={14} />
                  </motion.button>

                  {/* Primary — Bella does it autonomously. This is the
                      one the cursor lands on. */}
                  <motion.button
                    ref={doItButtonRef}
                    type="button"
                    tabIndex={-1}
                    aria-disabled="true"
                    initial={{ opacity: 0, y: 8, scale: 0.96 }}
                    animate={
                      showButtons
                        ? { opacity: 1, y: 0, scale: doItPressed ? 0.96 : 1 }
                        : { opacity: 0, y: 8, scale: 0.96 }
                    }
                    transition={{
                      opacity: { duration: 0.35, delay: 0.06 },
                      y:       { duration: 0.35, delay: 0.06 },
                      scale:   { duration: doItPressed ? 0.12 : 0.35, ease: 'easeOut' },
                    }}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-[14px] font-semibold text-white cursor-default select-none"
                    style={{
                      background: doItPressed
                        ? 'linear-gradient(180deg, rgb(82 128 235) 0%, rgb(68 112 220) 100%)'
                        : 'linear-gradient(180deg, rgb(108 156 255) 0%, rgb(82 128 235) 100%)',
                      boxShadow:  doItPressed
                        ? '0 4px 12px -4px rgba(91,140,255,0.50), inset 0 1px 0 rgba(255,255,255,0.12)'
                        : '0 10px 24px -8px rgba(91,140,255,0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
                      pointerEvents: 'none',
                    }}
                  >
                    <Sparkles size={14} />
                    Do it for me
                  </motion.button>
                </div>
              </div>
            </motion.div>

            {/* Cursor */}
            <AnimatePresence>
              {showCursor && (
                <motion.div
                  aria-hidden="true"
                  initial={{ opacity: 0, x: cursorStart.x, y: cursorStart.y, scale: 1 }}
                  animate={
                    cursorPressed
                      ? { opacity: 1, x: cursorTarget.x, y: cursorTarget.y, scale: 0.85 }
                      : cursorAtButton
                      ? { opacity: 1, x: cursorTarget.x, y: cursorTarget.y, scale: 1 }
                      : { opacity: 1, x: cursorStart.x,  y: cursorStart.y,  scale: 1 }
                  }
                  exit={{ opacity: 0, transition: { duration: 0.4, delay: 0.4 } }}
                  transition={{
                    opacity: { duration: 0.2 },
                    x:       { duration: 0.75, ease: [0.5, 0, 0.25, 1] },
                    y:       { duration: 0.75, ease: [0.5, 0, 0.25, 1] },
                    scale:   { duration: 0.15, ease: 'easeOut' },
                  }}
                  style={{
                    position: 'absolute',
                    top:      0,
                    left:     0,
                    pointerEvents: 'none',
                    zIndex:   20,
                    filter:   'drop-shadow(0 4px 8px rgba(0,0,0,0.4))',
                  }}
                >
                  <CursorIcon />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bella working card — appears after the click */}
            <AnimatePresence mode="wait">
              {showWorking && !showDone && (
                <motion.div
                  key="working"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
                  className="mt-4 rounded-xl border overflow-hidden"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(28,24,16,0.95) 0%, rgba(20,18,12,0.95) 100%)',
                    borderColor: 'rgba(255,196,99,0.30)',
                    boxShadow: '0 18px 50px -20px rgba(255,196,99,0.20)',
                  }}
                >
                  <div
                    className="px-5 py-3 border-b flex items-center gap-2.5"
                    style={{
                      borderColor: 'rgba(255,196,99,0.18)',
                      background:  'rgba(255,196,99,0.04)',
                    }}
                  >
                    <PulseDot color="rgb(255 196 99)" size={8} />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text">BELLA</span>
                    <span className="text-text-dim text-[11px]">·</span>
                    <span className="text-[11px]" style={{ color: 'rgb(255 196 99)' }}>Working</span>
                  </div>
                  <div className="p-5 md:p-6">
                    <div className="text-[13px] text-text-muted mb-4">
                      Building no-reply sequence
                    </div>
                    <ul className="space-y-2.5">
                      {WORK_STEPS.map((s, i) => {
                        const done   = i < workStep;
                        const active = i === workStep;
                        return (
                          <li
                            key={i}
                            className="flex items-center gap-3 text-[13.5px] leading-snug"
                            style={{
                              color: done   ? 'rgb(235 240 255)'
                                   : active ? 'rgb(235 240 255)'
                                   :          'rgb(120 130 152)',
                            }}
                          >
                            <span
                              className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
                              style={{
                                background: done   ? 'rgba(111,207,151,0.18)'
                                          : active ? 'rgba(255,196,99,0.18)'
                                          :          'rgba(120,130,152,0.10)',
                                color:      done   ? 'rgb(111 207 151)'
                                          : active ? 'rgb(255 196 99)'
                                          :          'rgb(120 130 152)',
                              }}
                            >
                              {done   ? <Check    size={12} />
                              : active ? <Loader2 size={12} className="animate-spin" />
                              :          <span className="w-1 h-1 rounded-full bg-current" />}
                            </span>
                            <span>{s}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </motion.div>
              )}

              {showDone && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
                  className="mt-4 rounded-xl border overflow-hidden"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(18,28,22,0.95) 0%, rgba(12,20,16,0.95) 100%)',
                    borderColor: 'rgba(111,207,151,0.32)',
                    boxShadow: '0 18px 50px -20px rgba(111,207,151,0.25)',
                  }}
                >
                  <div
                    className="px-5 py-3 border-b flex items-center gap-2.5"
                    style={{
                      borderColor: 'rgba(111,207,151,0.20)',
                      background:  'rgba(111,207,151,0.05)',
                    }}
                  >
                    <PulseDot color="rgb(111 207 151)" size={8} />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text">BELLA</span>
                    <span className="text-text-dim text-[11px]">·</span>
                    <span className="text-[11px]" style={{ color: 'rgb(111 207 151)' }}>Done in 8s</span>
                  </div>
                  <div className="p-5 md:p-6">
                    <p className="text-sm md:text-base text-text mb-4">
                      No-reply sequence created.
                    </p>
                    <ul className="space-y-1.5 mb-5">
                      {[
                        '47 leads added',
                        'First touch scheduled · tomorrow 9:00 AM',
                        'Sequence: 3 / 7 / 14 days',
                        'Personalised per recipient',
                      ].map(line => (
                        <li key={line} className="flex items-center gap-2.5 text-[13px] text-text-muted">
                          <Check size={12} className="text-success shrink-0" />
                          {line}
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-disabled="true"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[12.5px] font-medium text-text border border-border cursor-default select-none"
                        style={{
                          background: 'rgba(255,255,255,0.03)',
                          pointerEvents: 'none',
                        }}
                      >
                        View sequence
                        <ArrowRight size={13} />
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-disabled="true"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[12.5px] font-medium text-text-muted cursor-default select-none"
                        style={{ pointerEvents: 'none' }}
                      >
                        Pause
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Annotation */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={showAnnotation ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.4 }}
              className="mt-5 pl-1"
            >
              <div className="h-px w-10 bg-border mb-3" aria-hidden="true" />
              <p className="text-[12px] md:text-[13px] text-text-muted leading-relaxed max-w-md">
                One question. Two options. The whole thing closed off in
                under a minute — Bella did the work, you stayed in
                control of the call.
              </p>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}

/** Ordered list of Moment 01 stages — used to derive "is past stage X" flags. */
const STAGE_ORDER: Moment01Stage[] = [
  'idle', 'typing', 'response-in', 'buttons-in',
  'cursor-in', 'cursor-moving', 'cursor-pressed',
  'working-in', 'done-in', 'finished',
];

/** Tiny helper — sets a stage after `ms`, returns a cleanup. */
function delay<T>(setter: (v: T) => void, value: T, ms: number) {
  const t = setTimeout(() => setter(value), ms);
  return () => clearTimeout(t);
}

/** Reusable pulsing dot — green for working/done, amber for awaiting, etc. */
function PulseDot({ color, size = 8 }: { color: string; size?: number }) {
  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="absolute inset-0 rounded-full opacity-70 animate-ping"
        style={{ background: color }}
      />
      <span
        className="relative rounded-full"
        style={{
          width: size, height: size,
          background: color,
          boxShadow:  `0 0 6px ${color}`,
        }}
      />
    </span>
  );
}

/** A small OS-style mouse cursor SVG, used by the Moment 01 animation. */
function CursorIcon() {
  return (
    <svg
      viewBox="0 0 22 22"
      width={22}
      height={22}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}
    >
      <path
        d="M3 2 L3 17 L7 13 L10 21 L12 20 L9 12 L15 12 Z"
        fill="rgb(245 247 255)"
        stroke="rgba(13, 18, 35, 0.85)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 4. Moment 02 — She turns a market into a shortlist (insurance × healthcare)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Two-column moment. Left: a short typed conversation between Bella and
 * the user (an insurance company building an outreach list of Qatari
 * healthcare facilities + decision makers). Right: a persistent "live
 * filter" panel that builds up as the conversation progresses — a
 * filtration log (every step preserved), a dual-metric headline
 * (facilities + contacts), and breakdown sections.
 *
 * Why this shape: the previous design left the user with just a final
 * "23" number and no sense of the journey. Now every step of the
 * filtration stays visible at the end, so the reader sees both the
 * scale (every Qatari company in the graph → 480 facilities) AND the
 * depth (1,247 decision makers identified). The starting database
 * count is deliberately NOT exposed — Bell.qa's positioning is "100%
 * Qatar covered", not a specific number.
 *
 * Each conversation message types out character-by-character so the
 * exchange feels real-time, matching Moment 01's typewriter treatment.
 *
 * Final Bella card has TWO buttons: "Add to CRM" (you take it from
 * here) and "Let Bella run the outreach" (autonomous). Same dual-mode
 * thread as Moment 01.
 */

type M02Speaker = 'bella' | 'user';

type M02Turn = {
  bella: string;
  user:  string;
  /** Updates the filtration log + (optionally) the headline counts. */
  log:   string;
  /** New facility count after this turn. null = unchanged. */
  facilities: number | null;
  /** New decision-maker count after this turn. null = unchanged. */
  contacts:   number | null;
};

const M02_TURNS: M02Turn[] = [
  {
    bella: 'What sector are you targeting?',
    user:  'Healthcare facilities, across Qatar.',
    log:   'Filtered to healthcare facilities',
    facilities: 480,
    contacts:   null,
  },
  {
    bella: 'Any facility type, or all of them — hospitals, clinics, medical centers, labs?',
    user:  'All of them. I want full coverage.',
    log:   'Scope confirmed: all facility types',
    facilities: 480,
    contacts:   null,
  },
  {
    bella: "What's the goal — outreach, research, partnership scoping?",
    user:  'Insurance coverage partnership.',
    log:   'Goal: insurance coverage partnership',
    facilities: 480,
    contacts:   null,
  },
  {
    bella: 'Want me to pull the procurement and partnership decision makers at each facility too?',
    user:  'Yes — everyone who decides on partnerships.',
    log:   'Pulled decision makers across all 480 facilities',
    facilities: 480,
    contacts:   1247,
  },
];

// Facilities counter starts at 0 (rendered as "—" via MetricNumber) and
// animates UP to 480 on turn 1. We deliberately don't surface the total
// Qatari company count on the marketing surface — Bell.qa's public
// position is "100% Qatar covered", not a specific number.
const M02_START_FACILITIES = 0;
// Timings tuned so the full reveal runs ~12s — enough for the reader to
// follow each turn, short enough to keep them watching.
const M02_TYPE_INTERVAL_MS       = 18;
const M02_PAUSE_AFTER_BELLA_MS   = 150;
const M02_PAUSE_AFTER_USER_MS    = 250;
const M02_COUNTER_TICK_MS        = 600;
const M02_PAUSE_AFTER_COUNTER_MS = 300;

const FACILITY_BREAKDOWN = [
  { label: 'Hospitals',         count: 12  },
  { label: 'Clinics',           count: 280 },
  { label: 'Medical centers',   count: 140 },
  { label: 'Specialty labs',    count: 48  },
];
const CONTACT_BREAKDOWN = [
  { label: 'Procurement leads',     count: 480 },
  { label: 'Partnership directors', count: 412 },
  { label: 'C-suite',               count: 355 },
];

type M02ActiveMsg = { turn: number; speaker: M02Speaker } | null;

function Moment02() {
  // Per-message typing progress, indexed by turn × speaker.
  const [bellaTyped, setBellaTyped] = useState<number[]>([0, 0, 0, 0]);
  const [userTyped,  setUserTyped]  = useState<number[]>([0, 0, 0, 0]);
  // Which message (if any) is actively typing right now.
  const [activeMsg,  setActiveMsg]  = useState<M02ActiveMsg>(null);
  // Which turns have had their counter / log update applied.
  const [completedTurns, setCompletedTurns] = useState<number>(-1);
  // Live display values for the dual-metric headline.
  const [displayedFacilities, setDisplayedFacilities] = useState(M02_START_FACILITIES);
  const [displayedContacts,   setDisplayedContacts]   = useState(0);
  // Final-card and annotation visibility.
  const [stage, setStage] = useState<'idle' | 'running' | 'final' | 'done'>('idle');

  const sectionRef = useRef<HTMLElement>(null);

  // Trigger once on viewport entry.
  useEffect(() => {
    if (!sectionRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && stage === 'idle') {
          setStage('running');
          setActiveMsg({ turn: 0, speaker: 'bella' });
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [stage]);

  // Typewriter — ticks one character at a time for the active message.
  useEffect(() => {
    if (!activeMsg) return;
    const { turn, speaker } = activeMsg;
    const fullText = M02_TURNS[turn][speaker];
    const typedArr = speaker === 'bella' ? bellaTyped : userTyped;
    const setTyped = speaker === 'bella' ? setBellaTyped : setUserTyped;
    const currentLen = typedArr[turn];

    if (currentLen >= fullText.length) {
      // This message is fully typed. Advance the conversation.
      const pause = speaker === 'bella' ? M02_PAUSE_AFTER_BELLA_MS : M02_PAUSE_AFTER_USER_MS;
      const t = setTimeout(() => {
        if (speaker === 'bella') {
          setActiveMsg({ turn, speaker: 'user' });
        } else {
          // User just finished — apply the turn's counter / log update,
          // then move to the next turn's Bella message (or finish).
          applyTurnUpdate(turn);
          if (turn < M02_TURNS.length - 1) {
            // Wait an extra beat for the counter / log to land, then continue.
            setTimeout(() => {
              setActiveMsg({ turn: turn + 1, speaker: 'bella' });
            }, M02_PAUSE_AFTER_COUNTER_MS);
          } else {
            // Done with the conversation. Show the final card.
            setTimeout(() => {
              setStage('final');
              setActiveMsg(null);
              setTimeout(() => setStage('done'), 900);
            }, M02_PAUSE_AFTER_COUNTER_MS + 200);
          }
        }
      }, pause);
      return () => clearTimeout(t);
    }

    const tick = setTimeout(() => {
      setTyped(prev => prev.map((c, i) => i === turn ? c + 1 : c));
    }, M02_TYPE_INTERVAL_MS);
    return () => clearTimeout(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMsg, bellaTyped, userTyped]);

  /** Applies the counter + log update for a completed turn. */
  function applyTurnUpdate(turnIdx: number) {
    const t = M02_TURNS[turnIdx];
    setCompletedTurns(prev => Math.max(prev, turnIdx));
    if (t.facilities !== null) animateNumber(displayedFacilities, t.facilities, setDisplayedFacilities);
    if (t.contacts   !== null) animateNumber(displayedContacts,   t.contacts,   setDisplayedContacts);
  }

  /** Animates a numeric counter from `from` to `to` over the counter-tick duration. */
  function animateNumber(from: number, to: number, setter: (n: number) => void) {
    if (from === to) return;
    const steps = 28;
    const stepValue = (from - to) / steps;
    let i = 0;
    const id = setInterval(() => {
      i++;
      if (i >= steps) {
        setter(to);
        clearInterval(id);
      } else {
        setter(Math.round(from - stepValue * i));
      }
    }, M02_COUNTER_TICK_MS / steps);
  }

  // Derived helpers
  const showFinalCard  = stage === 'final' || stage === 'done';
  const showAnnotation = stage === 'done';

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32">
      <div className="max-w-screen-xl mx-auto px-6">

        {/* Eyebrow + heading */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="max-w-3xl"
        >
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Capability 02 / 07
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            She turns a market into a shortlist.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed max-w-2xl">
            Defining who to go after isn&apos;t a 30-minute spreadsheet
            exercise. Bella asks a few questions, maps the entire Qatari
            market against your goal, and hands you both the
            organisations and the decision makers inside them.
          </p>
        </motion.div>

        {/* Two-column composition */}
        <div className="mt-12 md:mt-16 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">

          {/* LEFT — conversation */}
          <div className="lg:col-span-7 space-y-4">
            {M02_TURNS.map((turn, i) => (
              <M02TurnPair
                key={i}
                turn={turn}
                bellaTypedLen={bellaTyped[i]}
                userTypedLen={userTyped[i]}
                active={activeMsg?.turn === i ? activeMsg.speaker : null}
              />
            ))}

            <M02FinalCard visible={showFinalCard} />
          </div>

          {/* RIGHT — live filter panel (sticky on desktop) */}
          <div className="lg:col-span-5 lg:sticky lg:top-24">
            <M02FilterPanel
              facilities={displayedFacilities}
              contacts={displayedContacts}
              completedTurns={completedTurns}
              showBreakdowns={showFinalCard}
              showAnnotation={showAnnotation}
            />
          </div>

        </div>
      </div>
    </section>
  );
}

/** A single Bella question + user reply, typing live. */
function M02TurnPair({
  turn, bellaTypedLen, userTypedLen, active,
}: {
  turn:          M02Turn;
  bellaTypedLen: number;
  userTypedLen:  number;
  active:        M02Speaker | null;
}) {
  // The whole pair fades in as soon as Bella starts typing it.
  const visible = bellaTypedLen > 0 || active === 'bella';
  if (!visible) return <div />;  // placeholder so layout doesn't jump

  const bellaText = turn.bella.slice(0, bellaTypedLen);
  const userText  = turn.user.slice(0,  userTypedLen);
  const bellaDone = bellaTypedLen >= turn.bella.length;
  const userStarted = bellaDone && (userTypedLen > 0 || active === 'user');

  return (
    <div className="space-y-2">
      {/* Bella message */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="rounded-xl border border-border overflow-hidden"
        style={{
          background:
            'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
        }}
      >
        <div
          className="px-4 py-2 border-b border-border flex items-center gap-2"
          style={{ background: 'rgba(91,140,255,0.06)' }}
        >
          <PulseDot color="rgb(111 207 151)" size={6} />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text">Bella</span>
        </div>
        <div className="px-4 py-3 text-sm text-text leading-snug min-h-[2.5rem]">
          {bellaText}
          {active === 'bella' && (
            <span
              className="inline-block w-[2px] h-[1.05em] align-[-2px] ml-[1px] animate-pulse"
              style={{ background: 'rgb(165 195 255)' }}
              aria-hidden="true"
            />
          )}
        </div>
      </motion.div>

      {/* User reply — appears once Bella's done, types in */}
      {userStarted && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex justify-end"
        >
          <div
            className="rounded-xl border max-w-[82%]"
            style={{
              background:  'rgba(26,32,52,0.7)',
              borderColor: 'rgba(196,154,255,0.30)',
            }}
          >
            <div
              className="px-4 py-2 border-b flex items-center justify-end gap-2"
              style={{
                background:   'rgba(196,154,255,0.06)',
                borderColor:  'rgba(196,154,255,0.20)',
              }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: 'rgb(196 154 255)' }}>You</span>
            </div>
            <div className="px-4 py-3 text-sm text-text leading-snug min-h-[2.5rem]">
              {userText}
              {active === 'user' && (
                <span
                  className="inline-block w-[2px] h-[1.05em] align-[-2px] ml-[1px] animate-pulse"
                  style={{ background: 'rgb(196 154 255)' }}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/** Bella's final summary card — appears after the conversation completes. Two buttons. */
function M02FinalCard({ visible }: { visible: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
      transition={{ duration: 0.5, delay: 0.3, ease: [0.22, 0.61, 0.36, 1] }}
      className="mt-6 rounded-xl border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
        borderColor: 'rgba(91,140,255,0.32)',
        boxShadow:   '0 18px 50px -20px rgba(91,140,255,0.30)',
      }}
    >
      <div
        className="px-4 py-2 border-b border-border flex items-center gap-2"
        style={{ background: 'rgba(91,140,255,0.10)' }}
      >
        <PulseDot color="rgb(111 207 151)" size={8} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text">
          Bella · Done in 12s
        </span>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm md:text-base text-text leading-relaxed mb-5">
          <span className="font-semibold">480 Qatari healthcare facilities</span>{' '}
          mapped, with <span className="font-semibold">1,247 decision makers</span>{' '}
          identified at procurement, partnership, and C-suite levels.
          Ready to act.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {/* Secondary — user takes it from here */}
          <button
            type="button"
            tabIndex={-1}
            aria-disabled="true"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13.5px] font-semibold text-text-muted border border-border cursor-default select-none"
            style={{ background: 'rgba(255,255,255,0.02)', pointerEvents: 'none' }}
          >
            Add to CRM
            <ArrowRight size={14} />
          </button>
          {/* Primary — Bella does the personalised outreach */}
          <button
            type="button"
            tabIndex={-1}
            aria-disabled="true"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-[14px] font-semibold text-white cursor-default select-none"
            style={{
              background: 'linear-gradient(180deg, rgb(108 156 255) 0%, rgb(82 128 235) 100%)',
              boxShadow:  '0 10px 24px -8px rgba(91,140,255,0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
              pointerEvents: 'none',
            }}
          >
            <Sparkles size={14} />
            Let Bella run the outreach
          </button>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Right-column filter panel — persistent through the whole moment.
 * Shows starting universe, filtration log, dual-metric headline,
 * and breakdowns of facilities + decision makers (at end).
 */
function M02FilterPanel({
  facilities, contacts, completedTurns,
  showBreakdowns, showAnnotation,
}: {
  facilities:      number;
  contacts:        number;
  completedTurns:  number;
  showBreakdowns:  boolean;
  showAnnotation:  boolean;
}) {
  // The starting-universe label is always visible. It shows the user
  // where Bella began — the whole Qatari market — so the journey is
  // preserved even after the headline number narrows. Exact size of
  // the database is not exposed.
  return (
    <div>
      <div
        className="rounded-2xl border border-border overflow-hidden"
        style={{
          background:
            'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
          boxShadow: '0 18px 50px -20px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-3 border-b border-border flex items-center justify-between gap-2"
          style={{ background: 'rgba(255,255,255,0.015)' }}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
            Live filter · Bella
          </span>
          <PulseDot color="rgb(111 207 151)" size={6} />
        </div>

        {/* Dual-metric headline */}
        <div className="px-5 py-6 grid grid-cols-2 gap-5">
          <div className="text-center">
            <div className="text-[9px] uppercase tracking-wider text-text-dim font-semibold mb-2">
              Facilities
            </div>
            <MetricNumber value={facilities} color="rgb(165 195 255)" />
          </div>
          <div className="text-center">
            <div className="text-[9px] uppercase tracking-wider text-text-dim font-semibold mb-2">
              Decision makers
            </div>
            <MetricNumber value={contacts} color="rgb(206 184 248)" />
          </div>
        </div>

        {/* Filtration log — builds up as turns complete. Persistent. */}
        <div className="px-5 py-4 border-t border-border">
          <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-3">
            How Bella filtered
          </div>
          <ul className="space-y-2 text-[12.5px] leading-snug">
            <LogRow
              done={true}
              label="Started with every Qatari company"
            />
            {M02_TURNS.map((t, i) => (
              <LogRow
                key={i}
                done={completedTurns >= i}
                label={t.log}
              />
            ))}
          </ul>
        </div>

        {/* Breakdowns — appear after final card */}
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={showBreakdowns ? { opacity: 1, height: 'auto' } : { opacity: 0, height: 0 }}
          transition={{ duration: 0.4 }}
          className="overflow-hidden"
        >
          <div className="px-5 py-4 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                Facility mix
              </div>
              <ul className="space-y-1.5">
                {FACILITY_BREAKDOWN.map(b => (
                  <li key={b.label} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-text-muted">{b.label}</span>
                    <span className="text-text font-mono tabular-nums">{b.count}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                Decision makers
              </div>
              <ul className="space-y-1.5">
                {CONTACT_BREAKDOWN.map(b => (
                  <li key={b.label} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="text-text-muted">{b.label}</span>
                    <span className="text-text font-mono tabular-nums">{b.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Annotation */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={showAnnotation ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        transition={{ duration: 0.4 }}
        className="mt-5 pl-1"
      >
        <div className="h-px w-10 bg-border mb-3" aria-hidden="true" />
        <p className="text-[12px] md:text-[13px] text-text-muted leading-relaxed max-w-md">
          Every Qatari company in the graph, narrowed to 480 healthcare
          facilities and 1,247 decision makers in four questions.
          The full target map, ready to act on.
        </p>
        <Link
          href="/platform/signals-and-insights"
          className="inline-flex items-center gap-1.5 mt-3 text-[12px] font-semibold text-accent-bright hover:text-text transition-colors"
        >
          Learn more about Signals &amp; Insights
          <ArrowRight size={11} />
        </Link>
      </motion.div>
    </div>
  );
}

function LogRow({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full mt-0.5"
        style={{
          background: done ? 'rgba(111,207,151,0.18)' : 'rgba(120,130,152,0.10)',
          color:      done ? 'rgb(111 207 151)'      : 'rgb(120 130 152)',
        }}
      >
        {done
          ? <Check size={10} />
          : <span className="w-1 h-1 rounded-full bg-current" />}
      </span>
      <span style={{ color: done ? 'rgb(220 230 250)' : 'rgb(120 130 152)' }}>
        {label}
      </span>
    </li>
  );
}

/**
 * A large metric number for the Moment 02 filter panel.
 *
 * Renders two separate elements depending on value > 0 so React mounts
 * a fresh DOM node on the transition — this avoids the gradient
 * `background-clip: text` trick painting a solid colored rectangle
 * behind the div during state changes (which is what was happening
 * with the previous single-div + conditional-style approach).
 */
function MetricNumber({ value, color }: { value: number; color: string }) {
  if (value <= 0) {
    return (
      <div
        className="text-3xl md:text-4xl font-semibold tabular-nums leading-none"
        style={{ color: 'rgba(120, 130, 152, 0.55)' }}
      >
        —
      </div>
    );
  }
  return (
    <div
      className="text-3xl md:text-4xl font-semibold tabular-nums leading-none"
      style={{ color }}
    >
      {value.toLocaleString()}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Moment 03 — You decide how much rope she gets. (approval / autonomous)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Centered single-column composition (deliberately a different shape from
 * Moments 01 and 02). At the top: eyebrow + heading + subhead, then a
 * real interactive toggle, then a demo card that swaps content based
 * on which mode is selected.
 *
 * The toggle is FUNCTIONAL — user can click to switch modes and the
 * demo replays for that mode. On viewport entry, the demo auto-plays
 * "Approve each step" first, then auto-switches to "Autonomous" so the
 * user sees both modes without touching anything.
 *
 * Same task in both modes ("Send no-reply sequence to 14 leads") so
 * the only thing that differs is HOW Bella executes it.
 */

type M03Mode = 'approve' | 'autonomous';

const M03_TASK = 'Send no-reply sequence to 14 leads';

const M03_APPROVE_STEPS = [
  'Pulled 14 unreplied threads',
  'Drafted personalised email for Mohammed Al-Marri',
  'Ready to send wave 1',
  'Scheduled follow-ups for unanswered',
];
const M03_APPROVE_GATE_MS  = 1300;  // time the approval gate is "visible" before auto-approve
const M03_APPROVE_TRANSITION_MS = 400; // press → approved transition

const M03_AUTO_STEPS = [
  'Pulled 14 unreplied threads',
  'Drafted 14 personalised emails',
  'Sent first wave',
  'Scheduled 3-touch follow-up sequence',
  'CRM updated · tracking enabled',
];
const M03_AUTO_STEP_MS = 380;

function Moment03() {
  const [mode, setMode]               = useState<M03Mode>('approve');
  // Approve mode state — currentStep is which step is currently waiting,
  // pressing is true during the brief auto-press animation.
  const [approveStep, setApproveStep] = useState(0);
  const [approvePressing, setApprovePressing] = useState(false);
  const [approveDone, setApproveDone] = useState(false);
  // Autonomous mode state — how many steps are visible.
  const [autoStep,    setAutoStep]    = useState(0);
  const [autoDone,    setAutoDone]    = useState(false);
  // Has the section been seen yet (drives initial auto-play).
  const [started,     setStarted]     = useState(false);
  // After both modes have auto-played once, the section is "settled"
  // and the user can flip modes without an auto-switch fighting them.
  const [autoPlayCompleted, setAutoPlayCompleted] = useState(false);

  const sectionRef = useRef<HTMLElement>(null);

  // Trigger sequence on viewport entry, once.
  useEffect(() => {
    if (!sectionRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !started) setStarted(true);
      },
      { threshold: 0.3 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [started]);

  // Approve-mode progression: each step waits at its approval gate,
  // shows a brief "pressing" effect, then advances.
  useEffect(() => {
    if (mode !== 'approve' || !started) return;
    if (approveStep >= M03_APPROVE_STEPS.length) {
      // All steps approved. Mark the run complete.
      setApproveDone(true);
      // If we're in the initial auto-play, switch to autonomous after a pause.
      if (!autoPlayCompleted) {
        const t = setTimeout(() => {
          setMode('autonomous');
        }, 1400);
        return () => clearTimeout(t);
      }
      return;
    }

    // Wait at gate, press, then advance.
    const press = setTimeout(() => setApprovePressing(true), M03_APPROVE_GATE_MS);
    const advance = setTimeout(() => {
      setApprovePressing(false);
      setApproveStep(s => s + 1);
    }, M03_APPROVE_GATE_MS + M03_APPROVE_TRANSITION_MS);
    return () => { clearTimeout(press); clearTimeout(advance); };
  }, [mode, started, approveStep, autoPlayCompleted]);

  // Autonomous-mode progression: rapid step ticking.
  useEffect(() => {
    if (mode !== 'autonomous') return;
    if (autoStep >= M03_AUTO_STEPS.length) {
      setAutoDone(true);
      // First time we reach the end, mark auto-play complete so the
      // user can freely toggle.
      if (!autoPlayCompleted) setAutoPlayCompleted(true);
      return;
    }
    const t = setTimeout(() => setAutoStep(s => s + 1), M03_AUTO_STEP_MS);
    return () => clearTimeout(t);
  }, [mode, autoStep, autoPlayCompleted]);

  // User-driven toggle. Reset the relevant mode's state so the demo
  // replays cleanly when they click between modes.
  function handleToggle(next: M03Mode) {
    if (next === mode) return;
    if (next === 'approve') {
      setApproveStep(0);
      setApprovePressing(false);
      setApproveDone(false);
    } else {
      setAutoStep(0);
      setAutoDone(false);
    }
    setMode(next);
  }

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32">
      <div className="max-w-screen-lg mx-auto px-6">

        {/* Header — centered */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto"
        >
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Capability 03 / 07
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            You decide how much rope she gets.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Bella runs in two modes. Pick which one fits the task —
            or the team running it. Switch any time.
          </p>
        </motion.div>

        {/* Toggle */}
        <div className="mt-10 flex justify-center">
          <M03Toggle mode={mode} onChange={handleToggle} />
        </div>

        {/* Demo card */}
        <div className="mt-8 max-w-2xl mx-auto">
          <div
            className="rounded-2xl border border-border overflow-hidden"
            style={{
              background:
                'linear-gradient(180deg, rgba(19,24,41,0.95) 0%, rgba(13,18,35,0.95) 100%)',
              boxShadow: '0 18px 50px -20px rgba(0,0,0,0.6)',
              minHeight: 360,
            }}
          >
            {/* Header strip — Bella state varies by mode + completion */}
            <div
              className="px-5 py-3 border-b border-border flex items-center gap-2.5"
              style={{ background: 'rgba(255,255,255,0.015)' }}
            >
              <PulseDot
                color={
                  mode === 'approve' && !approveDone ? 'rgb(255 196 99)' :
                  mode === 'autonomous' && !autoDone ? 'rgb(255 196 99)' :
                                                       'rgb(111 207 151)'
                }
                size={8}
              />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-text">BELLA</span>
              <span className="text-text-dim text-[11px]">·</span>
              <span
                className="text-[11px]"
                style={{
                  color:
                    mode === 'approve' && !approveDone ? 'rgb(255 196 99)' :
                    mode === 'autonomous' && !autoDone ? 'rgb(255 196 99)' :
                                                         'rgb(111 207 151)',
                }}
              >
                {mode === 'approve'
                  ? (approveDone ? 'Done · all steps approved' : 'Awaiting your approval')
                  : (autoDone    ? 'Done in 18s'                : 'Working autonomously')}
              </span>
            </div>

            {/* Task row */}
            <div className="px-5 md:px-6 pt-5">
              <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-1.5">
                Task
              </div>
              <div className="text-sm md:text-[15px] text-text font-medium">
                {M03_TASK}
              </div>
            </div>

            {/* Body — swap content by mode with a cross-fade */}
            <div className="px-5 md:px-6 py-5">
              <AnimatePresence mode="wait">
                {mode === 'approve' ? (
                  <motion.div
                    key="approve"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{    opacity: 0, y: -6 }}
                    transition={{ duration: 0.3 }}
                  >
                    <M03ApproveBody
                      currentStep={approveStep}
                      pressing={approvePressing}
                      done={approveDone}
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="autonomous"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{    opacity: 0, y: -6 }}
                    transition={{ duration: 0.3 }}
                  >
                    <M03AutoBody
                      revealedStep={autoStep}
                      done={autoDone}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Annotation — copy depends on which mode is active */}
          <div className="mt-5 pl-1">
            <div className="h-px w-10 bg-border mb-3" aria-hidden="true" />
            <AnimatePresence mode="wait">
              <motion.p
                key={mode}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{    opacity: 0, y: -4 }}
                transition={{ duration: 0.25 }}
                className="text-[12px] md:text-[13px] text-text-muted leading-relaxed max-w-md"
              >
                {mode === 'approve'
                  ? 'For high-stakes work. Every action passes by you before it happens.'
                  : 'For volume. Bella runs the whole thing and gives you the summary.'}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Pill toggle for Approve vs Autonomous. Real interactive control. */
function M03Toggle({
  mode, onChange,
}: {
  mode:     M03Mode;
  onChange: (m: M03Mode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Bella execution mode"
      className="inline-flex items-center rounded-full border border-border p-1 relative"
      style={{
        background: 'rgba(13,18,35,0.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
      }}
    >
      <M03ToggleButton
        active={mode === 'approve'}
        onClick={() => onChange('approve')}
        icon={<ShieldCheck size={13} />}
        label="Approve each step"
      />
      <M03ToggleButton
        active={mode === 'autonomous'}
        onClick={() => onChange('autonomous')}
        icon={<Sparkles size={13} />}
        label="Autonomous"
      />
    </div>
  );
}

function M03ToggleButton({
  active, onClick, icon, label,
}: {
  active:  boolean;
  onClick: () => void;
  icon:    React.ReactNode;
  label:   string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        'relative px-4 md:px-5 py-2.5 text-[12.5px] md:text-[13px] font-semibold rounded-full transition-colors ' +
        (active ? 'text-white' : 'text-text-muted hover:text-text')
      }
    >
      {/* Shared layout id so the active background slides between buttons */}
      {active && (
        <motion.span
          layoutId="m03-toggle-active"
          className="absolute inset-0 rounded-full"
          style={{
            background: 'linear-gradient(180deg, rgb(108 156 255) 0%, rgb(82 128 235) 100%)',
            boxShadow:  '0 8px 20px -8px rgba(91,140,255,0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative inline-flex items-center gap-2 whitespace-nowrap">
        {icon}
        {label}
      </span>
    </button>
  );
}

/** Approve-mode body — each step shows with an approve gate. */
function M03ApproveBody({
  currentStep, pressing, done,
}: {
  currentStep: number;
  pressing:    boolean;
  done:        boolean;
}) {
  return (
    <ul className="space-y-3">
      {M03_APPROVE_STEPS.map((step, i) => {
        // Past steps are approved; current step has the gate; future hidden.
        const isPast    = i < currentStep || (done && i < M03_APPROVE_STEPS.length);
        const isCurrent = i === currentStep && !done;
        const isFuture  = i > currentStep && !done;
        if (isFuture) return null;
        return (
          <motion.li
            key={i}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="rounded-lg border"
            style={{
              background:  isCurrent ? 'rgba(255,196,99,0.06)' : 'rgba(111,207,151,0.04)',
              borderColor: isCurrent ? 'rgba(255,196,99,0.30)' : 'rgba(111,207,151,0.18)',
            }}
          >
            <div className="px-4 py-3 flex items-start gap-3">
              <span
                className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full mt-0.5"
                style={{
                  background: isPast    ? 'rgba(111,207,151,0.20)' : 'rgba(255,196,99,0.18)',
                  color:      isPast    ? 'rgb(111 207 151)'       : 'rgb(255 196 99)',
                }}
              >
                {isPast    ? <Check    size={12} />
                           : <Loader2 size={12} className="animate-spin" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] text-text leading-snug">{step}</div>
                {isCurrent && (
                  <div className="mt-0.5 text-[11px]" style={{ color: 'rgb(255 196 99)' }}>
                    Waiting for your approval
                  </div>
                )}
              </div>
            </div>

            {/* Approval gate — primary Approve + secondary Stop. Only on current step. */}
            {isCurrent && (
              <div className="px-4 pb-3 pt-1 flex items-center gap-2.5">
                <button
                  type="button"
                  tabIndex={-1}
                  aria-disabled="true"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[12.5px] font-semibold text-white cursor-default select-none transition-all"
                  style={{
                    background: pressing
                      ? 'linear-gradient(180deg, rgb(82 128 235) 0%, rgb(68 112 220) 100%)'
                      : 'linear-gradient(180deg, rgb(108 156 255) 0%, rgb(82 128 235) 100%)',
                    boxShadow: pressing
                      ? '0 3px 10px -3px rgba(91,140,255,0.4), inset 0 1px 0 rgba(255,255,255,0.12)'
                      : '0 6px 18px -6px rgba(91,140,255,0.55), inset 0 1px 0 rgba(255,255,255,0.16)',
                    transform: pressing ? 'scale(0.97)' : 'scale(1)',
                    pointerEvents: 'none',
                  }}
                >
                  <Check size={12} />
                  Approve
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  aria-disabled="true"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-[12.5px] font-medium text-text-muted border border-border cursor-default select-none"
                  style={{ background: 'rgba(255,255,255,0.02)', pointerEvents: 'none' }}
                >
                  <X size={12} />
                  Stop
                </button>
              </div>
            )}
          </motion.li>
        );
      })}

      {/* Done summary */}
      {done && (
        <motion.li
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-lg border px-4 py-3"
          style={{
            background:  'rgba(111,207,151,0.05)',
            borderColor: 'rgba(111,207,151,0.25)',
          }}
        >
          <div className="text-[13px] text-text">
            All four steps approved. Sequence is live.
          </div>
        </motion.li>
      )}
    </ul>
  );
}

/** Autonomous-mode body — clean checklist that ticks off rapidly. */
function M03AutoBody({
  revealedStep, done,
}: {
  revealedStep: number;
  done:         boolean;
}) {
  const visibleSteps = done ? M03_AUTO_STEPS.length : Math.min(revealedStep + 1, M03_AUTO_STEPS.length);
  return (
    <div>
      <ul className="space-y-2.5">
        {M03_AUTO_STEPS.slice(0, visibleSteps).map((step, i) => {
          const isCurrent = i === revealedStep && !done;
          return (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="flex items-center gap-3 text-[13.5px] leading-snug"
            >
              <span
                className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
                style={{
                  background: isCurrent ? 'rgba(255,196,99,0.18)' : 'rgba(111,207,151,0.20)',
                  color:      isCurrent ? 'rgb(255 196 99)'       : 'rgb(111 207 151)',
                }}
              >
                {isCurrent
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Check   size={12} />}
              </span>
              <span className="text-text">{step}</span>
            </motion.li>
          );
        })}
      </ul>

      {done && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="mt-5 pt-4 border-t border-border"
        >
          <div className="text-[13px] text-text-muted">
            14 emails sent. Tracking enabled. Bella will route replies as
            they land and run the follow-up sequence automatically.
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 6. Moment 04 — She does the work Qatar requires. (operational filings)
// ───────────────────────────────────────────────────────────────────────────

/**
 * The moat moment. Bella does the operational work that nobody else's
 * AI agent can: WPS submissions, tax filings, ministry forms — work
 * that requires Qatar-specific knowledge, local integrations, and the
 * customer's own data. Generic AI agents can summarise; Bella can file.
 *
 * Two-column layout:
 *   LEFT (sticky) — eyebrow + heading + body that names the moat plainly
 *   RIGHT          — the WPS filing card with animated step progression,
 *                    followed by a panel of other operational work Bella
 *                    handles, then the annotation
 *
 * Animation: when the section enters the viewport, the WPS filing card
 * builds up step by step (similar to Moment 01's Bella-working card,
 * but more substantial — five steps, real Qatari context). Once
 * complete, the "other ops" panel fades in below.
 *
 * Numbers shown (84 employees, QAR 1,247,500 transferred, confirmation
 * number WPS-2026-05-04827) are illustrative sample data, presented as
 * a representative example of one Bella run.
 */

type M04Stage = 'idle' | 'filing' | 'filed' | 'done';

const M04_FILING_STEPS = [
  'Pulled 84 employees from payroll',
  'Validated 84 active QID statuses',
  'Generated WPS SIF file',
  'Submitted to Ministry of Labour',
  'Confirmation received',
];
const M04_STEP_INTERVAL_MS = 750;
const M04_AFTER_FILING_PAUSE_MS = 700;

const M04_OTHER_OPS = [
  { icon: Receipt,       label: 'VAT & tax filings',              hint: 'Monthly returns, annual reconciliation'    },
  { icon: Banknote,      label: 'Monthly payroll runs',            hint: 'Bank files, statutory deductions, payslips' },
  { icon: Briefcase,     label: 'Trade licence renewals',          hint: 'MOCI submissions, document gathering'      },
  { icon: FileCheck,     label: 'Commercial registration updates', hint: 'Director changes, capital, addresses'      },
  { icon: CalendarClock, label: 'Compliance deadline tracking',    hint: 'Surfaces what is due, before it is due'    },
  { icon: Landmark,      label: 'Ministry portal interactions',    hint: 'On your behalf, with full audit trail'      },
];

function Moment04() {
  const [stage, setStage] = useState<M04Stage>('idle');
  const [step,  setStep]  = useState(0);

  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && stage === 'idle') {
          setStage('filing');
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [stage]);

  // Step ticker — advances one step at a time while filing.
  useEffect(() => {
    if (stage !== 'filing') return;
    if (step >= M04_FILING_STEPS.length) {
      const t = setTimeout(() => setStage('filed'), M04_AFTER_FILING_PAUSE_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep(s => s + 1), M04_STEP_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [stage, step]);

  // Stage transitions after filing.
  useEffect(() => {
    if (stage !== 'filed') return;
    const t = setTimeout(() => setStage('done'), 900);
    return () => clearTimeout(t);
  }, [stage]);

  const filingComplete = stage === 'filed' || stage === 'done';
  const showOtherOps   = stage === 'done';

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">

          {/* LEFT — sticky prose */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-5 lg:sticky lg:top-24"
          >
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
              Capability 04 / 07
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
              She does the work<br/>Qatar requires.
            </h2>
            <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed max-w-md">
              Bella speaks the operational language of doing business
              here. WPS submissions, tax filings, ministry forms,
              renewals — the work nobody enjoys, done end to end.
            </p>
            <div
              className="mt-7 inline-flex items-center gap-2.5 px-3.5 py-2 rounded-md border"
              style={{
                background:  'rgba(91,140,255,0.06)',
                borderColor: 'rgba(91,140,255,0.22)',
              }}
            >
              <span className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                Why this matters
              </span>
              <span className="text-text-dim">·</span>
              <span className="text-[12.5px] text-text">
                Try asking a generic AI to file your WPS.
              </span>
            </div>
          </motion.div>

          {/* RIGHT — filing card + other ops + annotation */}
          <div className="lg:col-span-7 relative">

            {/* WPS filing card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-80px' }}
              transition={{ duration: 0.5 }}
              className="rounded-xl border overflow-hidden"
              style={{
                background: filingComplete
                  ? 'linear-gradient(180deg, rgba(18,28,22,0.95) 0%, rgba(12,20,16,0.95) 100%)'
                  : 'linear-gradient(180deg, rgba(28,24,16,0.95) 0%, rgba(20,18,12,0.95) 100%)',
                borderColor: filingComplete ? 'rgba(111,207,151,0.32)' : 'rgba(255,196,99,0.30)',
                boxShadow: filingComplete
                  ? '0 18px 50px -20px rgba(111,207,151,0.22)'
                  : '0 18px 50px -20px rgba(255,196,99,0.18)',
              }}
            >
              {/* Header */}
              <div
                className="px-5 py-3 border-b flex items-center gap-2.5"
                style={{
                  borderColor: filingComplete ? 'rgba(111,207,151,0.20)' : 'rgba(255,196,99,0.18)',
                  background:  filingComplete ? 'rgba(111,207,151,0.05)' : 'rgba(255,196,99,0.04)',
                }}
              >
                <PulseDot color={filingComplete ? 'rgb(111 207 151)' : 'rgb(255 196 99)'} size={8} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text">BELLA</span>
                <span className="text-text-dim text-[11px]">·</span>
                <span
                  className="text-[11px]"
                  style={{ color: filingComplete ? 'rgb(111 207 151)' : 'rgb(255 196 99)' }}
                >
                  {filingComplete ? 'Done in 47s' : 'Filing in progress'}
                </span>
              </div>

              {/* Subject line */}
              <div className="px-5 md:px-6 pt-5">
                <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-1.5">
                  Submission
                </div>
                <div className="text-sm md:text-[15px] text-text font-medium flex items-center gap-2">
                  <Landmark size={14} className="text-text-dim" />
                  WPS · May 2026 · Ministry of Labour
                </div>
              </div>

              {/* Step list */}
              <div className="px-5 md:px-6 py-5">
                <ul className="space-y-2.5">
                  {M04_FILING_STEPS.map((label, i) => {
                    const done    = filingComplete || i < step;
                    const active  = !filingComplete && i === step;
                    const pending = !filingComplete && i > step;
                    if (pending) return (
                      <li key={i} className="flex items-center gap-3 text-[13.5px] leading-snug text-text-dim/70">
                        <span
                          className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
                          style={{ background: 'rgba(120,130,152,0.08)', color: 'rgb(120 130 152)' }}
                        >
                          <span className="w-1 h-1 rounded-full bg-current" />
                        </span>
                        <span>{label}</span>
                      </li>
                    );
                    return (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25 }}
                        className="flex items-center gap-3 text-[13.5px] leading-snug text-text"
                      >
                        <span
                          className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
                          style={{
                            background: done   ? 'rgba(111,207,151,0.20)' : 'rgba(255,196,99,0.18)',
                            color:      done   ? 'rgb(111 207 151)'       : 'rgb(255 196 99)',
                          }}
                        >
                          {done   ? <Check    size={12} />
                                  : <Loader2 size={12} className="animate-spin" />}
                        </span>
                        <span>{label}</span>
                      </motion.li>
                    );
                  })}
                </ul>
              </div>

              {/* Footer — appears once filing is complete */}
              <AnimatePresence>
                {filingComplete && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.4 }}
                    className="overflow-hidden"
                  >
                    <div
                      className="px-5 md:px-6 py-4 border-t"
                      style={{ borderColor: 'rgba(111,207,151,0.20)' }}
                    >
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-1">
                            Salaries paid
                          </div>
                          <div className="text-sm text-text font-mono">
                            84 employees
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-1">
                            Total transferred
                          </div>
                          <div className="text-sm text-text font-mono tabular-nums">
                            QAR 1,247,500
                          </div>
                        </div>
                      </div>
                      <div
                        className="rounded-md px-3 py-2 inline-flex items-center gap-2 font-mono text-[12px]"
                        style={{
                          background:  'rgba(111,207,151,0.08)',
                          border:      '1px solid rgba(111,207,151,0.22)',
                        }}
                      >
                        <Check size={11} style={{ color: 'rgb(111 207 151)' }} />
                        <span className="text-text-muted">Confirmation</span>
                        <span className="text-text">WPS-2026-05-04827</span>
                      </div>
                      <div className="mt-3 text-[11.5px] text-text-dim">
                        Receipt filed to your records · audit log updated
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

            {/* "Other operational work Bella handles" panel */}
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={showOtherOps ? { opacity: 1, y: 0 } : { opacity: 0, y: 18 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-5 rounded-xl border border-border overflow-hidden"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
              }}
            >
              <div
                className="px-5 py-3 border-b border-border"
                style={{ background: 'rgba(255,255,255,0.015)' }}
              >
                <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
                  Other Qatar-specific work she handles
                </div>
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-border">
                {M04_OTHER_OPS.map((op, i) => {
                  const Icon = op.icon;
                  // Right-column items get a left border on >=sm; bottom row gets top border
                  const isRightCol = i % 2 === 1;
                  const isBottomRow = i >= 2;
                  return (
                    <li
                      key={i}
                      className={
                        'p-4 flex items-start gap-3 ' +
                        (isRightCol ? 'sm:border-l sm:border-border ' : '') +
                        (isBottomRow ? 'sm:border-t sm:border-border ' : '')
                      }
                    >
                      <span
                        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md text-accent-bright"
                        style={{ background: 'rgba(91,140,255,0.12)' }}
                      >
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-text leading-tight">
                          {op.label}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-text-muted leading-snug">
                          {op.hint}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </motion.div>

            {/* Annotation */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={showOtherOps ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="mt-5 pl-1"
            >
              <div className="h-px w-10 bg-border mb-3" aria-hidden="true" />
              <p className="text-[12px] md:text-[13px] text-text-muted leading-relaxed max-w-md">
                Generic AI agents can summarise paperwork. Bella files it.
                The work Qatar requires, handled by a system that
                actually plugs into Qatar.
              </p>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 7. Moment 05 — She doesn't wait. She acts. (a signal acted on)
// ───────────────────────────────────────────────────────────────────────────

/**
 * The proactive moment. Unlike Moments 01–04 where the user initiates,
 * here Bella initiates: she watches the signal stream (hirings, funding,
 * leadership moves, regulatory shifts, expansions) and surfaces the ones
 * that match the user's ICP — already with the outreach drafted.
 *
 * This is the section that ties the Bell.qa Signals & Insights layer to
 * Bella's action layer. The data is the moat; Bella is what converts it.
 *
 * Two-column layout:
 *   LEFT (sticky) — eyebrow + heading + body + pull-quote chip
 *   RIGHT          — live signal feed (4 cards, one highlighted), a
 *                    connector ("Bella acted on this signal"), and the
 *                    full Bella action card with reasoning, match score,
 *                    drafted email preview, and three buttons (Send /
 *                    Edit first / Dismiss)
 *
 * Animation: on viewport entry the feed cards stagger in, the third
 * card highlights as Bella's pick, the connector appears, then the
 * action card builds up section by section (why → match → email →
 * buttons → annotation).
 */

type M05Stage =
  | 'idle'
  | 'feed-1' | 'feed-2' | 'feed-3' | 'feed-4'
  | 'highlight'
  | 'card-in'
  | 'why-in'
  | 'email-in'
  | 'buttons-in'
  | 'done';

type SignalKind = 'hiring' | 'funding' | 'leadership' | 'expansion';

const M05_SIGNAL_FEED: {
  kind: SignalKind;
  headline: string;
  meta: string;
  when: string;
  highlighted?: boolean;
}[] = [
  {
    kind:    'leadership',
    headline:'Mohammed Al-Marri left Acme Logistics for Doha Freight',
    meta:    'LinkedIn · Public announcement',
    when:    '24m ago',
  },
  {
    kind:    'funding',
    headline:'Apex Insurance raised QAR 240M Series B',
    meta:    'QSE filing · MOCI update',
    when:    '18m ago',
  },
  {
    kind:    'hiring',
    headline:'Qatari Logistics Co. — Hiring HR Director (Doha)',
    meta:    'Job posting · Direct careers page',
    when:    '12m ago',
    highlighted: true,
  },
  {
    kind:    'expansion',
    headline:'Al-Rayyan Petroleum announced expansion into Kuwait',
    meta:    'Press release · MOCI Kuwait filing',
    when:    '6m ago',
  },
];

const SIGNAL_ICONS: Record<SignalKind, React.ComponentType<{ size?: number | string }>> = {
  hiring:     Briefcase,
  funding:    TrendingUp,
  leadership: Users,
  expansion:  Landmark,
};

const SIGNAL_TINTS: Record<SignalKind, string> = {
  hiring:     'rgb(91 140 255)',   // brand blue
  funding:    'rgb(111 207 151)',  // green
  leadership: 'rgb(196 154 255)',  // violet
  expansion:  'rgb(255 196 99)',   // amber
};

function Moment05() {
  const [stage, setStage] = useState<M05Stage>('idle');
  const sectionRef = useRef<HTMLElement>(null);

  // Trigger sequence on viewport entry.
  useEffect(() => {
    if (!sectionRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && stage === 'idle') {
          setStage('feed-1');
        }
      },
      { threshold: 0.3 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [stage]);

  // Stage progression — each stage triggers the next after a delay.
  useEffect(() => {
    const next: Record<M05Stage, [M05Stage, number] | null> = {
      idle:        null,
      'feed-1':    ['feed-2',     350],
      'feed-2':    ['feed-3',     350],
      'feed-3':    ['feed-4',     350],
      'feed-4':    ['highlight',  500],
      'highlight': ['card-in',    700],
      'card-in':   ['why-in',     500],
      'why-in':    ['email-in',   700],
      'email-in':  ['buttons-in', 600],
      'buttons-in':['done',       600],
      done:        null,
    };
    const step = next[stage];
    if (!step) return;
    const t = setTimeout(() => setStage(step[0]), step[1]);
    return () => clearTimeout(t);
  }, [stage]);

  // Visibility flags
  const ORDER: M05Stage[] = [
    'idle', 'feed-1', 'feed-2', 'feed-3', 'feed-4',
    'highlight', 'card-in', 'why-in', 'email-in', 'buttons-in', 'done',
  ];
  const sIdx = ORDER.indexOf(stage);
  const past = (s: M05Stage) => sIdx >= ORDER.indexOf(s);

  const visibleFeedCount =
    sIdx >= ORDER.indexOf('feed-4') ? 4 :
    sIdx >= ORDER.indexOf('feed-3') ? 3 :
    sIdx >= ORDER.indexOf('feed-2') ? 2 :
    sIdx >= ORDER.indexOf('feed-1') ? 1 : 0;

  const showHighlight  = past('highlight');
  const showConnector  = past('card-in');
  const showCard       = past('card-in');
  const showWhy        = past('why-in');
  const showEmail      = past('email-in');
  const showButtons    = past('buttons-in');
  const showAnnotation = past('done');

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">

          {/* LEFT — sticky prose */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-5 lg:sticky lg:top-24"
          >
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
              Capability 05 / 07
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
              She doesn&apos;t wait.<br/>She acts.
            </h2>
            <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed max-w-md">
              Bella watches every signal across the Qatari market —
              hirings, funding, leadership changes, regulatory moves,
              expansions. The moment one matters to you, she&apos;s
              already drafted the outreach.
            </p>
            <div
              className="mt-7 inline-flex items-center gap-2.5 px-3.5 py-2 rounded-md border"
              style={{
                background:  'rgba(91,140,255,0.06)',
                borderColor: 'rgba(91,140,255,0.22)',
              }}
            >
              <span className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                How this lands
              </span>
              <span className="text-text-dim">·</span>
              <span className="text-[12.5px] text-text">
                She brings the lead with the work already started.
              </span>
            </div>
          </motion.div>

          {/* RIGHT — feed + connector + action card + annotation */}
          <div className="lg:col-span-7 relative">

            {/* Live signal feed */}
            <div
              className="rounded-xl border border-border overflow-hidden"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
              }}
            >
              <div
                className="px-5 py-3 border-b border-border flex items-center justify-between gap-2"
                style={{ background: 'rgba(255,255,255,0.015)' }}
              >
                <div className="flex items-center gap-2">
                  <Radar size={12} className="text-accent-bright" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-dim">
                    Live signals · Qatar
                  </span>
                </div>
                <PulseDot color="rgb(111 207 151)" size={6} />
              </div>
              <ul>
                {M05_SIGNAL_FEED.map((sig, i) => (
                  <SignalRow
                    key={i}
                    signal={sig}
                    visible={i < visibleFeedCount}
                    highlighted={sig.highlighted === true && showHighlight}
                    divided={i < M05_SIGNAL_FEED.length - 1}
                  />
                ))}
              </ul>
            </div>

            {/* Connector between feed and Bella's action card */}
            <AnimatePresence>
              {showConnector && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.4 }}
                  className="flex flex-col items-center py-3"
                >
                  <span
                    className="w-px h-5"
                    style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(91,140,255,0.5) 100%)' }}
                    aria-hidden="true"
                  />
                  <span
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-wider font-semibold"
                    style={{
                      color:       'rgb(165 195 255)',
                      background:  'rgba(91,140,255,0.10)',
                      borderColor: 'rgba(91,140,255,0.32)',
                    }}
                  >
                    <Sparkles size={10} />
                    Bella acted on this
                  </span>
                  <span
                    className="w-px h-5"
                    style={{ background: 'linear-gradient(180deg, rgba(91,140,255,0.5) 0%, transparent 100%)' }}
                    aria-hidden="true"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Bella action card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={showCard ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
              className="rounded-xl border overflow-hidden"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
                borderColor: 'rgba(91,140,255,0.32)',
                boxShadow:   '0 18px 50px -20px rgba(91,140,255,0.25)',
              }}
            >
              {/* Header */}
              <div
                className="px-5 py-3 border-b flex items-center gap-2.5"
                style={{
                  borderColor: 'rgba(91,140,255,0.20)',
                  background:  'rgba(91,140,255,0.05)',
                }}
              >
                <PulseDot color="rgb(111 207 151)" size={8} />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-text">BELLA</span>
                <span className="text-text-dim text-[11px]">·</span>
                <span className="text-[11px] text-text-muted">Caught this 12 mins ago</span>
              </div>

              {/* Body */}
              <div className="p-5 md:p-6">

                {/* Why this matters */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={showWhy ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className="flex items-center justify-between mb-3 gap-3">
                    <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold">
                      Why this matches your ICP
                    </div>
                    <span
                      className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border tabular-nums"
                      style={{
                        color:       'rgb(111 207 151)',
                        background:  'rgba(111,207,151,0.10)',
                        borderColor: 'rgba(111,207,151,0.30)',
                      }}
                    >
                      Match 94 / 100
                    </span>
                  </div>
                  <ul className="space-y-1.5 mb-5">
                    <ReasonRow text="In your ICP — logistics sector, Doha-based" />
                    <ReasonRow text="Hiring an HR Director — typical trigger for HR-systems evaluation" />
                    <ReasonRow text="Your firm has 14 logistics customers Bella can reference" />
                  </ul>
                </motion.div>

                {/* Drafted email preview */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={showEmail ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.4 }}
                >
                  <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-2 flex items-center gap-1.5">
                    <Mail size={11} />
                    Drafted outreach
                  </div>
                  <div
                    className="rounded-lg border overflow-hidden"
                    style={{
                      background:  'rgba(13,18,35,0.7)',
                      borderColor: 'rgba(91,140,255,0.20)',
                    }}
                  >
                    <div className="px-4 py-2.5 border-b text-[11px] text-text-muted"
                      style={{ borderColor: 'rgba(91,140,255,0.15)' }}>
                      <span className="text-text-dim">To:</span> people-ops@qatari-logistics.qa
                    </div>
                    <div className="px-4 py-2.5 border-b text-[12.5px] text-text font-medium leading-snug"
                      style={{ borderColor: 'rgba(91,140,255,0.15)' }}>
                      On your HR Director search — quick context from inside the sector
                    </div>
                    <div className="px-4 py-3 text-[12.5px] text-text-muted leading-relaxed">
                      Caught your post for an HR Director. We&apos;ve helped
                      14 logistics firms across Qatar standardise people
                      operations on a single platform. If useful I can
                      share what worked for one at your stage — 15 mins
                      next week?
                    </div>
                  </div>
                </motion.div>

                {/* Three action buttons */}
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={showButtons ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
                  transition={{ duration: 0.4 }}
                  className="mt-6 flex flex-wrap items-center gap-3"
                >
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-disabled="true"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-[14px] font-semibold text-white cursor-default select-none"
                    style={{
                      background: 'linear-gradient(180deg, rgb(108 156 255) 0%, rgb(82 128 235) 100%)',
                      boxShadow:  '0 10px 24px -8px rgba(91,140,255,0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
                      pointerEvents: 'none',
                    }}
                  >
                    <Sparkles size={14} />
                    Send now
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-disabled="true"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13.5px] font-semibold text-text-muted border border-border cursor-default select-none"
                    style={{ background: 'rgba(255,255,255,0.02)', pointerEvents: 'none' }}
                  >
                    <PencilLine size={13} />
                    Edit first
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-disabled="true"
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium text-text-dim cursor-default select-none"
                    style={{ pointerEvents: 'none' }}
                  >
                    <X size={13} />
                    Dismiss
                  </button>
                </motion.div>
              </div>
            </motion.div>

            {/* Annotation */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={showAnnotation ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.4 }}
              className="mt-5 pl-1"
            >
              <div className="h-px w-10 bg-border mb-3" aria-hidden="true" />
              <p className="text-[12px] md:text-[13px] text-text-muted leading-relaxed max-w-md">
                Most teams hear about a signal days after the market does.
                Bella catches it the moment it lands, scores it against
                your ICP, and brings you the lead with the work already
                started.
              </p>
              <Link
                href="/platform/signals-and-insights"
                className="inline-flex items-center gap-1.5 mt-3 text-[12px] font-semibold text-accent-bright hover:text-text transition-colors"
              >
                Learn more about Signals &amp; Insights
                <ArrowRight size={11} />
              </Link>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}

/** A single row in the live signal feed. */
function SignalRow({
  signal, visible, highlighted, divided,
}: {
  signal: typeof M05_SIGNAL_FEED[number];
  visible:     boolean;
  highlighted: boolean;
  divided:     boolean;
}) {
  const Icon = SIGNAL_ICONS[signal.kind];
  const tint = SIGNAL_TINTS[signal.kind];

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
      transition={{ duration: 0.3 }}
      className={
        'relative px-4 py-3 flex items-start gap-3 transition-colors ' +
        (divided ? 'border-b border-border ' : '')
      }
      style={{
        background: highlighted ? 'rgba(91,140,255,0.06)' : undefined,
      }}
    >
      {/* Left accent stripe for the highlighted card */}
      {highlighted && (
        <motion.span
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ duration: 0.3 }}
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r"
          style={{ background: 'rgb(91 140 255)', transformOrigin: 'center' }}
          aria-hidden="true"
        />
      )}
      <span
        className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md"
        style={{
          background: tint.replace('rgb', 'rgba').replace(')', ' / 0.12)'),
          color:      tint,
        }}
      >
        <Icon size={14} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-text leading-snug">
          {signal.headline}
        </div>
        <div className="mt-0.5 text-[11px] text-text-dim leading-tight">
          {signal.meta}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-[10px] font-mono text-text-dim tabular-nums">
          {signal.when}
        </span>
        {highlighted && (
          <motion.span
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              color:      'rgb(165 195 255)',
              background: 'rgba(91,140,255,0.14)',
              border:     '1px solid rgba(91,140,255,0.30)',
            }}
          >
            <Sparkles size={9} />
            Bella
          </motion.span>
        )}
      </div>
    </motion.li>
  );
}

/** Small bullet row used in the "Why this matters" list. */
function ReasonRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2.5 text-[13px] text-text-muted leading-snug">
      <span
        className="shrink-0 inline-flex items-center justify-center w-4 h-4 rounded-full mt-0.5"
        style={{ background: 'rgba(111,207,151,0.18)', color: 'rgb(111 207 151)' }}
      >
        <Check size={10} />
      </span>
      <span>{text}</span>
    </li>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 8. Moment 06 — She runs the whole loop. (24-hour dashboard)
// ───────────────────────────────────────────────────────────────────────────

/**
 * The closing capability. Brings everything from Moments 01–05 together
 * as one continuous revenue motion: Signal → Draft → Send → Track →
 * Reply → Meeting → loop. Visualised as a "Bella · Last 24 hours"
 * dashboard with three stacked sections:
 *
 *   1. KPI strip       — four headline numbers tick up from 0 to the
 *                        day's totals (sent / replies / meetings / deals)
 *   2. Loop diagram    — six horizontal nodes with a traveling "active"
 *                        indicator that cycles continuously, conveying
 *                        the loop never stops
 *   3. Activity feed   — five recent Bella actions across multiple
 *                        prospects, fading in one after another
 *
 * Position: this is the section that ties the whole page together. The
 * previous capabilities show Bella doing one specific thing each.
 * Moment 06 shows what happens when all of them are running together
 * across your book of business.
 */

type M06Stage =
  | 'idle'
  | 'card-in'
  | 'kpi-in'
  | 'loop-in'
  | 'feed-in'
  | 'done';

const M06_KPI_FINAL = { sent: 87, replies: 23, meetings: 11, deals: 6 };
const M06_KPI_TICK_DURATION_MS = 1800;
const M06_KPI_TICK_STEPS = 36;

const M06_LOOP_NODES = [
  { label: 'Signal',   icon: Radar          },
  { label: 'Draft',    icon: PencilLine     },
  { label: 'Send',     icon: Send           },
  { label: 'Track',    icon: Activity       },
  { label: 'Reply',    icon: MessageSquare  },
  { label: 'Meeting',  icon: CalendarClock  },
];
const M06_LOOP_NODE_INTERVAL_MS = 700;

type M06ActivityKind = 'sent' | 'reply' | 'meeting' | 'followup' | 'crm';
const M06_ACTIVITY_FEED: { kind: M06ActivityKind; when: string; text: string }[] = [
  { kind: 'sent',     when: '2m ago',  text: 'Sent outreach to Apex Insurance · 12 contacts'             },
  { kind: 'reply',    when: '5m ago',  text: 'Reply from Mohammed Al-Marri at Doha Freight'             },
  { kind: 'meeting',  when: '8m ago',  text: 'Meeting booked · Khalid Hassan · Tue 10:30 AM'            },
  { kind: 'followup', when: '11m ago', text: 'Follow-up sequence triggered for 4 unanswered threads'    },
  { kind: 'crm',      when: '14m ago', text: 'CRM updated · 3 deals advanced to Negotiation'            },
];
const M06_ACTIVITY_ICONS: Record<M06ActivityKind, React.ComponentType<{ size?: number | string }>> = {
  sent:     Send,
  reply:    MessageSquare,
  meeting:  CalendarClock,
  followup: RefreshCw,
  crm:      Check,
};
const M06_ACTIVITY_COLORS: Record<M06ActivityKind, string> = {
  sent:     'rgb(91 140 255)',   // brand blue
  reply:    'rgb(111 207 151)',  // green
  meeting:  'rgb(196 154 255)',  // violet
  followup: 'rgb(255 196 99)',   // amber
  crm:      'rgb(165 195 255)',  // light blue
};

function Moment06() {
  const [stage, setStage] = useState<M06Stage>('idle');
  const [kpi, setKpi] = useState({ sent: 0, replies: 0, meetings: 0, deals: 0 });
  const [activeLoopIdx, setActiveLoopIdx] = useState(0);
  const [feedCount, setFeedCount] = useState(0);

  const sectionRef = useRef<HTMLElement>(null);

  // Trigger on viewport entry.
  useEffect(() => {
    if (!sectionRef.current) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && stage === 'idle') {
          setStage('card-in');
        }
      },
      { threshold: 0.25 }
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [stage]);

  // Stage progression.
  useEffect(() => {
    const next: Record<M06Stage, [M06Stage, number] | null> = {
      idle:      null,
      'card-in': ['kpi-in',  450],
      'kpi-in':  ['loop-in', 1900],   // long enough for KPI ticker to finish
      'loop-in': ['feed-in', 600],
      'feed-in': ['done',    2400],   // long enough for feed entries to land
      done:      null,
    };
    const step = next[stage];
    if (!step) return;
    const t = setTimeout(() => setStage(step[0]), step[1]);
    return () => clearTimeout(t);
  }, [stage]);

  // KPI ticker — interpolate over fixed duration once kpi-in fires.
  useEffect(() => {
    if (stage !== 'kpi-in' && stage !== 'loop-in' && stage !== 'feed-in' && stage !== 'done') return;
    if (kpi.sent === M06_KPI_FINAL.sent) return; // already done
    const stepMs = M06_KPI_TICK_DURATION_MS / M06_KPI_TICK_STEPS;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      const t = Math.min(1, i / M06_KPI_TICK_STEPS);
      setKpi({
        sent:     Math.round(M06_KPI_FINAL.sent     * t),
        replies:  Math.round(M06_KPI_FINAL.replies  * t),
        meetings: Math.round(M06_KPI_FINAL.meetings * t),
        deals:    Math.round(M06_KPI_FINAL.deals    * t),
      });
      if (i >= M06_KPI_TICK_STEPS) clearInterval(interval);
    }, stepMs);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Loop ticker — once loop-in fires, the active node cycles through the
  // six nodes forever (every M06_LOOP_NODE_INTERVAL_MS). This is the
  // "always running" visual signal.
  useEffect(() => {
    if (stage !== 'loop-in' && stage !== 'feed-in' && stage !== 'done') return;
    const interval = setInterval(() => {
      setActiveLoopIdx(i => (i + 1) % M06_LOOP_NODES.length);
    }, M06_LOOP_NODE_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [stage]);

  // Activity feed — reveals one entry at a time once feed-in fires.
  useEffect(() => {
    if (stage !== 'feed-in' && stage !== 'done') return;
    if (feedCount >= M06_ACTIVITY_FEED.length) return;
    const t = setTimeout(() => setFeedCount(c => c + 1), 380);
    return () => clearTimeout(t);
  }, [stage, feedCount]);

  const showCard       = stage !== 'idle';
  const showKpi        = stage === 'kpi-in' || stage === 'loop-in' || stage === 'feed-in' || stage === 'done';
  const showLoop       = stage === 'loop-in' || stage === 'feed-in' || stage === 'done';
  const showFeed       = stage === 'feed-in' || stage === 'done';
  const showAnnotation = stage === 'done';

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">

          {/* LEFT — sticky prose */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-5 lg:sticky lg:top-24"
          >
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
              Capability 06 / 07
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
              She runs the whole loop.
            </h2>
            <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed max-w-md">
              Signals to first touch. First touch to reply. Reply to
              meeting. Meeting to deal. Every step in the revenue
              motion, Bella&apos;s. You watch the pipeline build
              itself.
            </p>
            <div
              className="mt-7 inline-flex items-center gap-2.5 px-3.5 py-2 rounded-md border"
              style={{
                background:  'rgba(91,140,255,0.06)',
                borderColor: 'rgba(91,140,255,0.22)',
              }}
            >
              <span className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                The closing capability
              </span>
              <span className="text-text-dim">·</span>
              <span className="text-[12.5px] text-text">
                Everything above, running together.
              </span>
            </div>
          </motion.div>

          {/* RIGHT — the dashboard */}
          <div className="lg:col-span-7 relative">

            {/* Dashboard card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={showCard ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
              className="rounded-2xl border border-border overflow-hidden"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
                boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6)',
              }}
            >
              {/* Dashboard header */}
              <div
                className="px-5 py-3 border-b border-border flex items-center justify-between gap-3"
                style={{ background: 'rgba(255,255,255,0.015)' }}
              >
                <div className="flex items-center gap-2.5">
                  <PulseDot color="rgb(111 207 151)" size={8} />
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-text">
                    Bella
                  </span>
                  <span className="text-text-dim text-[11px]">·</span>
                  <span className="text-[11px] text-text-muted">Last 24 hours</span>
                </div>
                <span
                  className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border"
                  style={{
                    color:       'rgb(111 207 151)',
                    background:  'rgba(111,207,151,0.08)',
                    borderColor: 'rgba(111,207,151,0.28)',
                  }}
                >
                  Always running
                </span>
              </div>

              {/* KPI strip */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={showKpi ? { opacity: 1 } : { opacity: 0 }}
                transition={{ duration: 0.4 }}
                className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border border-b border-border"
              >
                <KpiCell label="Sent"     value={kpi.sent}     unit="emails"   tone="rgb(91 140 255)"   />
                <KpiCell label="Replies"  value={kpi.replies}  unit="threads"  tone="rgb(111 207 151)"  />
                <KpiCell label="Meetings" value={kpi.meetings} unit="booked"   tone="rgb(196 154 255)"  />
                <KpiCell label="Deals"    value={kpi.deals}    unit="advanced" tone="rgb(255 196 99)"   />
              </motion.div>

              {/* Loop diagram */}
              <div className="px-5 md:px-6 py-6 border-b border-border">
                <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-4 flex items-center gap-1.5">
                  <RefreshCw size={11} />
                  The loop · Bella never stops
                </div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={showLoop ? { opacity: 1 } : { opacity: 0 }}
                  transition={{ duration: 0.5 }}
                >
                  <LoopFlow activeIdx={showLoop ? activeLoopIdx : -1} />
                </motion.div>
              </div>

              {/* Activity feed */}
              <div className="px-5 md:px-6 py-5">
                <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-3">
                  Live activity
                </div>
                <ul className="space-y-2.5">
                  {M06_ACTIVITY_FEED.map((entry, i) => (
                    <FeedRow
                      key={i}
                      entry={entry}
                      visible={showFeed && i < feedCount}
                    />
                  ))}
                </ul>
              </div>
            </motion.div>

            {/* Annotation */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={showAnnotation ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.4 }}
              className="mt-5 pl-1"
            >
              <div className="h-px w-10 bg-border mb-3" aria-hidden="true" />
              <p className="text-[12px] md:text-[13px] text-text-muted leading-relaxed max-w-md">
                Seven capabilities, running together, twenty-four hours
                a day. This is what it looks like when the entire revenue
                motion happens without you having to push it forward.
              </p>
              <Link
                href="/platform/crm"
                className="inline-flex items-center gap-1.5 mt-3 text-[12px] font-semibold text-accent-bright hover:text-text transition-colors"
              >
                See the CRM
                <ArrowRight size={11} />
              </Link>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}

/** Single KPI cell inside the dashboard's KPI strip. */
function KpiCell({
  label, value, unit, tone,
}: {
  label: string;
  value: number;
  unit:  string;
  tone:  string;
}) {
  return (
    <div className="p-5">
      <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-2">
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-3xl md:text-4xl font-semibold tabular-nums leading-none"
          style={{ color: tone }}
        >
          {value.toLocaleString()}
        </span>
        <span className="text-[11px] text-text-dim">{unit}</span>
      </div>
    </div>
  );
}

/**
 * The horizontal loop flow — six nodes with connecting lines. The active
 * node (driven by activeIdx) gets a brighter fill + larger scale, and
 * the connecting line LEADING INTO it pulses brand-blue.
 *
 * Pass activeIdx = -1 to render a "resting" state with no active node.
 */
function LoopFlow({ activeIdx }: { activeIdx: number }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {M06_LOOP_NODES.map((node, i) => {
        const Icon     = node.icon;
        const isActive = i === activeIdx;
        const wasActive = i === ((activeIdx - 1 + M06_LOOP_NODES.length) % M06_LOOP_NODES.length);
        return (
          <div key={node.label} className="flex items-center shrink-0">
            <div className="flex flex-col items-center gap-1.5 min-w-[64px]">
              <motion.div
                animate={{
                  scale: isActive ? 1.12 : 1,
                  background: isActive
                    ? 'rgba(91,140,255,0.18)'
                    : 'rgba(91,140,255,0.06)',
                  boxShadow: isActive
                    ? '0 0 0 1px rgba(91,140,255,0.50), 0 8px 18px -6px rgba(91,140,255,0.45)'
                    : '0 0 0 1px rgba(91,140,255,0.18)',
                }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="inline-flex items-center justify-center w-10 h-10 rounded-lg"
                style={{ color: isActive ? 'rgb(220 232 255)' : 'rgb(165 195 255)' }}
              >
                <Icon size={16} />
              </motion.div>
              <span
                className={
                  'text-[10px] font-semibold uppercase tracking-wider transition-colors ' +
                  (isActive ? 'text-text' : 'text-text-dim')
                }
              >
                {node.label}
              </span>
            </div>

            {/* Connector between this node and the next */}
            {i < M06_LOOP_NODES.length - 1 && (
              <motion.span
                className="h-px w-6 md:w-8 mx-0.5 self-start mt-5"
                animate={{
                  background: wasActive
                    ? 'linear-gradient(90deg, rgba(91,140,255,0.6) 0%, rgba(91,140,255,0.20) 100%)'
                    : 'rgba(91,140,255,0.18)',
                }}
                transition={{ duration: 0.35 }}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** A single row in the dashboard's live activity feed. */
function FeedRow({
  entry, visible,
}: {
  entry:   typeof M06_ACTIVITY_FEED[number];
  visible: boolean;
}) {
  const Icon = M06_ACTIVITY_ICONS[entry.kind];
  const tint = M06_ACTIVITY_COLORS[entry.kind];

  return (
    <motion.li
      initial={{ opacity: 0, x: -6 }}
      animate={visible ? { opacity: 1, x: 0 } : { opacity: 0, x: -6 }}
      transition={{ duration: 0.3 }}
      className="flex items-start gap-3"
    >
      <span
        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md mt-0.5"
        style={{
          background: tint.replace('rgb', 'rgba').replace(')', ' / 0.14)'),
          color:      tint,
        }}
      >
        <Icon size={13} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] text-text leading-snug">{entry.text}</div>
      </div>
      <span className="shrink-0 text-[10px] font-mono text-text-dim tabular-nums whitespace-nowrap mt-1.5">
        {entry.when}
      </span>
    </motion.li>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 9. Moment 07 — She researches what would take you weeks. (deep research)
// ───────────────────────────────────────────────────────────────────────────

/**
 * The seventh capability. Bella performs deep research on any company,
 * person, sector, or topic — reading the web, registries, news,
 * filings, social — and produces a structured report in minutes.
 *
 * Two-column layout. Right side: typed research request → Bella
 * working card with progress → preview of the generated report.
 */

type M07Stage =
  | 'idle' | 'typing' | 'working' | 'workdone' | 'report-in' | 'done';

const M07_REQUEST = 'Deep research: Qatari fintech sector — landscape, funding, regulatory outlook, top players';
const M07_TYPE_MS = 18;

const M07_RESEARCH_STEPS = [
  'Scanned 247 web sources',
  'Pulled 18 regulatory filings',
  'Analysed 34 funding rounds',
  'Identified 6 emerging players',
  'Cross-referenced with 12 international comparables',
  'Structured the report',
];
const M07_STEP_INTERVAL_MS = 520;

const M07_REPORT_TOC = [
  '1. Sector overview · QAR market sizing',
  '2. Regulatory landscape · QCB framework',
  '3. Funding flow · 2024–2026 timeline',
  '4. Top 6 emerging players · profiles',
  '5. International comparables · GCC + Singapore',
  '6. Outlook & strategic recommendations',
];

function Moment07() {
  const [stage, setStage] = useState<M07Stage>('idle');
  const [typedLen, setTypedLen] = useState(0);
  const [step, setStep] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!sectionRef.current) return;
    const obs = new IntersectionObserver(
      (e) => { if (e[0]?.isIntersecting && stage === 'idle') setStage('typing'); },
      { threshold: 0.25 },
    );
    obs.observe(sectionRef.current);
    return () => obs.disconnect();
  }, [stage]);

  useEffect(() => {
    if (stage !== 'typing') return;
    if (typedLen >= M07_REQUEST.length) {
      const t = setTimeout(() => setStage('working'), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setTypedLen(l => l + 1), M07_TYPE_MS);
    return () => clearTimeout(t);
  }, [stage, typedLen]);

  useEffect(() => {
    if (stage !== 'working') return;
    if (step >= M07_RESEARCH_STEPS.length) {
      const t = setTimeout(() => setStage('workdone'), 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setStep(s => s + 1), M07_STEP_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [stage, step]);

  useEffect(() => {
    if (stage === 'workdone') {
      const t = setTimeout(() => setStage('report-in'), 600);
      return () => clearTimeout(t);
    }
    if (stage === 'report-in') {
      const t = setTimeout(() => setStage('done'), 1200);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const showRequest    = stage !== 'idle';
  const showWorking    = stage === 'working' || stage === 'workdone' || stage === 'report-in' || stage === 'done';
  const workComplete   = stage === 'workdone' || stage === 'report-in' || stage === 'done';
  const showReport     = stage === 'report-in' || stage === 'done';
  const showAnnotation = stage === 'done';

  const displayedReq = M07_REQUEST.slice(0, typedLen);
  const typewriterCaret = stage === 'typing' || stage === 'idle';

  return (
    <section ref={sectionRef} className="relative py-24 md:py-32">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">

          {/* LEFT — sticky prose */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.5 }}
            className="lg:col-span-5 lg:sticky lg:top-24"
          >
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
              Capability 07 / 07
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
              She researches what<br/>would take you weeks.
            </h2>
            <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed max-w-md">
              Ask Bella to deep-research any company, person, sector,
              or topic. She reads the web, the registries, the news,
              the filings, the social posts. She compares, measures,
              contextualises. You get a structured report &mdash; in
              minutes &mdash; that would have taken your team days.
            </p>
            <div
              className="mt-7 inline-flex items-center gap-2.5 px-3.5 py-2 rounded-md border"
              style={{
                background:  'rgba(91,140,255,0.06)',
                borderColor: 'rgba(91,140,255,0.22)',
              }}
            >
              <span className="text-[11px] uppercase tracking-wider text-text-dim font-semibold">
                The big unlock
              </span>
              <span className="text-text-dim">·</span>
              <span className="text-[12.5px] text-text">
                Hours of analyst work, in minutes.
              </span>
            </div>
          </motion.div>

          {/* RIGHT — request → working → report */}
          <div className="lg:col-span-7">

            {/* Research request input */}
            <div
              className="rounded-xl border border-border px-4 py-3.5 flex items-start gap-3 min-h-[60px]"
              style={{
                background: 'rgba(19,24,41,0.55)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
              }}
            >
              <FileSearch size={16} className="text-text-dim shrink-0 mt-0.5" />
              <span className="flex-1 text-sm md:text-base text-text leading-snug">
                {showRequest ? displayedReq : ''}
                {typewriterCaret && (
                  <span
                    className="inline-block w-[2px] h-[1.05em] align-[-2px] ml-[1px] animate-pulse"
                    style={{ background: 'rgb(165 195 255)' }}
                    aria-hidden="true"
                  />
                )}
              </span>
            </div>

            {/* Bella working / done card */}
            <AnimatePresence>
              {showWorking && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45 }}
                  className="mt-4 rounded-xl border overflow-hidden"
                  style={{
                    background: workComplete
                      ? 'linear-gradient(180deg, rgba(18,28,22,0.95) 0%, rgba(12,20,16,0.95) 100%)'
                      : 'linear-gradient(180deg, rgba(28,24,16,0.95) 0%, rgba(20,18,12,0.95) 100%)',
                    borderColor: workComplete ? 'rgba(111,207,151,0.32)' : 'rgba(255,196,99,0.30)',
                  }}
                >
                  <div
                    className="px-5 py-3 border-b flex items-center gap-2.5"
                    style={{
                      borderColor: workComplete ? 'rgba(111,207,151,0.20)' : 'rgba(255,196,99,0.18)',
                      background:  workComplete ? 'rgba(111,207,151,0.05)' : 'rgba(255,196,99,0.04)',
                    }}
                  >
                    <PulseDot color={workComplete ? 'rgb(111 207 151)' : 'rgb(255 196 99)'} size={8} />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text">BELLA</span>
                    <span className="text-text-dim text-[11px]">·</span>
                    <span
                      className="text-[11px]"
                      style={{ color: workComplete ? 'rgb(111 207 151)' : 'rgb(255 196 99)' }}
                    >
                      {workComplete ? 'Research complete in 3m 42s' : 'Researching the Qatari fintech sector'}
                    </span>
                  </div>
                  <div className="p-5 md:p-6">
                    <ul className="space-y-2.5">
                      {M07_RESEARCH_STEPS.map((label, i) => {
                        const done    = workComplete || i < step;
                        const active  = !workComplete && i === step;
                        const pending = !workComplete && i > step;
                        if (pending) return (
                          <li key={i} className="flex items-center gap-3 text-[13.5px] leading-snug text-text-dim/70">
                            <span className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
                              style={{ background: 'rgba(120,130,152,0.08)', color: 'rgb(120 130 152)' }}>
                              <span className="w-1 h-1 rounded-full bg-current" />
                            </span>
                            <span>{label}</span>
                          </li>
                        );
                        return (
                          <motion.li
                            key={i}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25 }}
                            className="flex items-center gap-3 text-[13.5px] leading-snug text-text"
                          >
                            <span
                              className="shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full"
                              style={{
                                background: done ? 'rgba(111,207,151,0.20)' : 'rgba(255,196,99,0.18)',
                                color:      done ? 'rgb(111 207 151)'       : 'rgb(255 196 99)',
                              }}
                            >
                              {done ? <Check size={12} /> : <Loader2 size={12} className="animate-spin" />}
                            </span>
                            <span>{label}</span>
                          </motion.li>
                        );
                      })}
                    </ul>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Report preview card */}
            <AnimatePresence>
              {showReport && (
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, ease: [0.22, 0.61, 0.36, 1] }}
                  className="mt-4 rounded-xl border overflow-hidden"
                  style={{
                    background:
                      'linear-gradient(180deg, rgba(19,24,41,0.96) 0%, rgba(13,18,35,0.96) 100%)',
                    borderColor: 'rgba(91,140,255,0.32)',
                    boxShadow:   '0 18px 50px -20px rgba(91,140,255,0.25)',
                  }}
                >
                  <div
                    className="px-5 py-3 border-b flex items-center gap-2.5"
                    style={{
                      borderColor: 'rgba(91,140,255,0.20)',
                      background:  'rgba(91,140,255,0.05)',
                    }}
                  >
                    <BookOpen size={12} className="text-accent-bright" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-text">Report</span>
                    <span className="text-text-dim text-[11px]">·</span>
                    <span className="text-[11px] text-text-muted">Generated by Bella</span>
                  </div>
                  <div className="p-5 md:p-6">
                    <div className="text-base md:text-lg font-semibold text-text leading-snug mb-1">
                      Qatari Fintech Sector · Landscape &amp; Outlook 2026
                    </div>
                    <div className="text-[11.5px] text-text-dim font-mono tabular-nums mb-5">
                      28 pages · 247 sources cited · generated in 3m 42s
                    </div>

                    <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-2">
                      Contents
                    </div>
                    <ul className="space-y-1.5 mb-5">
                      {M07_REPORT_TOC.map((line, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-[13px] text-text-muted leading-snug">
                          <span className="text-text-dim shrink-0">{line.split(' ')[0]}</span>
                          <span>{line.replace(/^\d+\. /, '')}</span>
                        </li>
                      ))}
                    </ul>

                    <div
                      className="rounded-lg px-4 py-3 mb-4 border-l-2"
                      style={{
                        background:    'rgba(91,140,255,0.06)',
                        borderLeftColor:'rgba(91,140,255,0.45)',
                      }}
                    >
                      <div className="text-[10px] uppercase tracking-wider text-text-dim font-semibold mb-1.5">
                        Executive summary · excerpt
                      </div>
                      <div className="text-[12.5px] text-text-muted leading-relaxed italic">
                        &ldquo;The Qatari fintech sector raised an estimated
                        QAR 1.4B across 34 disclosed rounds between 2024 and
                        early 2026, with regulatory permits issued by QCB
                        accelerating from 6 to 19 entities. Six emerging
                        players control roughly 41% of consumer payment
                        volume. Closest international comparable trajectory
                        is Saudi Arabia&apos;s 2019&ndash;2021 ramp&hellip;&rdquo;
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-disabled="true"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13.5px] font-semibold text-white cursor-default select-none"
                        style={{
                          background: 'linear-gradient(180deg, rgb(108 156 255) 0%, rgb(82 128 235) 100%)',
                          boxShadow:  '0 10px 24px -8px rgba(91,140,255,0.55), inset 0 1px 0 rgba(255,255,255,0.18)',
                          pointerEvents: 'none',
                        }}
                      >
                        Open full report
                        <ArrowRight size={14} />
                      </button>
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-disabled="true"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-[12.5px] font-medium text-text-muted border border-border cursor-default select-none"
                        style={{ background: 'rgba(255,255,255,0.02)', pointerEvents: 'none' }}
                      >
                        Export PDF
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Annotation */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={showAnnotation ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
              transition={{ duration: 0.4 }}
              className="mt-5 pl-1"
            >
              <div className="h-px w-10 bg-border mb-3" aria-hidden="true" />
              <p className="text-[12px] md:text-[13px] text-text-muted leading-relaxed max-w-md">
                Ask once. Get a citation-backed, structured report ready
                for the boardroom. Any company, any person, any sector,
                any topic.
              </p>
            </motion.div>
          </div>

        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 10. Mid-page CTA — strategic Get Access after the seven capabilities
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
                Seven capabilities · one platform
              </div>
              <div className="text-xl md:text-2xl font-semibold text-text leading-tight">
                Ready to put Bella to work in your Qatari market?
              </div>
              <div className="mt-2 text-[13.5px] text-text-muted leading-relaxed">
                Every commercial plan includes Bella. Activation happens
                within 1 to 24 hours of your access request.
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
// 11. Surface area panel — Every part of Bell.qa is in her toolkit
// ───────────────────────────────────────────────────────────────────────────

const SURFACE_AREA = [
  {
    label: 'Data she reads',
    tint:  'rgb(91 140 255)',
    items: [
      { icon: Database,    text: 'The Bell.qa company graph'           },
      { icon: Users,       text: 'Decision-maker profiles'             },
      { icon: Radar,       text: 'Live signals &amp; insights'         },
      { icon: MapPin,      text: 'Map &amp; geographic data'           },
      { icon: BookOpen,    text: 'News &amp; press feed'               },
      { icon: FileCheck,   text: 'Filings &amp; registrations'         },
    ],
  },
  {
    label: 'Tools she operates',
    tint:  'rgb(196 154 255)',
    items: [
      { icon: Inbox,         text: 'The built-in CRM'                  },
      { icon: Send,          text: 'Outbound email'                    },
      { icon: RefreshCw,     text: 'Sequences &amp; follow-ups'        },
      { icon: CalendarClock, text: 'Calendar &amp; scheduling'         },
      { icon: PencilLine,    text: 'Templates &amp; drafts'            },
      { icon: ListChecks,    text: 'Filters &amp; saved lists'         },
    ],
  },
  {
    label: 'Systems she touches',
    tint:  'rgb(111 207 151)',
    items: [
      { icon: Settings2,    text: 'Workspace settings'                 },
      { icon: Server,       text: 'SMTP &amp; DNS configuration'       },
      { icon: KeyRound,     text: 'Team access controls'               },
      { icon: Landmark,     text: 'Government portals (WPS, MOCI, tax)'},
      { icon: Banknote,     text: 'Banking integrations'               },
      { icon: Plug,         text: 'API &amp; webhooks'                 },
    ],
  },
];

function SurfaceArea() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/50">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Bella&apos;s surface area
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            Every part of Bell.qa<br/>is in her toolkit.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Bella isn&apos;t a chatbot bolted on the side. She has full
            access &mdash; read and write &mdash; to every surface, every
            dataset, every integration in the platform. Here&apos;s the
            audit list.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {SURFACE_AREA.map((col, i) => (
            <motion.div
              key={col.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className="rounded-2xl border border-border overflow-hidden"
              style={{
                background:
                  'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
              }}
            >
              <div
                className="px-5 py-3 border-b border-border"
                style={{ background: 'rgba(255,255,255,0.015)' }}
              >
                <div
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: col.tint }}
                >
                  {col.label}
                </div>
              </div>
              <ul>
                {col.items.map((item, j) => {
                  const Icon = item.icon;
                  return (
                    <li
                      key={j}
                      className={
                        'px-5 py-3 flex items-center gap-3 ' +
                        (j < col.items.length - 1 ? 'border-b border-border/60 ' : '')
                      }
                    >
                      <span
                        className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-md"
                        style={{
                          background: col.tint.replace('rgb', 'rgba').replace(')', ' / 0.12)'),
                          color:      col.tint,
                        }}
                      >
                        <Icon size={13} />
                      </span>
                      <span
                        className="text-[13px] text-text leading-snug"
                        dangerouslySetInnerHTML={{ __html: item.text }}
                      />
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-[12px] text-text-dim leading-relaxed max-w-2xl mx-auto">
          Every action she takes on any of the above is logged with a
          full audit trail. You set the permissions; Bella respects them.
        </p>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 12. Departments — Which revenue functions Bella accelerates (cross-linked)
// ───────────────────────────────────────────────────────────────────────────

type DeptCard = {
  icon: React.ComponentType<{ size?: number | string }>;
  team: string;
  tagline: string;
  capabilities: string[];
  href: string;
};

const DEPARTMENTS: DeptCard[] = [
  {
    icon: Target,
    team: 'Sales',
    tagline: 'Hands every rep a pre-qualified pipeline.',
    capabilities: [
      'Filters all of Qatar by your ICP in seconds',
      'Drafts outreach tailored to each prospect',
      'Tracks replies, schedules meetings, updates the CRM',
    ],
    href: '/platform/sales',
  },
  {
    icon: Megaphone,
    team: 'Marketing',
    tagline: 'Reaches the right Qatari accounts at the right moment.',
    capabilities: [
      'Builds target lists that update themselves',
      'Triggers campaigns off real-world signals',
      'Attributes pipeline back to the signal that surfaced it',
    ],
    href: '/platform/marketing',
  },
  {
    icon: Handshake,
    team: 'Business Development',
    tagline: 'Surfaces partnerships and M&A targets before the market does.',
    capabilities: [
      'Maps ownership chains, board overlaps, corporate relationships',
      'Tracks strategic moves &mdash; acquisitions, new licences, expansion',
      'Builds watchlists that surface change automatically',
    ],
    href: '/platform/business-development',
  },
  {
    icon: Microscope,
    team: 'Research',
    tagline: 'Hands analysts the report they would have spent days writing.',
    capabilities: [
      'Deep-researches any company, sector, or topic',
      'Pulls every public signal with full citation trail',
      'Produces structured reports ready for the boardroom',
    ],
    href: '/platform/research',
  },
];

function Departments() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/50">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Departments she accelerates
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            An AI partner for every revenue function you run.
          </h2>
          <p className="mt-5 text-base md:text-lg text-text-muted leading-relaxed">
            Bella works alongside your sales, marketing, business
            development, and research teams &mdash; taking the
            operational lift off people so they can focus on the
            judgment calls only they can make.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {DEPARTMENTS.map((d, i) => (
            <DeptCardBlock key={d.team} dept={d} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function DeptCardBlock({ dept, index }: { dept: DeptCard; index: number }) {
  const Icon = dept.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, rotateX: -10 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.55, delay: index * 0.07 }}
    >
      <Link
        href={dept.href}
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
          <h3 className="text-base font-semibold text-text leading-tight">{dept.team}</h3>
          <p className="mt-2 text-[13px] text-accent-bright/90 leading-snug">{dept.tagline}</p>
          <ul className="mt-4 space-y-1.5 border-t border-border pt-4 flex-1">
            {dept.capabilities.map((cap, i) => (
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
            Explore {dept.team}
            <ArrowRight size={11} className="transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 13. Email demo — annotated outreach example (different from homepage)
// ───────────────────────────────────────────────────────────────────────────

/**
 * The homepage uses an insurance/logistics example (Sarah Chen → Hamad).
 * This page uses a recruiter / VP-Sales-gap example to demonstrate that
 * Bella's outreach engine generalises to any vertical.
 *
 * Scenario:
 *   Sender    — Layla Hassan, Director at Apex Executive Search
 *   Recipient — Saif Al-Kuwari, CEO at Qatari Distribution Co.
 *   Hook       — Saif's VP of Sales transitioned to Doha Freight (signal)
 *   Pitch      — Three pre-qualified VP candidates from the sector
 */

const BELLA_EMAIL_ANNOTATIONS = [
  {
    n: '01',
    title: 'Caught the trigger',
    body: 'Bella tracked the VP departure 14 minutes after it became public on LinkedIn. She filed it as a high-priority outreach signal for executive-search ICP.',
  },
  {
    n: '02',
    title: 'Identified the buyer',
    body: 'Saif as CEO is the only decision-maker on senior hires at his level. Bella skipped the HR director and addressed him directly.',
  },
  {
    n: '03',
    title: 'Matched real candidates',
    body: "Pulled three VP-level candidates from the firm's database with logistics-sector tenure. Two have signalled openness in the last quarter.",
  },
  {
    n: '04',
    title: 'Framed market urgency',
    body: "Distribution-sector hiring is competitive in Q3. Bella named the timing without overstating it &mdash; matched to Saif's public posting style.",
  },
  {
    n: '05',
    title: 'Calibrated the tone',
    body: 'Read every public statement Saif has made on LinkedIn in the last 90 days. Drafted to match: direct, brief, no superlatives.',
  },
  {
    n: '06',
    title: 'Optimised the ask',
    body: '"30 minutes Thursday or Friday morning" tested as the highest-converting variant for C-suite cold outreach in the Qatari market.',
  },
];

function BellaEmailDemo() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/50">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border border-border bg-bg-elev-2 text-text text-[11px] font-semibold uppercase tracking-wider">
            <Mail size={11} />
            Another example, different sector
          </div>
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            Same engine. Different vertical.
          </h2>
          <p className="mt-3 text-base text-text-muted">
            Bella&apos;s outreach engine doesn&apos;t care what you sell.
            Here&apos;s the same loop running on a leadership-change
            signal, drafted for an executive-search firm.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">
          <div className="lg:col-span-3">
            <BellaEmailMock />
          </div>

          <div className="lg:col-span-2 space-y-5">
            {BELLA_EMAIL_ANNOTATIONS.map((a, i) => (
              <motion.div
                key={a.n}
                initial={{ opacity: 0, x: 16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
                className="flex gap-4"
              >
                <span
                  className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg font-mono text-xs font-semibold"
                  style={{
                    background: 'rgba(91,140,255,0.14)',
                    color:      'rgb(165 195 255)',
                    border:     '1px solid rgba(91,140,255,0.32)',
                  }}
                >
                  {a.n}
                </span>
                <div>
                  <div className="text-sm font-semibold text-text leading-tight">{a.title}</div>
                  <div
                    className="mt-1 text-[13px] text-text-muted leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: a.body }}
                  />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function BellaEmailMock() {
  return (
    <div
      className="rounded-xl border border-border overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, rgba(19,24,41,0.95) 0%, rgba(13,18,35,0.95) 100%)',
        boxShadow: '0 24px 60px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
      }}
    >
      <div className="px-5 py-3 border-b border-border flex items-center gap-3 bg-bg-elev-2/40">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-accent/20 text-accent-bright text-[10px] font-semibold">
          LH
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] text-text leading-tight">
            <span className="font-semibold">Layla Hassan</span>
            <span className="text-text-muted"> &lt;layla@apex-search.qa&gt;</span>
          </div>
          <div className="text-[11px] text-text-dim leading-tight">
            to Saif Al-Kuwari &lt;saif@qatari-dist.qa&gt;
          </div>
        </div>
        <div className="text-[11px] text-text-dim font-mono">09:14</div>
      </div>

      <div className="px-5 pt-5 pb-3">
        <div className="text-base font-semibold text-text">
          On the VP Sales gap &mdash; three candidates worth meeting
        </div>
      </div>

      <div className="px-5 pb-6 text-[14px] text-text leading-relaxed space-y-3.5">
        <p>Hi Saif,</p>
        <p>
          Saw your{' '}
          <BellaHighlight>VP of Sales transitioned to Doha Freight last week</BellaHighlight>.
          Tough timing with Q3 ramping.
        </p>
        <p>
          We&apos;ve been tracking{' '}
          <BellaHighlight>three sector-experienced VP-level candidates</BellaHighlight>{' '}
          all month, each leadership-track at distribution competitors. Two
          have indicated they&apos;re open to moves. All three sit in Doha and
          have relocated teams before.
        </p>
        <p>
          Profiles ready when you are.{' '}
          <BellaHighlight>30 minutes Thursday or Friday morning?</BellaHighlight>
        </p>
        <p>
          Best,<br/>
          Layla
        </p>
      </div>

      <div
        className="px-5 py-3 border-t border-border flex items-center justify-between text-[10px] text-text-dim"
        style={{ background: 'rgba(255,255,255,0.015)' }}
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          Drafted by Bella · 9s · tracked from leadership-change signal · profiles pre-qualified by ICP fit
        </span>
        <span className="font-mono">SENT</span>
      </div>
    </div>
  );
}

function BellaHighlight({ children }: { children: React.ReactNode }) {
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

// ───────────────────────────────────────────────────────────────────────────
// 14. CRM stats — "One month of Bella, in the CRM."
// ───────────────────────────────────────────────────────────────────────────

function CrmStats() {
  const stats = [
    { icon: Inbox,         value: '21,847', label: 'Outreach emails sent',      tone: 'data'     },
    { icon: MessageSquare, value: '3,476',  label: 'Replies received',          tone: 'data'     },
    { icon: CalendarClock, value: '612',    label: 'Meetings scheduled',        tone: 'movement' },
    { icon: TrendingUp,    value: '184',    label: 'Deals in active pipeline',  tone: 'econ'     },
  ];

  const TONE_COLOR: Record<string, string> = {
    data:     'rgb(91 140 255)',
    movement: 'rgb(111 207 151)',
    econ:     'rgb(255 196 99)',
  };

  return (
    <section className="relative py-24 md:py-28 border-t border-border/50">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            One month of Bella, in the CRM.
          </h2>
          <p className="mt-3 text-base text-text-muted">
            What a team running with Bella looks like at scale. Every
            action logged, every thread tracked, every reply routed, so
            your people spend their time on the conversations that
            actually need them.
          </p>
        </div>

        <div
          className="rounded-2xl border border-border p-6 md:p-8 max-w-4xl mx-auto"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
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
              Same month without Bella: a fraction of the volume, with most
              of the week spent on manual research and admin instead of
              selling.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 15. Comparison — "What your team does alone. What your team does with Bella."
// ───────────────────────────────────────────────────────────────────────────

const COMPARISON_ROWS = [
  {
    capability: 'Knowledge of every Qatari company & decision-maker',
    traditional: "Bounded by each person's network and time to research",
    bella:      'Every company in the graph and their decision-makers, surfaced instantly',
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
    bella:      "Taken off the team's plate, freeing them for judgment-heavy work",
  },
  {
    capability: 'Capacity to scale up',
    traditional:'New volume usually means new hires, new ramp time, new overhead',
    bella:      'Scales instantly without adding headcount or onboarding',
  },
];

function Comparison() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/50">
      <div className="max-w-screen-xl mx-auto px-6">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl md:text-3xl font-semibold text-text leading-tight">
            What your team does alone. What your team does with Bella.
          </h2>
          <p className="mt-3 text-base text-text-muted">
            Even great teams run into the same ceilings: time, scale,
            and reach. Bella sits underneath them and lifts those
            ceilings, so the people you already have can do far more
            of what they&apos;re great at.
          </p>
        </div>

        <div
          className="rounded-2xl border border-border overflow-hidden max-w-5xl mx-auto"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.92) 0%, rgba(13,18,35,0.92) 100%)',
          }}
        >
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
                <CalendarClock size={14} className="shrink-0 mt-0.5 text-text-dim" />
                <span>{row.traditional}</span>
              </div>
              <div className="col-span-4 p-4 leading-snug flex items-start gap-2">
                <Check size={14} className="shrink-0 mt-0.5 text-accent-bright" />
                <span className="text-text">{row.bella}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// 16. Three-reader block — operator / IT & security / executive
// ───────────────────────────────────────────────────────────────────────────

const READERS = [
  {
    icon:  Briefcase,
    label: 'For the operator',
    body:  'Less repetitive work, more conversations with people who matter. Bella covers the operational lift; your team focuses on the judgment calls only people can make.',
  },
  {
    icon:  ShieldCheck,
    label: 'For IT & security',
    body:  'Full audit trail on every Bella action. SSO, role-based access, per-tenant key separation, in-Qatar hosting. She respects every permission you set.',
  },
  {
    icon:  BarChart3,
    label: 'For the executive',
    body:  "Pipeline that builds itself, on the data Qatar can't be operated without. The compounding advantage that grows with every customer win.",
  },
];

function ThreeReader() {
  return (
    <section className="relative py-24 md:py-28 border-t border-border/50">
      <div className="max-w-screen-xl mx-auto px-6">

        <div className="text-center max-w-2xl mx-auto mb-12">
          <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-text-dim mb-5">
            Three lenses on the same platform
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold text-gradient leading-tight">
            What Bella changes for you.
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          {READERS.map((r, i) => {
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
// 17. Final CTA — the closing Get Access section
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
          Put Bella to work for your team.
        </h2>
        <p className="mt-4 text-base text-text-muted max-w-xl mx-auto leading-relaxed">
          Every commercial plan includes Bella. Get access, set her
          rules, and watch the operational lift come off your team.
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

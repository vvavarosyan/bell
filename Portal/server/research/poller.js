// Background poller for the Research subsystem.
//
// One process-wide interval that calls orchestrator.tick() every N seconds.
// Single-flight: if a tick is still running, the next interval no-ops.
// Survives across HTTP requests, restarted on each server boot.

import { tick } from './orchestrator.js';

const INTERVAL_MS = 15_000;     // Firecrawl Agent runs take minutes; 15s is generous

let timer    = null;
let running  = false;
let lastTick = null;
let lastErr  = null;

export function startPoller() {
  if (timer) return;
  timer = setInterval(safeTick, INTERVAL_MS);
  // Kick once shortly after boot so a freshly-queued job doesn't wait the full interval
  setTimeout(safeTick, 2000);
  console.log(`[research] Background poller started (every ${INTERVAL_MS / 1000}s).`);
}

export function stopPoller() {
  if (timer) { clearInterval(timer); timer = null; }
}

export function status() {
  return { running, last_tick: lastTick, last_error: lastErr };
}

async function safeTick() {
  if (running) return;
  running = true;
  try {
    const out = await tick();
    lastTick = { at: new Date().toISOString(), n: out.length };
    lastErr = null;
  } catch (err) {
    lastErr = String(err.message || err);
    console.error('[research poller] tick error:', lastErr);
  } finally {
    running = false;
  }
}

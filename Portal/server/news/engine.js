// Market Feed engine — starts the poller + the enrichment loop + the signal
// generator (Phase C).
//
// Gated by env BDI_NEWS_ENGINE=1 so it runs on exactly ONE deployment (the
// production portal), not on every service that shares the prod DB — otherwise
// we'd double-poll and double-spend on the LLM. Off by default.

import { startPoller, getPollerState } from './poller.js';
import { enrichBatch, getEnrichState } from './enrich.js';
import { runProducers } from './producers.js';
import { generateSignals, getSignalsState } from './signals.js';

const ENRICH_TICK_MS    = 30_000;
const PRODUCERS_TICK_MS  = 5 * 60_000;   // company registrations etc. every 5 min
const SIGNALS_TICK_MS    = 15 * 60_000;  // signal derivation every 15 min (idempotent)

let enrichTimer = null;
let producersTimer = null;
let signalsTimer = null;
let enrichRunning = false;
let enabled = false;

export function startNewsEngine() {
  if (process.env.BDI_NEWS_ENGINE !== '1') {
    console.log('[news] engine disabled (set BDI_NEWS_ENGINE=1 on ONE service to enable)');
    return;
  }
  enabled = true;
  startPoller();
  enrichTimer = setInterval(async () => {
    if (enrichRunning) return;
    enrichRunning = true;
    try { await enrichBatch(); }
    catch (e) { console.error('[news] enrich:', e.message); }
    finally { enrichRunning = false; }
  }, ENRICH_TICK_MS);

  // Non-news producers (company registrations, …). Run once shortly after boot,
  // then on an interval.
  setTimeout(() => runProducers().catch((e) => console.error('[news] producers:', e.message)), 12_000);
  producersTimer = setInterval(() => {
    runProducers().catch((e) => console.error('[news] producers:', e.message));
  }, PRODUCERS_TICK_MS);

  // Signal derivation (Phase C) — idempotent via dedup keys; boot pass after 25s.
  setTimeout(() => generateSignals().catch((e) => console.error('[signals] boot:', e.message)), 25_000);
  signalsTimer = setInterval(() => {
    generateSignals().catch((e) => console.error('[signals] tick:', e.message));
  }, SIGNALS_TICK_MS);

  console.log('[news] engine started (poller + enrichment + producers + signals)');
}

export function getNewsState() {
  return { enabled, poller: getPollerState(), enrich: getEnrichState(), signals: getSignalsState() };
}

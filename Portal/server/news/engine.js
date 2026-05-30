// Market Feed engine — starts the poller + the enrichment loop.
//
// Gated by env BDI_NEWS_ENGINE=1 so it runs on exactly ONE deployment (the
// production portal), not on every service that shares the prod DB — otherwise
// we'd double-poll and double-spend on the LLM. Off by default.

import { startPoller, getPollerState } from './poller.js';
import { enrichBatch, getEnrichState } from './enrich.js';
import { runProducers } from './producers.js';

const ENRICH_TICK_MS    = 30_000;
const PRODUCERS_TICK_MS  = 5 * 60_000;   // company registrations etc. every 5 min

let enrichTimer = null;
let producersTimer = null;
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

  console.log('[news] engine started (poller + enrichment + producers)');
}

export function getNewsState() {
  return { enabled, poller: getPollerState(), enrich: getEnrichState() };
}

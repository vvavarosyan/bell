// Market Feed engine — starts the poller + the enrichment loop.
//
// Gated by env BDI_NEWS_ENGINE=1 so it runs on exactly ONE deployment (the
// production portal), not on every service that shares the prod DB — otherwise
// we'd double-poll and double-spend on the LLM. Off by default.

import { startPoller, getPollerState } from './poller.js';
import { enrichBatch, getEnrichState } from './enrich.js';

const ENRICH_TICK_MS = 30_000;

let enrichTimer = null;
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
  console.log('[news] engine started (poller + enrichment)');
}

export function getNewsState() {
  return { enabled, poller: getPollerState(), enrich: getEnrichState() };
}

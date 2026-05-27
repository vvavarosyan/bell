// Apify HTTP client — generic actor runner for the enrichment pipeline.
//
// Two run modes:
//   runSync(actorId, input)        - blocks until the actor finishes, returns
//                                    dataset items. Use for fast actors (<60s).
//   runAsync(actorId, input)       - starts a run, returns run handle. Poll
//                                    runStatus() then fetchDataset() when done.
//
// Token comes from macOS Keychain (bdi-apify entry) at call time, so users
// can rotate the key in the Portal Settings without restarting the server.

import { getKey } from '../../keychain.js';

const API_BASE = 'https://api.apify.com/v2';
const DEFAULT_TIMEOUT_MS = 300_000;     // 5 min for sync-run cap

function actorPath(actorId) {
  // Apify accepts both "user/name" and "user~name". Replace / with ~ for URL.
  return encodeURIComponent(actorId.replace('/', '~'));
}

async function tokenOrThrow() {
  const t = await getKey('apify');
  if (!t) throw new Error('No Apify API key set. Go to Settings → Apify and paste your key.');
  return t;
}

async function jsonFetch(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal });
    const ct = r.headers.get('content-type') || '';
    const body = ct.includes('application/json') ? await r.json() : await r.text();
    if (!r.ok) {
      const message = typeof body === 'string'
        ? body
        : (body?.error?.message || body?.message || JSON.stringify(body));
      const err = new Error(`Apify ${r.status}: ${String(message).slice(0, 300)}`);
      err.status = r.status;
      err.body = body;
      throw err;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run actor synchronously and return dataset items. Best for short, single-call
 * actors like a single Google Maps search.
 */
export async function runSync(actorId, input, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const token = await tokenOrThrow();
  const url = `${API_BASE}/acts/${actorPath(actorId)}/run-sync-get-dataset-items?token=${token}&clean=true`;
  const items = await jsonFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }, timeoutMs);
  // run-sync-get-dataset-items returns an array directly
  return Array.isArray(items) ? items : (items?.items || []);
}

/**
 * Start an async run. Returns { runId, datasetId, status }.
 */
export async function runAsync(actorId, input) {
  const token = await tokenOrThrow();
  const url = `${API_BASE}/acts/${actorPath(actorId)}/runs?token=${token}`;
  const body = await jsonFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = body?.data;
  if (!data) throw new Error('Apify: unexpected run response');
  return {
    runId: data.id,
    datasetId: data.defaultDatasetId,
    status: data.status,
    startedAt: data.startedAt,
  };
}

/** Poll a single run. */
export async function runStatus(runId) {
  const token = await tokenOrThrow();
  const url = `${API_BASE}/actor-runs/${encodeURIComponent(runId)}?token=${token}`;
  const body = await jsonFetch(url, { method: 'GET' });
  const d = body?.data;
  return d ? {
    runId: d.id,
    status: d.status,
    datasetId: d.defaultDatasetId,
    finishedAt: d.finishedAt,
    stats: d.stats,
    usageTotalUsd: d.usageTotalUsd,
  } : null;
}

/** Fetch all items from a dataset. */
export async function fetchDataset(datasetId, { limit = 10000 } = {}) {
  const token = await tokenOrThrow();
  const url = `${API_BASE}/datasets/${encodeURIComponent(datasetId)}/items?token=${token}&clean=true&format=json&limit=${limit}`;
  const body = await jsonFetch(url, { method: 'GET' });
  return Array.isArray(body) ? body : (body?.items || []);
}

/**
 * Run async, then poll to completion. Returns { items, run } where items is
 * the dataset and run is the final run-status payload (includes usageTotalUsd
 * so callers can record the cost).
 */
export async function runAndWait(actorId, input, {
  pollMs = 3000,
  maxWaitMs = 30 * 60_000,
} = {}) {
  const started = await runAsync(actorId, input);
  const deadline = Date.now() + maxWaitMs;

  let run = await runStatus(started.runId);
  while (run && run.status === 'RUNNING' || run?.status === 'READY') {
    if (Date.now() > deadline) {
      throw new Error(`Apify run ${started.runId} did not finish within ${maxWaitMs/60000} min`);
    }
    await new Promise(r => setTimeout(r, pollMs));
    run = await runStatus(started.runId);
  }
  if (run?.status !== 'SUCCEEDED') {
    const err = new Error(`Apify run ${started.runId} ended with status ${run?.status}`);
    err.run = run;
    throw err;
  }
  const items = await fetchDataset(started.datasetId);
  return { items, run };
}

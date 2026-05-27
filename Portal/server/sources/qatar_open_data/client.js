// HTTP client for the Opendatasoft Explore API v2.1 — used to talk to
// data.gov.qa. Public data needs no auth; we send a polite User-Agent.
//
// Endpoints we use:
//   GET /api/explore/v2.1/catalog/datasets
//   GET /api/explore/v2.1/catalog/datasets/{id}
//   GET /api/explore/v2.1/catalog/datasets/{id}/exports/json    ← full export

const BASE = 'https://www.data.gov.qa/api/explore/v2.1';
const UA   = 'BellDataIntelligence/0.1 (local portal; contact admin)';
const DEFAULT_TIMEOUT_MS = 60_000;

class HttpError extends Error {
  constructor(status, body, url) {
    super(`HTTP ${status} from ${url}`);
    this.status = status;
    this.body   = body;
    this.url    = url;
  }
}
export { HttpError };

async function call(path, { params, accept = 'application/json', timeoutMs = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = BASE + path + qs;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Chain external signal if provided so the scheduler can cancel.
  const onAbort = () => ctrl.abort();
  if (signal) signal.addEventListener('abort', onAbort);
  try {
    const r = await fetch(url, {
      headers: { 'Accept': accept, 'User-Agent': UA },
      signal: ctrl.signal,
    });
    const ct = r.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const text = isJson ? null : await r.text();          // hold text for later
    if (!r.ok) {
      let body;
      try { body = isJson ? await r.json() : text; } catch { body = null; }
      throw new HttpError(r.status, body, url);
    }
    if (isJson) {
      const data = await r.json();
      return { data, bytes: byteLengthOf(JSON.stringify(data)) };
    }
    return { data: text, bytes: byteLengthOf(text || '') };
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

function byteLengthOf(s) {
  try { return Buffer.byteLength(s, 'utf8'); } catch { return 0; }
}

/**
 * List datasets from the catalog. Paginated; max 100 per page (API cap).
 * Returns { total, results: [...] }.
 *
 * results[i] is the raw catalog row (Opendatasoft's nested shape — we
 * normalize it in catalog_sync.js before writing to the DB).
 */
export async function listDatasets({ limit = 100, offset = 0, where = null, orderBy = null, signal } = {}) {
  const params = { limit: String(limit), offset: String(offset) };
  if (where)   params.where    = where;
  if (orderBy) params.order_by = orderBy;
  const { data, bytes } = await call('/catalog/datasets', { params, signal });
  return {
    total:   Number(data?.total_count ?? data?.totalRecords ?? data?.total ?? 0),
    results: Array.isArray(data?.results) ? data.results : [],
    bytes,
  };
}

/**
 * Fetch one dataset's full metadata (richer than what's in /catalog/datasets).
 */
export async function getDataset(datasetId, { signal } = {}) {
  const { data, bytes } = await call(`/catalog/datasets/${encodeURIComponent(datasetId)}`, { signal });
  return { data, bytes };
}

/**
 * Export an entire dataset as JSON in one call. No pagination cap.
 * Returns an array of records — each record is a plain object {field: value}.
 *
 * For huge datasets this can be many MB; the caller is responsible for
 * batching the DB inserts.
 */
export async function exportDatasetAsJson(datasetId, { signal, timeoutMs = 5 * 60_000 } = {}) {
  // /exports/json returns a JSON array of records. Long datasets can take a
  // while; we allow a 5-min timeout (well under typical Opendatasoft cap).
  const { data, bytes } = await call(`/catalog/datasets/${encodeURIComponent(datasetId)}/exports/json`, {
    params: { use_labels: 'false' },   // use field names as keys, not labels
    signal,
    timeoutMs,
  });
  // Normalize: some Opendatasoft installs return {results: [...]}, others
  // return the array directly. Be defensive.
  const arr = Array.isArray(data) ? data : (Array.isArray(data?.results) ? data.results : []);
  return { records: arr, bytes };
}

/**
 * Fetch a small page of records (preview). Used by the dataset detail drawer.
 */
export async function previewRecords(datasetId, { limit = 20, offset = 0, signal } = {}) {
  const { data, bytes } = await call(`/catalog/datasets/${encodeURIComponent(datasetId)}/records`, {
    params: { limit: String(limit), offset: String(offset) },
    signal,
  });
  return {
    total: Number(data?.total_count ?? 0),
    results: Array.isArray(data?.results) ? data.results : [],
    bytes,
  };
}

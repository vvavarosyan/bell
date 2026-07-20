// Overpass API client for OpenStreetMap Qatar. Plain HTTPS, no key. Polite:
// identifies itself, backs off on rate-limits, rotates mirror endpoints. Qatar is
// small enough to query by category over the country bbox.

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const UA = 'BellDataIntelligence/1.0 (bell.qa; Qatar business directory; contact hello@bell.qa)';

// Country bbox, matching the app's inQatar guard (south, west, north, east). NOTE:
// this bbox clips Bahrain's southern tip, so DON'T filter POIs by bbox — use the
// area filter below, which is Qatar's actual admin boundary.
export const QATAR_BBOX = '24.40,50.55,26.30,51.85';

// Qatar's real admin-2 boundary as an Overpass area (excludes Bahrain). Prepend to
// a query and filter members with `(area.qa)`.
export const QATAR_AREA = 'area["ISO3166-1"="QA"][admin_level=2]->.qa;';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Run an Overpass QL query, returning the elements array. Retries on
 * 429/502/504/timeouts across mirrors with linear backoff.
 */
export async function overpass(ql, { timeoutMs = 180000, retries = 5, onProgress = () => {} } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const ep = ENDPOINTS[attempt % ENDPOINTS.length];
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(ep, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: ql }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        onProgress(`  Overpass ${res.status} on ${host(ep)} — backing off…`);
        await sleep(3000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
      const json = await res.json();
      return json.elements || [];
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      onProgress(`  Overpass error on ${host(ep)} (${err.message}) — retry ${attempt + 1}/${retries}`);
      await sleep(2000 * (attempt + 1));
    }
  }
  throw lastErr || new Error('Overpass: all attempts failed');
}

function host(url) { try { return new URL(url).host; } catch { return url; } }

// Coordinate of an element: nodes carry lat/lon; ways/relations carry `center`
// when the query used `out center`.
export function elementCoord(el) {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') return [el.lon, el.lat];
  if (el.center && typeof el.center.lat === 'number') return [el.center.lon, el.center.lat];
  return null;
}

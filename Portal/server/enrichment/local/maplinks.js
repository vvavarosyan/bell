// Google-Maps link → exact coordinates. When a company's own website pins its
// branches with a Google-Maps link (href or embed iframe), those coordinates
// are STATED by the company — not a guess — so extracting them is rule-2.1-safe
// and needs no INWANI zone/street/building codes.
//
// Every candidate is validated against Qatar's bounding box: this both rejects
// garbage AND disambiguates coordinate order (Qatar lat≈25, lng≈51 are in
// disjoint ranges, so a swapped pair fails the box and is retried the other way).

const QATAR_BBOX = [50.55, 24.40, 51.85, 26.30]; // lng min, lat min, lng max, lat max
function inQatar(lng, lat) {
  return Number.isFinite(lng) && Number.isFinite(lat)
    && lng >= QATAR_BBOX[0] && lng <= QATAR_BBOX[2] && lat >= QATAR_BBOX[1] && lat <= QATAR_BBOX[3];
}
// Accept a numeric pair as {lat,lng} only if it lands in Qatar; try the swap too.
function qatarPair(a, b) {
  const x = Number(a), y = Number(b);
  if (inQatar(y, x)) return { lat: x, lng: y };   // (a,b) = (lat,lng)
  if (inQatar(x, y)) return { lat: y, lng: x };   // (a,b) = (lng,lat)
  return null;
}

/** Extract {lat,lng} from ONE Google-Maps URL, or null. Handles the common
 *  formats: /@lat,lng ; ?q=/query=/ll=/center=/destination=/daddr=lat,lng ;
 *  q=loc:lat,lng ; and embed "!3dLAT!2dLNG". Coordinate order is validated by
 *  Qatar bbox, so mixed conventions can't produce a swapped pin. */
export function extractMapCoords(url) {
  const u = String(url || '');
  if (!/google\.[a-z.]+\/maps|maps\.google|\/maps\/embed|!3d[0-9]/i.test(u)) return null;

  // Embed iframe pb string: !3d<lat>!2d<lng> (3d is ALWAYS latitude, 2d longitude).
  let m = u.match(/!3d(-?\d{1,3}\.\d+)!2d(-?\d{1,3}\.\d+)/);
  if (m) { const p = qatarPair(m[1], m[2]); if (p) return p; }
  m = u.match(/!2d(-?\d{1,3}\.\d+)!3d(-?\d{1,3}\.\d+)/);
  if (m) { const p = qatarPair(m[2], m[1]); if (p) return p; }   // reorder to (lat,lng)

  // /@lat,lng,zoom
  m = u.match(/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/);
  if (m) { const p = qatarPair(m[1], m[2]); if (p) return p; }

  // ?q= / query= / ll= / center= / destination= / daddr= / sll= = lat,lng
  // (with an optional "loc:" prefix that some share links add).
  m = u.match(/[?&](?:q|query|ll|center|destination|daddr|sll)=(?:loc:)?(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/i);
  if (m) { const p = qatarPair(m[1], m[2]); if (p) return p; }

  return null;
}

// Any URL that is a Google-Maps place/pin (used to FIND candidate links in HTML).
const MAPS_URL_RX = /(?:https?:)?\/\/[^\s"'<>()]*(?:google\.[a-z.]+\/maps|maps\.google[a-z.]*|\/maps\/embed)[^\s"'<>()]*/gi;
// Shortened Google-Maps links carry no inline coordinates — they need an HTTP
// redirect to resolve. Surfaced separately so the caller (which has network) can
// choose to follow them; never guessed.
const SHORT_RX = /(?:https?:)?\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[A-Za-z0-9]+/gi;

// The human place name a Google-Maps "/place/<Name>/" URL carries, if any.
function placeName(url) {
  const m = String(url).match(/\/maps\/place\/([^/@]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1].replace(/\+/g, ' ')).trim().slice(0, 120) || null; }
  catch { return m[1].replace(/\+/g, ' ').trim().slice(0, 120) || null; }
}

/** Scan page HTML (+ any already-extracted link list) for Google-Maps links and
 *  return { coords: [{lat,lng,url}], shortLinks: [url] }. Deduped by rounded
 *  coordinate so the same branch pinned twice yields one location. */
export function extractMapLinks(html = '', links = []) {
  const hay = String(html || '') + '\n' + (Array.isArray(links) ? links.join('\n') : '');
  const coords = [];
  const seen = new Set();
  for (const raw of hay.match(MAPS_URL_RX) || []) {
    const url = raw.replace(/&amp;/g, '&');
    const c = extractMapCoords(url);
    if (!c) continue;
    const key = c.lat.toFixed(4) + ',' + c.lng.toFixed(4);
    if (seen.has(key)) continue;
    seen.add(key);
    coords.push({ ...c, url, name: placeName(url) });
  }
  const shortLinks = [...new Set((hay.match(SHORT_RX) || []).map((s) => s.replace(/&amp;/g, '&')))];
  return { coords, shortLinks };
}

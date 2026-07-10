// Safe serialization of a tender's `raw` jsonb payload.
//
// ⚠️ WHY THIS FILE EXISTS. Three write paths independently did
// `JSON.stringify(raw).slice(0, 20000)`. A hard slice cuts the string mid-object,
// Postgres rejects the malformed jsonb, the error is swallowed by the row's
// catch, and the tender is silently counted as failed — data loss with no trace.
// Truncating serialized JSON is never correct. Drop whole optional values
// instead, largest and least-important first, and refuse to write if it still
// doesn't fit.
//
// Lives in its own module so ingest.js / enrich.js / enrich_ashghal.js can all
// use it without an import cycle (enrich* already import scrape_monaqasat.js).

export const RAW_LIMIT = 20_000;

/**
 * @param {object} raw
 * @returns {string|null} valid JSON within RAW_LIMIT, or null if impossible.
 */
export function packRaw(raw) {
  let json = JSON.stringify(raw);
  if (json == null) return null;
  if (json.length <= RAW_LIMIT) return json;

  const trimmed = { ...raw };

  // 1. the verbatim published-field list is a nice-to-have; codes are not
  delete trimmed.fields;
  json = JSON.stringify(trimmed);
  if (json.length <= RAW_LIMIT) return json;

  // 2. clip the free-text description (plain text, no structure to corrupt)
  if (typeof trimmed.description === 'string' && trimmed.description.length > 200) {
    trimmed.description = trimmed.description.slice(0, 200) + '…';
    json = JSON.stringify(trimmed);
    if (json.length <= RAW_LIMIT) return json;
  }

  // 3. Ashghal keeps its bidder table in raw — drop the losers before the winner
  if (Array.isArray(trimmed.bidders) && trimmed.bidders.length > 1) {
    trimmed.bidders = trimmed.bidders.filter((b) => b && (b.winner || b.rank === 1 || b.rank === '1'));
    json = JSON.stringify(trimmed);
    if (json.length <= RAW_LIMIT) return json;
  }

  // 4. last resort: keep activity CODES (they drive matching), shed their names
  if (Array.isArray(trimmed.activities)) {
    trimmed.activities = trimmed.activities.map((a) => ({ code: a.code }));
    json = JSON.stringify(trimmed);
    if (json.length <= RAW_LIMIT) return json;
  }

  return null;   // caller must leave the row alone rather than write junk
}

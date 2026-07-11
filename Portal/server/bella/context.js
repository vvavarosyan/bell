// Bella — fresh-signals brief (Phase 3: proactive awareness).
// Val's spec: "total data awareness … either show them to the user or use that
// information to act." Nothing used to tell Bella what happened TODAY unless
// she happened to call a tool — this injects a one-line brief of the last 24h
// of signals into each turn's user message (never the system prompt — that
// would bust the prompt cache; see prompt.js header).
//
// Personalization reuses the exact "For you" mechanics from routes/signals.js:
// signals are GLOBAL rows; the tenant's lens is tenant_profile.target_industries
// overlapped against signals.industries[]. Cost control: one line (~60 tokens),
// cached per tenant for 60s, and a DB hiccup degrades to no brief — a missing
// nicety must never break a chat turn.

import { query } from '../db.js';

const TTL_MS = 60_000;
const CACHE_MAX = 500;
const cache = new Map();   // tenantId -> { at, brief }

export async function freshSignalsBrief(tenantId) {
  const key = tenantId ?? 0;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.brief;

  let brief = null;
  try {
    const counts = await query(
      `SELECT kind, count(*)::int AS n
         FROM signals
        WHERE occurred_at > now() - interval '24 hours'
        GROUP BY kind ORDER BY n DESC`,
    );
    if (counts.rows.length) {
      const total = counts.rows.reduce((a, r) => a + r.n, 0);
      let icpLine = '';
      if (tenantId) {
        const icp = await query(
          `SELECT target_industries FROM tenant_profile WHERE tenant_id = $1`, [tenantId],
        ).catch(() => ({ rows: [] }));
        const inds = (icp.rows[0]?.target_industries || []).filter(Boolean);
        if (inds.length) {
          const top = await query(
            `SELECT title FROM signals
              WHERE occurred_at > now() - interval '24 hours'
                AND industries && $1::text[]
              ORDER BY importance DESC, occurred_at DESC
              LIMIT 2`,
            [inds],
          );
          if (top.rows.length) {
            icpLine = `; matching their ICP: ` + top.rows.map((r) => `"${String(r.title).slice(0, 70)}"`).join(', ');
          }
        }
      }
      const byKind = counts.rows.slice(0, 4).map((r) => `${r.n} ${String(r.kind).replace(/_/g, ' ')}`).join(', ');
      brief = `${total} new signals in the last 24h (${byKind})${icpLine}`;
    }
  } catch {
    brief = null;   // best-effort by contract
  }

  if (cache.size >= CACHE_MAX) cache.clear();   // crude but sufficient bound
  cache.set(key, { at: Date.now(), brief });
  return brief;
}

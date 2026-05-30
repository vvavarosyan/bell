// Market Feed news poller — fetches due RSS / Google News feeds, parses, and
// inserts deduped news_items. Runs on the always-on production app.
//
// Gated by env BDI_NEWS_ENGINE=1 (see startNewsEngine in news/engine.js) so it
// runs on exactly ONE deployment and we don't double-poll the shared prod DB.
//
// Dedup: news_items.guid is globally UNIQUE. Google News returns the same
// article (same guid) across multiple topic feeds — ON CONFLICT (guid) DO
// NOTHING collapses those into one item automatically.

import { query } from '../db.js';
import { parseFeed } from './parse.js';

const POLL_TICK_MS   = 60_000;   // check for due sources every minute
const SOURCES_PER_TICK = 8;      // cap work per tick
const FETCH_TIMEOUT_MS = 15_000;
const MAX_AGE_DAYS     = 14;      // ignore items older than this on first ingest
const DISABLE_AFTER_FAILS = 8;    // auto-disable a source after this many consecutive failures

const state = {
  scanning:        false,
  last_poll_at:    null,
  sources_polled:  0,
  items_added_last: 0,
  last_error:      null,
};
export function getPollerState() { return { ...state }; }

let tickTimer = null;
let running = false;

export function startPoller() {
  if (tickTimer) return;
  console.log('[news] poller online');
  setTimeout(() => tick().catch((e) => console.error('[news] boot poll:', e.message)), 6_000);
  tickTimer = setInterval(() => tick().catch((e) => console.error('[news] tick:', e.message)), POLL_TICK_MS);
}
export function stopPoller() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

async function tick() {
  if (running) return;
  running = true;
  state.scanning = true;
  try {
    const due = await query(
      `SELECT * FROM news_sources
        WHERE active = true
          AND (last_polled_at IS NULL
               OR last_polled_at + make_interval(secs => poll_interval_seconds) < now())
        ORDER BY last_polled_at NULLS FIRST
        LIMIT $1`,
      [SOURCES_PER_TICK]
    );
    let polled = 0, added = 0;
    for (const src of due.rows) {
      added += await pollOne(src);
      polled++;
    }
    state.sources_polled = polled;
    state.items_added_last = added;
    state.last_poll_at = new Date().toISOString();
  } finally {
    running = false;
    state.scanning = false;
  }
}

async function fetchFeed(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'BellMarketFeed/1.0 (+https://bell.qa)', 'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' },
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

/** Poll one source; returns number of new items inserted. */
async function pollOne(src) {
  try {
    const xml = await fetchFeed(src.url);
    const items = parseFeed(xml);
    const cutoff = Date.now() - MAX_AGE_DAYS * 86_400_000;

    let added = 0;
    for (const it of items) {
      if (!it.guid) continue;
      // Skip very old items on first sight (keeps the feed fresh).
      if (it.published_at && new Date(it.published_at).getTime() < cutoff) continue;

      const r = await query(
        `INSERT INTO news_items
           (source_id, source_name, guid, url, title, summary, image_url, author, published_at, language, category)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (guid) DO NOTHING
         RETURNING id`,
        [
          src.id, src.name, it.guid.slice(0, 480), it.link, it.title,
          it.summary, it.image_url, it.author, it.published_at, src.language,
          src.category_hint || 'other',
        ]
      );
      if (r.rowCount > 0) {
        added++;
        // Show it in the feed immediately (category = source hint); the LLM pass
        // later upgrades category/sentiment/companies/importance.
        await query(
          `INSERT INTO feed_events
             (kind, ref_table, ref_id, title, summary, url, image_url, category, source_name, occurred_at)
           VALUES ('news','news_items',$1,$2,$3,$4,$5,$6,$7, COALESCE($8, now()))
           ON CONFLICT (kind, ref_table, ref_id) DO NOTHING`,
          [r.rows[0].id, it.title, it.summary, it.link, it.image_url,
           src.category_hint || 'other', src.name, it.published_at]
        );
      }
    }

    await query(
      `UPDATE news_sources
          SET last_polled_at = now(), last_status = 'ok', last_error = NULL,
              consecutive_failures = 0, updated_at = now()
        WHERE id = $1`,
      [src.id]
    );
    return added;
  } catch (err) {
    state.last_error = `${src.name}: ${err.message}`;
    await query(
      `UPDATE news_sources
          SET last_polled_at = now(), last_status = 'error', last_error = $2,
              consecutive_failures = consecutive_failures + 1,
              active = (consecutive_failures + 1 < $3),
              updated_at = now()
        WHERE id = $1`,
      [src.id, err.message.slice(0, 300), DISABLE_AFTER_FAILS]
    );
    return 0;
  }
}

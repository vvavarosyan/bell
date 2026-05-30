// /api/feed — the Market Feed read API (feature-gated: signed-in + subscription).
//
//   GET /api/feed            → paginated feed_events (keyset), with filters and
//                              resolved company chips. `after_id` returns only
//                              newer items (for live prepend).
//   GET /api/feed/stats      → live counters for the "Bell is scanning…" bar.
//   GET /api/feed/trending   → most-mentioned companies recently.
//   Admin (admin.bell.qa / local): manage sources + manual poll.

import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../lib/auth.js';
import { getNewsState } from '../news/engine.js';

const router = Router();

const KINDS      = ['news', 'research', 'company_registered', 'dataset_update', 'signal'];
const CATEGORIES = ['economic', 'political', 'corporate', 'energy', 'real_estate', 'tech', 'legal', 'sports', 'other'];

// Attach resolved company chips ({id,name,bin}) to a page of events.
async function attachCompanies(events) {
  const ids = [...new Set(events.flatMap((e) => e.linked_company_ids || []).map(Number))];
  if (!ids.length) { for (const e of events) e.companies = []; return; }
  const r = await query(`SELECT id, name, bin FROM companies WHERE id = ANY($1::bigint[])`, [ids]);
  const byId = new Map(r.rows.map((c) => [Number(c.id), c]));
  for (const e of events) {
    e.companies = (e.linked_company_ids || [])
      .map((id) => byId.get(Number(id)))
      .filter(Boolean)
      .slice(0, 6);
  }
}

// GET /api/feed
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 30), 60);
    const where = [];
    const params = [];

    const kind = req.query.kind;
    if (kind && KINDS.includes(kind)) { params.push(kind); where.push(`kind = $${params.length}`); }

    const category = req.query.category;
    if (category && CATEGORIES.includes(category)) { params.push(category); where.push(`category = $${params.length}`); }

    const sentiment = req.query.sentiment;
    if (['positive', 'negative', 'neutral'].includes(sentiment)) { params.push(sentiment); where.push(`sentiment = $${params.length}`); }

    const q = (req.query.q || '').trim();
    if (q) { params.push('%' + q.toLowerCase() + '%'); where.push(`(lower(title) LIKE $${params.length} OR lower(coalesce(summary,'')) LIKE $${params.length})`); }

    const companyId = req.query.company_id ? Number(req.query.company_id) : null;
    if (companyId) { params.push(companyId); where.push(`$${params.length} = ANY(linked_company_ids)`); }

    // Live prepend: only items newer than after_id.
    const afterId = req.query.after_id ? Number(req.query.after_id) : null;
    if (afterId) { params.push(afterId); where.push(`id > $${params.length}`); }

    // Keyset pagination downward: cursor = "<occurredISO>__<id>".
    if (!afterId && req.query.cursor) {
      const [occ, cid] = String(req.query.cursor).split('__');
      if (occ && cid) {
        params.push(occ); const p1 = params.length;
        params.push(Number(cid)); const p2 = params.length;
        where.push(`(occurred_at < $${p1} OR (occurred_at = $${p1} AND id < $${p2}))`);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit);
    const sql = `
      SELECT id, kind, ref_table, ref_id, title, summary, url, image_url, category,
             source_name, sentiment, importance, entities, linked_company_ids,
             payload, occurred_at
        FROM feed_events
        ${whereSql}
        ORDER BY occurred_at DESC, id DESC
        LIMIT $${params.length}`;
    const r = await query(sql, params);
    const events = r.rows;
    await attachCompanies(events);

    const last = events[events.length - 1];
    const next_cursor = (!afterId && events.length === limit && last)
      ? `${new Date(last.occurred_at).toISOString()}__${last.id}`
      : null;

    res.json({ events, next_cursor });
  } catch (err) { next(err); }
});

// GET /api/feed/stats — live counters + engine scanning state.
router.get('/stats', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT
        (SELECT count(*)::int FROM news_sources WHERE active = true) AS active_sources,
        (SELECT count(*)::int FROM news_items) AS total_items,
        (SELECT count(*)::int FROM feed_events) AS total_events,
        (SELECT count(*)::int FROM news_items WHERE created_at > now() - interval '24 hours') AS items_today,
        (SELECT count(*)::int FROM feed_events WHERE occurred_at > now() - interval '24 hours') AS events_today,
        (SELECT count(*)::int FROM feed_events WHERE array_length(linked_company_ids,1) > 0
            AND occurred_at > now() - interval '24 hours') AS linked_today
    `);
    const news = getNewsState();
    res.json({
      ...r.rows[0],
      scanning: !!news.poller?.scanning,
      engine_enabled: !!news.enabled,
      last_poll_at: news.poller?.last_poll_at || null,
      poller_error: news.poller?.last_error || null,
      enrich_skipped: news.enrich?.last_error || null,
    });
  } catch (err) { next(err); }
});

// GET /api/feed/trending — top companies mentioned in the last 48h.
router.get('/trending', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT c.id, c.name, c.bin, count(*)::int AS mentions
        FROM feed_events fe
        CROSS JOIN LATERAL unnest(fe.linked_company_ids) AS cid
        JOIN companies c ON c.id = cid
       WHERE fe.occurred_at > now() - interval '48 hours'
       GROUP BY c.id, c.name, c.bin
       ORDER BY mentions DESC
       LIMIT 10`);
    res.json({ companies: r.rows });
  } catch (err) { next(err); }
});

// GET /api/feed/:id — one event with richer detail (for the news drawer).
// Declared AFTER the literal routes (/stats, /trending, /sources) so it doesn't
// shadow them.
router.get('/:id(\\d+)', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const r = await query(`SELECT * FROM feed_events WHERE id = $1`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    const ev = r.rows[0];
    if (ev.kind === 'news' && ev.ref_id) {
      const ni = await query(
        `SELECT title, summary, author, published_at, image_url, url, source_name
           FROM news_items WHERE id = $1`,
        [ev.ref_id]
      );
      if (ni.rows.length) ev.detail = ni.rows[0];
    }
    await attachCompanies([ev]);
    res.json({ event: ev });
  } catch (err) { next(err); }
});

// ---- Admin: source registry + manual poll (admin.bell.qa / local engine) ----
router.get('/sources', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const r = await query(`SELECT * FROM news_sources ORDER BY active DESC, name`);
    res.json({ sources: r.rows, engine: getNewsState() });
  } catch (err) { next(err); }
});

router.post('/sources', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const { name, url, kind, category_hint, poll_interval_seconds } = req.body || {};
    if (!name || !url) return res.status(400).json({ error: 'bad_request', reason: 'name + url required' });
    const r = await query(
      `INSERT INTO news_sources (name, url, kind, category_hint, poll_interval_seconds)
       VALUES ($1,$2,COALESCE($3,'rss'),$4,COALESCE($5,900))
       ON CONFLICT (url) DO UPDATE SET name = EXCLUDED.name, active = true, consecutive_failures = 0
       RETURNING *`,
      [name, url, kind, category_hint || null, poll_interval_seconds || null]
    );
    res.json({ source: r.rows[0] });
  } catch (err) { next(err); }
});

export default router;

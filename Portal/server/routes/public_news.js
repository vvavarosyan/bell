// /api/public/news — PUBLIC (no auth) feed of Bell-summarized news for the
// marketing site's /news section (Phase B2, Val 2026-07-02). This is the SEO
// snowball surface: bell.qa republishes OUR OWN summaries (Bell copyright) as
// daily fresh pages with links back to the source.
//
// Safety/copyright rules:
//   • Only items PROCESSED by the enricher WITH a Bell-written summary, and
//     only from the Bell-summary era (SUMMARIZE_SINCE) — never raw RSS blurbs.
//   • Headline + our summary + attribution link only. No article bodies, no
//     publisher images.
//   • Read-only, CDN-cacheable (s-maxage) — safe to expose without auth.

import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

// Keep in lock-step with news/enrich.js SUMMARIZE_SINCE.
const PUBLIC_SINCE = process.env.BDI_NEWS_SINCE || '2026-07-02';
const MAX_LIMIT = 100;

const slugify = (s) => String(s || '')
  .toLowerCase()
  .replace(/['’]/g, '')
  .replace(/[^a-z0-9؀-ۿ]+/g, '-')   // keep Arabic letters
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || 'story';

const shape = (r) => ({
  id: Number(r.id),
  slug: `${r.id}-${slugify(r.title)}`,
  title: r.title,
  summary: r.summary,
  body: r.body ?? null,
  category: r.category || 'other',
  sentiment: r.sentiment || 'neutral',
  importance: Number(r.importance_score) || 0,
  source_name: r.source_name || null,
  source_url: r.url || null,
  entities: r.entities || {},
  published_at: r.published_at || r.created_at,
});

const cache = (res, secs = 900) => {
  res.setHeader('Cache-Control', `public, s-maxage=${secs}, stale-while-revalidate=${secs * 4}`);
};

// GET /api/public/news?limit=&offset=&category=
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(Math.max(Number(req.query.limit) || 30, 1), MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [PUBLIC_SINCE];
    let catSql = '';
    if (req.query.category) { params.push(String(req.query.category)); catSql = `AND category = $${params.length}`; }
    params.push(limit, offset);
    const r = await query(
      `SELECT id, title, summary, category, sentiment, importance_score, source_name, url, entities, published_at, created_at
         FROM news_items
        WHERE processed = true AND summary IS NOT NULL AND created_at >= $1 ${catSql}
        ORDER BY published_at DESC NULLS LAST, id DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    cache(res, 900);
    res.json({ items: r.rows.map(shape) });
  } catch (err) { next(err); }
});

// GET /api/public/news/:id — one article + related (same category, recent).
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'bad_id' });
    const r = await query(
      `SELECT id, title, summary, body, category, sentiment, importance_score, source_name, url, entities, published_at, created_at
         FROM news_items
        WHERE id = $1 AND processed = true AND summary IS NOT NULL AND created_at >= $2`,
      [id, PUBLIC_SINCE],
    );
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    const item = shape(r.rows[0]);
    const rel = await query(
      `SELECT id, title, summary, category, sentiment, importance_score, source_name, url, entities, published_at, created_at
         FROM news_items
        WHERE processed = true AND summary IS NOT NULL AND created_at >= $1
          AND category = $2 AND id <> $3
        ORDER BY published_at DESC NULLS LAST, id DESC
        LIMIT 4`,
      [PUBLIC_SINCE, item.category, id],
    );
    cache(res, 900);
    res.json({ item, related: rel.rows.map(shape) });
  } catch (err) { next(err); }
});

export default router;

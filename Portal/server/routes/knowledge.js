// Qatar Knowledge Base — read API for the customer-facing "Qatar Knowledge" browse
// section. Read-only over knowledge_pages / knowledge_sources / knowledge_changes
// (crawled locally via "Run Qatar Knowledge Scan.command", mirrored to prod).
//
// Everything here is source-stated (Rule 2.1): each result carries its source
// name + url + as-of date, and the verbatim law/body phrases the page used.
// PDPPL: pages describe Qatar governance + laws; officials appear only in their
// public capacity (role/title), which is customer-facing per Val — no personal
// contact data lives in the KB.

import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

const tablesReady = async () => {
  try { return !!(await query(`SELECT to_regclass('public.knowledge_pages') AS t`)).rows[0].t; }
  catch { return false; }
};

// Compact "mentions" (verbatim law + body phrases) for a list row — never officials
// (kept out of the foreground; still available in the full-page view).
function listMentions(entities) {
  if (!entities || typeof entities !== 'object') return undefined;
  const out = [];
  if (Array.isArray(entities.law_refs)) out.push(...entities.law_refs.slice(0, 4).map((x) => x.text));
  if (Array.isArray(entities.bodies)) out.push(...entities.bodies.slice(0, 4).map((x) => x.matched || x.name));
  return out.length ? out.slice(0, 6) : undefined;
}

// ---- Stats (6h process cache) ------------------------------------------------
let statsCache = null;
let statsCacheAt = 0;
const STATS_TTL = 6 * 3600 * 1000;

async function computeStats() {
  const pages = (await query(`SELECT count(*)::int n FROM knowledge_pages WHERE active`)).rows[0].n;
  const laws = (await query(
    `SELECT count(*)::int n FROM knowledge_pages p JOIN knowledge_sources s ON s.id = p.source_id
      WHERE p.active AND s.category = 'laws'`)).rows[0].n;
  const sources = (await query(`SELECT count(*)::int n FROM knowledge_sources WHERE active`)).rows[0].n;
  const withEntities = (await query(
    `SELECT count(*)::int n FROM knowledge_pages WHERE active AND entities IS NOT NULL AND entities <> '{}'::jsonb`)).rows[0].n;
  const lastChange = (await query(`SELECT max(detected_at) t FROM knowledge_changes`)).rows[0].t;
  return { pages, laws, sources, with_entities: withEntities, last_change: lastChange };
}

router.get('/stats', async (req, res, next) => {
  try {
    if (!(await tablesReady())) return res.json({ pages: 0, laws: 0, sources: 0, with_entities: 0, empty: true });
    if (!statsCache || Date.now() - statsCacheAt > STATS_TTL) { statsCache = await computeStats(); statsCacheAt = Date.now(); }
    res.json(statsCache);
  } catch (err) { next(err); }
});

// ---- Sources (for the filter) ------------------------------------------------
router.get('/sources', async (req, res, next) => {
  try {
    if (!(await tablesReady())) return res.json({ rows: [] });
    const rows = (await query(
      `SELECT s.id, s.name, s.category, s.base_url, s.last_crawled_at,
              count(p.id) FILTER (WHERE p.active)::int AS pages
         FROM knowledge_sources s LEFT JOIN knowledge_pages p ON p.source_id = s.id
        WHERE s.active GROUP BY s.id ORDER BY pages DESC, s.name`)).rows;
    res.json({ rows });
  } catch (err) { next(err); }
});

// ---- Recent changes (the "what changed" feed) --------------------------------
router.get('/changes', async (req, res, next) => {
  try {
    if (!(await tablesReady())) return res.json({ rows: [] });
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const rows = (await query(
      `SELECT c.title, c.url, c.source_name, c.kind, c.detected_at
         FROM knowledge_changes c ORDER BY c.detected_at DESC LIMIT ${limit}`)).rows;
    res.json({ rows });
  } catch (err) { next(err); }
});

// ---- Browse / search pages ---------------------------------------------------
router.get('/pages', async (req, res, next) => {
  try {
    if (!(await tablesReady())) return res.json({ rows: [], total: 0, empty: true });
    const q = String(req.query.q || '').trim();
    const source = Number(req.query.source) || null;
    const category = String(req.query.category || '').trim();
    const lang = String(req.query.lang || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 24, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const where = ['p.active'];
    const params = [];
    if (source) { params.push(source); where.push(`p.source_id = $${params.length}`); }
    if (category) { params.push(category); where.push(`s.category = $${params.length}`); }
    if (lang) { params.push(lang); where.push(`p.lang = $${params.length}`); }
    let rankSel = 'NULL::float AS rank';
    let excerptSel = `left(regexp_replace(p.content, '\\s+', ' ', 'g'), 240) AS excerpt`;
    let order = 'p.changed_at DESC NULLS LAST, p.fetched_at DESC';
    if (q) {
      params.push(q);
      const qi = params.length;
      where.push(`p.ts @@ websearch_to_tsquery('simple', $${qi})`);
      rankSel = `ts_rank(p.ts, websearch_to_tsquery('simple', $${qi})) AS rank`;
      excerptSel = `ts_headline('simple', p.content, websearch_to_tsquery('simple', $${qi}), 'MaxWords=42,MinWords=15,MaxFragments=2,StartSel=«,StopSel=»') AS excerpt`;
      order = 'rank DESC, p.changed_at DESC NULLS LAST';
    }
    const whereSql = where.join(' AND ');
    const total = (await query(
      `SELECT count(*)::int n FROM knowledge_pages p LEFT JOIN knowledge_sources s ON s.id = p.source_id WHERE ${whereSql}`,
      params)).rows[0].n;
    const rows = (await query(
      `SELECT p.id, p.title, p.url, p.lang, p.word_count, p.fetched_at, p.changed_at, p.entities,
              s.name AS source, s.category, ${rankSel}, ${excerptSel}
         FROM knowledge_pages p LEFT JOIN knowledge_sources s ON s.id = p.source_id
        WHERE ${whereSql} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
      params)).rows;
    res.json({
      rows: rows.map((r) => ({
        id: r.id, title: r.title, url: r.url, lang: r.lang, words: r.word_count,
        source: r.source, category: r.category, as_of: r.fetched_at, changed_at: r.changed_at,
        mentions: listMentions(r.entities),
        excerpt: String(r.excerpt || '').replace(/\s+/g, ' ').trim(),
      })),
      total,
    });
  } catch (err) { next(err); }
});

// ---- One full page -----------------------------------------------------------
router.get('/pages/:id', async (req, res, next) => {
  try {
    if (!(await tablesReady())) return res.status(404).json({ error: 'not_found' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_id' });
    const r = (await query(
      `SELECT p.id, p.title, p.url, p.lang, p.word_count, p.content, p.entities, p.fetched_at, p.changed_at,
              s.name AS source, s.category, s.base_url
         FROM knowledge_pages p LEFT JOIN knowledge_sources s ON s.id = p.source_id
        WHERE p.id = $1 AND p.active`, [id])).rows[0];
    if (!r) return res.status(404).json({ error: 'not_found' });
    res.json({
      id: r.id, title: r.title, url: r.url, lang: r.lang, words: r.word_count,
      source: r.source, category: r.category, as_of: r.fetched_at, changed_at: r.changed_at,
      content: r.content, entities: r.entities || {},
    });
  } catch (err) { next(err); }
});

export default router;

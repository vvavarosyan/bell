// Market Feed enrichment — a cheap-LLM pass over unprocessed news_items.
// Classifies category/sentiment/importance, extracts entities, conservatively
// links mentioned companies to Bell company records, and upgrades the
// corresponding feed_events row. Cost-controlled: small batches, a daily cap,
// cheapest capable model. Items already appear in the feed (poller writes
// feed_events at insert with the source's category hint); this just makes them
// smarter.

import { query } from '../db.js';
import { getKey } from '../keychain.js';

const MODEL      = process.env.BDI_NEWS_MODEL || 'gpt-4o-mini';
const BATCH      = 12;
const DAILY_CAP  = Number(process.env.BDI_NEWS_DAILY_CAP || 4000);  // items/day

const CATEGORIES = ['economic', 'political', 'corporate', 'energy', 'real_estate', 'tech', 'legal', 'sports', 'other'];
const SENTIMENTS = ['positive', 'negative', 'neutral'];

const state = { processed_today: 0, day: null, last_run_at: null, last_error: null, links_made: 0 };
export function getEnrichState() { return { ...state }; }

function rollDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (state.day !== d) { state.day = d; state.processed_today = 0; }
}

/** Enrich one batch of unprocessed items. Returns a small summary. */
export async function enrichBatch() {
  rollDay();
  if (state.processed_today >= DAILY_CAP) return { skipped: 'daily_cap' };

  const key = await getKey('openai');
  if (!key) return { skipped: 'no_openai_key' };

  const { rows } = await query(
    `SELECT id, title, summary FROM news_items WHERE processed = false ORDER BY created_at DESC LIMIT $1`,
    [BATCH]
  );
  if (!rows.length) return { processed: 0 };

  const list = rows.map((r, i) => `${i}. ${r.title}${r.summary ? ' — ' + r.summary.slice(0, 200) : ''}`).join('\n');
  const sys = 'You are a Qatar business-intelligence news classifier. Be precise and return only JSON.';
  const user =
`Classify each numbered news item for a Qatar market-intelligence feed.
Categories: ${CATEGORIES.join(', ')}.
For "companies", list ONLY explicitly named companies/organizations (no generic terms like "Qatar" or "the government").
Return JSON exactly:
{"items":[{"i":<index>,"category":"<one category>","sentiment":"positive|negative|neutral","importance":<0..1>,"companies":["..."],"people":["..."]}]}

Items:
${list}`;

  let parsed;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: sys }, { role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error('OpenAI HTTP ' + res.status + ': ' + (await res.text()).slice(0, 160));
    const data = await res.json();
    parsed = JSON.parse(data.choices?.[0]?.message?.content || '{}');
  } catch (err) {
    state.last_error = err.message;
    return { error: err.message };  // leave items unprocessed; they retry next tick
  }

  const byIndex = new Map((parsed.items || []).map((x) => [Number(x.i), x]));
  let processed = 0, links = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const c = byIndex.get(i) || {};
    const category   = CATEGORIES.includes(c.category) ? c.category : 'other';
    const sentiment  = SENTIMENTS.includes(c.sentiment) ? c.sentiment : 'neutral';
    const importance = clamp01(Number(c.importance));
    const companies  = Array.isArray(c.companies) ? c.companies.slice(0, 12) : [];
    const people     = Array.isArray(c.people) ? c.people.slice(0, 12) : [];
    const companyIds = await linkCompanies(companies);
    links += companyIds.length;
    const entities = JSON.stringify({ companies, people });

    await query(
      `UPDATE news_items
          SET processed = true, category = $2, sentiment = $3, sentiment_score = $4,
              importance_score = $5, entities = $6::jsonb, linked_company_ids = $7, updated_at = now()
        WHERE id = $1`,
      [row.id, category, sentiment, sentScore(sentiment), importance, entities, companyIds]
    );
    await query(
      `UPDATE feed_events
          SET category = $2, sentiment = $3, importance = $4, entities = $5::jsonb, linked_company_ids = $6
        WHERE kind = 'news' AND ref_table = 'news_items' AND ref_id = $1`,
      [row.id, category, sentiment, importance, entities, companyIds]
    );
    processed++;
  }

  state.processed_today += processed;
  state.last_run_at = new Date().toISOString();
  state.links_made += links;
  return { processed, links };
}

function clamp01(n) { return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; }
function sentScore(s) { return s === 'positive' ? 1 : s === 'negative' ? -1 : 0; }

// Conservative company linking: exact normalized match, or "name + suffix"
// (e.g. "qatarenergy" → "qatarenergy llc"). Min length guards against noise.
async function linkCompanies(names) {
  const ids = [];
  for (const raw of names) {
    const norm = normalize(raw);
    if (norm.length < 5) continue;
    const r = await query(
      `SELECT id FROM companies
        WHERE archived = false
          AND (name_normalized = $1 OR name_normalized LIKE $1 || ' %')
        ORDER BY length(name_normalized) ASC
        LIMIT 1`,
      [norm]
    );
    if (r.rows.length) ids.push(Number(r.rows[0].id));
  }
  return [...new Set(ids)];
}
function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

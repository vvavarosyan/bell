// Market Feed enrichment — the LLM pass over unprocessed news_items.
//
// v2 (Phase B, Val 2026-07-02): EVERY item now gets a PROPER Bell-written
// summary. The enricher first FETCHES each article and extracts its readable
// text (news/extract.js), then asks the model for a 2–3 sentence factual
// summary grounded ONLY in that text — plus the original classification work
// (category/sentiment/importance/entities) and conservative company linking.
// Bell-written summaries OVERRIDE the raw RSS blurbs (which are often
// truncated junk); we never store the article body itself — summary only,
// with the "read at source" link doing the rest (copyright-safe).
//
// Cost-controlled: small batches, a daily cap, cheapest capable model.
// No key → skips quietly and retries next tick (nothing breaks).

import { query } from '../db.js';
import { getKey } from '../keychain.js';
import { fetchArticleTexts } from './extract.js';

// Provider-flexible: prefer Anthropic (Claude Haiku) if a key is set, else
// OpenAI. NOTE: the old default (claude-3-haiku-20240307) is retired — keep
// this on a CURRENT model or the pass fails on every call.
const ANTHROPIC_MODEL = process.env.BDI_NEWS_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
const OPENAI_MODEL    = process.env.BDI_NEWS_OPENAI_MODEL    || 'gpt-4o-mini';
const BATCH      = 10;                                               // items per LLM call
const DAILY_CAP  = Number(process.env.BDI_NEWS_DAILY_CAP || 4000);   // items/day
const EXCERPT_CHARS = 3000;                                          // article text per item fed to the model

// Val 2026-07-02: do NOT spend on the pre-existing backlog — only items
// ingested from this date forward get the LLM pass. Overridable if we ever
// want to back-fill (set BDI_NEWS_SINCE=1970-01-01 to process everything).
const SUMMARIZE_SINCE = process.env.BDI_NEWS_SINCE || '2026-07-02';

const CATEGORIES = ['economic', 'political', 'corporate', 'energy', 'real_estate', 'tech', 'legal', 'sports', 'other'];
const SENTIMENTS = ['positive', 'negative', 'neutral'];

const state = { processed_today: 0, day: null, last_run_at: null, last_error: null, links_made: 0, summarized: 0, fetched_articles: 0 };
export function getEnrichState() { return { ...state }; }

function rollDay() {
  const d = new Date().toISOString().slice(0, 10);
  if (state.day !== d) { state.day = d; state.processed_today = 0; }
}

/** Enrich one batch of unprocessed items. Returns a small summary. */
export async function enrichBatch() {
  rollDay();
  if (state.processed_today >= DAILY_CAP) return { skipped: 'daily_cap' };

  const anthropicKey = await getKey('anthropic');
  const openaiKey    = anthropicKey ? null : await getKey('openai');
  if (!anthropicKey && !openaiKey) { state.last_error = 'no_llm_key (set BDI_KEY_ANTHROPIC)'; return { skipped: 'no_llm_key' }; }

  const { rows } = await query(
    `SELECT id, url, title, summary, source_name
       FROM news_items
      WHERE processed = false AND created_at >= $2
      ORDER BY created_at DESC
      LIMIT $1`,
    [BATCH, SUMMARIZE_SINCE]
  );
  if (!rows.length) return { processed: 0 };

  // 1) Fetch the actual articles (parallel, capped, fail-soft) so summaries are
  //    grounded in the real text — not hallucinated from a headline.
  const texts = await fetchArticleTexts(rows.map((r) => ({ id: r.id, url: r.url })), { concurrency: 5 });
  state.fetched_articles += texts.size;

  const list = rows.map((r, i) => {
    const body = (texts.get(r.id) || '').slice(0, EXCERPT_CHARS);
    const rss  = !body && r.summary ? `RSS blurb: ${String(r.summary).slice(0, 260)}` : '';
    return `### ITEM ${i}
TITLE: ${r.title}
SOURCE: ${r.source_name || 'unknown'}
${body ? `ARTICLE TEXT:\n${body}` : (rss || 'ARTICLE TEXT: (unavailable)')}`;
  }).join('\n\n');

  const sys = 'You are a Qatar business-intelligence news analyst. You are precise, factual, and you NEVER invent details that are not in the provided text. Return only JSON.';
  const user =
`For each numbered news item below, produce for a Qatar market-intelligence feed:
- "summary": 2–3 factual sentences (40–70 words) written ONLY from the item's provided text. Neutral tone, no hype, no opinions. If the article text is unavailable or too thin, write ONE cautious sentence restating what the headline says — never invent numbers, names, or outcomes.
- "category": one of ${CATEGORIES.join(', ')}.
- "sentiment": positive|negative|neutral (business sentiment for Qatar's market).
- "importance": 0..1 (market significance for Qatar).
- "companies": ONLY explicitly named companies/organizations (no generic terms like "Qatar" or "the government").
- "people": explicitly named individuals.
Return JSON exactly:
{"items":[{"i":<index>,"summary":"...","category":"...","sentiment":"...","importance":<0..1>,"companies":["..."],"people":["..."]}]}

${list}`;

  let parsed;
  try {
    const text = anthropicKey
      ? await callAnthropic(anthropicKey, sys, user)
      : await callOpenAI(openaiKey, sys, user);
    parsed = JSON.parse(extractJson(text));
    state.last_error = null;
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
    // Bell-written summary WINS over the raw RSS blurb (COALESCE keeps the old
    // text only when the model produced nothing for this item).
    const aiSummary = (typeof c.summary === 'string' && c.summary.trim()) ? c.summary.trim().slice(0, 700) : null;
    if (aiSummary) state.summarized++;

    await query(
      `UPDATE news_items
          SET processed = true, category = $2, sentiment = $3, sentiment_score = $4,
              importance_score = $5, entities = $6::jsonb, linked_company_ids = $7,
              summary = COALESCE($8, summary), updated_at = now()
        WHERE id = $1`,
      [row.id, category, sentiment, sentScore(sentiment), importance, entities, companyIds, aiSummary]
    );
    await query(
      `UPDATE feed_events
          SET category = $2, sentiment = $3, importance = $4, entities = $5::jsonb,
              linked_company_ids = $6, summary = COALESCE($7, summary)
        WHERE kind = 'news' AND ref_table = 'news_items' AND ref_id = $1`,
      [row.id, category, sentiment, importance, entities, companyIds, aiSummary]
    );
    processed++;
  }

  state.processed_today += processed;
  state.last_run_at = new Date().toISOString();
  state.links_made += links;
  return { processed, links, summarized: state.summarized };
}

// ---- LLM providers ---------------------------------------------------------
async function callAnthropic(key, system, user) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2500,
      temperature: 0.2,
      system: system + ' Respond with ONLY the JSON object, no prose, no markdown fences.',
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error('Anthropic HTTP ' + res.status + ': ' + (await res.text()).slice(0, 160));
  const data = await res.json();
  return data.content?.[0]?.text || '{}';
}

async function callOpenAI(key, system, user) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error('OpenAI HTTP ' + res.status + ': ' + (await res.text()).slice(0, 160));
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '{}';
}

// Tolerate a model that wraps JSON in prose or ```json fences.
function extractJson(text) {
  if (!text) return '{}';
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
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

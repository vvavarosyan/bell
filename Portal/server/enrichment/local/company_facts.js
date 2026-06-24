// Stage 11 — Company Facts Finder (Local Engine 5).
// ----------------------------------------------------------------------------
// Pulls CAPITAL, FINANCIALS and SHAREHOLDERS from a company's OWN website into
// company_financials / company_shareholders. For Qatar SMEs this data only lives
// on their site (the registries don't expose it), so that's where we look.
//
// Credit-smart + doctrine-first ("no garbage"):
//   • $0 GATE — fetch the site locally (Crawl4AI renders JS ones) and only
//     proceed if the text actually mentions capital / shareholders / financials.
//     Most companies don't → we never spend a credit on them.
//   • EXTRACT — for the rest, one Firecrawl structured (LLM) scrape returns clean
//     { capital, financials, shareholders } (validated live: Milaha → capital
//     QAR 4B + FY24/FY23 figures, ~5 credits).
//   • VALIDATE — only well-formed facts are stored (a metric + a real number; a
//     named shareholder; capital with a value). Vague/empty → discarded.
//
// Disable with BELL_FACTS_FIRECRAWL=0. Mirrors the other engines' shape:
//   enrichCompany(company) + enrichCompanies(companies, jobLog).

import { query } from '../../db.js';
import { fetchPage } from './http.js';
import { rendererAvailable, renderPage } from './render.js';
import { scrapeExtract } from '../clients/firecrawl.js';

const ENABLED = process.env.BELL_FACTS_FIRECRAWL !== '0';
const FC = { extracts: 0, credits: 0, financials: 0, shareholders: 0, errors: 0, disabled: false };
export function factsState() { return { ...FC }; }

// Only spend a credit if the page actually talks about money/ownership.
const FACTS_RX = /(share\s*capital|paid[\s-]*up\s*capital|authoriz(?:ed|ed)?\s*capital|capital\s*of\s*(?:qar|usd|qr)|shareholders?|shareholding|ownership\s+structure|board of directors|annual report|financial statements?|net profit|revenue|turnover|total assets|operating income)/i;

const SCHEMA = {
  type: 'object',
  properties: {
    capital: { type: 'array', items: { type: 'object', properties: {
      type: { type: 'string' }, amount: { type: 'string' }, currency: { type: 'string' } } } },
    shareholders: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, type: { type: 'string' }, stake: { type: 'string' } } } },
    financials: { type: 'array', items: { type: 'object', properties: {
      metric: { type: 'string' }, value: { type: 'string' }, currency: { type: 'string' }, period: { type: 'string' } } } },
  },
};
const PROMPT = 'Extract official company facts ONLY if explicitly stated on the page: registered / paid-up / authorized capital (amount + currency), shareholders and their ownership stakes, and stated financial figures (revenue, net profit, total assets, operating income) with their period or year. Do not infer or guess — omit anything not clearly stated on this page.';

function toUrl(website) {
  if (!website) return '';
  let s = String(website).trim();
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}
const clean = (s) => (s == null ? null : (String(s).trim().replace(/\s+/g, ' ').slice(0, 300) || null));
function parseNum(v) {
  if (v == null) return null;
  const s = String(v).toLowerCase().replace(/,/g, '');
  const mult = /\b(billion|bn)\b/.test(s) ? 1e9 : /\b(million|mn)\b/.test(s) ? 1e6 : /\b(thousand|k)\b/.test(s) ? 1e3 : 1;
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]) * mult;
  return Number.isFinite(n) ? n : null;
}

async function markStage11(id, status, extras = {}) {
  await query(`UPDATE companies SET stage11_status=$2, stage11_at=now(), extra_fields=extra_fields||$3::jsonb WHERE id=$1`,
    [id, status, JSON.stringify(extras)]);
}

async function getPage(url) {
  let p = await fetchPage(url, { respectRobots: false, timeoutMs: 9000, retries: 1 }).catch(() => null);
  if ((!p || !p.ok || (p.text || '').length < 400) && await rendererAvailable()) {
    const r = await renderPage(url).catch(() => null);
    if (r && r.ok) p = r;
  }
  return p && p.ok ? p : null;
}

function validFinancials(facts) {
  const out = [];
  for (const f of (Array.isArray(facts.financials) ? facts.financials : [])) {
    const metric = clean(f.metric); if (!metric) continue;
    const valNum = parseNum(f.value); const valText = clean(f.value);
    if (valNum == null && !(valText && /\d/.test(valText))) continue;     // require a number
    out.push({ metric, value_text: valText, value_num: valNum, currency: clean(f.currency), period: clean(f.period) });
  }
  for (const c of (Array.isArray(facts.capital) ? facts.capital : [])) {
    const amount = clean(c.amount); if (!amount || !/\d/.test(amount)) continue;
    const type = (clean(c.type) || 'capital').toLowerCase();
    const metric = /paid/.test(type) ? 'paid_up_capital' : /author/.test(type) ? 'authorized_capital' : 'capital';
    out.push({ metric, value_text: amount, value_num: parseNum(amount), currency: clean(c.currency), period: null });
  }
  return out.slice(0, 30);
}
function validShareholders(facts) {
  const out = [];
  for (const s of (Array.isArray(facts.shareholders) ? facts.shareholders : [])) {
    const name = clean(s.name); if (!name || name.length < 2) continue;
    out.push({ holder_name: name, holder_type: clean(s.type), stake_pct: parseNum(s.stake), stake_text: clean(s.stake) });
  }
  return out.slice(0, 40);
}

async function writeFacts(companyId, financials, shareholders, source) {
  let fin = 0, sh = 0;
  for (const f of financials) {
    const exists = await query(
      `SELECT 1 FROM company_financials WHERE company_id=$1 AND lower(metric)=lower($2) AND coalesce(period,'')=coalesce($3,'') LIMIT 1`,
      [companyId, f.metric, f.period || '']);
    if (exists.rows.length) continue;
    await query(
      `INSERT INTO company_financials (company_id, metric, value_text, value_num, currency, period, confidence, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [companyId, f.metric, f.value_text, f.value_num, f.currency, f.period, 'medium', source]
    ).then(() => fin++).catch(() => {});
  }
  for (const s of shareholders) {
    const exists = await query(
      `SELECT 1 FROM company_shareholders WHERE company_id=$1 AND lower(holder_name)=lower($2) LIMIT 1`,
      [companyId, s.holder_name]);
    if (exists.rows.length) continue;
    await query(
      `INSERT INTO company_shareholders (company_id, holder_name, holder_type, stake_pct, stake_text, confidence, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [companyId, s.holder_name, s.holder_type, s.stake_pct, s.stake_text, 'medium', source]
    ).then(() => sh++).catch(() => {});
  }
  return { fin, sh };
}

export async function enrichCompany(company) {
  const url = toUrl(company.website);
  if (!url) { await markStage11(company.id, 'no_data', { stage11_skip: 'no-website' }); return { status: 'no_data', facts: 0 }; }

  // $0 gate — does the site even mention capital / shareholders / financials?
  const page = await getPage(url);
  if (!page) { await markStage11(company.id, 'no_data', { stage11_skip: 'unreachable' }); return { status: 'no_data', facts: 0 }; }
  if (!FACTS_RX.test((page.title || '') + ' ' + (page.text || ''))) {
    await markStage11(company.id, 'no_data', { stage11_skip: 'no-facts-keywords' });
    return { status: 'no_data', facts: 0 };
  }

  if (!ENABLED || FC.disabled) {
    await markStage11(company.id, 'no_data', { stage11_skip: 'extract-disabled' });
    return { status: 'no_data', facts: 0 };
  }

  // Structured extraction (Firecrawl LLM) on the company's OWN page.
  let facts;
  try {
    facts = await scrapeExtract(page.finalUrl || url, { prompt: PROMPT, schema: SCHEMA });
    FC.extracts++; FC.credits += 5;
  } catch (e) {
    FC.errors++;
    if (e?.status === 401 || e?.status === 402 || e?.status === 429) FC.disabled = true;
    await markStage11(company.id, 'failed', { stage11_error: String((e && e.message) || 'extract').slice(0, 140) });
    return { status: 'failed', facts: 0 };
  }
  if (!facts) { await markStage11(company.id, 'no_data', { stage11_skip: 'no-extract' }); return { status: 'no_data', facts: 0 }; }

  const financials = validFinancials(facts);
  const shareholders = validShareholders(facts);
  const { fin, sh } = await writeFacts(company.id, financials, shareholders, 'website:firecrawl');
  FC.financials += fin; FC.shareholders += sh;
  const total = fin + sh;
  await markStage11(company.id, total > 0 ? 'done' : 'no_data', { stage11_financials: fin, stage11_shareholders: sh });
  return { status: total > 0 ? 'done' : 'no_data', facts: total };
}

export async function enrichCompanies(companies, jobLog = null) {
  let done = 0, no_data = 0, failed = 0, facts = 0;
  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    try {
      const r = await enrichCompany(c);
      if (r.status === 'done') done++; else if (r.status === 'failed') failed++; else no_data++;
      facts += r.facts || 0;
      jobLog?.(`  ${r.status === 'done' ? '✓' : (r.status === 'failed' ? '✗' : '·')} [${i + 1}/${companies.length}] ${c.name} — +${r.facts || 0} fact(s)`);
    } catch (err) {
      failed++;
      try { await markStage11(c.id, 'failed', { stage11_error: err.message }); } catch { /* ignore */ }
      jobLog?.(`  ✗ [${i + 1}/${companies.length}] ${c.name} — ${err.message}`);
    }
  }
  return { done, no_data, failed, usd: 0, facts };
}

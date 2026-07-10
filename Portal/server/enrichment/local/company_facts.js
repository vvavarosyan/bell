// Stage 11 — Company Facts Finder (Local Engine 5).
// ----------------------------------------------------------------------------
// Pulls CAPITAL, FINANCIALS and SHAREHOLDERS from a company's OWN website into
// company_financials / company_shareholders. For Qatar SMEs this data only lives
// on their site (the registries don't expose it), so that's where we look.
//
// Credit-smart + doctrine-first ("no garbage"):
//   • $0 GATE — fetch the site locally (Crawl4AI renders JS ones) and only
//     proceed if the text actually mentions capital / shareholders / financials.
//     Most companies don't → we never look further.
//   • EXTRACT (local-first, FREE) — parse the SAME rendered page with local
//     heuristics for capital / financials / shareholders. No second fetch, no
//     credits. This is the default ("extract once" off the Crawl4AI render).
//   • EXTRACT (Firecrawl, opt-in) — only if the local pass finds nothing AND
//     BELL_FACTS_FIRECRAWL=1, fall back to one structured (LLM) scrape (~5
//     credits). Off by default so the engine costs $0 unless you ask for it.
//   • VALIDATE — only well-formed facts are stored (a metric + a real number; a
//     named shareholder; capital with a value). Vague/empty → discarded.
//
// Flags: BELL_FACTS_LOCAL=0 disables local extraction; BELL_FACTS_FIRECRAWL=1
// enables the paid fallback. Mirrors the other engines' shape:
//   enrichCompany(company) + enrichCompanies(companies, jobLog).

import { query } from '../../db.js';
import { fetchPage } from './http.js';
import { rendererAvailable, renderPage } from './render.js';
import { scrapeExtract } from '../clients/firecrawl.js';
import { recordReject } from './rejects.js';
import { recordSearch } from './ledger.js';

const LOCAL_FIRST        = process.env.BELL_FACTS_LOCAL !== '0';   // free local parse (default ON)
const FIRECRAWL_FALLBACK = process.env.BELL_FACTS_FIRECRAWL === '1'; // paid LLM extract (default OFF)
const FC = { local: 0, extracts: 0, credits: 0, financials: 0, shareholders: 0, errors: 0, disabled: false };
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

// ---- LOCAL (free) facts extraction from the already-rendered page ----------
// Returns the SAME { capital, financials, shareholders } shape Firecrawl returns,
// so the existing validators + write path handle both identically. Conservative
// by design (each item needs a currency/number or a clear "Name NN%") to honour
// the "no garbage" doctrine; the validators discard anything still vague.
const CUR = '(QAR|QR|USD|US\\$|\\$|EUR|€|AED|SAR|KWD|BHD|OMR)';
function normCurrency(c) {
  if (!c) return null;
  const s = String(c).toUpperCase();
  if (s === 'QR') return 'QAR';
  if (s === 'US$' || s === '$') return 'USD';
  if (s === '€') return 'EUR';
  return s;
}
export function extractFactsLocal(page) {
  const text = (((page && page.title) || '') + '\n' + ((page && page.text) || '')).replace(/ /g, ' ');
  const capital = [], financials = [], shareholders = [];
  let m;

  // Capital: "<type> capital [of] <cur> <num>"  (type optional)
  const capRx = new RegExp(
    '(authoriz(?:ed)?|paid[\\s-]*up|share|registered|issued)?\\s*capital(?:\\s+of)?[^.\\n]{0,40}?' +
    CUR + '\\s*([0-9][0-9.,]*\\s*(?:billion|bn|million|mn|thousand|k)?)', 'gi');
  while ((m = capRx.exec(text)) !== null) {
    const amount = (m[3] || '').trim().replace(/[.,]+$/, '');
    if (!/\d/.test(amount)) continue;
    capital.push({ type: (m[1] || 'capital').trim(), currency: normCurrency(m[2]), amount: `${m[2]} ${amount}`.trim() });
    if (capital.length >= 10) break;
  }

  // Financials: "<metric> ... [cur] <num>"  (+ a nearby year if present)
  const METRIC = '(net\\s+profit|net\\s+income|net\\s+loss|revenue|total\\s+revenue|turnover|' +
    'total\\s+assets|operating\\s+income|gross\\s+profit|ebitda|total\\s+equity|profit\\s+for\\s+the\\s+year)';
  const finRx = new RegExp(METRIC + '[^.\\n]{0,40}?' + CUR + '?\\s*([0-9][0-9.,]*\\s*(?:billion|bn|million|mn|thousand|k)?)', 'gi');
  while ((m = finRx.exec(text)) !== null) {
    const num = (m[3] || '').trim().replace(/[.,]+$/, '');
    if (!/\d/.test(num)) continue;
    const around = text.slice(Math.max(0, m.index - 10), m.index + m[0].length + 40);
    const ym = around.match(/\b(20\d\d|FY\s?\d{2,4})\b/);
    financials.push({ metric: m[1].replace(/\s+/g, ' ').trim(), currency: normCurrency(m[2]), value: num, period: ym ? ym[1] : null });
    if (financials.length >= 30) break;
  }

  // Shareholders: only inside an ownership context; "<Name> ... NN%".
  if (/shareholders?|ownership\s+structure|shareholding|owned\s+by/i.test(text)) {
    const shRx = /([A-Z][A-Za-z&.\-'’ ]{2,38}?)\s*(?:[-–—:(]|\bholds?\b|\bowns?\b|\bwith\b)?\s*\(?([0-9]{1,3}(?:\.[0-9]+)?)\s*%/g;
    const STOP = /^(the|and|capital|revenue|profit|total|share|approximately|about|over|up|growth|increase|more|than|nearly|around|almost|net|gross|annual)$/i;
    while ((m = shRx.exec(text)) !== null) {
      const name = m[1].replace(/\s+/g, ' ').trim();
      const pct = parseFloat(m[2]);
      if (!name || name.length < 3 || pct > 100 || STOP.test(name)) continue;
      shareholders.push({ name, stake: m[2] + '%', type: null });
      if (shareholders.length >= 20) break;
    }
  }

  return { capital, financials, shareholders };
}

async function markStage11(id, status, extras = {}) {
  await query(`UPDATE companies SET stage11_status=$2, stage11_at=now(), extra_fields=extra_fields||$3::jsonb WHERE id=$1`,
    [id, status, JSON.stringify(extras)]);
  await recordSearch(id, 11, status, extras);
}

async function getPage(url) {
  let p = await fetchPage(url, { respectRobots: false, timeoutMs: 9000, retries: 1 }).catch(() => null);
  if ((!p || !p.ok || (p.text || '').length < 400) && await rendererAvailable()) {
    const r = await renderPage(url).catch(() => null);
    if (r && r.ok) p = r;
  }
  return p && p.ok ? p : null;
}

function validFinancials(facts, rejects) {
  const out = [];
  for (const f of (Array.isArray(facts.financials) ? facts.financials : [])) {
    const metric = clean(f.metric); if (!metric) continue;
    const valNum = parseNum(f.value); const valText = clean(f.value);
    if (valNum == null && !(valText && /\d/.test(valText))) {            // require a number
      if (rejects) rejects.push({ kind: 'fact', value: `${metric}${valText ? ': ' + valText : ''}`, reason: 'no numeric value' });
      continue;
    }
    out.push({ metric, value_text: valText, value_num: valNum, currency: clean(f.currency), period: clean(f.period) });
  }
  for (const c of (Array.isArray(facts.capital) ? facts.capital : [])) {
    const amount = clean(c.amount);
    if (!amount || !/\d/.test(amount)) {
      if (rejects && (clean(c.type) || amount)) rejects.push({ kind: 'fact', value: `capital${amount ? ': ' + amount : ''}`, reason: 'no numeric value' });
      continue;
    }
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
    // A near-empty JS shell that never got rendered was never actually read —
    // its keyword miss is NOT proof the site shows no facts (ledger: degraded).
    const shell = (page.text || '').length < 400 && !page.rendered;
    await markStage11(company.id, 'no_data', { stage11_skip: shell ? 'js-shell-unrendered' : 'no-facts-keywords' });
    return { status: 'no_data', facts: 0 };
  }

  if (!LOCAL_FIRST && !FIRECRAWL_FALLBACK) {
    await markStage11(company.id, 'no_data', { stage11_skip: 'extract-disabled' });
    return { status: 'no_data', facts: 0 };
  }

  // EXTRACT (local-first, FREE) — parse the page we already rendered.
  let financials = [], shareholders = [], source = 'website:local';
  if (LOCAL_FIRST) {
    FC.local++;
    const local = extractFactsLocal(page);
    financials = validFinancials(local, null);
    shareholders = validShareholders(local);
  }

  // EXTRACT (Firecrawl LLM, OPT-IN) — only if local found nothing.
  if (!financials.length && !shareholders.length && FIRECRAWL_FALLBACK && !FC.disabled) {
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
    if (facts) {
      const rejects = [];
      financials = validFinancials(facts, rejects);
      shareholders = validShareholders(facts);
      source = 'website:firecrawl';
      for (const rj of rejects.slice(0, 25)) { try { await recordReject(company.id, 'facts', rj.kind, rj.value, rj.reason); } catch { /* ignore */ } }
    }
  }

  const { fin, sh } = await writeFacts(company.id, financials, shareholders, source);
  FC.financials += fin; FC.shareholders += sh;
  const total = fin + sh;
  await markStage11(company.id, total > 0 ? 'done' : 'no_data',
    { stage11_financials: fin, stage11_shareholders: sh, stage11_source: source });
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

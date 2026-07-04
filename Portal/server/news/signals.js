// SIGNALS generator (Phase C, Val-approved 2026-07-02) — derives market
// signals from data Bell already owns and writes them into the `signals`
// table (migration 070). Runs on the news-engine service every ~15 minutes;
// every insert is idempotent via dedup_key, so re-runs never duplicate.
//
// PDPPL note: leadership signals NEVER carry a person's name — role title +
// company only ("New C-level joined X"), consistent with the People lockdown.
//
// Also exports the PURE ICP scorer used by /api/signals for the per-tenant
// "For you" view — unit-testable without a database.

import { query } from '../db.js';

const state = { last_run_at: null, last_error: null, inserted_last: 0, runs: 0 };
export function getSignalsState() { return { ...state }; }

const LOOKBACK_HOURS = { hiring: 48, newly_licensed: 72, partnership: 72, leadership: 72, news_event: 48, expansion: 336, tender: 720 };

export async function generateSignals() {
  let inserted = 0;
  try {
    inserted += await genHiring();
    inserted += await genNewlyLicensed();
    inserted += await genPartnerships();
    inserted += await genLeadership();
    inserted += await genNewsEvents();
    inserted += await genExpansion();
    inserted += await genTenderSignals();
    state.last_error = null;
  } catch (err) {
    state.last_error = err.message;
    console.error('[signals] generate:', err.message);
  }
  state.last_run_at = new Date().toISOString();
  state.inserted_last = inserted;
  state.runs++;
  return { inserted };
}

// hiring — companies that posted jobs in the window (one signal per company/day).
async function genHiring() {
  const r = await query(`
    INSERT INTO signals (kind, company_id, company_name, title, body, source_kind, ref_table, ref_id,
                         industry, employee_count, importance, occurred_at, dedup_key)
    SELECT 'hiring', c.id, c.name,
           'Hiring: ' || count(j.id) || CASE WHEN count(j.id) = 1 THEN ' new role at ' ELSE ' new roles at ' END || c.name,
           (array_agg(j.title ORDER BY j.posted_at DESC))[1]
             || CASE WHEN count(j.id) > 1 THEN ' +' || (count(j.id) - 1) || ' more' ELSE '' END,
           'jobs', 'companies', c.id,
           c.industry, c.employee_count,
           LEAST(0.4 + count(j.id) * 0.1, 0.9),
           max(j.created_at),
           'hiring:' || c.id || ':' || to_char(now(), 'YYYY-MM-DD')
      FROM jobs j JOIN companies c ON c.id = j.company_id
     WHERE j.created_at > now() - interval '${LOOKBACK_HOURS.hiring} hours' AND j.is_active = true
     GROUP BY c.id, c.name, c.industry, c.employee_count
    ON CONFLICT (dedup_key) DO NOTHING`);
  return r.rowCount || 0;
}

// newly_licensed — fresh, active registry entries.
async function genNewlyLicensed() {
  const r = await query(`
    INSERT INTO signals (kind, company_id, company_name, title, body, source_kind, ref_table, ref_id,
                         industry, employee_count, importance, occurred_at, dedup_key)
    SELECT 'newly_licensed', c.id, c.name,
           'Newly licensed: ' || c.name,
           NULLIF(concat_ws(' · ', c.industry, c.city), ''),
           'registry', 'companies', c.id,
           c.industry, c.employee_count, 0.55, c.created_at,
           'newco:' || c.id
      FROM companies c
     WHERE c.created_at > now() - interval '${LOOKBACK_HOURS.newly_licensed} hours'
       AND COALESCE(c.is_active, true) = true AND COALESCE(c.archived, false) = false
       AND COALESCE(c.extra_fields->>'created_via', '') <> 'user_contributed'
    ON CONFLICT (dedup_key) DO NOTHING`);
  return r.rowCount || 0;
}

// partnership — new network edges from Engine 3 (competitor edges excluded:
// they're derived similarity, not a market EVENT).
async function genPartnerships() {
  const r = await query(`
    INSERT INTO signals (kind, subkind, company_id, company_name, title, body, source_kind, ref_table, ref_id,
                         industry, employee_count, importance, occurred_at, dedup_key)
    SELECT 'partnership', cr.relation_type, c.id, c.name,
           c.name || ' — new ' || cr.relation_type || ': ' || cr.target_name,
           CASE WHEN cr.discovered_via IS NOT NULL THEN 'Discovered via ' || replace(cr.discovered_via, '_', ' ') END,
           'relationships', 'company_relationships', cr.id,
           c.industry, c.employee_count,
           CASE WHEN cr.confidence = 'high' THEN 0.7 ELSE 0.55 END,
           cr.created_at,
           'rel:' || cr.id
      FROM company_relationships cr JOIN companies c ON c.id = cr.source_company_id
     WHERE cr.created_at > now() - interval '${LOOKBACK_HOURS.partnership} hours'
       AND cr.relation_type IN ('partner', 'client', 'affiliate', 'parent', 'subsidiary')
       AND cr.confidence IN ('high', 'medium')
    ON CONFLICT (dedup_key) DO NOTHING`);
  return r.rowCount || 0;
}

// leadership — senior arrivals. TITLES ONLY, never person names (PDPPL).
async function genLeadership() {
  const r = await query(`
    INSERT INTO signals (kind, subkind, company_id, company_name, title, body, source_kind, ref_table, ref_id,
                         industry, employee_count, importance, occurred_at, dedup_key)
    SELECT 'leadership', pc.seniority_level, c.id, c.name,
           'New leadership at ' || c.name,
           NULLIF(pc.title, ''),
           'people', 'person_companies', pc.id,
           c.industry, c.employee_count, 0.6, pc.created_at,
           'lead:' || pc.id
      FROM person_companies pc JOIN companies c ON c.id = pc.company_id
     WHERE pc.created_at > now() - interval '${LOOKBACK_HOURS.leadership} hours'
       AND pc.is_current = true
       AND pc.seniority_level IN ('owner', 'c_level', 'vp')
       AND COALESCE(pc.title, '') <> ''
    ON CONFLICT (dedup_key) DO NOTHING`);
  return r.rowCount || 0;
}

// news_event — Bell-summarized news linked to companies (one per item+company,
// first 3 linked companies to avoid fan-out).
// Business-relevance filter (Val 2026-07-04): sports/celebrity news wrongly
// matched to Qatar companies (a barber shop named after a football club, a news
// agency's local branch) was polluting Signals. Only business-relevant news
// above an importance floor becomes a signal — quality over volume.
const NEWS_SIGNAL_EXCLUDE = ['sports', 'other'];
const NEWS_SIGNAL_MIN_IMPORTANCE = 0.45;

async function genNewsEvents() {
  // Purge junk news signals that slipped in before this filter existed.
  await query(`DELETE FROM signals
                WHERE kind = 'news_event'
                  AND (lower(coalesce(subkind,'')) = ANY($1::text[]) OR importance < $2)`,
    [NEWS_SIGNAL_EXCLUDE, NEWS_SIGNAL_MIN_IMPORTANCE]);
  const r = await query(`
    INSERT INTO signals (kind, subkind, company_id, company_name, title, body, source_kind, ref_table, ref_id,
                         industry, employee_count, importance, occurred_at, dedup_key)
    SELECT 'news_event', n.category, c.id, c.name, n.title, n.summary,
           'news', 'news_items', n.id,
           c.industry, c.employee_count,
           GREATEST(COALESCE(n.importance_score, 0.4), 0.4),
           COALESCE(n.published_at, n.created_at),
           'news:' || n.id || ':' || c.id
      FROM news_items n
      CROSS JOIN LATERAL unnest(n.linked_company_ids[1:3]) AS lid(cid)
      JOIN companies c ON c.id = lid.cid
     WHERE n.processed = true AND n.summary IS NOT NULL
       AND n.created_at > now() - interval '${LOOKBACK_HOURS.news_event} hours'
       AND array_length(n.linked_company_ids, 1) > 0
       AND lower(coalesce(n.category,'')) <> ALL($1::text[])
       AND COALESCE(n.importance_score, 0) >= $2
    ON CONFLICT (dedup_key) DO NOTHING`, [NEWS_SIGNAL_EXCLUDE, NEWS_SIGNAL_MIN_IMPORTANCE]);
  return r.rowCount || 0;
}

// expansion — hiring VELOCITY (Signals v2): a company that opened many roles in
// the fortnight is scaling → the strongest buyer-intent signal Bell owns. One
// per company per ISO week; distinct from the day-level `hiring` pulse.
async function genExpansion() {
  const r = await query(`
    INSERT INTO signals (kind, subkind, company_id, company_name, title, body, source_kind, ref_table, ref_id,
                         industry, employee_count, importance, occurred_at, dedup_key)
    SELECT 'expansion', 'hiring_velocity', c.id, c.name,
           c.name || ' is scaling — ' || count(j.id) || ' roles opened in two weeks',
           'Rapid hiring' || COALESCE(' in ' || NULLIF(c.industry, ''), '') || ' — a strong growth + buying signal.',
           'jobs', 'companies', c.id,
           c.industry, c.employee_count,
           LEAST(0.65 + count(j.id) * 0.04, 0.95),
           max(j.created_at),
           'expansion:' || c.id || ':' || to_char(now(), 'IYYY-"W"IW')
      FROM jobs j JOIN companies c ON c.id = j.company_id
     WHERE j.created_at > now() - interval '${LOOKBACK_HOURS.expansion} hours' AND j.is_active = true
     GROUP BY c.id, c.name, c.industry, c.employee_count
    HAVING count(j.id) >= 4
    ON CONFLICT (dedup_key) DO NOTHING`);
  return r.rowCount || 0;
}

// tender — an AWARD linked to a Bell company is the strongest owned buyer-intent
// / active-vendor signal there is. Importance scales with contract value. Feeds
// tenders come from server/tenders/ingest.js (Monaqasat/Ashghal/QatarEnergy/…).
async function genTenderSignals() {
  const r = await query(`
    INSERT INTO signals (kind, subkind, company_id, company_name, title, body, source_kind, ref_table, ref_id,
                         industry, employee_count, importance, occurred_at, dedup_key)
    SELECT 'tender', t.status, c.id, c.name,
           CASE WHEN t.status = 'awarded' THEN c.name || ' won a tender — ' || t.title
                ELSE 'Tender activity — ' || t.title END,
           NULLIF(concat_ws(' · ', t.buyer,
             CASE WHEN t.value_amount IS NOT NULL THEN round(t.value_amount)::text || ' ' || COALESCE(t.currency, 'QAR') END), ''),
           'tenders', 'tenders', t.id,
           c.industry, c.employee_count,
           LEAST(0.75 + COALESCE(LEAST(t.value_amount, 50000000), 0) / 50000000.0 * 0.2, 0.97),
           COALESCE(t.awarded_at, t.published_at, t.created_at),
           'tender:' || t.id
      FROM tenders t JOIN companies c ON c.id = t.award_company_id
     WHERE t.award_company_id IS NOT NULL
       AND t.status <> 'cancelled'
       AND COALESCE(t.awarded_at, t.published_at, t.created_at) > now() - interval '${LOOKBACK_HOURS.tender} hours'
    ON CONFLICT (dedup_key) DO NOTHING`);
  return r.rowCount || 0;
}

// ── ICP scoring (pure — used by /api/signals scope=icp) ─────────────────────
// icp = { target_industries: [], target_keywords: [], target_sizes: [] }
// Returns { score: 0..1, reasons: [] } — score 0 means "not a match".

const SIZE_BUCKETS = [
  ['1-10', 1, 10], ['11-50', 11, 50], ['51-200', 51, 200],
  ['201-1000', 201, 1000], ['1001-5000', 1001, 5000], ['5000+', 5001, Infinity],
];
function bucketOf(n) {
  if (!Number.isFinite(Number(n)) || n == null) return null;
  const v = Number(n);
  const b = SIZE_BUCKETS.find(([, lo, hi]) => v >= lo && v <= hi);
  return b ? b[0] : null;
}

export function scoreSignalForIcp(signal, icp = {}) {
  const reasons = [];
  let score = 0;
  const inds = (icp.target_industries || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  const kws  = (icp.target_keywords  || []).map((s) => String(s).toLowerCase().trim()).filter(Boolean);
  const sizes = (icp.target_sizes || []).map((s) => String(s).trim()).filter(Boolean);

  const sigInd = String(signal.industry || '').toLowerCase();
  if (sigInd && inds.some((t) => sigInd.includes(t) || t.includes(sigInd))) {
    score += 0.6; reasons.push('industry match: ' + signal.industry);
  }
  const hay = (String(signal.title || '') + ' ' + String(signal.body || '')).toLowerCase();
  const kw = kws.find((k) => k.length >= 3 && hay.includes(k));
  if (kw) { score += 0.25; reasons.push('keyword: ' + kw); }

  const bucket = bucketOf(signal.employee_count);
  if (bucket && sizes.includes(bucket)) { score += 0.15; reasons.push('size match: ' + bucket); }

  return { score: Math.min(1, Math.round(score * 100) / 100), reasons };
}

// ── In-market score (Signals v2, pure) ──────────────────────────────────────
// Aggregates a company's RECENT signals into a 0–100 buying-intent score.
// Weighted by signal kind, recency, and importance, with a bonus for showing
// several DISTINCT kinds, then lifted when the company matches the tenant ICP.
// Pure + unit-testable; the /api/signals/in-market route feeds it grouped rows.
const INTENT_WEIGHT = {
  tender: 34,          // won/active on a public tender — the strongest owned intent
  expansion: 30,       // scaling fast
  hiring: 22,          // actively hiring — budget + growth
  leadership: 18,      // new decision-maker — a window to engage
  partnership: 14,     // doing deals — active in market
  newly_licensed: 12,  // just entered the market
  news_event: 8,       // in the news — context
};
const KIND_LABEL = {
  tender: 'winning tenders', expansion: 'scaling fast', hiring: 'actively hiring', leadership: 'new leadership',
  partnership: 'new partnerships', newly_licensed: 'newly licensed', news_event: 'in the news',
};
function recencyMult(occurredAt, now = Date.now()) {
  const days = Math.max(0, (now - new Date(occurredAt).getTime()) / 86_400_000);
  if (days <= 2) return 1;
  if (days >= 14) return 0.3;
  return 1 - ((days - 2) / 12) * 0.7;
}

export function computeInMarketScore(signals, icp = {}) {
  if (!Array.isArray(signals) || !signals.length) return { score: 0, reasons: [], kinds: [] };
  let raw = 0;
  const kinds = new Set();
  for (const s of signals) {
    const w = INTENT_WEIGHT[s.kind] || 6;
    const imp = Math.max(0.3, Math.min(1, Number(s.importance) || 0.5));
    raw += w * recencyMult(s.occurred_at) * imp;
    kinds.add(s.kind);
  }
  // Diversity bonus: several distinct signal types = hotter (cap at +36%).
  raw *= 1 + Math.min(kinds.size - 1, 3) * 0.12;
  // ICP alignment lift.
  const reasons = [];
  if ((icp.target_industries || []).length || (icp.target_keywords || []).length || (icp.target_sizes || []).length) {
    let best = 0;
    for (const s of signals) best = Math.max(best, scoreSignalForIcp(s, icp).score);
    if (best > 0) { raw *= 1 + best * 0.5; reasons.push('matches your ICP'); }
  }
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  for (const k of kinds) if (KIND_LABEL[k]) reasons.push(KIND_LABEL[k]);
  return { score, reasons: reasons.slice(0, 4), kinds: [...kinds] };
}

// Company financials — normalize, consolidate, and (conservatively) estimate.
// ----------------------------------------------------------------------------
// Val's rule 2.1 + 2026-07-12: financial data must be SOLID and high-probability
// only. We never invent a figure the source didn't state; every value carries
// its source + a confidence. Estimates are allowed ONLY by INTERPOLATING between
// two real reported annual figures (a solid mathematical basis), never by
// extrapolation or employee-count heuristics, and are always flagged estimated.

// Canonical metric vocabulary — collapses the messy raw metrics ("Net Profit",
// "net profit", "net_profit" → one) into clean keys, ordered by importance.
const METRICS = [
  { key: 'revenue',            label: 'Revenue',            rx: /^(revenue|total revenue|turnover|sales|gross revenue)$/i },
  { key: 'net_profit',         label: 'Net profit',         rx: /^(net profit|net income|profit|profit for the (period|year)|net earnings)$/i },
  { key: 'eps',                label: 'EPS',                rx: /^(eps|earnings per share|basic eps|diluted eps)$/i },
  { key: 'dividend_per_share', label: 'Dividend / share',   rx: /^(dps|dividend per share)$/i },
  { key: 'gross_profit',       label: 'Gross profit',       rx: /^gross profit$/i },
  { key: 'operating_profit',   label: 'Operating profit',   rx: /^(operating profit|ebit|operating income)$/i },
  { key: 'ebitda',             label: 'EBITDA',             rx: /^ebitda$/i },
  { key: 'total_assets',       label: 'Total assets',       rx: /^(total assets|assets)$/i },
  { key: 'total_liabilities',  label: 'Total liabilities',  rx: /^total liabilities$/i },
  { key: 'equity',             label: "Shareholders' equity", rx: /^(equity|shareholders'? equity|total equity)$/i },
  { key: 'paid_up_capital',    label: 'Paid-up capital',    rx: /^(paid[_ -]?up capital|paid capital)$/i },
  { key: 'authorized_capital', label: 'Authorized capital', rx: /^authori[sz](e|)d (share )?capital$/i },
  { key: 'registered_capital', label: 'Registered capital', rx: /^registered capital$/i },
  { key: 'capital',            label: 'Share capital',      rx: /^(capital|share capital|issued (share )?capital)$/i },
  { key: 'market_cap',         label: 'Market cap',         rx: /^(market cap(italization)?|valuation)$/i },
  { key: 'funding_raised',     label: 'Funding raised',     rx: /^funding[_ ]?raised$/i },
  { key: 'employees',          label: 'Employees',          rx: /^employees?$/i },
];
const METRIC_ORDER = new Map(METRICS.map((m, i) => [m.key, i]));

/** Raw metric string → { key, label }. Unknown metrics are kept, title-cased.
 *  Separators (_ - ') are flattened to spaces first so "paid_up_capital",
 *  "paid-up capital" and "Paid Up Capital" all map to the same metric. */
export function normalizeMetric(raw) {
  const norm = String(raw || '').replace(/['']/g, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const m of METRICS) if (m.rx.test(norm)) return { key: m.key, label: m.label };
  const label = norm.replace(/\b\w/g, (c) => c.toUpperCase());
  return { key: 's:' + norm.toLowerCase(), label: label || 'Unknown' };
}

// Confidence a source earns by default (a row's explicit confidence wins).
// Audited exchange filings + official registry are the trustworthy tiers.
const SOURCE_CONF = [
  [/qse|exchange|audit/i, 'high'],
  [/registry|moci|qfc|qfcra|official/i, 'high'],
  [/research/i, 'medium'],
  [/website|firecrawl|scrape/i, 'low'],
];
export function confidenceOf(row) {
  const given = String(row?.confidence || '').toLowerCase();
  if (given === 'high' || given === 'medium' || given === 'low') return given;
  const src = String(row?.source || '');
  for (const [rx, c] of SOURCE_CONF) if (rx.test(src)) return c;
  return 'low';
}
const CONF_RANK = { high: 3, medium: 2, low: 1 };

// Parse an annual period → a year number, or null (quarterly/unknown are left
// as-is and never interpolated). "FY2023", "2023", "2023-12" → 2023.
export function periodYear(period) {
  const m = String(period || '').match(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/);
  if (!m) return null;
  if (/q[1-4]|quarter|-0?[1-9]|h[12]/i.test(String(period))) return null;   // not a full-year figure
  return Number(m[1]);
}

/**
 * Consolidate raw company_financials rows into clean metrics. For each
 * (metric, period) the single best figure wins — highest confidence, then the
 * most recent as_of. Optionally adds conservative interpolated estimates
 * between two real annual figures (flagged estimated).
 * @returns [{ key, label, entries: [{ period, year, value_num, value_text, currency, confidence, source, estimated }] }]
 */
export function consolidateFinancials(rows, { estimate = false } = {}) {
  const byMetric = new Map();
  for (const r of (rows || [])) {
    const { key, label } = normalizeMetric(r.metric);
    if (!byMetric.has(key)) byMetric.set(key, { key, label, byPeriod: new Map() });
    const bucket = byMetric.get(key);
    const period = String(r.period || '').trim() || '—';
    const conf = confidenceOf(r);
    const entry = {
      period, year: periodYear(period),
      value_num: r.value_num != null ? Number(r.value_num) : null,
      value_text: r.value_text || null,
      currency: r.currency || null,
      confidence: conf, source: r.source || null, estimated: false,
      _as_of: r.as_of || null,
    };
    const prev = bucket.byPeriod.get(period);
    // Keep the stronger figure: higher confidence, then newer as_of.
    if (!prev || CONF_RANK[conf] > CONF_RANK[prev.confidence]
      || (CONF_RANK[conf] === CONF_RANK[prev.confidence] && String(entry._as_of || '') > String(prev._as_of || ''))) {
      bucket.byPeriod.set(period, entry);
    }
  }

  const out = [];
  for (const { key, label, byPeriod } of byMetric.values()) {
    let entries = [...byPeriod.values()];
    if (estimate) entries = entries.concat(interpolateAnnual(entries));
    // Newest first; undated ('—') last.
    entries.sort((a, b) => (b.year || -1) - (a.year || -1) || String(b.period).localeCompare(String(a.period)));
    entries.forEach((e) => { delete e._as_of; });
    out.push({ key, label, entries });
  }
  out.sort((a, b) => (METRIC_ORDER.has(a.key) ? METRIC_ORDER.get(a.key) : 99) - (METRIC_ORDER.has(b.key) ? METRIC_ORDER.get(b.key) : 99));
  return out;
}

/**
 * Conservative estimate: fill a MISSING year that sits strictly BETWEEN two
 * reported annual numeric figures, by linear interpolation. Never extrapolates
 * past the reported range. Each estimate is flagged + capped at medium
 * confidence. Returns only the newly-created estimated entries.
 */
export function interpolateAnnual(entries) {
  const real = entries
    .filter((e) => e.year && e.value_num != null && !e.estimated)
    .sort((a, b) => a.year - b.year);
  const have = new Set(real.map((e) => e.year));
  const est = [];
  for (let i = 0; i < real.length - 1; i++) {
    const a = real[i], b = real[i + 1];
    const span = b.year - a.year;
    if (span < 2 || span > 5) continue;   // only small, plausible gaps
    for (let y = a.year + 1; y < b.year; y++) {
      if (have.has(y)) continue;
      const t = (y - a.year) / span;
      const v = a.value_num + (b.value_num - a.value_num) * t;
      est.push({
        period: 'FY' + y, year: y,
        value_num: Math.round(v), value_text: null,
        currency: a.currency || b.currency || null,
        // Never 'medium' (amber reads as a real figure). An interpolated value
        // is a number the source never stated — it renders low/grey + an "est."
        // badge + a distinct hollow dot so a customer can never mistake it for
        // reported data (Val 2026-07-12: users must never experience unreliable data).
        confidence: 'low', source: 'estimate:interpolated', estimated: true,
      });
    }
  }
  return est;
}

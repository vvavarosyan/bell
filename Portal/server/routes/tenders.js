// /api/tenders — Qatar public tenders + awards (Signals v2 follow-up).
//
// GET  /            list tenders with filters + total (status, source, buyer, q, year, limit, offset)
// GET  /stats       counts by status (for a header/legend)
// GET  /facets      distinct sources / top buyers / years / statuses — drives the filter UI
// GET  /sync-status LOCAL engine: local count vs live (app.bell.qa) count → "are they synced?"
// GET  /:id         one tender with full detail (raw activities, contact, contract…)
// POST /ingest      admin/local: feed scraped or manual tender rows → upsert +
//                   fuzzy-link to companies (server/tenders/ingest.js). The
//                   signals engine then turns awarded, linked tenders into
//                   'tender' signals that drive the in-market score.
// POST /scan        LOCAL engine: render + parse the live sources and ingest.

import { Router } from 'express';
import { query } from '../db.js';
import { requireRole } from '../lib/auth.js';
import { getKey } from '../keychain.js';
import { ingestTenders } from '../tenders/ingest.js';
// One normalization, one index: SQL_TIGHT is the expression companies_employer_tight_idx holds.
import { employerKey, SQL_TIGHT } from '../jobs/attribute.js';
import { runTenderScan } from '../tenders/scrape.js';

const router = Router();

// Shared SELECT for list rows. `has_detail` tells the UI whether a tender has
// been through detail enrichment yet (activities present) — used to show a
// "detail pending" hint during a background backfill.
const LIST_COLS = `
  id, source, source_ref, title, buyer, category, status,
  award_company_name, award_company_id, value_amount, currency, url,
  published_at, deadline_at, awarded_at,
  industries, primary_industry,
  (source <> 'monaqasat' OR jsonb_exists(raw, 'activities')) AS has_detail,
  -- Ashghal publishes the bid bond only as a source string ("180,000 Q.R.") in raw,
  -- never in value_amount. Extract the digits so the card can show it. Monaqasat/awards
  -- carry value_amount directly, so this stays a fallback (never overrides value_amount).
  nullif(regexp_replace(coalesce(raw->>'tender_bond',''), '[^0-9]', '', 'g'), '')::bigint AS bond_amount`;

// CROSS-SOURCE TWIN (display only, nothing deleted): Kahramaa publishes through the
// central Monaqasat portal too, and its OWN payload states the Monaqasat number
// verbatim (raw->>'monaqasat_number'). 80 live tenders therefore appear twice in the
// list — once per source — which reads as double-counting. The Monaqasat row leads
// (the central portal), the Kahramaa row is suppressed from the LIST ONLY and rides
// along as also_on_* fields. The Kahramaa row itself stays untouched and fully
// reachable by id/detail — Kahramaa-only facts (winners, ICV) are never lost.
// Zero-stripped comparison because Monaqasat refs sometimes carry leading zeros.
const KM_TWIN = `regexp_replace(t2.source_ref,'^0+','') = regexp_replace(tenders.raw->>'monaqasat_number','^0+','')`;
const TWIN_SUPPRESS = `NOT (tenders.source = 'kahramaa'
  AND COALESCE(tenders.raw->>'monaqasat_number','') NOT IN ('','null')
  AND EXISTS (SELECT 1 FROM tenders t2 WHERE t2.source = 'monaqasat' AND ${KM_TWIN}))`;
const TWIN_DECOR = `(
  SELECT jsonb_build_object('id', k.id, 'source_ref', k.source_ref,
                            'winners', k.raw->'winners', 'award_category', k.raw->>'award_category')
    FROM tenders k
   WHERE tenders.source = 'monaqasat' AND k.source = 'kahramaa'
     AND COALESCE(k.raw->>'monaqasat_number','') NOT IN ('','null')
     AND regexp_replace(tenders.source_ref,'^0+','') = regexp_replace(k.raw->>'monaqasat_number','^0+','')
   LIMIT 1) AS also_on_kahramaa`;

// The tenant's ICP target industries, or [] when the profile is unset.
async function icpIndustries(req) {
  if (!req.tenant?.id) return [];
  const r = await query(`SELECT target_industries FROM tenant_profile WHERE tenant_id = $1`, [req.tenant.id])
    .catch(() => ({ rows: [] }));
  return (r.rows[0]?.target_industries || []).filter(Boolean);
}

router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const conds = [];

    // "For you" — only tenders whose line(s) of business overlap this tenant's
    // ICP industries. Array overlap on the indexed industries[] column, so it's
    // the same vocabulary the ICP picker writes (canonical industry tags).
    if (req.query.icp === '1') {
      const icp = await icpIndustries(req);
      if (!icp.length) return res.json({ rows: [], total: 0, limit, offset, icp_missing: true });
      params.push(icp); conds.push(`industries && $${params.length}::text[]`);
    }
    if (req.query.industry) {
      params.push([String(req.query.industry)]); conds.push(`industries && $${params.length}::text[]`);
    }
    if (req.query.status) { params.push(String(req.query.status).toLowerCase()); conds.push(`status = $${params.length}`); }
    if (req.query.source) { params.push(String(req.query.source).toLowerCase()); conds.push(`source = $${params.length}`); }
    if (req.query.buyer)  { params.push(String(req.query.buyer)); conds.push(`buyer = $${params.length}`); }
    if (req.query.q) {
      // "Find any detail" (Val 2026-07-12: searching "5797/2025" found nothing).
      // Match the fast indexed columns AND the full published payload — raw::text
      // covers the buyer's own ref, the Monaqasat/Kahramaa cross-reference number,
      // department, the description and every "As published" field value. The
      // tenders table is small (~27k rows) so the seq scan is well under 100ms.
      params.push('%' + String(req.query.q).replace(/[%_\\]/g, '') + '%');
      conds.push(`(title ILIKE $${params.length} OR buyer ILIKE $${params.length}
        OR source_ref ILIKE $${params.length} OR category ILIKE $${params.length}
        OR award_company_name ILIKE $${params.length} OR raw::text ILIKE $${params.length})`);
    }
    if (req.query.year && /^20\d{2}$/.test(String(req.query.year))) {
      params.push(Number(req.query.year));
      conds.push(`EXTRACT(YEAR FROM COALESCE(awarded_at, published_at, created_at)) = $${params.length}`);
    }
    if (req.query.linked === '1') conds.push('award_company_id IS NOT NULL');
    // Cross-source twins collapse to their Monaqasat row — EXCEPT when the user
    // filters source=kahramaa explicitly: then they are asking for Kahramaa's own
    // list and every row must show (suppressing there would make Kahramaa look
    // like it published 80 fewer tenders than it did).
    if (String(req.query.source || '').toLowerCase() !== 'kahramaa') conds.push(TWIN_SUPPRESS);
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const totalR = await query(`SELECT count(*)::int AS n FROM tenders ${where}`, params);
    params.push(limit); const lim = params.length;
    params.push(offset); const off = params.length;
    const rowsR = await query(
      `SELECT ${LIST_COLS}, ${TWIN_DECOR}
         FROM tenders ${where}
        ORDER BY COALESCE(awarded_at, published_at, created_at) DESC NULLS LAST, id DESC
        LIMIT $${lim} OFFSET $${off}`,
      params,
    );
    res.json({ rows: rowsR.rows, total: totalR.rows[0].n, limit, offset });
  } catch (err) { next(err); }
});

// GET /api/tenders/buyers — "Who's buying": procuring entities ranked by ICP fit,
// urgency (soonest deadline) and open-tender count. This is the buyer-intent wedge —
// it reframes tenders from a bid list into "who is actively buying in YOUR line of
// business, and act on it." Pure aggregation over the indexed buyer + industries[]
// columns (no fragile buyer→company resolution; most Qatar tender buyers are public
// agencies not in the commercial registry anyway).
router.get('/buyers', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    let icp = [];
    if (req.query.icp === '1') {
      icp = await icpIndustries(req);
      if (!icp.length) return res.json({ rows: [], total: 0, icp: [], icp_missing: true });
    }
    const r = await query(
      `WITH open_t AS (
         SELECT id, buyer, deadline_at, published_at, source, industries
           FROM tenders
          WHERE status = 'open' AND buyer IS NOT NULL AND btrim(buyer) <> ''
       ),
       agg AS (
         SELECT o.buyer,
                count(DISTINCT o.id)::int AS open_count,
                min(o.deadline_at) FILTER (WHERE o.deadline_at > now()) AS soonest_deadline,
                max(o.published_at) AS latest_published,
                array_remove(array_agg(DISTINCT ind), NULL) AS industries,
                array_remove(array_agg(DISTINCT o.source), NULL) AS sources
           FROM open_t o
           LEFT JOIN LATERAL unnest(coalesce(o.industries, '{}'::text[])) AS ind ON true
          GROUP BY o.buyer
       )
       SELECT buyer, open_count, soonest_deadline, latest_published, industries, sources,
              (industries && $1::text[]) AS icp_match,
              count(*) OVER ()::int AS total
         FROM agg
        WHERE ($1::text[] = '{}'::text[] OR industries && $1::text[])
        ORDER BY (industries && $1::text[]) DESC, soonest_deadline ASC NULLS LAST, open_count DESC
        LIMIT $2 OFFSET $3`,
      [icp, limit, offset]);
    const icpSet = new Set(icp.map((x) => String(x).toLowerCase()));
    const rows = r.rows.map(({ total, ...b }) => ({
      ...b,
      // which of the buyer's lines of business match the tenant's ICP (for the label)
      matched_industries: icpSet.size ? (b.industries || []).filter((i) => icpSet.has(String(i).toLowerCase())) : [],
    }));
    res.json({ rows, total: r.rows[0]?.total || 0, icp, limit, offset });
  } catch (err) { next(err); }
});

// GET /api/tenders/awards — "Who won what": recent contract awards with the winning
// company, value, ICV score and (Ashghal) the full bidder table — competitive award
// intelligence rivals charge for and don't link to a company graph.
//
// MONAQASAT WAS EXCLUDED HERE ON A PREMISE THAT IS FALSE. The old comment read "Monaqasat hides
// the winner and its value is a bid bond". It does not hide the winner: the awarded list links a
// per-tender report stating the winning company, its CR number, the awarded amount and every
// rival bid. That belief cost Bell a year of award data, and this page was showing 1,479 awards
// while the database held 24,537.
//
// The bid-bond half of the warning WAS true and is handled, not ignored. On the list page
// `value_amount` carries the tender bond; the award backfill overwrote it with the report's
// stated Awarded Amount, keeping the bond separately in raw.tender_bond. Measured on all 23,058
// Monaqasat awards, exactly 9 still hold a figure equal to the recorded bond — for those the
// value is published as NULL rather than presented as a contract value. Bell shows no number
// rather than the wrong number (Rule 2.1).
//
// Amounts proven against the two awards documented in CLAUDE.md, both exact: 4905/2022 →
// ALMOHANNADI, QAR 105,763,640.26; 1799/2023 → AL ALI ENGINEERING, QAR 402,500,000.00.
//
// Twin suppression matches the tender list: a Kahramaa row that is the same award as a Monaqasat
// row would otherwise now appear twice, since both sources are included.
router.get('/awards', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [];
    const conds = [`status = 'awarded'`, `source IN ('monaqasat','ashghal','qatarenergy','kahramaa')`,
      `award_company_name IS NOT NULL`, `btrim(award_company_name) <> ''`];
    if (req.query.icp === '1') {
      const icp = await icpIndustries(req);
      if (!icp.length) return res.json({ rows: [], total: 0, icp_missing: true });
      params.push(icp); conds.push(`industries && $${params.length}::text[]`);
    }
    if (req.query.source) { params.push(String(req.query.source).toLowerCase()); conds.push(`source = $${params.length}`); }
    // Same rule the tender list uses: asking FOR Kahramaa shows Kahramaa's own rows in full.
    if (String(req.query.source || '').toLowerCase() !== 'kahramaa') conds.push(TWIN_SUPPRESS);
    const where = 'WHERE ' + conds.join(' AND ');
    const totalR = await query(`SELECT count(*)::int n FROM tenders ${where}`, params);
    params.push(limit); const lim = params.length;
    params.push(offset); const off = params.length;
    const rowsR = await query(
      `SELECT id, source, title, buyer, award_company_name, award_company_id, awarded_at,
              -- Never present a bid bond as a contract value. If the only figure held for this
              -- award is identical to the tender bond the source published, Bell shows nothing.
              CASE WHEN source = 'monaqasat' AND value_amount IS NOT NULL
                    AND value_amount = NULLIF(regexp_replace(COALESCE(raw->>'tender_bond',''), '[^0-9.]', '', 'g'), '')::numeric
                   THEN NULL ELSE value_amount END AS value_amount,
              industries, primary_industry,
              nullif(raw->>'bidder_count', '')::int AS bidder_count,
              (raw->'bidders'->0->>'icv')          AS winner_icv
         FROM tenders ${where}
        ORDER BY awarded_at DESC NULLS LAST, value_amount DESC NULLS LAST, id DESC
        LIMIT $${lim} OFFSET $${off}`,
      params);
    res.json({ rows: rowsR.rows, total: totalR.rows[0].n, limit, offset });
  } catch (err) { next(err); }
});

// GET /api/tenders/won-by/:companyId — what ONE company has won from the Qatar government.
//
// The highest-value question a Qatar B2B customer can ask about a local firm, and until now Bell
// could not answer it anywhere — not in the API, not on the company profile, not through Bella —
// despite holding 24,537 awarded tenders with a named winner, 18,601 of them matched to a company.
//
// Only tenders whose winner was matched by a STATED registration number are counted (that is how
// award_company_id is set — never by name similarity), so a total here is evidence, not an
// estimate. Values are summed ONLY where the source states an amount; a count and a total are
// therefore answers to different questions and are reported separately rather than blended.
router.get('/won-by/:companyId', async (req, res, next) => {
  try {
    const id = Number(req.params.companyId);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);

    const totals = await query(`
      SELECT count(*)::int                                          AS contracts,
             count(*) FILTER (WHERE value_amount IS NOT NULL)::int   AS with_value,
             COALESCE(sum(value_amount::numeric) FILTER (WHERE value_amount IS NOT NULL), 0) AS total_value,
             min(awarded_at)::date                                   AS first_award,
             max(awarded_at)::date                                   AS latest_award,
             count(DISTINCT buyer)::int                              AS buyers
        FROM tenders
       WHERE award_company_id = $1 AND status = 'awarded' AND ${TWIN_SUPPRESS}`, [id]);

    const byBuyer = await query(`
      SELECT buyer, count(*)::int AS contracts,
             COALESCE(sum(value_amount::numeric) FILTER (WHERE value_amount IS NOT NULL), 0) AS value
        FROM tenders
       WHERE award_company_id = $1 AND status = 'awarded' AND ${TWIN_SUPPRESS}
         AND buyer IS NOT NULL
       GROUP BY buyer ORDER BY contracts DESC LIMIT 10`, [id]);

    const recent = await query(`
      SELECT id, source, source_ref, title, buyer, awarded_at::date, currency,
             CASE WHEN source = 'monaqasat' AND value_amount IS NOT NULL
                   AND value_amount = NULLIF(regexp_replace(COALESCE(raw->>'tender_bond',''), '[^0-9.]', '', 'g'), '')::numeric
                  THEN NULL ELSE value_amount END AS value_amount
        FROM tenders
       WHERE award_company_id = $1 AND status = 'awarded' AND ${TWIN_SUPPRESS}
       ORDER BY awarded_at DESC NULLS LAST, id DESC LIMIT $2`, [id, limit]);

    res.json({ totals: totals.rows[0], by_buyer: byBuyer.rows, recent: recent.rows });
  } catch (err) { next(err); }
});

router.get('/stats', async (_req, res, next) => {
  try {
    // Counts match the deduped LIST (cross-source twins collapse to one), or the
    // status chips disagree with the totals underneath them.
    const r = await query(`
      SELECT status, count(*)::int AS n,
             count(*) FILTER (WHERE award_company_id IS NOT NULL)::int AS linked,
             count(*) FILTER (WHERE jsonb_exists(raw, 'activities'))::int AS detailed
        FROM tenders WHERE ${TWIN_SUPPRESS} GROUP BY status`);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// Distinct values for the filter dropdowns. Buyers capped to the busiest 40.
router.get('/facets', async (_req, res, next) => {
  try {
    const [sources, buyers, years, statuses, industries] = await Promise.all([
      query(`SELECT source, count(*)::int AS n FROM tenders GROUP BY source ORDER BY n DESC`),
      query(`SELECT buyer, count(*)::int AS n FROM tenders WHERE buyer IS NOT NULL AND buyer <> '' GROUP BY buyer ORDER BY n DESC LIMIT 40`),
      query(`SELECT DISTINCT EXTRACT(YEAR FROM COALESCE(awarded_at, published_at, created_at))::int AS y FROM tenders ORDER BY y DESC`),
      query(`SELECT status, count(*)::int AS n FROM tenders WHERE ${TWIN_SUPPRESS} GROUP BY status ORDER BY n DESC`),
      // Industry facet (migration 078) — unnest so a tender counts under each of
      // its lines of business. Fails soft before the migration applies.
      query(`SELECT i AS industry, count(*)::int AS n
               FROM tenders, unnest(industries) AS i
              GROUP BY i ORDER BY n DESC LIMIT 30`).catch(() => ({ rows: [] })),
    ]);
    res.json({
      sources: sources.rows,
      buyers: buyers.rows,
      years: years.rows.map((r) => r.y).filter(Boolean),
      statuses: statuses.rows,
      industries: industries.rows,
    });
  } catch (err) { next(err); }
});

// LOCAL engine only: compare the local tender count with the live site's, so
// the operator can confirm the last scan actually reached production. Uses the
// same sync token + target the push uses. Off the local engine, prod is null.
router.get('/sync-status', async (_req, res, next) => {
  try {
    const localR = await query(`SELECT count(*)::int AS n, max(updated_at) AS m FROM tenders`);
    const local = localR.rows[0].n;
    const local_updated = localR.rows[0].m;
    let prod = null, target = null, error = null;
    const isLocal = (process.env.BDI_MODE || 'local-admin').toLowerCase() === 'local-admin';
    if (isLocal) {
      try {
        const s = await query(`SELECT value FROM settings WHERE key = 'sync_target_url'`).catch(() => ({ rows: [] }));
        target = String((s.rows[0] && s.rows[0].value) || process.env.BDI_SYNC_TARGET_URL || 'https://app.bell.qa').replace(/\/+$/, '');
        const token = await getKey('sync-token');
        if (!token) { error = 'no_sync_token'; }
        else {
          const r = await fetch(target + '/api/sync/count?table=tenders', { headers: { Authorization: 'Bearer ' + token } });
          if (r.ok) { const b = await r.json(); prod = Number(b.count); }
          else { error = 'prod_http_' + r.status; }
        }
      } catch (e) { error = String(e.message || e).slice(0, 80); }
    }
    res.json({ local, local_updated, prod, synced: (prod != null ? prod >= local : null), target, error });
  } catch (err) { next(err); }
});

// ── Award intelligence (Operation Data Trust D2) ─────────────────────────────────────────────
// 23,058 award reports — winner, every LOSING bidder with CR numbers, proposal amounts, ICV —
// sat in tenders.raw with no route, no UI and no Bella tool reading them. This is the dataset
// no competitor holds; a customer could see win-counts and nothing else.

/** Resolve bid CR numbers to live companies in ONE query. Returns Map<baseCr, {id,name}>. */
export async function matchBidCrs(crs) {
  const bases = [...new Set(crs.map((c) => String(c || '').replace(/^0+/, '').split('/')[0]).filter((c) => c.length >= 4))];
  if (!bases.length) return new Map();
  const r = await query(
    `SELECT DISTINCT ON (base) base, id, name FROM (
       SELECT ltrim(split_part(r.number,'/',1),'0') AS base, c.id, c.name,
              (r.body IN ('MOCI','QCCI','company_record','CRA')) AS registry
         FROM company_registrations r
         JOIN companies c ON c.id = r.company_id
        WHERE COALESCE(c.archived,false) = false AND c.canonical_id IS NULL
          AND ltrim(split_part(r.number,'/',1),'0') = ANY($1::text[])) x
     ORDER BY base, registry DESC, id`, [bases]);
  return new Map(r.rows.map((x) => [x.base, { id: Number(x.id), name: x.name }]));
}

/** Resolve winner NAMES to companies for the sources that publish no CR numbers (Ashghal,
 *  Kahramaa). Deliberately the SAME rule linkTenderCompanies uses to write award_company_id —
 *  normalized exact match, nothing fuzzy — so a name shown as a link means exactly what a
 *  stored link means. A name held by two live companies is ambiguous and resolves to nothing:
 *  the employer-matcher rule, refuse rather than pick. */
async function matchWinnerNames(names) {
  const keys = [...new Set(names.map(nameKey).filter((k) => k.length >= 6))];
  if (!keys.length) return new Map();
  // ⚠️ SQL_TIGHT and nameKey are the SAME normalization, and the expression below is the one
  // companies_employer_tight_idx indexes — byte for byte. Rolling my own (strip '&' instead of
  // expanding it to 'and') answered correctly while seq-scanning 197k companies on every drawer
  // open: 312 ms and 32k buffer pages, per view. The migration-113 lesson in miniature.
  const r = await query(
    `SELECT key, min(id) AS id, count(*)::int AS n FROM (
       SELECT ${SQL_TIGHT} AS key, c.id
         FROM companies c
        WHERE COALESCE(c.archived,false) = false AND c.canonical_id IS NULL
          AND ${SQL_TIGHT} = ANY($1::text[])) x
      GROUP BY key`, [keys]);
  // A name held by two live companies is ambiguous: it resolves to nothing.
  return new Map(r.rows.filter((x) => x.n === 1).map((x) => [x.key, Number(x.id)]));
}
const nameKey = (n) => employerKey(n).replace(/ /g, '');

/** Kahramaa publishes an award CATEGORY with every firm that won a share of it and the amount
 *  each was awarded — raw.winners: [{name, amount}]. 332 awarded rows hold 503 winners, and the
 *  drawer showed only the first: 171 winners and their amounts were invisible. No bidder list
 *  exists here, so every row IS a winner and the block says so (kind 'winners'). */
async function kahramaaAward(t) {
  const ws = t.raw?.winners;
  if (!Array.isArray(ws) || !ws.length || !ws.some((w) => w && w.name)) return null;
  const named = ws.filter((w) => w && w.name);
  const matched = await matchWinnerNames(named.map((w) => w.name));
  return {
    kind: 'winners',
    winner: { name: t.award_company_name || named[0].name, company_id: t.award_company_id || null,
              approved_value: null, currency: t.currency || 'QAR' },
    bids: named.map((w) => ({
      name: w.name,
      company_id: matched.get(nameKey(w.name)) || null,
      // The amount arrives formatted ("5,555,555.00") — kept as a number for the UI's
      // formatter, and left null rather than guessed if it is not a plain figure.
      proposal_amount: (() => { const v = Number(String(w.amount ?? '').replace(/[^0-9.]/g, '')); return Number.isFinite(v) && v > 0 ? v : null; })(),
      currency: t.currency || 'QAR',
      financial_result: null,
      icv: null,
      is_winner: true,
    })),
  };
}

/** Ashghal stores its bidder table in a different shape (raw.bidders: name/rank/icv/
 *  accepted_price/winner, no CR numbers) — translate it to the award_report shape so the same
 *  drawer renders it. 45 awarded Ashghal tenders carried this unread. Values verbatim: the ICV
 *  keeps only its number (the UI adds the %), the page's own rank wording rides financial_result. */
function ashghalAward(t) {
  const bids = t.raw?.bidders;
  if (!Array.isArray(bids) || !bids.length || !bids.some((b) => b && b.name)) return null;
  const winner = bids.find((b) => b.winner === true) || null;
  return {
    kind: 'bids',
    winner: winner ? { name: winner.name, approved_value: null, currency: 'QAR' } : null,
    bids: bids.filter((b) => b && b.name).map((b) => ({
      name: b.name,
      company_id: null,          // Ashghal states no CR numbers — names only, never guessed
      proposal_amount: b.accepted_price ?? null,
      currency: 'QAR',
      financial_result: b.rank != null && String(b.rank) !== '' ?
        (/^\d+$/.test(String(b.rank)) ? 'rank ' + b.rank : String(b.rank)) : null,
      icv: b.icv != null ? String(b.icv).replace(/\s*%$/, '') : null,
      is_winner: b.winner === true,
    })),
  };
}

/** Shape raw->award_report for the product: parsed, company-matched, report URL admin-only. */
export async function composeAward(t, { admin = false } = {}) {
  const ar = t.raw?.award_report;
  // Each source publishes its award differently; the drawer renders one shape. Monaqasat and
  // Ashghal give the full bidder list, Kahramaa only the winners. QatarEnergy states one winner
  // and its price, both of which the drawer already prints — a one-row block would be noise.
  if (!ar) return ashghalAward(t) || await kahramaaAward(t);
  const bids = Array.isArray(ar.bids) ? ar.bids : [];
  const allCrs = bids.flatMap((b) => b.registrations || []);
  const matched = await matchBidCrs(allCrs);
  const findCo = (regs) => {
    for (const c of regs || []) {
      const hit = matched.get(String(c).replace(/^0+/, '').split('/')[0]);
      if (hit) return hit;
    }
    return null;
  };
  const winnerName = ar.winner?.name || t.award_company_name || null;
  return {
    winner: winnerName ? {
      name: winnerName,
      company_id: t.award_company_id || findCo(ar.winner?.registrations)?.id || null,
      approved_value: ar.winner?.approved_value ?? null,
      currency: ar.winner?.currency || 'QAR',
    } : null,
    bids: bids.map((b) => {
      const co = findCo(b.registrations);
      return {
        name: b.name,
        company_id: co?.id || null,
        proposal_amount: b.proposal_amount ?? null,
        currency: b.currency || 'QAR',
        // The page's own wording ("Winner", "Regretted", …) — stated, never derived.
        financial_result: b.financial_result || null,
        // ICV — In-Country Value, stated on the award page as a ratio.
        icv: b.local_value_ratio ?? null,
        is_winner: !!winnerName && String(b.name).trim() === String(winnerName).trim(),
      };
    }),
    ...(admin ? { report_url: ar.url || null } : {}),
  };
}

// GET /api/tenders/awards/company/:id — a company's full competitive record.
router.get('/awards/company/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_request' });
    // Wins: the plain column, re-parented on merge since 2026-08-09.
    const wins = await query(
      `SELECT id, title, buyer, awarded_at, value_amount, currency,
              raw->'award_report'->'winner'->>'approved_value' AS approved_value,
              jsonb_array_length(COALESCE(raw->'award_report'->'bids','[]'::jsonb)) AS bid_count
         FROM tenders WHERE award_company_id = $1
         ORDER BY awarded_at DESC NULLS LAST LIMIT 100`, [id]);
    // Lost bids: awards whose bidder list carries one of this company's CR numbers but somebody
    // else won. Containment probes ride idx_tenders_award_bids_gin (migration 119) — the
    // expression here and the index expression must never drift apart (the migration-113 lesson).
    const crs = (await query(
      `SELECT DISTINCT ltrim(split_part(number,'/',1),'0') AS base
         FROM company_registrations WHERE company_id = $1
          AND length(ltrim(split_part(number,'/',1),'0')) >= 4`, [id])).rows.map((x) => x.base);
    let lost = { rows: [] };
    if (crs.length) {
      // A bid records the CR as printed (zero-padded) AND Bell needs the base form — probe both.
      const variants = [...new Set(crs.flatMap((c) => [c, c.padStart(8, '0'), c.padStart(5, '0')]))];
      lost = await query(
        `SELECT DISTINCT t.id, t.title, t.buyer, t.awarded_at, t.award_company_name,
                jsonb_array_length(COALESCE(t.raw->'award_report'->'bids','[]'::jsonb)) AS bid_count
           FROM tenders t, unnest($2::text[]) AS cr
          WHERE t.raw->'award_report' IS NOT NULL
            AND t.raw->'award_report'->'bids' @> jsonb_build_array(jsonb_build_object('registrations', jsonb_build_array(cr)))
            AND COALESCE(t.award_company_id, 0) <> $1
          ORDER BY t.awarded_at DESC NULLS LAST LIMIT 100`, [id, variants]);
    }
    const winTotal = await query(
      `SELECT count(*)::int n,
              COALESCE(sum(NULLIF(raw->'award_report'->'winner'->>'approved_value','')::numeric), 0) AS total_value
         FROM tenders WHERE award_company_id = $1`, [id]);
    res.json({
      company_id: id,
      wins: wins.rows, lost: lost.rows,
      won_count: winTotal.rows[0].n,
      won_value: Number(winTotal.rows[0].total_value) || 0,
      lost_count: lost.rows.length,
    });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad_request', reason: 'bad_id' });
    const r = await query(
      `SELECT id, source, source_ref, title, buyer, category, status,
              award_company_name, award_company_id, value_amount, currency, url,
              published_at, deadline_at, awarded_at, raw, created_at, updated_at
         FROM tenders WHERE id = $1`,
      [id],
    );
    if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });
    const t = r.rows[0];
    // Cross-source twin, both directions — the SAME tender published by Kahramaa and
    // on the central Monaqasat portal (Kahramaa's own payload states the number).
    let twin = null;
    if (t.source === 'monaqasat') {
      twin = (await query(
        `SELECT id, source, source_ref FROM tenders
          WHERE source = 'kahramaa' AND COALESCE(raw->>'monaqasat_number','') NOT IN ('','null')
            AND regexp_replace(raw->>'monaqasat_number','^0+','') = regexp_replace($1,'^0+','') LIMIT 1`,
        [t.source_ref])).rows[0] || null;
    } else if (t.source === 'kahramaa' && t.raw?.monaqasat_number) {
      twin = (await query(
        `SELECT id, source, source_ref FROM tenders
          WHERE source = 'monaqasat'
            AND regexp_replace(source_ref,'^0+','') = regexp_replace($1,'^0+','') LIMIT 1`,
        [String(t.raw.monaqasat_number)])).rows[0] || null;
    }
    // The award block — winner, every bidder with amounts + ICV, company-matched by CR.
    // Served parsed so the UI never digs in raw; the report URL stays admin-only (the
    // hide-sources-from-users decision, 2026-08-07).
    const award = await composeAward(t, { admin: req.user?.role === 'platform_admin' || process.env.BDI_MODE === 'local-admin' })
      .catch(() => null);
    res.json({ tender: t, twin, award });
  } catch (err) { next(err); }
});

// Feed rows in: [{ source, source_ref, title, buyer, category, status,
// award_company_name, value_amount, currency, url, published_at, ... }]
router.post('/ingest', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const rows = Array.isArray(req.body?.tenders) ? req.body.tenders : [];
    if (!rows.length) return res.status(400).json({ error: 'bad_request', reason: 'tenders[] required' });
    const out = await ingestTenders(rows);
    res.json(out);
  } catch (err) { next(err); }
});

// POST /api/tenders/scan — LOCAL engine only: render + parse the live tender
// sources (Monaqasat…) and ingest. Needs the local browser renderer, so on
// prod it simply returns 0 scraped. Triggered by "Run Tender Scan.command".
router.post('/scan', requireRole('platform_admin'), async (req, res, next) => {
  try {
    const sources = Array.isArray(req.body?.sources) ? req.body.sources : undefined;
    const pages = req.body?.pages != null ? Math.min(Math.max(Number(req.body.pages) || 1, 1), 60) : undefined;
    const out = await runTenderScan({ sources, pages });
    res.json(out);
  } catch (err) { next(err); }
});

export default router;

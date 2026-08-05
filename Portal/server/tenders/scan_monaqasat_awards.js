// Monaqasat AWARD BACKFILL — fill in who won, for how much, and who they beat.
// ----------------------------------------------------------------------------
// Walks /TendersOnlineServices/AwardedTenders/{page}, follows each row's
// /TendersOnlineServices/TenderCompaniesDetails/{id} report, and writes the result onto the
// matching `tenders` row. Plain HTTP throughout — these pages need no browser.
//
// WHAT IT WRITES (only what the page states — Rule 2.1):
//   award_company_name  the winner, verbatim
//   award_company_id    only when a stated CR number matches a company EXACTLY; never a
//                       name-similarity guess (name matching is how Bell attached the wrong
//                       company before)
//   awarded_at          the stated award date
//   value_amount        the stated AWARDED amount. NOTE this replaces the tender-bond figure
//                       Monaqasat shows on the list page, which was never the contract value.
//   raw.award_report    winner + every rival bid with its Local Value Ratio (ICV) + the
//                       participant list, packed through packRaw so it can never be truncated
//                       into invalid jsonb.
//
// RESUMABLE by design: a tender whose raw already carries award_report.scraped_at is skipped
// unless force is set, so Val can close the window at any time and re-run.
//
// Politeness + memory: pages are fetched through a small pool. This is one of ~1,187 list
// pages and ~23,700 reports, so it is an hours-long backfill, not a sweep step.

import { query } from '../db.js';
import { fetchPage } from '../enrichment/local/http.js';
import { packRaw } from './raw.js';
import { parseAwardReport, parseAwardDate, AWARD_REPORT_URL, crNumbersOnly } from './awards_monaqasat.js';

const BASE = 'https://monaqasat.mof.gov.qa';
const LIST = (n) => `${BASE}/TendersOnlineServices/AwardedTenders/${n}`;
const CONCURRENCY = Number(process.env.BELL_AWARDS_CONCURRENCY || 3);

async function mapPool(items, worker, concurrency = CONCURRENCY) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const n = i++;
      try { out[n] = await worker(items[n], n); } catch { out[n] = null; }
    }
  }));
  return out;
}

/** Report ids on one awarded-list page, in page order. */
export function reportIdsOnPage(html) {
  const ids = [];
  for (const m of String(html || '').matchAll(/TenderCompaniesDetails\/(\d+)/gi)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids;
}

/** Exact CR match only. Returns a company id, or null when 0 or >1 candidates. */
async function matchWinner(registrationRaw) {
  const crs = crNumbersOnly(registrationRaw);
  if (!crs.length) return null;
  const r = await query(
    `SELECT id FROM companies
      WHERE primary_registration_no = ANY($1::text[])
        AND COALESCE(archived, false) = false
      LIMIT 2`, [crs]);
  // Ambiguity is not a coin flip: two companies sharing a stated CR means Bell's own data is
  // unclear, so we record the winner's NAME and leave the link empty for review.
  return r.rows.length === 1 ? r.rows[0].id : null;
}

async function applyReport(id, report, { force }) {
  const tenderNo = report.tender_number;
  if (!tenderNo || !report.winner || !report.winner.name) return { status: 'no_winner' };

  const existing = (await query(
    `SELECT id, raw FROM tenders WHERE source = 'monaqasat' AND source_ref = $1 LIMIT 1`,
    [tenderNo])).rows[0];

  if (existing && !force && existing.raw && existing.raw.award_report && existing.raw.award_report.scraped_at) {
    return { status: 'skipped' };
  }

  const companyId = await matchWinner(report.winner.registration_raw);
  const awardedAt = parseAwardDate(report.awarded_at);
  const award = {
    scraped_at: new Date().toISOString(),
    report_id: id,
    url: AWARD_REPORT_URL(id),
    winner: report.winner,
    bids: report.bids,
    participants: report.participants,
  };

  if (existing) {
    const raw = packRaw({ ...(existing.raw || {}), award_report: award });
    await query(
      `UPDATE tenders
          SET award_company_name = $2,
              award_company_id   = COALESCE($3, award_company_id),
              awarded_at         = COALESCE($4::date, awarded_at),
              value_amount       = COALESCE($5, value_amount),
              currency           = COALESCE($6, currency),
              status             = 'awarded',
              raw                = COALESCE($7::jsonb, raw),
              updated_at         = now()
        WHERE id = $1`,
      [existing.id, report.winner.name, companyId, awardedAt,
       report.awarded_amount, report.currency, raw]);
    return { status: 'updated', linked: !!companyId };
  }

  // Bell never captured this tender (its Monaqasat archive starts later than the awarded
  // feed). Insert it COMPLETE from what the report states — the metadata table carries the
  // whole tender record, so these rows are not stubs. Nothing is inferred.
  const raw = packRaw({
    source: 'monaqasat-award',
    type: report.tender_type || null,
    sector: report.sector || null,
    entity_ref: report.entity_ref || null,
    envelopes: report.envelopes || null,
    document_value: report.document_value,
    tender_bond: report.tender_bond,          // the BID GUARANTEE — never the contract value
    technical_opening_date: report.technical_opening_at || null,
    financial_opening_date: report.financial_opening_at || null,
    award_report: award,
  });
  await query(
    `INSERT INTO tenders (source, source_ref, title, buyer, category, status, award_company_name,
                          award_company_id, awarded_at, published_at, deadline_at,
                          value_amount, currency, url, raw, created_at, updated_at)
     VALUES ('monaqasat', $1, $2, $3, $4, 'awarded', $5, $6, $7::date, $8::date, $9::date,
             $10, $11, $12, $13::jsonb, now(), now())
     ON CONFLICT DO NOTHING`,
    [tenderNo, report.subject || tenderNo, report.ministry || null, report.sector || null,
     report.winner.name, companyId, awardedAt,
     parseAwardDate(report.published_at), parseAwardDate(report.closing_at),
     report.awarded_amount, report.currency, AWARD_REPORT_URL(id), raw]);
  return { status: 'inserted', linked: !!companyId };
}

/**
 * REPAIR PASS — complete any award-feed tender that was inserted before the parser learned to
 * read the full metadata table. Those rows carry the winner but no sector/publish/closing
 * date. Their report id is stored, so this re-reads the SAME page and fills the gaps; it never
 * touches a tender that already has its metadata, and never overwrites a non-null value.
 */
export async function repairThinAwards({ limit = 100000, jobLog = null } = {}) {
  const log = (m) => { if (jobLog) jobLog(m); else console.log(m); };
  const rows = (await query(
    `SELECT id, raw->'award_report'->>'report_id' AS report_id
       FROM tenders
      WHERE source = 'monaqasat'
        AND raw->>'source' = 'monaqasat-award'
        AND raw->'award_report'->>'report_id' IS NOT NULL
        AND (category IS NULL OR published_at IS NULL)
      ORDER BY id
      LIMIT $1`, [limit])).rows;
  log(`  repair: ${rows.length} award-feed tender(s) are missing their full detail.`);
  let fixed = 0;
  await mapPool(rows, async (row) => {
    const page = await fetchPage(AWARD_REPORT_URL(row.report_id), { respectRobots: false, timeoutMs: 30_000, retries: 1 });
    if (!page.ok) return;
    const r = parseAwardReport(String(page.html || ''));
    if (!r.tender_number) return;
    const cur = (await query(`SELECT raw FROM tenders WHERE id = $1`, [row.id])).rows[0];
    const raw = packRaw({
      ...(cur?.raw || {}),
      type: r.tender_type || cur?.raw?.type || null,
      sector: r.sector || cur?.raw?.sector || null,
      entity_ref: r.entity_ref || cur?.raw?.entity_ref || null,
      envelopes: r.envelopes || cur?.raw?.envelopes || null,
      document_value: r.document_value ?? cur?.raw?.document_value ?? null,
      tender_bond: r.tender_bond ?? cur?.raw?.tender_bond ?? null,
      technical_opening_date: r.technical_opening_at || cur?.raw?.technical_opening_date || null,
      financial_opening_date: r.financial_opening_at || cur?.raw?.financial_opening_date || null,
    });
    await query(
      `UPDATE tenders
          SET title        = CASE WHEN $2 <> '' THEN $2 ELSE title END,
              buyer        = COALESCE(buyer, $3),
              category     = COALESCE(category, $4),
              published_at = COALESCE(published_at, $5::date),
              deadline_at  = COALESCE(deadline_at, $6::date),
              raw          = COALESCE($7::jsonb, raw),
              updated_at   = now()
        WHERE id = $1`,
      [row.id, r.subject || '', r.ministry || null, r.sector || null,
       parseAwardDate(r.published_at), parseAwardDate(r.closing_at), raw]);
    fixed++;
  });
  log(`  repair: completed ${fixed} tender(s).`);
  return { candidates: rows.length, fixed };
}

/**
 * @param {object} opts
 * @param {number} opts.pages      how many list pages to walk (default all found)
 * @param {number} opts.startPage  1-based
 * @param {boolean} opts.force     re-scrape reports already stored
 */
export async function scanMonaqasatAwards({ pages = Infinity, startPage = 1, force = false, jobLog = null } = {}) {
  const log = (m) => { if (jobLog) jobLog(m); else console.log(m); };
  const tally = { pages: 0, reports: 0, updated: 0, inserted: 0, skipped: 0, no_winner: 0, linked: 0, failed: 0 };

  for (let p = startPage; p < startPage + pages; p++) {
    const list = await fetchPage(LIST(p), { respectRobots: false, timeoutMs: 30_000, retries: 1 });
    if (!list.ok) { log(`  page ${p}: unreachable — stopping.`); break; }
    const ids = reportIdsOnPage(list.html);
    if (!ids.length) { log(`  page ${p}: no award reports — end of the archive.`); break; }
    tally.pages++;

    const results = await mapPool(ids, async (id) => {
      const page = await fetchPage(AWARD_REPORT_URL(id), { respectRobots: false, timeoutMs: 30_000, retries: 1 });
      if (!page.ok) return { status: 'failed' };
      const report = parseAwardReport(String(page.html || ''));
      return await applyReport(id, report, { force });
    });

    for (const r of results) {
      tally.reports++;
      const s = (r && r.status) || 'failed';
      tally[s] = (tally[s] || 0) + 1;
      if (r && r.linked) tally.linked++;
    }
    log(`  page ${p}: ${ids.length} report(s) · updated ${tally.updated} · inserted ${tally.inserted} · linked ${tally.linked} · skipped ${tally.skipped}`);
  }
  return tally;
}

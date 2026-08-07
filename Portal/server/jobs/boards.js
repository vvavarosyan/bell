// Where each company publishes its vacancies — recorded once, swept on its own schedule.
//
// The harvester finds these for free (pickCareersLinks reads links it already has in hand), so
// coverage is every website Bell holds rather than a curated shortlist — which is what Val asked
// for: "not only for the big websites, big companies, but also for the entire active companies
// database."

import { query } from '../db.js';

// Hosted applicant-tracking platforms, in the order we test them. The FIRST match wins, so more
// specific patterns must come first.
const PLATFORMS = [
  [/(^|\.)oraclecloud\.com$/i,                'oracle_cloud'],
  [/(^|\.)myworkdayjobs\.com$|(^|\.)myworkdaysite\.com$/i, 'workday'],
  [/(^|\.)icims\.com$/i,                      'icims'],
  [/(^|\.)successfactors\.(com|eu)$/i,        'successfactors'],
  [/(^|\.)taleo\.net$/i,                      'taleo'],
  [/(^|\.)greenhouse\.io$/i,                  'greenhouse'],
  [/(^|\.)lever\.co$/i,                       'lever'],
  [/(^|\.)smartrecruiters\.com$/i,            'smartrecruiters'],
  [/(^|\.)bamboohr\.com$/i,                   'bamboohr'],
  [/(^|\.)zohorecruit\.com$/i,                'zoho_recruit'],
  [/(^|\.)workable\.com$/i,                   'workable'],
  [/(^|\.)teamtailor\.com$/i,                 'teamtailor'],
  [/(^|\.)recruitee\.com$/i,                  'recruitee'],
];

/** Which platform serves this host, or null for a company's own page. */
export function platformOf(host) {
  const h = String(host || '').toLowerCase();
  for (const [rx, name] of PLATFORMS) if (rx.test(h)) return name;
  return null;
}

/**
 * A stable identity for the BOARD, independent of which company Bell currently believes owns it.
 * It is the upsert key for jobs, so correcting an attribution must NOT change it — otherwise every
 * job on that board would be re-inserted as new and the old rows would look withdrawn.
 *
 * A hosted ATS is identified by its TENANT HOST alone: that host is one employer's board, and its
 * paths vary by product version. A company's own careers page includes the path, because one host
 * can serve several brands' boards (careers.powerholding-intl.com/BaladnaCareers is a real,
 * measured example).
 */
export function boardKeyFor({ url, host, kind }) {
  const platform = platformOf(host);
  if (platform) return `${platform}:${String(host).toLowerCase()}`;
  let path = '';
  try { path = new URL(url).pathname.replace(/\/+$/, '').toLowerCase(); } catch { /* keep '' */ }
  return `site:${String(host).toLowerCase()}${path}`;
}

/**
 * Record the careers endpoints found on a company's site.
 *
 * ⚠️ ATTRIBUTION IS NOT ASSUMED. A board is stored as 'unverified' unless it lives on the company's
 * OWN registrable domain, and nothing downstream may attach a job to a company while a board is
 * unverified. That is the guard against Bell's stored website being wrong: "Honey Well Trading &
 * Contracting", a Qatar trading firm, has honeywell.com on record, and that board carries 1,282
 * vacancies in Chennai, Pune and Bracknell. Filtering those to Qatar does NOT save you — Honeywell
 * has a genuine Doha vacancy, which would attach to the wrong company with a real, fresh date.
 *
 * Re-running is safe: an existing board keeps its attribution (an operator's or the identity
 * gate's decision is never overwritten by a re-crawl) and only refreshes what it saw.
 */
export async function recordCareersBoards(companyId, links, { log = () => {} } = {}) {
  if (!companyId || !Array.isArray(links) || !links.length) return { recorded: 0 };
  let recorded = 0;
  for (const l of links) {
    const board_key = boardKeyFor(l);
    const platform = platformOf(l.host) || 'own_site';
    // 'own' means the careers page sits on the company's own registrable domain — the company is
    // vouching for it by linking it from its own site, which is as good as this gets without a
    // separate check. Everything else waits for evidence.
    const attribution = l.kind === 'own' ? 'verified' : 'unverified';
    const why = l.kind === 'own'
      ? 'careers page on the company\'s own domain'
      : `${l.kind} host (${l.host}) — needs evidence before any job is attributed`;
    try {
      await query(
        `INSERT INTO job_boards (company_id, board_key, platform, url, kind, attribution, attribution_why)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (board_key) DO UPDATE
            SET url = EXCLUDED.url,
                kind = EXCLUDED.kind,
                platform = EXCLUDED.platform,
                -- company_id is only FILLED IN, never reassigned: two companies linking the same
                -- third-party board must not take turns owning it.
                company_id = COALESCE(job_boards.company_id, EXCLUDED.company_id),
                updated_at = now()`,
        [companyId, board_key, platform, l.url, l.kind, attribution, why]);
      recorded++;
    } catch (err) {
      log(`  job board record failed for ${l.url}: ${err.message}`);
    }
  }
  return { recorded };
}

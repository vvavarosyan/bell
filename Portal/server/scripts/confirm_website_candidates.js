// The 4,780 websites Bell already found and never looked at.
//
// The Website Finder's free search ran across essentially every no-website company in August —
// and, by a deliberate precision-first policy (finder.js, 2026-06-13), saved almost nothing
// automatically. Its finds went to `website_candidates` for review… and that review never
// happened: 4,780 pending, 0 ever approved. Meanwhile the finder's OTHER method — domain
// guessing — is what contaminated half the database. The queue is the good pile.
//
// This is task #96's gate, applied to that queue. Val's standing constraint (2026-08-06):
// "Manually checking thousands of records is not something that I or any of my team is willing
// to do… automated, and very very safe." So the gate is EVIDENCE, not judgment:
//
//   APPROVE only when the page ITSELF names the company — every distinctive token of the
//           company's name appears on the page, and at least one of them in the title or the
//           domain. "Al Sharq Insurance" is approved for sharqinsurance.com.qa only because
//           the site says so, not because the domain looks right.
//   REJECT  only on hard evidence: a parked host, parking-page content (both matchers already
//           proven on 2,065 live rows), or HTTP 404/410.
//   PENDING everything else — unreachable tonight, image-heavy pages, Arabic/translated names
//           the token test cannot prove. Absence of proof is not proof of absence (Rule 2.1),
//           so nothing is rejected for merely failing the name test.
//
// An approval resets the company's harvest stamp, so the always-on engine picks the new site up
// in its next lap — the ROG finally gets real work, and each approved site historically yields
// an email ~2 times in 3.
//
//   node scripts/confirm_website_candidates.js --limit 200            # preview, writes nothing
//   node scripts/confirm_website_candidates.js --limit 200 --apply

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, pool } from '../db.js';
import { isParkedWebsite, isParkedContent } from '../enrichment/local/extract.js';
import { employerCore } from '../jobs/attribute.js';

const argOf = (name, dflt) => { const i = process.argv.indexOf(name); return i >= 0 ? Number(process.argv[i + 1]) || dflt : dflt; };
const APPLY = process.argv.includes('--apply');

// Words that name a CATEGORY, not a company. A token outside this list (and ≥3 chars) is
// "distinctive" — it is the part of the name that can prove identity. Deliberately includes the
// transliteration filler ('al', 'el') and the geography every Qatar company shares.
const GENERIC = new Set([
  'al', 'el', 'the', 'and', 'of', 'for',
  'qatar', 'doha', 'gulf', 'arab', 'arabian', 'international', 'national', 'global',
  'trading', 'contracting', 'services', 'service', 'group', 'holding', 'holdings',
  'company', 'establishment', 'enterprises', 'enterprise', 'general', 'center', 'centre',
  'factory', 'industries', 'industrial', 'engineering', 'technology', 'technologies',
  'solutions', 'consulting', 'consultants', 'management', 'development', 'investment',
  'trade', 'commerce', 'business', 'office', 'shop', 'store', 'market',
  'health', 'clinic', 'medical', 'hospital',
]);

const CONCURRENCY = 6;
const FETCH_TIMEOUT = 12_000;

function distinctiveTokens(name) {
  const core = employerCore(name);                       // lowercased, & → and, legal trail gone
  return core.split(/\s+/).filter((t) => t.length >= 3 && !GENERIC.has(t) && !/^\d+$/.test(t));
}

/** Lowercased, punctuation-folded haystack from raw HTML — title, meta description, body text. */
function pageHaystack(html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const meta = (html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) || [])[1] || '';
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ');
  const fold = (s) => ' ' + String(s).toLowerCase().replace(/&amp;/g, ' and ').replace(/[^a-z0-9؀-ۿ]+/g, ' ') + ' ';
  return { title: fold(title), all: fold(title + ' ' + meta + ' ' + body) };
}

function domainCompressed(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host.split('.')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  } catch { return ''; }
}

/**
 * The gate. Pure — takes the page, returns the decision — so the tests drive it directly.
 * @returns {{verdict:'approve'|'reject'|'pending', why:string, matched?:string[]}}
 */
export function gateDecision({ companyName, url, status, html }) {
  if (isParkedWebsite(url)) return { verdict: 'reject', why: 'parked host' };
  if (status === 404 || status === 410) return { verdict: 'reject', why: 'http ' + status };
  if (!html) return { verdict: 'pending', why: 'unreachable' };
  const hay = pageHaystack(html);
  if (isParkedContent(hay.all)) return { verdict: 'reject', why: 'parking-page content' };

  const tokens = distinctiveTokens(companyName);
  // A fully-generic name ("Qatar Trading Company") can never be PROVEN by tokens — it stays for
  // humans. Same genericness caution the branch matcher learned the hard way.
  if (!tokens.length) return { verdict: 'pending', why: 'name has no distinctive token' };

  // ⚠️ TWO LIVE PREVIEWS, TWO LESSONS, ONE RULE. Preview #1 approved "Novo Trade" for
  // novoresume.com (substring anchor). Preview #2, after tightening, still approved
  // "Marvel Group" for the Marvel Comics wiki, "Zoom Contracting" for zoom.us and "Rotana
  // Trading" for the hotel chain — because a company NAMED AFTER A COMMON WORD trivially finds
  // that word in the famous site's title. "The page states this word" proves nothing; the page
  // must state THE COMPANY. Two requirements, both mandatory:
  //   1. THE FULL NAME AS A PHRASE — every non-filler token of the core name, in order,
  //      allowing only filler words (al/el/the/and/of/for) between them. zoom.us does not say
  //      "zoom contracting"; sharqinsurance.com.qa does say "sharq insurance".
  //   2. QATAR CONTEXT — the page mentions qatar/doha or a +974 number, or the domain is .qa.
  //      The Marvel wiki states neither.
  // Single-word names additionally need the word in the TITLE and an exact-match domain — a
  // one-word phrase is no phrase at all.
  const FILLER = '(?:\\s+(?:al|el|the|and|of|for))*\\s+';
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seq = employerCore(companyName).split(/\s+/)
    .filter((t) => t && !['al', 'el', 'the', 'and', 'of', 'for'].includes(t));
  if (!seq.length) return { verdict: 'pending', why: 'name has no matchable tokens' };
  const phraseRe = new RegExp('(^|\\s)' + seq.map(esc).join(FILLER) + '(\\s|$)');
  if (!phraseRe.test(hay.all)) {
    return { verdict: 'pending', why: 'page does not state the company name as a phrase' };
  }

  const dom = domainCompressed(url);
  const isQa = (() => { try { return /\.qa$/i.test(new URL(url).hostname); } catch { return false; } })();
  const qatarContext = isQa || /(^|\s)(qatar|doha|974)(\s|$)/.test(hay.all);
  if (!qatarContext) return { verdict: 'pending', why: 'no Qatar context on the page' };

  if (seq.length === 1) {
    const t = seq[0];
    const singleOk = tokens.length === 1 && t.length >= 6 && hay.title.includes(' ' + t + ' ') && dom === t;
    if (!singleOk) return { verdict: 'pending', why: 'single-word name — needs exact domain + title, or a human' };
  }

  return { verdict: 'approve', why: 'page states the name', matched: tokens };
}

async function fetchPage(url) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), FETCH_TIMEOUT);
  try {
    const r = await fetch(url, {
      signal: ctl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' },
    });
    const html = await r.text().catch(() => '');
    return { status: r.status, html: html.slice(0, 800_000) };
  } catch { return { status: 0, html: '' }; }
  finally { clearTimeout(to); }
}

export async function confirmCandidates({ limit = 400, apply = false, log = console.log } = {}) {
  const rows = (await query(`
    SELECT wc.id, wc.candidate_url, wc.company_id, c.name,
           (c.website IS NOT NULL AND btrim(c.website) <> '') AS has_site
      FROM website_candidates wc
      JOIN companies c ON c.id = wc.company_id
     WHERE wc.status = 'pending' AND COALESCE(c.archived, false) = false
     ORDER BY wc.id
     LIMIT $1`, [limit])).rows;
  if (!rows.length) { log('  candidate queue is empty'); return { checked: 0, approved: 0, rejected: 0, pending: 0 }; }
  log(`  ${rows.length} pending website candidate(s) to examine${apply ? '' : ' (PREVIEW — nothing written)'}`);

  const out = { checked: 0, approved: 0, rejected: 0, pending: 0, superseded: 0 };
  let i = 0;
  const worker = async () => {
    for (;;) {
      const row = rows[i++];
      if (!row) return;
      out.checked++;
      // The company found a website some other way since the candidate was queued. The candidate
      // is moot — closed as superseded, never used to OVERWRITE a site that exists.
      if (row.has_site) {
        out.superseded++;
        if (apply) await query(`UPDATE website_candidates SET status='rejected', decided_at=now(), decided_by='auto-gate: superseded (site already set)' WHERE id=$1`, [row.id]);
        continue;
      }
      const page = await fetchPage(row.candidate_url);
      const d = gateDecision({ companyName: row.name, url: row.candidate_url, status: page.status, html: page.html });
      if (d.verdict === 'approve') {
        out.approved++;
        log(`  ✓ ${String(row.name).slice(0, 40).padEnd(42)} ${row.candidate_url}`);
        if (apply) {
          // Guard re-checked at write time; stage7 reset hands the site to the always-on
          // harvester's frontier — this is what puts the ROG back to work.
          await query(`
            UPDATE companies SET website = $2,
                   extra_fields = COALESCE(extra_fields,'{}'::jsonb) || $3::jsonb,
                   stage7_status = NULL, stage7_at = NULL, stage8_status = 'done', updated_at = now()
             WHERE id = $1 AND (website IS NULL OR btrim(website) = '')`,
            [row.company_id, row.candidate_url,
             JSON.stringify({ website_found: { method: 'search-confirmed', at: new Date().toISOString(), candidate_id: row.id, evidence: d.matched } })]);
          await query(`UPDATE website_candidates SET status='approved', decided_at=now(), decided_by='auto-gate: page states the name' WHERE id=$1`, [row.id]);
        }
      } else if (d.verdict === 'reject') {
        out.rejected++;
        if (apply) await query(`UPDATE website_candidates SET status='rejected', decided_at=now(), decided_by=$2 WHERE id=$1`, [row.id, 'auto-gate: ' + d.why]);
      } else {
        out.pending++;   // stays in the queue, honestly undecided
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  log(`  gate done: ${out.approved} approved · ${out.rejected} rejected (parked/dead) · ${out.pending} left for review · ${out.superseded} superseded`);
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  confirmCandidates({ limit: argOf('--limit', 400), apply: APPLY })
    .then((r) => { console.log('CANDIDATE GATE COMPLETE:', JSON.stringify(r)); return pool.end(); })
    .then(() => process.exit(0))
    .catch(async (e) => { console.error('CANDIDATE GATE FAILED: ' + e.message); await pool.end().catch(() => {}); process.exit(1); });
}

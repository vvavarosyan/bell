// Al Meezan (almeezan.qa) — Qatar's authoritative legal portal: the Constitution,
// laws, decree-laws, decrees and decisions. Its law LISTINGS are JS/ASP.NET
// PageMethods (not plain-fetch enumerable), but every individual law page
// (LawPage.aspx?id=N&language=en) is fully server-rendered. So we enumerate by a
// bounded, resumable ID-WALK and keep ONLY pages we can validate as real laws —
// every stored row is real source text, never a guess (Rule 2.1).
//
// The host serves an INCOMPLETE TLS chain, so we fetch with the cert check
// relaxed FOR THIS HOST ONLY (config.insecure_tls). Resumable via a walk cursor
// persisted back onto the source's config, so Val can close the window any time.

import { query } from '../db.js';
import { httpGet, upsertPage } from './crawl.js';
import { extractLawRefs } from './entities.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const HOST = 'https://www.almeezan.qa';
const lawUrl = (id) => `${HOST}/LawPage.aspx?id=${id}&language=en`;

const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#0*39;|&#x0*27;|&rsquo;|&lsquo;|&#x0*201[89];/gi, "'")
  .replace(/&ldquo;|&rdquo;|&#x0*201[cd];/gi, '"')
  .replace(/&ndash;|&mdash;|&#x0*201[34];/gi, '-')
  .replace(/&#x0*d;|&#x0*a;|&#0*13;|&#0*10;/gi, ' ')
  .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, ' ');

// Clean the law title out of Al Meezan's site title:
//   "Al Meezan - Qatary Legal Portal | Legislations | Law No. 10 of 1987 …"
//     → "Law No. 10 of 1987 …"
export function cleanTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  let t = decode((m ? m[1] : '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  t = t.replace(/^.*?\|\s*Legislations\s*\|\s*/i, '').trim();   // drop the portal prefix if present
  return t;
}

// The law text lives in <div class="default-text-block">…</div> block(s).
export function lawBody(html) {
  const blocks = [...html.matchAll(/<div[^>]*class\s*=\s*["'][^"']*default-text-block[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi)]
    .map((m) => m[1]);
  const src = blocks.length ? blocks.join('\n\n') : html;
  return decode(src.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').replace(/\s{3,}/g, '  ').trim();
}

// Is this really a law page (vs a redirect-to-home / empty shell / other kind)?
// Accept only when the TITLE carries a real legal citation (English OR Arabic) or
// names the Constitution, AND the body is substantive. This rejects the portal
// home / fallback pages (no citation in their title) with no false positives.
export function isLawPage(title, text) {
  if (!title || title.length < 6) return false;
  const isConstitution = /\bConstitution\b/i.test(title) || /دستور/.test(title);
  if (!isConstitution && extractLawRefs(title).length === 0) return false;
  return (text || '').length > 150;
}

async function saveCursor(source, cursor) {
  await query(
    `UPDATE knowledge_sources SET config = jsonb_set(coalesce(config,'{}'::jsonb), '{walk_cursor}', to_jsonb($2::int)), updated_at = now() WHERE id = $1`,
    [source.id, cursor]);
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

// Fetch one law page with the SAME 3-try retry the generic crawler uses, so a
// transient blip doesn't silently skip a real law. Distinguishes:
//   • {html}          — got the page (success)
//   • {status!=200}   — definitive HTTP status (404 etc.) → safe to advance
//   • {error, definitive} — oversized/bad url → skip, advancing (retry won't help)
//   • {transient}     — timeout/network, retries exhausted → caller must NOT skip
const DEFINITIVE_ERRORS = new Set(['too large', 'bad url', 'bad redirect']);
async function fetchLaw(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    const r = await httpGet(url, { insecure: true });
    if (r && r.html != null) return r;                                    // got the page
    if (r && r.status && r.status !== 200) return r;                      // definitive HTTP status
    if (r && r.status === 200 && r.html == null) return r;                // 200 non-HTML → skip
    if (r && DEFINITIVE_ERRORS.has(r.error)) return { ...r, definitive: true };
    last = r;                                                             // timeout/network → retry
    await sleepMs(500 * (i + 1));
  }
  return { transient: true, error: (last && last.error) || 'fetch failed' };
}

// Walk law ids for one run. Bounded by max_pages IDS PROBED per run (resumable),
// and by config.walk_to (the id ceiling). Cursor persists between runs; when the
// ceiling is reached it wraps back to walk_from so the next scan re-checks every
// law for CHANGES (amendments/repeals).
export async function crawlAlmeezan(source, { onProgress = () => {} } = {}) {
  const cfg = source.config || {};
  const from = Number(cfg.walk_from) || 1;
  const to = Number(cfg.walk_to) || 7200;
  const perRun = Math.min(Number(source.max_pages) || 1500, 4000);
  let id = Number.isFinite(Number(cfg.walk_cursor)) && Number(cfg.walk_cursor) >= from ? Number(cfg.walk_cursor) : from;
  const stats = { fetched: 0, new: 0, changed: 0, same: 0, errors: 0, skipped: 0 };
  let probed = 0;
  while (id <= to && probed < perRun) {
    const url = lawUrl(id);
    const r = await fetchLaw(url);
    probed++;
    if (r && r.transient) {
      // Retries exhausted on a transient failure — do NOT advance past a possibly
      // real law. Keep the cursor AT this id so the next scan re-probes it.
      stats.errors++;
      await saveCursor(source, id);
      onProgress(`Al Meezan: paused at id ${id} (network error) — just re-run to continue`);
      stats.cursor = id; stats.done = false; stats.paused = true;
      await query(`UPDATE knowledge_sources SET last_crawled_at = now(), updated_at = now() WHERE id = $1`, [source.id]);
      return stats;
    }
    if (r && r.html) {
      const title = cleanTitle(r.html);
      const text = lawBody(r.html);
      if (isLawPage(title, text)) {
        try { const k = await upsertPage(source, url, title, text); stats[k]++; stats.fetched++; }
        catch { stats.errors++; }
      } else stats.skipped++;
    } else if (r && r.error) stats.errors++;   // definitive error (too large / bad url) — skip
    else stats.skipped++;                       // non-200 status / non-HTML — skip
    id++;
    if (probed % 25 === 0) { await saveCursor(source, id); onProgress(`Al Meezan: id ${id}/${to} · ${stats.fetched} laws (${stats.new} new, ${stats.changed} changed)`); }
    await sleep(400);   // polite — one connection
  }
  // Reached the ceiling → wrap for the next re-crawl cycle; else save where we stopped.
  const wrapped = id > to;
  await saveCursor(source, wrapped ? from : id);
  // FIRST full pass over the whole archive complete → stamp the Gazette baseline
  // ONCE. This is the boundary that makes the "new legislation" feed honest: every
  // law found during the initial multi-run archive crawl is a first-time DISCOVERY,
  // not a Gazette event. Only a law that appears on a LATER wrap pass (detected_at
  // after this timestamp) is genuinely new legislation. (Transient failures pause
  // the cursor rather than skip, so real laws aren't discovered late and mislabeled.)
  if (wrapped && !cfg.gazette_baseline_at) {
    await query(
      `UPDATE knowledge_sources
          SET config = jsonb_set(coalesce(config,'{}'::jsonb), '{gazette_baseline_at}', to_jsonb(now()::text)),
              updated_at = now()
        WHERE id = $1`,
      [source.id]);
    stats.gazette_baseline_set = true;
  }
  await query(`UPDATE knowledge_sources SET last_crawled_at = now(), updated_at = now() WHERE id = $1`, [source.id]);
  stats.cursor = wrapped ? from : id;
  stats.done = wrapped;
  return stats;
}

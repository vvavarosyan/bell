// Parked-domain + placeholder-logo cleanup (bug A1, Val 2026-07-24).
//
// Two independent, ZERO-CASUALTY signals — both proven on live data before shipping:
//   • LOGO: the stored website_logo_url is a known default asset path (GoDaddy/Wix favicon,
//     parked-page default image, bare favicon, MOCI icon) OR a pure parking/panel host.
//     We do NOT strip by "shared across N companies": a real chain (Wellcare, 27 pharmacies)
//     legitimately shares one logo, and would be a false casualty.
//   • WEBSITE: the stored website is a domain-marketplace / for-sale / parking host — never
//     the company's real site (Harbour Holdings pointed at a GoDaddy "for sale" page).
//
// Both use the SAME predicates the harvester now rejects at the source (isPlaceholderLogo /
// isParkedWebsite in enrichment/local/extract.js) so a fixed record never comes back.
// The removed value is kept in extra_fields.{logo_removed,website_removed} — nothing is lost.
// Preview by default; writes only with --apply. companies is a mirror → an UPDATE bumps
// updated_at and syncs on the next push (no tombstone needed; a cleared value is not a delete).

import { query } from '../db.js';
import {
  isPlaceholderLogo, isParkedWebsite, isParkedContent, parkedDomainNamed, hostOfUrl,
} from '../enrichment/local/extract.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';

const apply = process.argv.includes('--apply');

async function scan() {
  const logoRows = (await query(
    `SELECT id, name, website, extra_fields->>'website_logo_url' AS logo FROM companies
      WHERE extra_fields->>'website_logo_url' IS NOT NULL`)).rows
    .filter((r) => isPlaceholderLogo(r.logo, r.website));

  const all = (await query(
    `SELECT id, name, website,
            extra_fields->>'website_description' AS descr,
            extra_fields->>'website_keywords'    AS kw
       FROM companies
      WHERE website IS NOT NULL AND btrim(website) <> ''`)).rows;

  // A stored description is EVIDENCE ABOUT THE SITE IT WAS SCRAPED FROM — and it goes stale
  // when the company's website changes. So a for-sale phrase only condemns the CURRENT website
  // when it names the CURRENT host. Proven live 2026-08-05: 361 rows carried a for-sale phrase,
  // but only 11 named the current website; the other 350 were real companies (Villaggio, Gulf
  // Hotels, Air Con Trading) whose sites would have been wrongly deleted on stale evidence.
  const webRows = [], staleDescrRows = [];
  for (const r of all) {
    const host = hostOfUrl(r.website);
    if (isParkedWebsite(r.website)) { webRows.push(r); continue; }   // host IS a marketplace
    if (!isParkedContent(r.descr, r.kw)) continue;
    const named = parkedDomainNamed(r.descr) || parkedDomainNamed(r.kw);
    if (named && named === host) webRows.push(r);                   // the CURRENT site is parked
    else staleDescrRows.push({ ...r, named });                      // text describes a DIFFERENT domain
  }
  return { logoRows, webRows, staleDescrRows };
}

function tally(rows, key) {
  const t = {};
  for (const r of rows) t[r[key]] = (t[r[key]] || 0) + 1;
  return Object.entries(t).sort((a, b) => b[1] - a[1]);
}

async function main() {
  console.log('');
  console.log('BELL — PARKED DOMAIN + PLACEHOLDER LOGO CLEANUP'
    + (apply ? '   (APPLYING)' : '   (PREVIEW — nothing written)'));
  console.log('======================================================================\n');
  const { logoRows, webRows, staleDescrRows } = await scan();

  console.log(`PLACEHOLDER LOGOS: ${logoRows.length.toLocaleString()} companies show a default/parked image, not their own mark.`);
  for (const [u, n] of tally(logoRows, 'logo').slice(0, 8)) console.log('   ×' + String(n).padEnd(5) + String(u).slice(0, 62));
  console.log('');
  console.log(`PARKED WEBSITES: ${webRows.length.toLocaleString()} companies point at a for-sale / parking page, not a real site.`);
  for (const [u, n] of tally(webRows, 'website').slice(0, 8)) console.log('   ×' + String(n).padEnd(5) + String(u).slice(0, 62));
  console.log('');
  console.log(`STALE DESCRIPTIONS: ${staleDescrRows.length.toLocaleString()} companies show text scraped from a DIFFERENT domain`);
  console.log('   (their website changed; the old text stayed). The WEBSITE IS KEPT — only the wrong text goes.');
  for (const r of staleDescrRows.slice(0, 6)) {
    console.log('   · ' + String(r.name).slice(0, 26).padEnd(28) + 'site ' + String(r.website).slice(0, 26).padEnd(28) + 'text is about ' + r.named);
  }
  console.log('\nRemoved values are kept in extra_fields (logo_removed / website_removed / description_removed) — nothing is lost.\n');

  if (!apply) {
    console.log('PREVIEW ONLY. Double-click "Apply Parked Domain Cleanup.command" to clear them.\n');
    return;
  }

  const touched = new Set();
  let nLogo = 0, nWeb = 0;
  for (const r of logoRows) {
    await query(`
      UPDATE companies
         SET extra_fields = (COALESCE(extra_fields,'{}'::jsonb) - 'website_logo_url')
             || jsonb_build_object('logo_removed', jsonb_build_object('url', $2::text, 'at', now()::text, 'reason', 'placeholder')),
             updated_at = now()
       WHERE id = $1`, [r.id, r.logo]);
    touched.add(r.id); if (++nLogo % 500 === 0) console.log('  …logos ' + nLogo);
  }
  for (const r of webRows) {
    const host = String(r.website || '').replace(/^https?:\/\/(www\.)?/i, '').split(/[/?#]/)[0].toLowerCase();
    // Null the parked website + remember the host so the Finder never re-adds it (same
    // shape the harvester now writes at the source).
    await query(`
      UPDATE companies
         SET website = NULL,
             extra_fields = COALESCE(extra_fields,'{}'::jsonb)
             || jsonb_build_object(
                  'website_removed', jsonb_build_object('url', $2::text, 'at', now()::text, 'reason', 'parked_domain'),
                  'website_rejected', (
                    SELECT to_jsonb(array(SELECT DISTINCT lower(h) FROM jsonb_array_elements_text(
                      COALESCE(extra_fields->'website_rejected','[]'::jsonb) || to_jsonb($3::text)) h)))),
             updated_at = now()
       WHERE id = $1`, [r.id, r.website, host]);
    touched.add(r.id); if (++nWeb % 200 === 0) console.log('  …websites ' + nWeb);
  }
  // Stale text: the website is CORRECT and stays; only the description that belongs to a
  // different domain is removed (kept in extra_fields.description_removed).
  let nStale = 0;
  for (const r of staleDescrRows) {
    await query(`
      UPDATE companies
         SET extra_fields = (COALESCE(extra_fields,'{}'::jsonb) - 'website_description' - 'website_keywords')
             || jsonb_build_object('description_removed', jsonb_build_object(
                  'text', $2::text, 'was_about', $3::text, 'site_now', $4::text,
                  'at', now()::text, 'reason', 'text_belongs_to_a_different_domain')),
             updated_at = now()
       WHERE id = $1`, [r.id, r.descr, r.named, r.website]);
    touched.add(r.id); if (++nStale % 200 === 0) console.log('  …stale text ' + nStale);
  }

  for (const id of touched) await recomputeBellScoreForCompany(id).catch(() => {});
  console.log(`\nCleared ${nLogo.toLocaleString()} placeholder logos, ${nWeb.toLocaleString()} parked websites, `
    + `${nStale.toLocaleString()} stale descriptions (websites kept).`);
  console.log('Publishes to the live site on the next data push.\n');
}
main().then(() => process.exit(0)).catch((e) => { console.error('Stopped:', e.stack || e.message); process.exit(1); });

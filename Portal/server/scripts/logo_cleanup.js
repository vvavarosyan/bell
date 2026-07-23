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
import { isPlaceholderLogo, isParkedWebsite, isParkedContent } from '../enrichment/local/extract.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';

const apply = process.argv.includes('--apply');

async function scan() {
  const logoRows = (await query(
    `SELECT id, name, extra_fields->>'website_logo_url' AS logo FROM companies
      WHERE extra_fields->>'website_logo_url' IS NOT NULL`)).rows
    .filter((r) => isPlaceholderLogo(r.logo));
  // Parked websites: a host-level parking service, OR a vanity domain whose harvested
  // content is a for-sale page (the big one — 2,065 rows, "X.com is for sale on GoDaddy").
  const webRows = (await query(
    `SELECT id, name, website,
            extra_fields->>'website_description' AS descr,
            extra_fields->>'website_keywords'    AS kw
       FROM companies
      WHERE website IS NOT NULL AND btrim(website) <> ''`)).rows
    .filter((r) => isParkedWebsite(r.website) || isParkedContent(r.descr, r.kw));
  return { logoRows, webRows };
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
  const { logoRows, webRows } = await scan();

  console.log(`PLACEHOLDER LOGOS: ${logoRows.length.toLocaleString()} companies show a default/parked image, not their own mark.`);
  for (const [u, n] of tally(logoRows, 'logo').slice(0, 8)) console.log('   ×' + String(n).padEnd(5) + String(u).slice(0, 62));
  console.log('');
  console.log(`PARKED WEBSITES: ${webRows.length.toLocaleString()} companies point at a for-sale / parking page, not a real site.`);
  for (const [u, n] of tally(webRows, 'website').slice(0, 8)) console.log('   ×' + String(n).padEnd(5) + String(u).slice(0, 62));
  console.log('\nRemoved values are kept in extra_fields (logo_removed / website_removed) — nothing is lost.\n');

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
  for (const id of touched) await recomputeBellScoreForCompany(id).catch(() => {});
  console.log(`\nCleared ${nLogo.toLocaleString()} placeholder logos and ${nWeb.toLocaleString()} parked websites.`);
  console.log('Publishes to the live site on the next data push.\n');
}
main().then(() => process.exit(0)).catch((e) => { console.error('Stopped:', e.stack || e.message); process.exit(1); });

// Flag + quarantine companies whose stored WEBSITE CONTENT belongs to a DIFFERENT
// brand, even though the DOMAIN matches the company name (Val 2026-07-15:
// "foundationendowment.com … has a logo for a completely different company named
// 'smart evolution'"). This is the content-conflict sibling of flag_website_conflicts.js
// (which handles the domain-vs-name case).
//
// Difference from the domain version: here the domain is very likely THE COMPANY'S OWN
// (it matches the name) — only the served page is wrong (parked / hijacked / rebranded).
// So this is NON-DESTRUCTIVE: it KEEPS the website, strips only the wrong DERIVED
// artifacts (logo / description / keywords / tech), hides the website-harvested contacts,
// and raises needs_review — snapshotting everything under extra_fields.website_content_conflict
// so the admin can restore it. Rule 2.1: we never wipe the domain we're unsure about.
//
// It RE-FETCHES each candidate homepage (the stored description alone lacks the title /
// og:site_name the classifier needs), so it is a crawler — pause the always-on engine
// first (local Portal → Local Engines → Pause). Resumable via
// extra_fields.website_content_checked_at; paced; idempotent.
//   Preview:  node server/scripts/flag_website_content_conflicts.js
//   Apply:    node server/scripts/flag_website_content_conflicts.js --apply

import { query } from '../db.js';
import { fetchPage, toRootUrl } from '../enrichment/local/http.js';
import { renderPage, rendererAvailable } from '../enrichment/local/render.js';
import { contentIdentity } from '../enrichment/local/content_identity.js';

const apply = process.argv.includes('--apply');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > -1 ? Number(process.argv[i + 1]) || 0 : 0; })();
const trunc = (s, n = 34) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Keys DERIVED from the (wrong) website — stripped on quarantine, snapshotted first.
const DERIVED_KEYS = ['website_logo_url', 'website_description', 'website_keywords'];

async function loadHome(website) {
  const url = toRootUrl(website);
  if (!url) return null;
  let home = await fetchPage(url, { retries: 1 }).catch(() => null);
  if (home && (!home.ok || (home.text || '').length < 400) && await rendererAvailable()) {
    const r = await renderPage(url).catch(() => null);
    if (r && r.ok && (r.text || '').length > (home.text || '').length) home = r;
  }
  return home;
}

async function quarantine(id, idv, home) {
  const c = (await query(`SELECT extra_fields FROM companies WHERE id=$1`, [id])).rows[0];
  if (!c) return null;
  const ef = c.extra_fields || {};
  const tech = (await query(`SELECT tech FROM company_tech WHERE company_id=$1`, [id])).rows.map((t) => t.tech);
  const wc = {
    brand: idv.brand || null, matched: idv.matched || null, evidence: idv.evidence || null,
    url: home?.finalUrl || null,
    logo_url: ef.website_logo_url || null,
    description: ef.website_description || null,
    tech,
    flagged_at: new Date().toISOString(),
  };
  await query(
    `UPDATE companies SET
        extra_fields = ((coalesce(extra_fields,'{}'::jsonb) - $2::text[])
                        || jsonb_build_object('website_content_conflict', $3::jsonb)),
        needs_review = TRUE,
        review_reason = $4,
        updated_at = now()
      WHERE id = $1`,
    [id, DERIVED_KEYS, JSON.stringify(wc),
     `Website content appears to be a different company (${wc.brand || 'unknown brand'}) — logo/description/tech hidden pending review`]);
  await query(`DELETE FROM company_tech WHERE company_id = $1`, [id]);
  await query(
    `UPDATE company_contacts SET extra_fields = coalesce(extra_fields,'{}'::jsonb) || '{"hidden_conflict":true}'::jsonb, updated_at=now()
      WHERE company_id = $1 AND source = 'stage7-website'`, [id]);
  return { tech: tech.length };
}

async function markChecked(id) {
  await query(`UPDATE companies SET extra_fields = coalesce(extra_fields,'{}'::jsonb) || jsonb_build_object('website_content_checked_at', $2::text) WHERE id=$1`,
    [id, new Date().toISOString()]);
}

(async () => {
  console.log(`Bell — flag wrong-CONTENT websites  (${apply ? 'APPLY — writing' : 'DRY-RUN — preview only'})\n`);
  // Candidates: harvested companies that stored a website logo/description and haven't
  // been content-checked since their last harvest.
  const rows = (await query(
    `SELECT id, name, website FROM companies
      WHERE coalesce(archived,false)=false
        AND website IS NOT NULL
        AND (extra_fields ? 'website_logo_url' OR extra_fields ? 'website_description')
        AND NOT (extra_fields ? 'website_content_conflict')
        AND NOT (extra_fields ? 'website_content_checked_at')
      ORDER BY id${LIMIT ? ` LIMIT ${LIMIT}` : ''}`)).rows;

  console.log(`Candidates to re-check: ${rows.length}${LIMIT ? ` (limited to ${LIMIT})` : ''}\n`);
  if (!apply) {
    console.log('DRY-RUN re-fetches a small sample so you can see what would be flagged, then stops.');
  }
  const sample = apply ? rows : rows.slice(0, 40);

  let checked = 0, flagged = 0, techRemoved = 0;
  for (const c of sample) {
    try {
      const home = await loadHome(c.website);
      if (!home || !home.ok) { if (apply) await markChecked(c.id); continue; }
      const idv = contentIdentity({ name: c.name }, { meta: home.meta, text: home.text, ok: home.ok });
      checked++;
      if (idv.verdict === 'content-conflict') {
        flagged++;
        console.log(`  CONFLICT  ${trunc(c.name).padEnd(36)} → "${trunc(idv.brand || '?', 24)}"  ${c.website}`);
        if (apply) { const r = await quarantine(c.id, idv, home); if (r) techRemoved += r.tech; }
      }
      if (apply) await markChecked(c.id);
      await sleep(900);   // polite pace, 8GB-Mac friendly
    } catch (e) { console.log(`  [err] co#${c.id}: ${e.message}`); }
  }

  console.log(`\n→ ${apply ? 'Checked' : 'Sampled'} ${checked} · flagged ${flagged}${apply ? ` · removed ${techRemoved} wrong tech rows` : ''}.`);
  if (!apply) console.log('\nPreview only (40-site sample). Review, then run "Apply Website-Content Conflict.command" (pause the always-on engine first).');
  else console.log('  Logo/description/tech/website-contacts hidden from customers (kept in admin under website_content_conflict). Website itself kept.');
  process.exit(0);
})().catch((e) => { console.error('Stopped:', e.message); process.exit(1); });

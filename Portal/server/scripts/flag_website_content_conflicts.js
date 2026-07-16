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
const recheckOnly = process.argv.includes('--recheck');   // only re-examine existing flags
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

// Undo a flag: put the snapshotted logo/description back, un-hide the website contacts,
// clear the review flag. Mirrors POST /companies/:id/restore-website-content.
async function restoreOne(id, wcc) {
  const back = {};
  if (wcc?.logo_url) back.website_logo_url = wcc.logo_url;
  if (wcc?.description) back.website_description = wcc.description;
  await query(
    `UPDATE companies SET
        needs_review = false, review_reason = NULL,
        extra_fields = ((coalesce(extra_fields,'{}'::jsonb) - 'website_content_conflict' - 'website_content_checked_at') || $2::jsonb),
        updated_at = now()
      WHERE id = $1`,
    [id, JSON.stringify(back)]);
  await query(
    `UPDATE company_contacts SET extra_fields = coalesce(extra_fields,'{}'::jsonb) - 'hidden_conflict', updated_at = now()
      WHERE company_id = $1 AND source = 'stage7-website'`, [id]);
}

// RE-CHECK EVERY ALREADY-FLAGGED COMPANY with the CURRENT classifier and RESTORE the ones
// that no longer qualify. This exists because a flagged row is excluded from the candidate
// query, so simply re-running could never undo a bad flag — and the 2026-07-16 run produced
// real false positives (accented names like "Stratèze"/"Wärtsilä", title TAGLINES such as
// Gannett Fleming's "Ingenuity That Shapes Lives", HTML entities, and parked/expired pages).
// The classifier has since been tightened; this pass is how those companies get their data
// back automatically instead of Val clicking restore 47 times.
async function recheckFlagged(applyMode) {
  const rows = (await query(
    `SELECT id, name, website, extra_fields->'website_content_conflict' AS wcc
       FROM companies WHERE extra_fields ? 'website_content_conflict' ORDER BY id`)).rows;
  if (!rows.length) return { checked: 0, restored: 0, kept: 0 };
  console.log(`Re-checking ${rows.length} previously-flagged compan${rows.length === 1 ? 'y' : 'ies'} with the current rules…\n`);
  let restored = 0, kept = 0;
  for (const c of rows) {
    try {
      const home = await loadHome(c.website);
      const idv = home && home.ok
        ? contentIdentity({ name: c.name }, { meta: home.meta, text: home.text, ok: home.ok, url: home.finalUrl })
        : { verdict: 'skip', reason: 'unreachable' };
      if (idv.verdict === 'content-conflict') {
        kept++;
        console.log(`  KEEP FLAG  ${trunc(c.name).padEnd(36)} → "${trunc(idv.brand || '?', 24)}"`);
      } else {
        restored++;
        console.log(`  RESTORE    ${trunc(c.name).padEnd(36)} (${idv.reason}) — data given back`);
        if (applyMode) await restoreOne(c.id, c.wcc || {});
      }
      await sleep(700);
    } catch (e) { console.log(`  [err] co#${c.id}: ${e.message}`); }
  }
  console.log(`\n→ ${applyMode ? 'Restored' : 'Would restore'} ${restored} · kept ${kept} genuine.\n`);
  return { checked: rows.length, restored, kept };
}

async function markChecked(id) {
  await query(`UPDATE companies SET extra_fields = coalesce(extra_fields,'{}'::jsonb) || jsonb_build_object('website_content_checked_at', $2::text) WHERE id=$1`,
    [id, new Date().toISOString()]);
}

(async () => {
  console.log(`Bell — flag wrong-CONTENT websites  (${apply ? 'APPLY — writing' : 'DRY-RUN — preview only'})\n`);

  // STEP 1 — always re-examine what we already flagged, and hand back anything the current
  // (stricter) rules clear. Self-correcting: a rule improvement automatically un-does the
  // bad flags it used to cause, rather than leaving a customer's data hidden for good.
  await recheckFlagged(apply);
  if (recheckOnly) { console.log('Re-check only (--recheck) — no new companies were scanned.'); process.exit(0); }
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
  const PREVIEW_N = (() => { const i = process.argv.indexOf('--sample'); return i > -1 ? Number(process.argv[i + 1]) || 120 : 120; })();
  if (!apply) {
    console.log(`DRY-RUN re-fetches a ${PREVIEW_N}-site sample so you can see what WOULD be flagged, then stops.`);
    console.log('Genuine wrong-content is rare — few or zero flags here is good (it means the data is mostly correct).\n');
  }
  const sample = apply ? rows : rows.slice(0, PREVIEW_N);

  let checked = 0, flagged = 0, techRemoved = 0;
  for (const c of sample) {
    try {
      const home = await loadHome(c.website);
      if (!home || !home.ok) { if (apply) await markChecked(c.id); continue; }
      const idv = contentIdentity({ name: c.name }, { meta: home.meta, text: home.text, ok: home.ok, url: home.finalUrl });
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
  if (!apply) console.log(`\nPreview only (${PREVIEW_N}-site sample). Review, then run "Apply Website-Content Conflict.command" (pause the always-on engine first).`);
  else console.log('  Logo/description/tech/website-contacts hidden from customers (kept in admin under website_content_conflict). Website itself kept.');
  process.exit(0);
})().catch((e) => { console.error('Stopped:', e.message); process.exit(1); });

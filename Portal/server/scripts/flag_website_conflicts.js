// Flag + fully RESET companies whose WEBSITE provably belongs to a DIFFERENT
// company (Val 2026-07-13, "Integrated Technical Services enriched with Arabian
// MEP's details … data is still garbage, I need a permanent solution").
//
// A wrong website FEEDS everything downstream: the harvested contacts, the tech
// stack (company_tech), the logo + description (extra_fields.website_logo_url /
// website_description), the email pattern (stage10). Clearing only the website
// leaves all of that garbage behind. So we undo the ENTIRE website cascade and
// preserve the originals under extra_fields.website_conflict (for admin restore),
// then reset the website/tech stages so a clean re-enrichment can run (the current
// finder won't re-attach the wrong site).
//
// Val's choice: FLAG FOR REVIEW + HIDE FROM CUSTOMERS. Nothing is deleted except
// the wrong tech-stack rows (their content is snapshotted into website_conflict).
//
// SAFETY: DRY-RUN by default. Add --apply to write. Idempotent (re-running a
// flagged company re-cleans any residue). Publishes on the next mirror push.
//   Preview:  node server/scripts/flag_website_conflicts.js
//   Apply:    node server/scripts/flag_website_conflicts.js --apply

import { query } from '../db.js';
import { findWebsiteConflicts, hostSlug } from '../enrichment/local/website_conflict.js';

const apply = process.argv.includes('--apply');
const trunc = (s, n = 34) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };

// extra_fields keys that are DERIVED from the (wrong) website — removed on reset.
const WEBSITE_DERIVED_KEYS = [
  'website_logo_url', 'website_description',
  'stage7_found', 'stage7_pages', 'stage7_rendered', 'stage7_scraped_at',
  'stage8_tiers', 'stage8_checked_at', 'stage8_search_complete',
  'stage10_domain', 'stage10_emails', 'stage10_format', 'stage10_people', 'stage10_pattern', 'stage10_observed',
  'stage11_skip', 'stage12_tech', 'stage12_source',
];

async function resetOne(id, domainHint) {
  const c = (await query(`SELECT website, email, extra_fields FROM companies WHERE id=$1`, [id])).rows[0];
  if (!c) return false;
  const ef = c.extra_fields || {};
  const existingWC = ef.website_conflict || {};
  const domain = domainHint || existingWC.domain || (c.website ? hostSlug(c.website) : null);
  const tech = (await query(`SELECT tech, category, confidence, source FROM company_tech WHERE company_id=$1`, [id])).rows;
  const con = (await query(`SELECT id, type, value, source, source_url FROM company_contacts WHERE company_id=$1`, [id])).rows;
  const site = (c.website || existingWC.website || '').replace(/^https?:\/\/(www\.)?/i, '').split('/')[0].replace(/^www\./, '');
  const fromDomain = con.filter((k) => (domain && hostSlug(k.source_url || '') === domain)
    || (k.source === 'stage7-website')
    || (k.type === 'email' && site && String(k.value).toLowerCase().endsWith('@' + site)));
  const emailFromDomain = c.email && domain && hostSlug('http://' + String(c.email).split('@')[1]) === domain;

  const wc = {
    belongs_to: existingWC.belongs_to, belongs_to_id: existingWC.belongs_to_id, domain,
    website: c.website || existingWC.website || null,
    email: existingWC.email || (emailFromDomain ? c.email : null),
    logo_url: existingWC.logo_url || ef.website_logo_url || null,
    description: existingWC.description || ef.website_description || null,
    tech: tech.length ? tech.map((t) => t.tech) : (existingWC.tech || []),
    contacts: fromDomain.length ? fromDomain.map((k) => ({ id: k.id, type: k.type, value: k.value })) : (existingWC.contacts || []),
    flagged_at: existingWC.flagged_at || new Date().toISOString(),
  };

  await query(
    `UPDATE companies SET
        website = NULL,
        email = CASE WHEN $2 THEN NULL ELSE email END,
        needs_review = true,
        review_reason = $3,
        extra_fields = ((coalesce(extra_fields,'{}'::jsonb) - $4::text[]) || jsonb_build_object('website_conflict', $5::jsonb)),
        stage7_status = NULL, stage7_at = NULL,
        stage11_status = 'pending', stage11_at = NULL,
        stage12_status = 'pending', stage12_at = NULL,
        updated_at = now()
      WHERE id = $1`,
    [id, !!emailFromDomain, `Website may belong to "${wc.belongs_to || 'another company'}" — hidden from customers pending review`, WEBSITE_DERIVED_KEYS, JSON.stringify(wc)]);
  await query(`DELETE FROM company_tech WHERE company_id = $1`, [id]);
  if (fromDomain.length) await query(`UPDATE company_contacts SET extra_fields = coalesce(extra_fields,'{}'::jsonb) || '{"hidden_conflict":true}'::jsonb, updated_at=now() WHERE id = ANY($1::bigint[])`, [fromDomain.map((k) => k.id)]);
  return { tech: tech.length, contacts: fromDomain.length };
}

(async () => {
  console.log(`Bell — flag + reset wrong-company websites  (${apply ? 'APPLY — writing' : 'DRY-RUN — preview only'})\n`);
  const rows = (await query(`SELECT id, name, website FROM companies WHERE coalesce(archived,false)=false AND is_active=true`)).rows;
  const conflicts = findWebsiteConflicts(rows).filter((c) => c.website);
  // Companies already flagged in a previous run (so re-running cleans residual tech/logo).
  const alreadyFlagged = (await query(`SELECT id, name, extra_fields->'website_conflict'->>'domain' AS domain, extra_fields->'website_conflict'->>'belongs_to' AS belongs_to FROM companies WHERE extra_fields ? 'website_conflict'`)).rows;

  const targets = new Map();
  for (const c of conflicts) targets.set(c.id, { id: c.id, name: c.name, domain: c.domain, belongs_to: c.belongs_to });
  for (const c of alreadyFlagged) if (!targets.has(c.id)) targets.set(c.id, { id: c.id, name: c.name, domain: c.domain, belongs_to: c.belongs_to });

  console.log(`Wrong-company websites to hide + reset: ${targets.size}  (${conflicts.length} detected now, ${alreadyFlagged.length} already flagged)\n`);
  let shown = 0;
  for (const t of targets.values()) { if (shown++ >= 55) break; console.log(`  ${trunc(t.name).padEnd(36)} → belongs to "${trunc(t.belongs_to || '?', 30)}"`); }
  if (targets.size > 55) console.log(`  … and ${targets.size - 55} more`);

  if (!apply) { console.log('\nPreview only. Review, then run "Apply Website-Conflict Fix.command".'); process.exit(0); }

  let done = 0, tech = 0, con = 0;
  for (const t of targets.values()) {
    try { const r = await resetOne(t.id, t.domain); if (r) { done++; tech += r.tech; con += r.contacts; } }
    catch (e) { console.log(`  [err] co#${t.id}: ${e.message}`); }
  }
  console.log(`\n→ reset ${done} companies · removed ${tech} wrong tech-stack rows · hid ${con} harvested contacts.`);
  console.log('  Website/logo/description/tech/website-emails hidden from customers (kept in admin under website_conflict); website + tech stages reset for a clean re-enrich.');
  process.exit(0);
})().catch((e) => { console.error('Stopped:', e.message); process.exit(1); });

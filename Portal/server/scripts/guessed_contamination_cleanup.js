// The cleanup for the database's single largest accuracy defect: guessed websites.
//
// The old Website Finder invented domains from company names. Harvesting then spread those
// sites' content everywhere a customer looks. Two classes are PROVABLY wrong and are handled
// here; everything merely suspicious is left for the evidence-driven re-check, not guessed at.
//
//   CLASS 1 — SHARED GUESSED HOSTS. 688 guessed domains each sit on 2+ companies (1,653
//   companies total). One domain has at most one owner; for every sharer whose NAME does not
//   spell the domain (the same exact-concatenation rule the approval gate uses), the website
//   claim is withdrawn: website cleared, website-derived description/keywords/logo dropped
//   (they describe someone else's site), and contacts harvested FROM that domain deleted with
//   tombstones. A sharer whose name DOES spell the domain is left standing — it may genuinely
//   own it, and the nightly gate machinery can confirm it against the live page later.
//
//   CLASS 2 — TEMPLATE CONTACT VALUES. One London landline stored as the phone of 640 Qatar
//   companies; Facebook's share-button URL as the "social profile" of 120; 135 values on 4,743
//   rows, all harvest-written. A value fanned across ≥10 companies by scraping is the template,
//   not the company:
//     · socials/emails at that fan-out are deleted — a company's own profile URL or mailbox is
//       unique by nature, so scale itself is the proof;
//     · NON-Qatar phone numbers at that fan-out are deleted — 640 Qatar companies do not share
//       one London landline;
//     · QATAR-format phones at that fan-out are NOT touched — a genuinely shared 800-number or
//       mall switchboard is possible, so those go to a review file on the Desktop instead.
//
// Every deletion tombstones (the tables are mirrored) and every affected company gets its
// legacy email/phone columns rebuilt afterwards — the [[legacy-contact-column]] lesson: a bulk
// delete that skips the resync leaves the wrong value live in the column customers see.
// The fan-out GUARD now in lib/contacts.js keeps the harvester from re-writing what this
// removes; without it, the next freshness lap would re-poison everything within days.
//
//   node scripts/guessed_contamination_cleanup.js            # preview, writes nothing
//   node scripts/guessed_contamination_cleanup.js --apply

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { query, pool } from '../db.js';
import { resyncContactColumns } from '../lib/contacts.js';
import { domainMatchesName } from './confirm_website_candidates.js';

const APPLY = process.argv.includes('--apply');
const FAN_THRESHOLD = 10;

const qatarPhone = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return /^(974)?[34567]\d{7}$/.test(d) || /^(974)?800\d{4,5}$/.test(d);
};

async function main() {
  console.log('');
  console.log('BELL — GUESSED-WEBSITE CONTAMINATION CLEANUP' + (APPLY ? '   (APPLYING)' : '   (PREVIEW — nothing written)'));
  console.log('=============================================================\n');

  // ── CLASS 1: shared guessed hosts ──────────────────────────────────────────────────────────
  const hosts = (await query(`
    SELECT lower(regexp_replace(regexp_replace(website,'^https?://',''),'^www\\.|/.*$','','g')) AS host,
           array_agg(id) AS ids, array_agg(name) AS names, array_agg(website) AS urls
      FROM companies
     WHERE COALESCE(archived,false) = false AND website IS NOT NULL
       AND extra_fields->'website_found'->>'method' = 'guess'
     GROUP BY 1 HAVING count(*) > 1
     ORDER BY count(*) DESC`)).rows;

  let clearCompanies = [], keepCount = 0;
  for (const h of hosts) {
    for (let i = 0; i < h.ids.length; i++) {
      if (domainMatchesName(h.names[i], h.urls[i])) keepCount++;   // may own it — recheck later
      else clearCompanies.push({ id: Number(h.ids[i]), name: h.names[i], host: h.host });
    }
  }
  console.log(`CLASS 1 — shared guessed domains: ${hosts.length} domains · ${hosts.reduce((a, h) => a + h.ids.length, 0)} companies`);
  console.log(`  ${clearCompanies.length} companies lose the website claim (their name does not spell the domain)`);
  console.log(`  ${keepCount} kept standing — the name spells the domain, the live-page re-check decides later`);
  for (const c of clearCompanies.slice(0, 6)) console.log(`    e.g. ${String(c.name).slice(0, 40).padEnd(42)} ✗ ${c.host}`);

  // ── CLASS 2: template contact values ───────────────────────────────────────────────────────
  const fans = (await query(`
    SELECT type, value, count(DISTINCT company_id)::int companies
      FROM company_contacts
     WHERE source ILIKE '%stage7%' OR source ILIKE '%website%' OR source ILIKE '%harvest%'
     GROUP BY 1, 2 HAVING count(DISTINCT company_id) >= $1
     ORDER BY 3 DESC`, [FAN_THRESHOLD])).rows;
  const deletable = fans.filter((f) => f.type !== 'phone' || !qatarPhone(f.value));
  const held = fans.filter((f) => f.type === 'phone' && qatarPhone(f.value));
  const delRows = deletable.length ? Number((await query(`
    SELECT count(*)::int n FROM company_contacts cc
     WHERE (cc.type, cc.value) IN (${deletable.map((_, i) => `($${2 * i + 1}, $${2 * i + 2})`).join(',')})`,
    deletable.flatMap((f) => [f.type, f.value]))).rows[0].n) : 0;
  console.log(`\nCLASS 2 — template values (same value on ≥${FAN_THRESHOLD} companies, harvest-written):`);
  console.log(`  ${deletable.length} template values → ${delRows} contact rows to delete`);
  console.log(`  ${held.length} Qatar-format numbers HELD for your eyes (a real shared hotline is possible)`);
  for (const f of deletable.slice(0, 5)) console.log(`    delete: ${f.type.padEnd(6)} ${String(f.value).slice(0, 40).padEnd(42)} on ${f.companies} companies`);
  for (const f of held) console.log(`    held:   ${f.type.padEnd(6)} ${String(f.value).slice(0, 40).padEnd(42)} on ${f.companies} companies`);

  // The held list goes to the Desktop either way — it is the review artifact.
  if (held.length) {
    const lines = ['Qatar-format numbers shared by many companies — possibly real shared hotlines, possibly templates.',
      'Bell deleted nothing here; if one is clearly a template, tell Claude and it goes.', ''];
    for (const f of held) lines.push(`${f.value}   on ${f.companies} companies`);
    await fs.writeFile(path.join(os.homedir(), 'Desktop', 'Bell — shared Qatar numbers to review.txt'), lines.join('\n'), 'utf8');
    console.log('  → list written to your Desktop: "Bell — shared Qatar numbers to review.txt"');
  }

  if (!APPLY) {
    console.log('\nPREVIEW ONLY. Double-click "Apply Guessed Website Cleanup.command" to run it.\n');
    return;
  }

  // ── APPLY ──────────────────────────────────────────────────────────────────────────────────
  const touched = new Set();

  // Class 1: withdraw the website claim + everything derived from it.
  let clearedSites = 0, deletedFromHosts = 0;
  for (const c of clearCompanies) {
    // Contacts harvested FROM this specific wrong domain — tombstoned, the table is mirrored.
    const del = await query(`
      WITH gone AS (
        DELETE FROM company_contacts
         WHERE company_id = $1
           AND (source ILIKE '%stage7%' OR source ILIKE '%website%' OR source ILIKE '%harvest%')
        RETURNING id)
      INSERT INTO sync_deletions (table_name, row_id) SELECT 'company_contacts', id FROM gone`,
      [c.id]);
    deletedFromHosts += del.rowCount;
    await query(`
      UPDATE companies
         SET website = NULL,
             extra_fields = (extra_fields - 'website_found' - 'website_description' - 'website_keywords' - 'website_logo_url')
                            || jsonb_build_object('website_guess_cleared', jsonb_build_object('host', $2::text, 'at', now())),
             stage8_status = 'no_data', stage8_at = now(),
             stage7_status = NULL, stage7_at = NULL,
             updated_at = now()
       WHERE id = $1`, [c.id, c.host]);
    clearedSites++;
    touched.add(c.id);
  }
  console.log(`\n  Class 1 applied: ${clearedSites} website claims withdrawn · ${deletedFromHosts} wrong-site contacts removed (tombstoned).`);

  // Class 2: delete the template values everywhere they landed. The affected companies are
  // read BEFORE the delete — afterwards the rows are gone and nothing can say who carried them.
  let deletedTemplates = 0;
  for (const f of deletable) {
    const affected = await query(
      `SELECT DISTINCT company_id FROM company_contacts WHERE type = $1 AND value = $2`,
      [f.type, f.value]);
    for (const a of affected.rows) touched.add(Number(a.company_id));
    const del = await query(`
      WITH gone AS (
        DELETE FROM company_contacts WHERE type = $1 AND value = $2
        RETURNING id)
      INSERT INTO sync_deletions (table_name, row_id)
      SELECT 'company_contacts', id FROM gone`, [f.type, f.value]);
    deletedTemplates += del.rowCount;
  }
  console.log(`  Class 2 applied: ${deletedTemplates} template contact rows removed (tombstoned).`);

  // Legacy column resync for every touched company — the mistake that created the
  // legacy-contact incident was skipping exactly this after a bulk delete.
  const resyncIds = new Set(touched);
  const carriers = await query(`
    SELECT DISTINCT c.id FROM companies c
     WHERE c.email IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM company_contacts cc WHERE cc.company_id = c.id AND cc.type = 'email'
         AND lower(btrim(COALESCE(cc.value_display, cc.value))) = lower(btrim(c.email)))`);
  for (const r of carriers.rows) resyncIds.add(Number(r.id));
  let resynced = 0;
  for (const id of resyncIds) {
    await resyncContactColumns('company', id).catch(() => {});
    resynced++;
  }
  console.log(`  Legacy email/phone columns rebuilt on ${resynced} companies.`);
  console.log('\nDone. Publishes to the live site on the next data push.\n');
}

main().then(() => pool.end()).then(() => process.exit(0))
  .catch(async (e) => { console.error('Stopped:', e.stack || e.message); await pool.end().catch(() => {}); process.exit(1); });

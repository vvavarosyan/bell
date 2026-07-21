// Legacy contact repair — reconcile companies.email / companies.phone with the
// contacts table that is supposed to be the source of truth.
//
// WHY THIS EXISTS (2026-07-21)
// Bell has two places a company email can live: the `company_contacts` rows (real
// store, quality-gated) and the legacy `companies.email` / `companies.phone`
// columns (a mirror of the primary contact, still read by CSV export, CRM reveal
// and — until today — outreach targeting).
//
// Several cleanup paths delete contact rows in bulk. Those bypass deleteContact(),
// which is the only thing that kept the mirror honest. So when the wrong-website
// reversal correctly removed contacts harvested from a site that belonged to a
// DIFFERENT company, the wrong address stayed on the column. Anya Aviation
// Consultancy QFZ still carries the London handbag brand's wholesale@ address;
// Novo Trade QFZ carries a CV-builder SaaS's; Aero Logistics QFZ carries a US
// Atlanta phone number. 790 companies in total.
//
// The forward bug is fixed (every bulk delete now calls resyncContactColumns).
// This repairs the records that were already damaged, in three honest buckets:
//
//   PROMOTE  — the column holds a good address the contacts table simply never
//              got. Insert it properly, quality-gated, is_verified = false.
//   CLEAR    — the column holds an address Bell DELETED as belonging to someone
//              else. Null it, keeping the removed value in
//              extra_fields.legacy_contact_removed so nothing vanishes silently.
//   REPORT   — correct rejections (personal mailbox on another company's domain,
//              unnormalisable junk). Listed, never touched: whether to clear them
//              is Val's call, not this script's.
//
// Rule 2.1: nothing is guessed. An address is only promoted if it passes the SAME
// gate every other contact faces. Anything ambiguous stays in REPORT.
//
// Preview by default; writes only with --apply.

import { query } from '../db.js';
import { normalizeEmail, isJunkEmail, upsertContact } from '../lib/contacts.js';
import { rankCompanyEmails } from '../lib/dataquality.js';
import { classifyAddress } from '../outreach/address_rules.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';

const apply = process.argv.includes('--apply');
const trunc = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));
const emailDomain = (e) => String(e || '').split('@')[1]?.replace(/^www\./, '').toLowerCase() || '';
const hostOf = (u) => { try { return new URL(String(u).startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

// The exact fingerprint of a wrong-website reversal, from undoAutoApprovals():
// website cleared, stage7 markers cleared, candidate returned to the review queue.
// Scoped this tightly on purpose — never a broad "no contacts → wipe the column" sweep.
const REVERSED = `c.website IS NULL AND c.stage7_status IS NULL
                  AND EXISTS (SELECT 1 FROM website_candidates w WHERE w.company_id = c.id)`;

async function classify() {
  const rows = (await query(`
    SELECT c.id, c.name, c.website, c.email::text AS email, c.phone::text AS phone,
           (${REVERSED}) AS reversed,
           EXISTS (SELECT 1 FROM company_contacts k WHERE k.company_id=c.id AND k.type='email') AS has_email_row,
           EXISTS (SELECT 1 FROM company_contacts k WHERE k.company_id=c.id AND k.type='phone') AS has_phone_row,
           (SELECT string_agg(DISTINCT s.source, ', ') FROM company_sources s
             WHERE s.company_id = c.id AND c.email IS NOT NULL
               AND position(lower(c.email::text) in lower(s.raw_payload::text)) > 0) AS email_stated_by
      FROM companies c
     WHERE COALESCE(c.archived,false) = false
       AND ( (c.email IS NOT NULL AND btrim(c.email::text) <> '')
          OR (c.phone IS NOT NULL AND btrim(c.phone::text) <> '') )
     ORDER BY c.id`)).rows;

  const promote = [], clearEmail = [], clearPhone = [], report = [];
  for (const r of rows) {
    // --- email ---
    if (r.email && !r.has_email_row) {
      const norm = normalizeEmail(r.email);
      if (!norm || isJunkEmail(norm)) {
        report.push({ ...r, kind: 'email', value: r.email, why: 'cannot normalise / blocklisted' });
      } else if (r.email_stated_by && classifyAddress({ email: norm }).outcome === 'role_mailbox') {
        // BEST EVIDENCE FIRST: an official source payload Bell already holds states
        // this exact address for THIS company (QCCI, Tasmu, QSTP). That is a stated
        // fact, and it outranks the reversal fingerprint below — plenty of real Qatar
        // companies have a registry email and no website at all. Verified disjoint on
        // live data today (0 rows in both buckets), but ordered deliberately so it
        // stays correct as the data moves.
        promote.push({ ...r, kind: 'email', value: norm, why: 'stated by ' + r.email_stated_by });
      } else if (r.reversed) {
        clearEmail.push({ ...r, value: r.email, why: 'harvested from a website judged to be another company' });
      } else if (classifyAddress({ email: norm }).outcome !== 'role_mailbox') {
        // ONLY generic company inboxes (info@, sales@, tenders@) are promoted.
        // `named_person` is personal data — PDPPL Art 22 and Val's standing rule that
        // people data stays admin-locked. `unclassified` (a bare "haris@", "alwaab@")
        // is NOT promoted either: address_rules.js's own doctrine is that absence of
        // evidence it is a role mailbox is not evidence that it is one. These rows
        // feed outreach once promoted, so silence must not become permission.
        // (Field is `outcome`, not `tier` — reading `.tier` here silently disabled
        // this whole guard and put mohammed.alyami@vodafone.com in the promote list.)
        const c = classifyAddress({ email: norm }).outcome;
        report.push({ ...r, kind: 'email', value: r.email,
          why: c === 'named_person' ? 'named person — PDPPL, left untouched'
                                    : 'cannot confirm it is a company inbox' });
      } else if (!r.website || !hostOf(r.website)) {
        // NO WEBSITE = NOTHING TO CORROBORATE AGAINST. This is the trap that caught
        // the first version of this script: rankCompanyEmails only drops a foreign
        // address when it is GIVEN a site domain (`if (sd && r === 3) continue`), so
        // with no website every address sailed through and the promote list contained
        // press@gendigital.com for "Clean Globe Consultancy" and info@schoolmykids.com
        // for "Al Safe Water Heater". 396 of the 732 have no website. Rule 2.1: if the
        // source does not state the address is theirs, Bell does not claim it.
        // Deliberately NOT matched on shared name words either — that exact heuristic
        // is what set thousands of wrong websites in the first auto-approve pass.
        report.push({ ...r, kind: 'email', value: r.email, why: 'no website to corroborate the domain against' });
      } else if (emailDomain(norm) !== hostOf(r.website)) {
        report.push({ ...r, kind: 'email', value: r.email, why: 'domain does not match the company\'s own website' });
      } else if (!rankCompanyEmails([norm], hostOf(r.website)).length) {
        report.push({ ...r, kind: 'email', value: r.email, why: 'personal mailbox, refused by the quality gate' });
      } else {
        promote.push({ ...r, kind: 'email', value: norm });
      }
    }
    // --- phone ---
    if (r.phone && !r.has_phone_row && r.reversed) {
      clearPhone.push({ ...r, value: r.phone, why: 'harvested from a website judged to be another company' });
    }
  }
  return { promote, clearEmail, clearPhone, report, scanned: rows.length };
}

async function main() {
  console.log('');
  console.log('BELL — LEGACY CONTACT REPAIR' + (apply ? '   (APPLYING)' : '   (PREVIEW — nothing is written)'));
  console.log('==========================================================');
  console.log('');

  const { promote, clearEmail, clearPhone, report, scanned } = await classify();
  console.log(`Scanned ${scanned.toLocaleString()} companies holding a legacy email or phone.`);
  console.log('');

  console.log(`1. PROMOTE into the contacts table — ${promote.length} email(s)`);
  console.log('   Good addresses the contacts table never received. They face the same');
  console.log('   quality gate as any other contact and are stored UNVERIFIED.');
  for (const p of promote.slice(0, 12)) console.log(`     #${p.id} ${trunc(p.name, 30).padEnd(32)} ${String(p.value).padEnd(34)} ${p.why || 'own website domain'}`);
  if (promote.length > 12) console.log(`     …and ${promote.length - 12} more`);
  console.log('');

  console.log(`2. CLEAR the wrong value — ${clearEmail.length} email(s) + ${clearPhone.length} phone(s)`);
  console.log('   Bell already DELETED these contacts as belonging to a different company;');
  console.log('   only the legacy column kept them. Outreach, CSV export and CRM read that');
  console.log('   column, so today they are still reachable. The removed value is kept in');
  console.log('   extra_fields.legacy_contact_removed — nothing is destroyed silently.');
  for (const c of [...clearEmail, ...clearPhone].slice(0, 12)) console.log(`     #${c.id} ${trunc(c.name, 34).padEnd(36)} ${c.value}`);
  const clearTotal = clearEmail.length + clearPhone.length;
  if (clearTotal > 12) console.log(`     …and ${clearTotal - 12} more`);
  console.log('');

  console.log(`3. REPORT ONLY — ${report.length} left exactly as they are`);
  console.log('   Correct rejections. Not touched: clearing them is a judgment call for Val.');
  const byWhy = {};
  for (const r of report) byWhy[r.why] = (byWhy[r.why] || 0) + 1;
  for (const [why, n] of Object.entries(byWhy)) console.log(`     ${String(n).padStart(5)}  ${why}`);
  console.log('');

  if (!apply) {
    console.log('PREVIEW ONLY — nothing was written.');
    console.log('Double-click "Apply Legacy Contact Repair.command" to make these changes.');
    console.log('');
    return;
  }

  let promoted = 0, cleared = 0, failed = 0;
  for (const p of promote) {
    try {
      const r = await upsertContact('company', p.id, {
        type: 'email', value: p.value, source: 'backfill-legacy',
        source_label: p.why || 'legacy companies.email column', is_verified: false,
      });
      if (r) promoted++;
    } catch { failed++; }
  }
  console.log(`Promoted ${promoted} email(s) into company_contacts` + (failed ? ` · ${failed} refused by the quality gate` : ''));

  for (const [list, col] of [[clearEmail, 'email'], [clearPhone, 'phone']]) {
    for (const c of list) {
      // Only clear if the column STILL holds the exact value we judged — never
      // clobber something a later enrichment has since corrected.
      const up = await query(`
        UPDATE companies
           SET ${col} = NULL,
               extra_fields = jsonb_set(COALESCE(extra_fields,'{}'::jsonb), '{legacy_contact_removed}',
                 COALESCE(extra_fields->'legacy_contact_removed','[]'::jsonb) ||
                 jsonb_build_object('type', $3::text, 'value', $2::text,
                                    'reason', 'wrong-website reversal residue', 'at', now()::text), true),
               updated_at = now()
         WHERE id = $1 AND ${col}::text = $2::text`, [c.id, c.value, col]).catch(() => ({ rowCount: 0 }));
      cleared += up.rowCount || 0;
    }
  }
  console.log(`Cleared ${cleared} wrong value(s) off the legacy columns.`);

  const touched = [...new Set([...promote, ...clearEmail, ...clearPhone].map((x) => x.id))];
  for (const id of touched) await recomputeBellScoreForCompany(id).catch(() => {});
  console.log(`Rescored ${touched.length} company record(s).`);
  console.log('');
  console.log('Done — changes written. They publish to the live site on the next data push.');
  console.log('');
}

main().then(() => process.exit(0)).catch((e) => { console.error('Stopped:', e.stack || e.message); process.exit(1); });

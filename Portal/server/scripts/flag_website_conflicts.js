// Flag companies whose WEBSITE provably belongs to a DIFFERENT company (Val 2026-
// 07-13, "Integrated Technical Services enriched with Arabian MEP's details").
//
// Val's choice: FLAG FOR REVIEW + HIDE FROM CUSTOMERS (keep in admin). So on apply
// we QUARANTINE the suspect web presence into extra_fields.website_conflict and
// blank the live customer-facing fields (website, matching email, and the contacts
// harvested from that domain), and set needs_review so an admin can confirm or
// restore. Nothing is deleted — every original value is preserved in extra_fields.
//
// SAFETY: DRY-RUN by default. Add --apply to write. Idempotent (skips already-
// flagged). Changes sync to prod on the next mirror push.
//   Preview:  node server/scripts/flag_website_conflicts.js
//   Apply:    node server/scripts/flag_website_conflicts.js --apply

import { query } from '../db.js';
import { findWebsiteConflicts, hostSlug } from '../enrichment/local/website_conflict.js';

const apply = process.argv.includes('--apply');
const trunc = (s, n = 34) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };

(async () => {
  console.log(`Bell — flag wrong-company websites  (${apply ? 'APPLY — writing' : 'DRY-RUN — preview only'})\n`);
  const rows = (await query(`SELECT id, name, website FROM companies WHERE coalesce(archived,false)=false AND is_active=true`)).rows;
  const conflicts = findWebsiteConflicts(rows).filter((c) => c.website);
  console.log(`Websites that provably belong to a DIFFERENT company: ${conflicts.length}\n`);
  for (const c of conflicts.slice(0, 60)) console.log(`  ${trunc(c.name).padEnd(36)} ${trunc(c.website, 34).padEnd(36)} → belongs to "${trunc(c.belongs_to, 30)}"`);
  if (conflicts.length > 60) console.log(`  … and ${conflicts.length - 60} more`);

  if (!apply) { console.log('\nPreview only. Review the list, then run "Apply Website-Conflict Fix.command".'); process.exit(0); }

  let done = 0;
  for (const c of conflicts) {
    try {
      // Full current state to preserve.
      const cur = (await query(`SELECT website, email, extra_fields FROM companies WHERE id=$1`, [c.id])).rows[0];
      if (!cur || (cur.extra_fields && cur.extra_fields.website_conflict)) continue;   // already flagged
      const domain = c.domain;
      // Contacts harvested from the suspect domain → quarantine (hide) them.
      const con = (await query(`SELECT id, type, value, value_display, source, source_url FROM company_contacts WHERE company_id=$1`, [c.id])).rows;
      const fromDomain = con.filter((k) => hostSlug(k.source_url || '') === domain || (k.type === 'email' && String(k.value).toLowerCase().endsWith('@' + c.website.replace(/^https?:\/\/(www\.)?/, '').split('/')[0].replace(/^www\./, ''))));
      const emailFromDomain = cur.email && hostSlug('http://' + String(cur.email).split('@')[1]) === domain;
      const quarantine = {
        belongs_to: c.belongs_to, belongs_to_id: c.belongs_to_id, domain,
        website: cur.website, email: emailFromDomain ? cur.email : null,
        contacts: fromDomain.map((k) => ({ id: k.id, type: k.type, value: k.value, source: k.source })),
        flagged_at: new Date().toISOString(),
      };
      await query(
        `UPDATE companies SET website = NULL,
           email = CASE WHEN $2 THEN NULL ELSE email END,
           needs_review = true,
           review_reason = $3,
           extra_fields = coalesce(extra_fields,'{}'::jsonb) || jsonb_build_object('website_conflict', $4::jsonb),
           updated_at = now()
         WHERE id = $1`,
        [c.id, emailFromDomain, `Website may belong to "${c.belongs_to}" — hidden from customers pending review`, JSON.stringify(quarantine)]);
      if (fromDomain.length) {
        await query(
          `UPDATE company_contacts SET extra_fields = coalesce(extra_fields,'{}'::jsonb) || '{"hidden_conflict":true}'::jsonb, updated_at = now()
            WHERE id = ANY($1::bigint[])`, [fromDomain.map((k) => k.id)]);
      }
      done++;
    } catch (e) { console.log(`  [err] co#${c.id}: ${e.message}`); }
  }
  console.log(`\n→ flagged ${done} companies (website hidden from customers, kept in admin, needs_review set). Publishes on the next data push.`);
  process.exit(0);
})().catch((e) => { console.error('Stopped:', e.message); process.exit(1); });

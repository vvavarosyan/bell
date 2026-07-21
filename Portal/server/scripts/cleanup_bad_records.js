// Clean two classes of bad records + report (Val 2026-07-13):
//   ① placeholder "people" from blank registry fields ("Required - OWNER NAME",
//      "Required - CONTACT PERSON", "OWNER NAME") → archive (hidden everywhere;
//      reversible; syncs to prod).
//   ② Cloudflare-obfuscated "emails" (/cdn-cgi/l/email-protection#<hex>) stored as
//      a real email → DECODE back to the real address where possible, else clear.
//
// SAFETY: DRY-RUN by default (prints what it WOULD do). Add --apply to write.
// Idempotent. Every change syncs to prod on the next mirror push.
//   Preview:  node server/scripts/cleanup_bad_records.js
//   Apply:    node server/scripts/cleanup_bad_records.js --apply

import { query } from '../db.js';
import { isPlaceholderName, decodeCloudflareEmail } from '../lib/dataquality.js';
import { resyncContactColumns } from '../lib/contacts.js';

const apply = process.argv.includes('--apply');
const trunc = (s, n = 40) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };

(async () => {
  console.log(`Bell — clean bad records  (${apply ? 'APPLY — writing' : 'DRY-RUN — preview only'})\n`);

  // ── ① placeholder people ────────────────────────────────────────────────
  const cand = (await query(`
    SELECT id, full_name FROM people
     WHERE COALESCE(archived,false)=false AND (
       full_name ILIKE '%required%' OR full_name ILIKE '%owner name%' OR full_name ILIKE '%contact person%'
       OR full_name ILIKE '%company name%' OR full_name ILIKE '%not available%' OR full_name ILIKE '%tbd%'
       OR full_name ILIKE '%your name%' OR full_name ILIKE '%first name%' OR full_name ILIKE '%last name%'
       OR full_name ILIKE '%full name%' OR full_name ILIKE '%team member%' OR full_name ILIKE '%lorem ipsum%'
       OR full_name ILIKE '%john doe%' OR full_name ILIKE '%jane doe%' OR full_name ILIKE '%sample %'
       OR full_name ILIKE '%to be updated%' OR full_name ILIKE '%to be advised%')`)).rows;
  const junk = cand.filter((p) => isPlaceholderName(p.full_name));
  console.log(`① Placeholder people to archive: ${junk.length}`);
  const byName = {};
  for (const p of junk) byName[p.full_name] = (byName[p.full_name] || 0) + 1;
  for (const [n, c] of Object.entries(byName).sort((a, b) => b[1] - a[1]).slice(0, 20)) console.log(`     ${String(c).padStart(3)} × "${trunc(n, 44)}"`);
  if (apply && junk.length) {
    const ids = junk.map((p) => p.id);
    const r = await query(
      `UPDATE people SET archived=true,
         extra_fields = coalesce(extra_fields,'{}'::jsonb) || jsonb_build_object('archive_reason','placeholder_name'),
         updated_at=now()
       WHERE id = ANY($1::bigint[])`, [ids]);
    console.log(`   → archived ${r.rowCount} people.`);
  }

  // ── ② Cloudflare-obfuscated emails ──────────────────────────────────────
  console.log('\n② Cloudflare-obfuscated emails (/cdn-cgi/l/email-protection):');
  const cc = (await query(`SELECT id, company_id, value FROM company_contacts WHERE type='email' AND (value ILIKE '%cdn-cgi%' OR value ILIKE '%email-protection%')`)).rows;
  const co = (await query(`SELECT id, name, email FROM companies WHERE email ILIKE '%cdn-cgi%' OR email ILIKE '%email-protection%'`)).rows;
  const pc = (await query(`SELECT id, person_id, value FROM person_contacts WHERE type='email' AND (value ILIKE '%cdn-cgi%' OR value ILIKE '%email-protection%')`)).rows;
  console.log(`   company_contacts: ${cc.length} · companies.email: ${co.length} · person_contacts: ${pc.length}`);
  const showFix = (label, id, raw) => { const dec = decodeCloudflareEmail(raw); console.log(`     ${label} #${id}: ${dec ? '→ ' + dec : 'undecodable → clear'}`); return dec; };

  for (const r of cc) { const dec = showFix('company_contact', r.id, r.value);
    if (apply) {
      if (dec) { try { await query(`UPDATE company_contacts SET value=$2, value_display=$2, updated_at=now() WHERE id=$1`, [r.id, dec]); }
                 catch { await query(`DELETE FROM company_contacts WHERE id=$1`, [r.id]); } }   // decoded collides with an existing contact → drop the junk row
      else await query(`DELETE FROM company_contacts WHERE id=$1`, [r.id]); } }
  for (const r of co) { const dec = showFix('company.email ' + trunc(r.name, 24), r.id, r.email);
    if (apply) await query(`UPDATE companies SET email=$2, updated_at=now() WHERE id=$1`, [r.id, dec || null]); }
  for (const r of pc) { const dec = showFix('person_contact', r.id, r.value);
    if (apply) { if (dec) { try { await query(`UPDATE person_contacts SET value=$2, value_display=$2, updated_at=now() WHERE id=$1`, [r.id, dec]); } catch { await query(`DELETE FROM person_contacts WHERE id=$1`, [r.id]); } }
                 else await query(`DELETE FROM person_contacts WHERE id=$1`, [r.id]); } }

  // Bulk deletes above bypass deleteContact(); re-derive the legacy columns so a
  // removed junk address cannot survive on companies.email/phone.
  if (apply) {
    for (const id of [...new Set(cc.map((r) => r.company_id).filter(Boolean))]) {
      await resyncContactColumns('company', id).catch(() => {});
    }
  }

  console.log(`\n${apply ? 'Done — changes written. They publish to the live site on the next data push.' : 'Preview only. Re-run with --apply (via "Apply Bad-Record Cleanup.command") to write.'}`);
  process.exit(0);
})().catch((e) => { console.error('Stopped:', e.message); process.exit(1); });

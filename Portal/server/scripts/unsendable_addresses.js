// The addresses Bell holds that are not addresses.
//
// Val, 2026-08-10, after the CRM refused to send: "Regarding the 456 broken addresses — yes
// please build that."
//
// Measured on the engine box: 220 of 19,449 `company_contacts` email rows and 236 of 12,343
// legacy `companies.email` values are strings a mail provider rejects outright. They are real
// harvested data, not corruption — this is what Qatar company websites and registry forms
// actually contain:
//
//     "LILAC.FASHION @HOTMAIL ,COM"   "mmaa@ mmaa.gov.qa"       "amusaid@yahoo"
//     "albateel@qatar.net .qa"        "EMARAT BLOCK@HOTMAIL.COM"  "info@buildimgsga0com"
//
// ⚠️ NOTHING HERE REPAIRS AN ADDRESS. "LILAC.FASHION @HOTMAIL ,COM" obviously "means"
// lilac.fashion@hotmail.com, and every instinct says just write that. It would be a guess about a
// real person's mailbox — and Rule 2.1 does not bend because a guess feels safe. Bell has been
// wrong about exactly this shape before: the [[legacy-contact-column]] incident put another
// company's mailbox on 297 outreach targets, and each of those looked reasonable too.
//
// So: PREVIEW lists them for a human to fix. APPLY only marks them, using the vocabulary that
// already exists for this (migration 061's `email_status = 'invalid'`), so they stop being
// treated as good data. The value itself is never changed and never deleted — it is the evidence
// of what a source stated, and Val may want to correct it by hand from the company's website.
//
//   node scripts/unsendable_addresses.js            # report only
//   node scripts/unsendable_addresses.js --apply    # mark them invalid (reversible)

import { query, pool } from '../db.js';
import { isSendableAddress } from '../lib/email.js';
import { writeFile } from 'node:fs/promises';
import os from 'os';
import path from 'path';

const APPLY = process.argv.includes('--apply');
const n = (v) => Number(v || 0).toLocaleString();

/**
 * Every stored email value, with enough context to correct it.
 *
 * Reads ALL of them and filters in JavaScript with the SHIPPED isSendableAddress, rather than
 * reimplementing the rule in SQL. A second copy of that rule is how the JS and SQL legal-form
 * lists drifted apart in migration 113 and made 2,188 companies silently unmatchable.
 */
async function collect() {
  const rows = [];

  const cc = await query(`
    SELECT cc.id, cc.company_id AS entity_id, 'company' AS kind,
           COALESCE(cc.value_display, cc.value) AS value,
           cc.source, cc.is_primary, cc.email_status,
           c.name AS entity_name, c.website, c.city
      FROM company_contacts cc
      JOIN companies c ON c.id = cc.company_id
     WHERE cc.type = 'email'`);
  for (const r of cc.rows) if (!isSendableAddress(r.value)) rows.push({ ...r, table: 'company_contacts' });

  const pc = await query(`
    SELECT pc.id, pc.person_id AS entity_id, 'person' AS kind,
           COALESCE(pc.value_display, pc.value) AS value,
           pc.source, pc.is_primary, pc.email_status,
           p.full_name AS entity_name, NULL AS website, NULL AS city
      FROM person_contacts pc
      JOIN people p ON p.id = pc.person_id
     WHERE pc.type = 'email'`);
  for (const r of pc.rows) if (!isSendableAddress(r.value)) rows.push({ ...r, table: 'person_contacts' });

  // The legacy mirror column. Reported separately because correcting it is a different action —
  // and because it is the column the [[legacy-contact-column]] incident was about.
  const legacy = await query(`
    SELECT c.id AS entity_id, 'company' AS kind, c.email AS value, NULL AS source,
           NULL::boolean AS is_primary, NULL AS email_status,
           c.name AS entity_name, c.website, c.city
      FROM companies c
     WHERE COALESCE(c.archived,false) = false AND c.email IS NOT NULL AND btrim(c.email) <> ''`);
  for (const r of legacy.rows) if (!isSendableAddress(r.value)) rows.push({ ...r, id: null, table: 'companies.email' });

  return rows;
}

/** Does this company have a DIFFERENT address that IS usable? Decides whether it is reachable. */
async function usableElsewhere(rows) {
  const ids = [...new Set(rows.filter((r) => r.kind === 'company').map((r) => Number(r.entity_id)))];
  if (!ids.length) return new Map();
  const r = await query(
    `SELECT company_id, COALESCE(value_display, value) AS v FROM company_contacts
      WHERE type='email' AND company_id = ANY($1::bigint[])`, [ids]);
  const good = new Map();
  for (const x of r.rows) {
    if (!isSendableAddress(x.v)) continue;
    const k = Number(x.company_id);
    if (!good.has(k)) good.set(k, []);
    good.get(k).push(x.v);
  }
  return good;
}

(async () => {
  console.log('');
  console.log('Addresses Bell holds that a mail provider will reject');
  console.log('=====================================================');
  console.log(APPLY ? 'MODE: APPLY — they will be marked invalid. Values are NOT changed or deleted.'
                    : 'MODE: report only (add --apply to mark them).');
  console.log('');

  const rows = await collect();
  if (!rows.length) {
    console.log('  Every stored email address is well-formed. Nothing to do.');
    console.log('');
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(0);
  }

  const good = await usableElsewhere(rows);
  const byTable = rows.reduce((a, r) => ((a[r.table] = (a[r.table] || 0) + 1), a), {});
  for (const [t, c] of Object.entries(byTable)) console.log(`  ${t.padEnd(20)} ${String(n(c)).padStart(6)} unusable`);

  const reachable = rows.filter((r) => r.kind === 'company' && good.has(Number(r.entity_id))).length;
  console.log('');
  console.log(`  ${n(rows.length)} in total.`);
  console.log(`  ${n(reachable)} belong to a company Bell can still reach at another address — fixing these adds a way in, it does not restore a lost one.`);
  console.log(`  ${n(rows.length - reachable)} are the only address on file, so correcting one makes that company contactable.`);
  console.log('');

  // The report is the deliverable: Val asked for a list he can correct from.
  const lines = [
    'Addresses Bell holds that a mail provider will reject',
    '=====================================================',
    'Generated by Preview Unsendable Addresses.command',
    '',
    'HOW TO USE THIS: open the company on the local Portal, find the email field, and replace the',
    'broken value with the correct one from the company\'s own website. Bell deliberately does NOT',
    'guess the correction — "LILAC.FASHION @HOTMAIL ,COM" probably means lilac.fashion@hotmail.com,',
    'but "probably" is not something Bell is allowed to write into a contact record.',
    '',
    'The "also reachable at" line means Bell already holds a WORKING address for that company, so',
    'that one is lower priority. A company with no other address is unreachable until it is fixed.',
    '',
  ];
  // ONE ENTRY PER PROBLEM, not per row. The legacy companies.email column is a MIRROR of the
  // primary contact, so almost every bad value appears twice — 455 rows are really ~235 things to
  // fix, and listing each twice is how a fixable list becomes one nobody works through.
  const grouped = new Map();
  for (const r of rows) {
    const key = `${r.kind}:${r.entity_id}:${String(r.value).trim().toLowerCase()}`;
    if (!grouped.has(key)) grouped.set(key, { ...r, tables: new Set(), sources: new Set() });
    const g = grouped.get(key);
    g.tables.add(r.table);
    if (r.source) g.sources.add(r.source);
    if (r.is_primary) g.is_primary = true;
  }
  const sorted = [...grouped.values()].sort((a, b) => {
    const ag = a.kind === 'company' && good.has(Number(a.entity_id));
    const bg = b.kind === 'company' && good.has(Number(b.entity_id));
    if (ag !== bg) return ag ? 1 : -1;                       // unreachable companies first
    return String(a.entity_name || '').localeCompare(String(b.entity_name || ''));
  });
  lines.push(`${sorted.length} addresses to correct, across ${new Set(sorted.map((r) => r.kind + r.entity_id)).size} records.`);
  lines.push('Companies Bell cannot reach any other way are listed FIRST.');
  lines.push('');
  for (const r of sorted) {
    const alt = r.kind === 'company' ? good.get(Number(r.entity_id)) : null;
    lines.push(`${r.entity_name || '(no name)'}   [${r.kind} #${r.entity_id}]`);
    lines.push(`    broken value : ${JSON.stringify(r.value)}`);
    lines.push(`    stored in    : ${[...r.tables].join(' + ')}${r.sources.size ? '  (stated by ' + [...r.sources].join(', ') + ')' : ''}${r.is_primary ? '  · PRIMARY' : ''}`);
    if (r.website) lines.push(`    website      : ${r.website}`);
    lines.push(alt?.length ? `    also reachable at : ${alt.slice(0, 3).join(', ')}`
                           : '    ⚠ NO other usable address — this company cannot be emailed until this is fixed.');
    lines.push('');
  }
  const out = path.join(os.homedir(), 'Desktop', 'Bell — broken email addresses.txt');
  await writeFile(out, lines.join('\n'), 'utf8');
  console.log(`  Full list written to your Desktop:  ${path.basename(out)}`);
  console.log('');
  console.log(`  ${n(sorted.length)} addresses to correct once the legacy mirror is folded in with its contact row.`);
  console.log('');
  console.log('  The first few — these companies have no other way in:');
  for (const r of sorted.slice(0, 6)) {
    console.log(`    ${String(r.entity_name || '').slice(0, 36).padEnd(38)} ${JSON.stringify(r.value)}`);
  }
  console.log('');

  if (!APPLY) {
    console.log('  Nothing was changed. Run "Apply Unsendable Address Marking.command" to mark these');
    console.log('  as invalid so Bell stops treating them as good addresses. The values stay exactly');
    console.log('  as they are, so you can still correct them afterwards.');
    console.log('');
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(0);
  }

  // APPLY — mark only. `invalid` is migration 061's existing vocabulary for precisely this, and
  // is_verified=false because a value that cannot be sent was never verified in any useful sense.
  // The address itself is untouched: it is the evidence of what a source stated, and Val corrects
  // it by hand from the company's own website.
  let marked = 0;
  for (const t of ['company_contacts', 'person_contacts']) {
    const ids = rows.filter((r) => r.table === t && r.id).map((r) => Number(r.id));
    if (!ids.length) continue;
    const r = await query(
      `UPDATE ${t} SET email_status = 'invalid', is_verified = false, last_verified_at = now(),
                       updated_at = now()
        WHERE id = ANY($1::bigint[]) AND COALESCE(email_status,'') <> 'invalid'
        RETURNING id`, [ids]);
    console.log(`  ${t}: ${n(r.rowCount)} marked invalid.`);
    marked += r.rowCount;
  }
  // The legacy column has no status field to set, so it is only ever REPORTED here. Clearing it
  // would be a deletion, and deletions on that column are what the legacy-contact incident was
  // made of — resyncContactColumns() rebuilds it from company_contacts anyway once the real
  // contact row is corrected.
  const legacyCount = rows.filter((r) => r.table === 'companies.email').length;
  if (legacyCount) {
    console.log(`  companies.email: ${n(legacyCount)} reported but NOT touched — that column is rebuilt`);
    console.log('                   from company_contacts, so correcting the contact fixes it too.');
  }
  console.log('');
  console.log(`  ${n(marked)} contact row(s) marked. Nothing was deleted and no address was rewritten.`);
  console.log('  Bell will stop offering these as recipients; the list on your Desktop is still valid.');
  console.log('');
  try { await pool.end(); } catch { /* ignore */ }
  process.exit(0);
})();

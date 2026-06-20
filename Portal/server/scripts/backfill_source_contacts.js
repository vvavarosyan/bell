// ============================================================================
// Source-directory contact fields → proper records  (existing data)
// ----------------------------------------------------------------------------
// Directory listings (QCCI) carry contact data as loose extra_fields text:
//   • qcci_fax / qcci_mobile      → should be real PHONE contacts (tagged Fax / Mobile)
//   • qcci_contact_person         → should be a PERSON linked to the company
//   • qcci_owner_name             → should be a PERSON (Owner) linked to the company
// This converts them into proper rows so they show in the Contacts list (with a
// Fax/Mobile tag, like the Primary tag) and the People tab (with a position) —
// instead of dangling as text in the company detail.
//
// SAFETY
//   • DRY-RUN by default — prints what it WOULD create. Add --apply to write.
//   • Idempotent: a phone upsert won't duplicate; a person is only created when
//     no person of that name is already linked to the company.
//   • Only valid phone numbers become phone contacts (others skipped).
//   • New rows sync to production on the next mirror push.
//
// USAGE (from the Portal directory)
//   node server/scripts/backfill_source_contacts.js            # preview
//   node server/scripts/backfill_source_contacts.js --apply    # write
//   node server/scripts/backfill_source_contacts.js --limit 500
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizePhone } from '../lib/dataquality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH = 500;

// extra_fields key → phone tag
const PHONE_FIELDS = [['qcci_fax', 'Fax'], ['qcci_mobile', 'Mobile']];
// extra_fields key → [role title, seniority_level, org_chart_level]
const PERSON_FIELDS = [
  ['qcci_contact_person', 'Contact Person', null, null],
  ['qcci_owner_name', 'Owner', 'owner', 1],
];

function argInt(flag, dflt) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return dflt;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : dflt;
}
const trunc = (s, n = 46) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };

async function run() {
  const { query, withTransaction } = await import('../db.js');
  const { upsertContact } = await import('../lib/contacts.js');
  const apply = process.argv.includes('--apply');
  const limit = argInt('--limit', null);

  let lastId = 0, scanned = 0, processed = 0;
  const R = { phones: 0, phonesSkipped: 0, people: 0, errors: 0, samples: [], errorSamples: [] };

  for (;;) {
    const cos = await query(
      `SELECT id, name, extra_fields FROM companies
        WHERE archived = false AND id > $1
          AND (extra_fields ?| array['qcci_fax','qcci_mobile','qcci_contact_person','qcci_owner_name'])
        ORDER BY id LIMIT $2`, [lastId, BATCH]);
    if (!cos.rows.length) break;
    lastId = cos.rows[cos.rows.length - 1].id;

    for (const c of cos.rows) {
      scanned++;
      const x = c.extra_fields || {};

      for (const [key, tag] of PHONE_FIELDS) {
        const raw = x[key]; if (!raw) continue;
        const norm = normalizePhone(raw);
        if (!norm) { R.phonesSkipped++; continue; }
        R.phones++;
        if (R.samples.length < 30) R.samples.push(`${tag.padEnd(7)} ${norm.display.padEnd(18)} ${trunc(c.name)}`);
        if (apply) {
          try { await upsertContact('company', c.id, { type: 'phone', value: norm.e164, value_display: norm.display, source: 'qcci-directory', source_label: tag }); }
          catch (e) { R.errors++; if (R.errorSamples.length < 20) R.errorSamples.push(`phone co#${c.id}: ${e.message}`); }
        }
      }

      for (const [key, title, seniority, orgLevel] of PERSON_FIELDS) {
        const name = String(x[key] || '').trim();
        if (!name || !/[a-z]/i.test(name) || name.length < 3) continue;
        R.people++;
        if (R.samples.length < 30) R.samples.push(`${title.padEnd(7)} ${trunc(name, 26).padEnd(26)} ${trunc(c.name)}`);
        if (apply) {
          try {
            await withTransaction(async (client) => {
              const ex = await client.query(
                `SELECT 1 FROM person_companies pc JOIN people p ON p.id = pc.person_id
                  WHERE pc.company_id = $1 AND lower(p.full_name) = lower($2) LIMIT 1`, [c.id, name]);
              if (ex.rows.length) return;
              const parts = name.split(/\s+/);
              const pr = await client.query(
                `INSERT INTO people (full_name, first_name, last_name, headline, country, extra_fields)
                 VALUES ($1,$2,$3,$4,'Qatar',$5::jsonb) RETURNING id`,
                [name, parts[0] || null, parts.length > 1 ? parts.slice(1).join(' ') : null, title,
                 JSON.stringify({ source: 'qcci-directory', via: key })]);
              await client.query(
                `INSERT INTO person_companies (person_id, company_id, title, seniority_level, org_chart_level, is_current, source_stage, raw_payload)
                 VALUES ($1,$2,$3,$4,$5,true,10,$6::jsonb)`,
                [pr.rows[0].id, c.id, title, seniority, orgLevel, JSON.stringify({ source: 'qcci-directory' })]);
            });
          } catch (e) { R.errors++; if (R.errorSamples.length < 20) R.errorSamples.push(`person co#${c.id}: ${e.message}`); }
        }
      }

      processed++;
      if (limit && processed >= limit) break;
    }
    if (limit && processed >= limit) break;
  }

  report(apply, scanned, R);
}

function report(apply, scanned, R) {
  const L = [];
  L.push('='.repeat(64));
  L.push(`  BELL SOURCE-CONTACTS CONVERSION — ${apply ? 'APPLIED' : 'DRY-RUN'}`);
  L.push(`  ${new Date().toISOString()}`);
  L.push('='.repeat(64));
  L.push('');
  L.push(`Companies with directory contact fields scanned: ${scanned}`);
  L.push(`  Phone contacts (Fax/Mobile) ${apply ? 'created' : 'to create'}: ${R.phones}  (skipped ${R.phonesSkipped} invalid)`);
  L.push(`  People (Contact Person / Owner) ${apply ? 'created' : 'to create'}: ${R.people}  (dry-run counts before dedup)`);
  if (R.errors) L.push(`  ⚠ Errors (skipped, isolated): ${R.errors}`);
  L.push('');
  if (R.samples.length) { L.push('Samples:'); for (const s of R.samples) L.push('  · ' + s); L.push(''); }
  if (R.errorSamples.length) { L.push('Errors:'); for (const s of R.errorSamples) L.push('  · ' + s); L.push(''); }
  L.push(apply ? 'Applied. Run a sync push so the new contacts + people mirror to production.'
               : 'No changes written. Re-run with --apply to create these.');
  L.push('='.repeat(64));
  const text = L.join('\n');
  console.log('\n' + text + '\n');
  try {
    const out = path.join(__dirname, '..', '..', `Directory-Contacts-${apply ? 'APPLIED' : 'PREVIEW'}.txt`);
    fs.writeFileSync(out, text);
    console.log('Report saved to: ' + out);
  } catch (e) { console.log('(could not save report: ' + e.message + ')'); }
}

const isMain = process.argv[1] && process.argv[1].endsWith('backfill_source_contacts.js');
if (isMain) run().then(() => process.exit(0)).catch((e) => { console.error('failed:', e); process.exit(1); });

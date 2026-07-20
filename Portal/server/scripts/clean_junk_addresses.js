// Junk-address cleanup — Preview (default) / Apply (--apply). Val 2026-07-20.
//
// ~245 companies have an "address" that is actually scraped page junk — copyright
// footers, "Since 1999" taglines, "Please enter a valid Qatar mobile number…"
// form text, "#1 Web Design Company", first-person marketing blurbs. Rule 2.1: a
// false address is worse than a missing one, so we NULL them.
//
// Two tiers (adversarially verified — the tightened structural guard keeps 2 real
// addresses that a naive version would have destroyed, e.g. "24th South Street"):
//   AUTO-NULL  — junk with NO real address content (≈236 rows). Apply nulls these.
//   REVIEW     — junk that ALSO embeds a real PO Box / street / floor / office
//                (≈9 rows). Left untouched; listed so Val can fix them by hand.
//
// The forward guard (extract.js guessAddress now delegates to the guarded
// guessAddresses; dataquality.isJunkAddress on contributed values) stops NEW junk
// from being stored — this cleans the historical rows. Apply pushes to prod itself.

import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../db.js';

const APPLY = process.argv.includes('--apply');
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT = join(__dirname, '..', '..', '..', 'Junk Addresses — Preview.tsv');

// Junk detector — prose / marketing / copyright / form-validation / SEO-title
// text. No backslashes here, so no JS-string escaping traps.
const DETECTOR = `btrim(coalesce(address,'')) <> '' AND (
     lower(address) ~ '(copyright|all rights reserved|rights reserved|&copy;)'
  OR address ~ '©'
  OR lower(address) ~ '(designed|developed|powered|hosted|created|built|website) by'
  OR lower(address) ~ 'please enter|must start with|enter a valid|valid qatar mobile| is required'
  OR lower(address) ~ 'since [0-9]{4}'
  OR lower(address) ~ 'established (in|since)|was established|founded (in|since)|founded in'
  OR lower(address) ~ 'welcome to |we are |we offer|we provide|we focus|our aim|our mission|our vision|our company|to be recognized|has been engaged|operates as|operates through'
  OR lower(address) ~ 'based in doha|based in qatar'
  OR lower(address) ~ 'shop online|read more|learn more|click here|view more'
  OR address ~ '#1 '
  OR lower(address) ~ 'made in qatar|home of luxury|fashion & beauty|beauty & makeup|reservation system|website design|web design'
)`;

// Real-address markers — if a junk row ALSO has one of these, it embeds a genuine
// address, so it goes to REVIEW instead of auto-null. Backslashes are DOUBLED
// because this is a JS string (\\s -> \s reaches Postgres).
const STRUCTURAL = `(
     address ~* 'p\\.?\\s?o\\.?\\s?box'
  OR address ~* 'zone\\s*(no\\.?\\s*)?[0-9]'
  OR address ~* '(street|road|st|rd)\\s*(no\\.?\\s*)?[0-9]'
  OR address ~* '[0-9]+\\s*(st|nd|rd|th)?\\s+[a-z]*\\s*(street|road|avenue)'
  OR address ~* 'building\\s*(no\\.?\\s*)?[0-9]'
  OR address ~* 'floor\\s*(no\\.?\\s*)?[0-9]'
  OR address ~* 'office\\s*(no\\.?\\s*)?[0-9]'
  OR address ~* 'located (in|at)'
)`;

const AUTO_WHERE   = `(${DETECTOR}) AND NOT ${STRUCTURAL}`;
const REVIEW_WHERE = `(${DETECTOR}) AND ${STRUCTURAL}`;

async function main() {
  const auto   = (await query(`SELECT id, name, address FROM companies WHERE ${AUTO_WHERE} ORDER BY id`)).rows;
  const review = (await query(`SELECT id, name, address FROM companies WHERE ${REVIEW_WHERE} ORDER BY id`)).rows;

  console.log('');
  console.log('JUNK ADDRESS CLEANUP — ' + (APPLY ? 'APPLY' : 'PREVIEW (no changes)'));
  console.log('  Auto-null (junk, no real address)     : ' + auto.length);
  console.log('  Review (junk + a real address inside) : ' + review.length + '  (left untouched)');
  console.log('');
  console.log('  Sample of what will be cleared:');
  for (const r of auto.slice(0, 12)) console.log('    #' + r.id + '  ' + String(r.address).replace(/\s+/g, ' ').slice(0, 66));
  console.log('');
  if (review.length) {
    console.log('  Review-only (NOT touched — a real address is buried in the junk):');
    for (const r of review) console.log('    #' + r.id + '  ' + String(r.address).replace(/\s+/g, ' ').slice(0, 66));
    console.log('');
  }

  const lines = ['# tier\tid\tname\taddress'];
  for (const r of auto)   lines.push('auto_null\t' + r.id + '\t' + r.name + '\t' + String(r.address).replace(/\s+/g, ' '));
  for (const r of review) lines.push('review\t' + r.id + '\t' + r.name + '\t' + String(r.address).replace(/\s+/g, ' '));
  writeFileSync(REPORT, lines.join('\n') + '\n', 'utf8');
  console.log('  Full list written to:\n    ' + REPORT);
  console.log('');

  if (!APPLY) {
    console.log('  This was a PREVIEW — nothing changed. To apply, run "Apply Junk-Address Cleanup.command".');
    return;
  }
  if (!auto.length) { console.log('  Nothing to clear.'); return; }

  // Only rows that are actually changing get their watermark bumped.
  const res = await query(
    `UPDATE companies SET address = NULL, updated_at = now() WHERE ${AUTO_WHERE} AND address IS NOT NULL`);
  console.log('  Cleared ' + res.rowCount + ' junk addresses (set to NULL).');
  console.log('');
  console.log('  Pushing changes to production...');
  const { runPush } = await import('../sync/push.js');
  await runPush({});
  console.log('  Done — production updated.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.stack || e); process.exit(1); });

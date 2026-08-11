// Re-read the websites of companies whose ONLY stored email is broken.
//
// Val, 2026-08-11, on the 244 companies the unsendable-address report showed as unreachable:
// "yes please build that." The rule that makes this allowed where hand-repair is not: the
// address a company PUBLISHES ON ITS OWN SITE is a stated fact. "info@afrni2022" probably means
// something — but what the site says today is not a guess, it is a statement, and the harvester
// already exists to capture exactly that (de-obfuscation, role emails on external domains,
// contact pages, /en /ar variants).
//
// Measured before building (2026-08-11): 215 companies have at least one stored email and NONE
// of them usable. Only 60 of those have a website to re-read — the other 155 got their broken
// value from a registry form (mostly QCCI backfill) and have no site on file, so no re-read can
// help them; they stay on the Desktop list for hand-fixing or for the Website Finder.
//
// Resumable BY NATURE: the cohort is "every stored email unusable", so a company that gains a
// good address from its own site leaves the cohort. Close the window any time and re-run.
// Small cohort, plain fetch — minutes, not hours. Still: don't run it beside a big enrich.

import { query } from '../db.js';
import { enrichCompanies } from '../enrichment/local/harvester.js';
import { isSendableAddress } from '../lib/email.js';

const BATCH = 20;
// --limit N reads only the first N companies — how Claude proves the tool on live data before
// handing it to Val. Absent for Val's click: his run does the whole cohort.
const LIMIT = (() => {
  const i = process.argv.indexOf('--limit');
  return i >= 0 ? Math.max(1, Number(process.argv[i + 1]) || 1) : null;
})();

/**
 * Companies where EVERY stored email (contact rows + the legacy column) fails the sendability
 * check, and a website exists to read. Filtered in JavaScript with the SHIPPED isSendableAddress
 * rather than a SQL re-implementation — a second copy of a rule is how the migration-113 drift
 * happened, and this cohort must agree byte-for-byte with the report Val is holding.
 */
async function cohort() {
  // ⚠️ GUESSED WEBSITES ARE EXCLUDED, and this line is the whole safety of the tool.
  // Probing the 60-company cohort before shipping found 20 whose `website` was invented by the
  // Website Finder's domain-guessing — "Tornado Trading" → tornado.com, "VISTA TRADING" →
  // vista.com, "Food Mark Co." → foodmark.com. Those domains resolve, but to STRANGERS.
  // Harvesting one would capture a foreign company's mailbox and store it as the Qatar
  // company's contact — precisely how Anya Aviation ended up carrying a London handbag brand's
  // wholesale@ ([[legacy-contact-column]]). A company whose only email is broken AND whose
  // website is a guess has TWO unverified fields, and stacking one on the other is not evidence.
  // The 20 stay on the Desktop list for hand-fixing; only source-stated websites are read.
  const r = await query(`
    SELECT c.id, c.name, c.website, c.email AS legacy,
           array_remove(array_agg(DISTINCT COALESCE(cc.value_display, cc.value)), NULL) AS contact_emails
      FROM companies c
      LEFT JOIN company_contacts cc ON cc.company_id = c.id AND cc.type = 'email'
     WHERE COALESCE(c.archived, false) = false
       AND c.website IS NOT NULL AND btrim(c.website) <> ''
       AND c.extra_fields->'website_found'->>'method' IS DISTINCT FROM 'guess'
       AND (cc.id IS NOT NULL OR (c.email IS NOT NULL AND btrim(c.email) <> ''))
     GROUP BY c.id
     ORDER BY c.id`);
  return r.rows.filter((x) => {
    const all = [...(x.contact_emails || []), ...(x.legacy ? [x.legacy] : [])]
      .filter((v) => v && String(v).trim());
    return all.length > 0 && !all.some(isSendableAddress);
  });
}

async function main() {
  const start = await cohort();
  console.log('Companies whose ONLY stored email address is broken, with a website to re-read: ' + start.length);
  if (!start.length) {
    console.log('Nothing to do — every such company either has a working address now or has no website. 🎉');
    return;
  }
  console.log('Reading each company\'s OWN site and capturing the address it actually publishes.');
  console.log('Nothing stored unless the site states it. Close this window any time — re-running');
  console.log('continues, and companies that gained a good address leave the list automatically.');
  console.log('');

  let processed = 0;
  const work = LIMIT ? start.slice(0, LIMIT) : start;
  if (LIMIT) console.log(`(--limit ${LIMIT}: proving run, first ${work.length} only)\n`);
  for (let i = 0; i < work.length; i += BATCH) {
    const ids = work.slice(i, i + BATCH).map((x) => Number(x.id));
    // Full rows for the harvester — it wants the company as the engines see it.
    const rows = (await query(`SELECT * FROM companies WHERE id = ANY($1::bigint[])`, [ids])).rows;
    await enrichCompanies(rows, (m) => console.log(m));
    processed += rows.length;
    console.log(`— progress: ${processed} of ${work.length} read —`);
  }

  const end = await cohort();
  const fixed = start.length - end.length;
  console.log('');
  console.log(`DONE. ${start.length} companies read → ${fixed} now have a usable address their own site states.`);
  if (end.length) {
    console.log(`${end.length} still have only the broken value — their site is down, publishes no email,`);
    console.log('or publishes the same broken one. Those stay on the Desktop list for hand-fixing:');
    for (const x of end.slice(0, 10)) console.log(`   • ${x.name}   (${x.website})`);
    if (end.length > 10) console.log(`   … and ${end.length - 10} more.`);
  }
  console.log('');
  console.log('Not covered by this tool, honestly stated:');
  console.log('  • 155 companies have a broken address and NO website at all — nothing to re-read.');
  console.log('  • 20 more have a website Bell only GUESSED from their name (tornado.com for');
  console.log('    "Tornado Trading") — reading a guessed domain could capture a STRANGER\'s');
  console.log('    mailbox, so those are refused. Both groups are on the Desktop list.');
  console.log('');
  console.log('Tell Claude when this finishes — he pushes the new contacts to the live site.');
}

main().catch((e) => {
  console.error('ERROR: ' + (e.message || e));
  console.error('Just re-run the command — it continues from where it left off.');
  process.exitCode = 1;
});

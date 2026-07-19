// Runner for "Reharvest No-Email Companies.command" — Track A's payoff run.
//
// The cohort: companies that were ALREADY website-harvested, still have ZERO emails — the
// proven extractor-miss class (8,620 measured 2026-07-15). The harvester now keeps role
// emails on external domains, decodes Cloudflare/entity/at-dot obfuscation, captures
// WhatsApp + branch addresses, probes locations + language-prefixed pages, and renders
// JS-shell contact pages. This re-runs those companies through the improved harvest.
//
// Resumable by nature: each finished company leaves the cohort; close the window any time
// and re-run. Plain fetch (7 concurrent) + at most 2 page-renders per company.

import { query } from '../db.js';
import { enrichCompanies } from '../enrichment/local/harvester.js';

const BATCH = 40;

async function cohortCount() {
  const r = await query(
    `SELECT count(*)::int AS n FROM companies c
      WHERE c.stage7_status = 'done'
        AND c.website IS NOT NULL AND btrim(c.website) <> ''
        AND c.is_active = true AND COALESCE(c.archived, false) = false
        AND NOT EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = c.id AND cc.type = 'email')`);
  return r.rows[0].n;
}

async function nextBatch(afterId) {
  // id-cursor pagination: a company that STILL has no email after re-harvest stays in the
  // cohort — without the cursor the same batch would re-select forever.
  const r = await query(
    `SELECT c.* FROM companies c
      WHERE c.id > $2 AND c.stage7_status = 'done'
        AND c.website IS NOT NULL AND btrim(c.website) <> ''
        AND c.is_active = true AND COALESCE(c.archived, false) = false
        AND NOT EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = c.id AND cc.type = 'email')
      ORDER BY c.id LIMIT $1`, [BATCH, afterId]);
  return r.rows;
}

async function main() {
  const start = await cohortCount();
  console.log('Companies already harvested but still WITHOUT any email: ' + start);
  if (!start) { console.log('Nothing to do — the cohort is empty. 🎉'); return; }
  console.log('Re-harvesting them with the improved extractor (deeper pages, de-obfuscation,');
  console.log('role emails, WhatsApp, branch addresses). ~10-20s per company, 7 at a time.');
  console.log('Close this window any time — re-running continues where it stopped.');
  console.log('');

  let processed = 0;
  let lastId = 0;
  for (;;) {
    const batch = await nextBatch(lastId);
    if (!batch.length) break;
    lastId = Number(batch[batch.length - 1].id);
    await enrichCompanies(batch, (m) => console.log(m));
    processed += batch.length;
    const left = await cohortCount();
    console.log(`— progress: ${processed} processed this run · ${left} still without email —`);
  }

  const end = await cohortCount();
  console.log('');
  console.log('DONE for this run. Cohort: ' + start + ' → ' + end + ' (' + (start - end) + ' companies gained an email).');
  console.log('The rest either publish no email at all, or need a browser render — both recorded');
  console.log('honestly in each company\'s Search-proof block.');
  console.log('');
  console.log('When you are happy with the local results, run "Push Changes.command" (or ask');
  console.log('Claude) to sync the new contacts to the live site.');
}

main().catch((e) => {
  console.error('ERROR: ' + (e.message || e));
  console.error('Just re-run the command — it continues from where it left off.');
  process.exitCode = 1;
});

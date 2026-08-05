// Monaqasat award backfill — Val's double-click entry point.
// Walks the awarded archive and fills in the winner, the awarded amount, and every rival bid
// with its ICV. Resumable: reports already stored are skipped, so closing the window is safe.
//   full archive : node scripts/scan_monaqasat_awards.js
//   just page 1-5: node scripts/scan_monaqasat_awards.js --pages 5
//   re-scrape    : node scripts/scan_monaqasat_awards.js --force

import { scanMonaqasatAwards } from '../tenders/scan_monaqasat_awards.js';
import { query } from '../db.js';

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > -1 ? Number(process.argv[i + 1]) || d : d; };
const force = process.argv.includes('--force');
const pages = arg('pages', Infinity);
const start = arg('start', 1);

const before = (await query(
  `SELECT count(*)::int c FROM tenders WHERE source='monaqasat' AND award_company_name IS NOT NULL`)).rows[0].c;

console.log('');
console.log('BELL — MONAQASAT AWARD BACKFILL');
console.log('==========================================================');
console.log('Filling in WHO WON each government tender, for how much, and who they beat.');
console.log('Resumable — you can close this window at any time and run it again.');
console.log(pages === Infinity ? 'Walking the whole archive (~1,187 pages — this takes hours).'
                               : `Walking ${pages} page(s) from page ${start}.`);
console.log(`Tenders with a winner right now: ${before.toLocaleString()}\n`);

const t = await scanMonaqasatAwards({ pages, startPage: start, force, jobLog: (m) => console.log(m) });

const after = (await query(
  `SELECT count(*)::int c FROM tenders WHERE source='monaqasat' AND award_company_name IS NOT NULL`)).rows[0].c;
const linked = (await query(
  `SELECT count(*)::int c FROM tenders WHERE source='monaqasat' AND award_company_id IS NOT NULL`)).rows[0].c;

console.log('\n==========================================================');
console.log(`Pages walked          : ${t.pages}`);
console.log(`Award reports read    : ${t.reports}   (failed ${t.failed})`);
console.log(`Existing tenders filled: ${t.updated}`);
console.log(`New tenders added     : ${t.inserted}`);
console.log(`Already had it (skipped): ${t.skipped}`);
console.log('');
console.log(`TENDERS WITH A WINNER : ${before.toLocaleString()} → ${after.toLocaleString()}`);
console.log(`Winners linked to a Bell company: ${linked.toLocaleString()}`);
console.log('\nThis publishes to the live site on the next data push.\n');
process.exit(0);

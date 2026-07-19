// Runner for "Test Maps Actors.command" — runs BOTH Google-Maps actors on the same two small
// Qatar searches (~50 places each side, well under $1 of the $5 monthly credit), stages
// everything, matches against companies, and prints the side-by-side verdict.

import { query } from '../db.js';
import { compareActors } from '../enrichment/gmaps_sweep.js';

const SEARCHES = ['construction company', 'medical clinic'];   // location is added per-actor in sweepOne

async function main() {
  const ready = await query(`SELECT to_regclass('gmaps_places') AS t`);
  if (!ready.rows[0].t) {
    console.error('Tables missing. Fix: double-click "Open Bell.qa Portal.command" once, then re-run.');
    process.exitCode = 1;
    return;
  }
  console.log('Testing BOTH Google-Maps actors on identical searches:');
  for (const s of SEARCHES) console.log('  · ' + s);
  console.log('~25 places per search per actor (≈ $0.30 total of the $5 free monthly credit).');
  console.log('');

  const { report, match } = await compareActors({ searches: SEARCHES, maxPlaces: 25, log: (m) => console.log('  ' + m) });

  console.log('');
  console.log('SIDE-BY-SIDE:');
  for (const [key, r] of Object.entries(report)) {
    console.log(`  ${key.padEnd(12)} fetched ${String(r.fetched).padStart(3)} · staged ${String(r.staged).padStart(3)} · emails ${r.with_email} · websites ${r.with_website} · phones ${r.with_phone}${r.errors.length ? ' · ERRORS: ' + r.errors.join(' | ') : ''}`);
  }
  console.log('');
  console.log('MATCHING vs Bell companies: ' + match.matched + ' matched (enriched) · ' + match.candidates + ' look NEW (held for review, not auto-added).');
  console.log('');
  console.log('Copy this whole output to Claude — together you pick the actor for the monthly sweep.');
}

main().catch((e) => {
  console.error('ERROR: ' + (e.message || e));
  if (/token|unauthor|401/i.test(String(e.message))) console.error('→ The Apify key may be missing locally. Ask Claude for the key-setup command.');
  process.exitCode = 1;
});

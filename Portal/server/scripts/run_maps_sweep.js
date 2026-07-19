// Runner for "Run Maps Sweep.command" — the monthly Google-Maps drip on the FREE $5 credit.
//
// Winner of the 2026-07-20 head-to-head: compass/crawler-google-places (2.4x the yield of
// microworlds on identical searches: 40 vs 17 places; equally email-less in practice — Bell's
// own harvester + Spark handle emails better anyway). ~$4 per 1,000 places on the free tier →
// the sweep caps itself at ~1,150 places per calendar month to stay inside the credit.
//
// Tender-heavy categories first (where Bell's pitch lands hardest), across Qatar's main
// municipalities. Progress is tracked per (category, area, month) — close and re-run any time;
// finished pairs are skipped. Matched places enrich existing companies (blanks only + place
// ids); unmatched are held as candidate_new for review — NEVER auto-created.

import { query } from '../db.js';
import { sweepOne, matchPlaces } from '../enrichment/gmaps_sweep.js';
import { getState, setState } from '../outreach/machine.js';

const MONTHLY_PLACE_CAP = 1150;         // ≈ $4.6 of the $5 free credit
const PER_SEARCH = 40;

const CATEGORIES = [
  'construction company', 'contracting company', 'trading company', 'engineering company',
  'information technology company', 'telecommunications company', 'facilities management company',
  'logistics company', 'transport company', 'manufacturer', 'medical clinic', 'dental clinic',
  'real estate company', 'cleaning company', 'security services company', 'advertising agency',
  'law firm', 'accounting firm', 'insurance agency', 'travel agency', 'restaurant', 'pharmacy',
  'car rental', 'equipment supplier',
];
const AREAS = ['Doha, Qatar', 'Al Rayyan, Qatar', 'Al Wakrah, Qatar', 'Lusail, Qatar', 'Al Khor, Qatar', 'Umm Salal, Qatar'];

async function placesThisMonth() {
  const r = await query(`SELECT count(*)::int AS n FROM gmaps_places WHERE created_at >= date_trunc('month', now())`);
  return r.rows[0].n;
}

async function main() {
  const ready = await query(`SELECT to_regclass('gmaps_places') AS t`);
  if (!ready.rows[0].t) {
    console.error('Tables missing. Fix: double-click "Open Bell.qa Portal.command" once, then re-run.');
    process.exitCode = 1;
    return;
  }
  const month = new Date().toISOString().slice(0, 7);
  const state = (await getState('gmaps_sweep')) || {};
  const done = new Set(state.month === month ? (state.done || []) : []);

  let used = await placesThisMonth();
  console.log('Google-Maps sweep (compass) — places already this month: ' + used + ' / ' + MONTHLY_PLACE_CAP + ' cap (~$5 free credit).');
  console.log('Categories: ' + CATEGORIES.length + ' · areas: ' + AREAS.length + ' · already done this month: ' + done.size + ' pairs.');
  console.log('');

  outer:
  for (const cat of CATEGORIES) {
    for (const area of AREAS) {
      const key = cat + '|' + area;
      if (done.has(key)) continue;
      if (used >= MONTHLY_PLACE_CAP) {
        console.log('Monthly free-credit cap reached (' + used + ' places). Re-run next month — it continues with the remaining pairs.');
        break outer;
      }
      process.stdout.write('  ' + cat + ' @ ' + area.split(',')[0] + ' … ');
      try {
        const r = await sweepOne('compass', cat, { location: area, maxPlaces: Math.min(PER_SEARCH, MONTHLY_PLACE_CAP - used) });
        used += r.fetched;
        done.add(key);
        await setState('gmaps_sweep', { month, done: [...done] });
        console.log(r.fetched + ' places (' + r.staged + ' new)');
      } catch (e) {
        console.log('ERROR: ' + String(e.message).slice(0, 120) + ' — will retry next run');
      }
    }
  }

  console.log('');
  console.log('Matching new places against Bell companies…');
  const m = await matchPlaces({ limit: 2000 });
  const totals = (await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status='matched')::int AS matched,
            count(*) FILTER (WHERE status='candidate_new')::int AS candidates
       FROM gmaps_places`)).rows[0];
  console.log('This run: ' + m.matched + ' matched (enriched) · ' + m.candidates + ' new candidates (held for review).');
  console.log('ALL-TIME: ' + totals.total + ' places · ' + totals.matched + ' matched · ' + totals.candidates + ' candidates.');
  console.log('');
  console.log('Data stays on this Mac; push to the live site with "Push Changes.command" (or ask Claude).');
}

main().catch((e) => {
  console.error('ERROR: ' + (e.message || e));
  console.error('Just re-run the command — finished searches are skipped automatically.');
  process.exitCode = 1;
});

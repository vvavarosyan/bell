// Gazetteer geocode — Preview (default) / Apply (--apply).
//
// Places addresses written the HUMAN way ("Marina 50, Lusail", "27 Al Kinana
// Street, Al Sadd") by resolving the name against Qatar's own surveyed landmark
// register, then confirming the composed INWANI code with the national locator.
// Exact-or-nothing at every step: a name must match ONE place, every number the
// address itself states must agree, and the locator must return score 100 — below
// that nothing is written.
//
// Two blockers this also clears:
//   • rows already stamped 'unparseable' are never retried by the normal geocoder
//     (it selects WHERE geocode_status IS NULL), so they stay invisible forever —
//     this script targets them directly.
//   • the register was never consulted at all.
//
// Apply runs a Rule-2.2 PROOF PASS first: it re-derives coordinates for locations
// that ALREADY have an independent coordinate and refuses to write anything unless
// ≥85% land within 250 m. Then it pushes to production.

import { query } from '../db.js';
import { resolveAddress } from '../gis/gazetteer.js';
import { geocodeInwani, composeCode } from '../gis/geocode_companies.js';

const APPLY = process.argv.includes('--apply');
const TOLERANCE_M = 250, MIN_AGREE = 0.85, PROOF_SAMPLE = 25;

const distM = (a, b) => {
  const dLat = (a.lat - b.lat) * 111320;
  const dLng = (a.lng - b.lng) * 111320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('');
  console.log('GAZETTEER GEOCODE — ' + (APPLY ? 'APPLY' : 'PREVIEW (no changes)'));
  console.log('');

  // ---- What can be resolved (local, no network) --------------------------
  const stuck = (await query(`
    SELECT id, company_id, label, address FROM company_locations
     WHERE latitude IS NULL AND address IS NOT NULL AND btrim(address) <> ''
       AND (geocode_status IS NULL OR geocode_status IN ('unparseable','not_found'))`)).rows;
  const resolved = [];
  for (const r of stuck) {
    const t = await resolveAddress(r.address);
    if (t) resolved.push({ ...r, triple: t });
  }
  console.log('  Unplaced addresses examined : ' + stuck.length);
  console.log('  Resolvable via the register : ' + resolved.length);
  const byVia = new Map();
  for (const r of resolved) byVia.set(r.triple.via, (byVia.get(r.triple.via) || 0) + 1);
  for (const [v, n] of byVia) console.log('      ' + String(n).padStart(4) + '  ' + v);
  console.log('');
  console.log('  Sample:');
  for (const r of resolved.slice(0, 10)) {
    console.log('    ' + String(r.address).replace(/\s+/g, ' ').slice(0, 52).padEnd(54)
      + '→ ' + composeCode(r.triple) + '  (' + r.triple.via.replace('gazetteer-', '') + ')');
  }
  console.log('');

  if (!APPLY) {
    console.log('  This was a PREVIEW — nothing changed. To place them, run "Apply Gazetteer Geocode.command".');
    console.log('  (Apply proves accuracy against known coordinates first, then writes only exact matches.)');
    return;
  }
  if (!resolved.length) { console.log('  Nothing to place.'); return; }

  // ---- PROOF PASS (Rule 2.2) --------------------------------------------
  console.log('  Proving the method against locations that already have coordinates…');
  const known = (await query(`
    SELECT id, address, latitude, longitude FROM company_locations
     WHERE latitude IS NOT NULL AND longitude IS NOT NULL
       AND address IS NOT NULL AND btrim(address) <> ''
     ORDER BY id DESC LIMIT 4000`)).rows;
  let agree = 0, checked = 0, noMatch = 0;
  for (const k of known) {
    if (checked >= PROOF_SAMPLE) break;
    const t = await resolveAddress(k.address);
    if (!t) continue;
    const hit = await geocodeInwani(t).catch(() => null);
    await sleep(120);
    if (!hit) { noMatch += 1; continue; }
    checked += 1;
    const d = distM({ lat: Number(k.latitude), lng: Number(k.longitude) }, { lat: hit.lat, lng: hit.lng });
    if (d <= TOLERANCE_M) agree += 1;
  }
  const ratio = checked ? agree / checked : 0;
  console.log(`     proof: ${agree}/${checked} within ${TOLERANCE_M}m (${Math.round(ratio * 100)}%); ${noMatch} honest no-matches`);
  if (checked < 5 || ratio < MIN_AGREE) {
    console.log('  ✗ Accuracy NOT proven — refusing to write anything. (Rule 2.2)');
    return;
  }
  console.log('  ✓ accuracy proven — safe to place.');
  console.log('');

  // ---- Place --------------------------------------------------------------
  let placed = 0, rejected = 0, i = 0;
  for (const r of resolved) {
    i += 1;
    const hit = await geocodeInwani(r.triple).catch(() => null);
    await sleep(120);
    if (!hit) {
      rejected += 1;
      await query(`UPDATE company_locations SET geocode_status='not_found', geocoded_at=now() WHERE id=$1`, [r.id]);
      continue;
    }
    await query(
      `UPDATE company_locations
          SET latitude=$2, longitude=$3, zone_no=$4, street_no=$5, building_no=$6,
              geocode_status='ok', geocode_method=$7, geocode_score=100, geocoded_at=now(), updated_at=now()
        WHERE id=$1`,
      [r.id, hit.lat, hit.lng, r.triple.zone, r.triple.street, r.triple.building, r.triple.via]);
    placed += 1;
    if (i % 50 === 0) console.log(`     … ${i}/${resolved.length} processed · ${placed} placed`);
  }
  console.log('');
  console.log('  Placed on the map : ' + placed);
  console.log('  Locator rejected  : ' + rejected + '  (no pin written — honest miss)');
  console.log('');
  console.log('  Pushing to production…');
  const { runPush } = await import('../sync/push.js');
  await runPush({});
  console.log('  Done — production updated.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.stack || e); process.exit(1); });

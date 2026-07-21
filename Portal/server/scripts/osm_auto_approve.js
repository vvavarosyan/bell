// OSM auto-approve — Preview (default) / Apply (--apply). Val 2026-07-21:
// "i dont think i can manually go through 7k+ records, we need to do something so
// Bell does the right work."
//
// So Bell does it. This promotes ONLY the high-confidence tier automatically:
//   • a real name (3+ chars, not just digits)
//   • a coordinate inside Qatar
//   • a business category (Food & Drink, Shopping, Health, Finance, …)
//   • AND a verifiable contact — a website or a phone
// A listing with a working contact is evidence of an operating business, which is
// what Rule 2.1 wants before Bell asserts a company exists. Everything weaker
// (name + location only) stays in the review queue, untouched.
//
// Dedup is the SAME guard the manual button uses (phone → website domain → exact
// normalized name): a candidate that matches an existing company LINKS to it
// instead of creating a duplicate. Every promoted place is tagged
// review_status='promoted' + matched_company_id, and the company carries
// company_sources('osm') provenance, so the whole batch is traceable.
//
// Apply pushes to production itself.

import { query, withTransaction } from '../db.js';
import { promoteToCompany, OSM_BUSINESS_GROUPS } from '../routes/discovery_review.js';
import { upsertContact } from '../lib/contacts.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';

const APPLY = process.argv.includes('--apply');

const CANDIDATE_SQL = `
  SELECT id, osm_type, osm_id, name, category, category_group, address, phone, website, latitude, longitude, tags
    FROM osm_places
   WHERE matched_company_id IS NULL AND review_status IS NULL
     AND name IS NOT NULL AND length(btrim(name)) >= 3
     AND btrim(name) !~ '^[0-9]+$'
     AND latitude IS NOT NULL AND longitude IS NOT NULL
     AND longitude BETWEEN 50.55 AND 51.85 AND latitude BETWEEN 24.40 AND 26.30
     AND category_group = ANY($1)
     AND (website IS NOT NULL OR phone IS NOT NULL)
   ORDER BY ((website IS NOT NULL)::int + (phone IS NOT NULL)::int) DESC, id`;

async function main() {
  const rows = (await query(CANDIDATE_SQL, [OSM_BUSINESS_GROUPS])).rows;
  const remaining = (await query(
    `SELECT count(*)::int n FROM osm_places
      WHERE matched_company_id IS NULL AND review_status IS NULL
        AND name IS NOT NULL AND category_group = ANY($1) AND latitude IS NOT NULL
        AND website IS NULL AND phone IS NULL`, [OSM_BUSINESS_GROUPS])).rows[0].n;

  console.log('');
  console.log('OSM AUTO-APPROVE — ' + (APPLY ? 'APPLY' : 'PREVIEW (no changes)'));
  console.log('  High-confidence places to add (name + location + contact) : ' + rows.length);
  console.log('  Left in the review queue (no phone/website — your call)   : ' + remaining);
  console.log('');
  const byGroup = new Map();
  for (const r of rows) byGroup.set(r.category_group, (byGroup.get(r.category_group) || 0) + 1);
  console.log('  By type:');
  for (const [g, n] of [...byGroup.entries()].sort((a, b) => b[1] - a[1])) console.log('    ' + String(n).padStart(4) + '  ' + g);
  console.log('');
  console.log('  Sample of what will be added:');
  for (const r of rows.slice(0, 12)) {
    console.log('    ' + String(r.name).slice(0, 38).padEnd(40) + (r.category || '').slice(0, 16).padEnd(18)
      + (r.phone ? '☎ ' : '  ') + (r.website ? '🔗' : ''));
  }
  console.log('');

  if (!APPLY) {
    console.log('  This was a PREVIEW — nothing changed. To add them, run "Apply OSM Auto-Approve.command".');
    return;
  }
  if (!rows.length) { console.log('  Nothing to add.'); return; }

  let created = 0, linked = 0, failed = 0;
  const touched = [];
  for (const p of rows) {
    try {
      const out = await withTransaction(async (client) => {
        const cur = await client.query(
          `SELECT matched_company_id, review_status FROM osm_places WHERE id=$1 FOR UPDATE`, [p.id]);
        const c = cur.rows[0];
        if (!c || c.matched_company_id || c.review_status) return null;   // already handled
        const r = await promoteToCompany(client, {
          name: p.name, website: p.website, phone: p.phone, category: p.category,
          latitude: p.latitude, longitude: p.longitude, country: 'Qatar',
          source: 'osm', sourceRecordId: 'osm:' + p.osm_type + '/' + p.osm_id, raw: p.tags,
        });
        await client.query(
          `INSERT INTO company_locations (company_id, label, address, latitude, longitude, source, geocode_status, updated_at)
           VALUES ($1,'Head office',$2,$3,$4,'osm-auto','osm', now())
           ON CONFLICT (company_id, lower(address)) DO NOTHING`,
          [r.companyId, (p.address || (Number(p.latitude).toFixed(5) + ', ' + Number(p.longitude).toFixed(5))).slice(0, 300),
           Number(p.latitude), Number(p.longitude)]);
        await client.query(
          `UPDATE osm_places SET matched_company_id=$2, review_status='promoted', updated_at=now() WHERE id=$1`,
          [p.id, r.companyId]);
        return r;
      });
      if (!out) continue;
      if (out.created) created += 1; else linked += 1;
      touched.push({ id: out.companyId, phone: p.phone });
      if ((created + linked) % 100 === 0) console.log('    … ' + (created + linked) + ' processed');
    } catch (err) {
      failed += 1;
      if (failed <= 5) console.log('    ✗ ' + String(p.name).slice(0, 40) + ': ' + err.message);
    }
  }

  // Contacts + rescore AFTER commit (upsertContact uses the pool, not the txn).
  for (const t of touched) {
    if (t.phone) await upsertContact('company', t.id, { type: 'phone', value: t.phone, source: 'osm-auto' }).catch(() => {});
    await recomputeBellScoreForCompany(t.id).catch(() => {});
  }

  console.log('');
  console.log('  Added as NEW companies : ' + created);
  console.log('  Linked to existing     : ' + linked + '  (dedup guard — no duplicates created)');
  if (failed) console.log('  Skipped on error       : ' + failed);
  console.log('');
  console.log('  Pushing to production…');
  const { runPush } = await import('../sync/push.js');
  await runPush({});
  console.log('  Done — production updated.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.stack || e); process.exit(1); });

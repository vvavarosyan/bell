// Tender detail health check — run via "Check Tender Detail.command".
//
// Read-only. Reports how the Monaqasat detail enrichment actually looks in the
// local DB (activity codes, contact, contract, description), so you can confirm
// it's accurate instead of trusting the scan's summary line. Also prints a few
// of the newest enriched tenders with their captured activity codes so you can
// open the same tender on monaqasat.mof.gov.qa and compare.

import { query } from '../db.js';

const SRC = 'monaqasat';

(async () => {
  console.log('Bell — Tender Detail Health Check (Monaqasat)\n');
  try {
    const n = async (sql) => (await query(sql, [SRC])).rows[0].n;

    // A REAL detail id is a non-empty string. `jsonb_exists` is true even when
    // the value is JSON null (the parser's honest "no link found") — that bug
    // kept 1,774 tenders looping as "pending" forever. Fixed 2026-07-09.
    const HAS_ID = `jsonb_typeof(raw->'detail_id')='string' AND btrim(raw->>'detail_id')<>''`;
    const total       = await n(`SELECT count(*)::int n FROM tenders WHERE source=$1`);
    const withId      = await n(`SELECT count(*)::int n FROM tenders WHERE source=$1 AND ${HAS_ID}`);
    const unlinked    = await n(`SELECT count(*)::int n FROM tenders WHERE source=$1 AND NOT (${HAS_ID})`);
    const withActs    = await n(`SELECT count(*)::int n FROM tenders WHERE source=$1 AND jsonb_typeof(raw->'activities')='array' AND jsonb_array_length(raw->'activities')>0`);
    const emptyActs   = await n(`SELECT count(*)::int n FROM tenders WHERE source=$1 AND raw->'activities' = '[]'::jsonb`);
    const v2          = await n(`SELECT count(*)::int n FROM tenders WHERE source=$1 AND COALESCE(NULLIF(raw->>'detail_v','')::int,1) >= 2`);
    const pending     = await n(`SELECT count(*)::int n FROM tenders WHERE source=$1 AND ${HAS_ID} AND (NOT jsonb_exists(raw,'activities') OR COALESCE(NULLIF(raw->>'detail_v','')::int,1) < 2)`);
    const withEmail   = await n(`SELECT count(*)::int n FROM tenders WHERE source=$1 AND raw ? 'contact_email'`);
    const withContract= await n(`SELECT count(*)::int n FROM tenders WHERE source=$1 AND raw ? 'contract_days'`);
    const withDesc    = await n(`SELECT count(*)::int n FROM tenders WHERE source=$1 AND raw ? 'description'`);

    const pad = (x) => String(x.toLocaleString()).padStart(8);
    console.log('Total Monaqasat tenders:         ' + pad(total));
    console.log('  with a detail page id:         ' + pad(withId));
    console.log('  no detail link on the card:    ' + pad(unlinked) + '   (old awarded cards; nothing to fetch — not "pending")');
    console.log('  WITH activity codes:           ' + pad(withActs));
    console.log('  checked, genuinely none ([]):  ' + pad(emptyActs));
    console.log('  fixed by new parser (v2):      ' + pad(v2));
    console.log('  still to (re)enrich:           ' + pad(pending));
    console.log('  with contact email:            ' + pad(withEmail));
    console.log('  with contract duration:        ' + pad(withContract));
    console.log('  with description:              ' + pad(withDesc));

    const s = await query(
      `SELECT source_ref, title, raw FROM tenders
        WHERE source=$1 AND jsonb_typeof(raw->'activities')='array' AND jsonb_array_length(raw->'activities')>0
        ORDER BY COALESCE(awarded_at, published_at, created_at) DESC NULLS LAST LIMIT 3`,
      [SRC]);
    if (s.rows.length) {
      console.log('\nNewest enriched tenders — open each on monaqasat.mof.gov.qa and compare the codes:');
      for (const r of s.rows) {
        const raw = r.raw || {};
        const acts = (raw.activities || []).map((a) => a.code).join(', ');
        console.log('\n  ' + r.source_ref + ' — ' + String(r.title || '').slice(0, 62));
        console.log('    activities: ' + (acts || '—'));
        console.log('    contact: ' + (raw.contact_email || '—') + '  ·  contract: ' + (raw.contract_days ? raw.contract_days + ' days' : '—') + '  ·  parser v' + (raw.detail_v || 1));
      }
    }

    console.log('\nReading this:');
    console.log('  • "WITH activity codes" should be a large share of recent tenders once re-enrich runs.');
    console.log('  • "fixed by new parser (v2)" grows as you run Enrich; when it ≈ detail-id count, you are done.');
    console.log('  • "still to (re)enrich" is high right after the parser fix ON PURPOSE — it re-checks every');
    console.log('    tender once with the corrected parser (newest first). Safe to run in stages.');
  } catch (err) {
    console.error('Check failed: ' + (err.message || err));
    console.error('(Is the local Postgres running? This reads the same DB the scans write to.)');
  } finally {
    process.exit(0);
  }
})();

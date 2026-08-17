// Award intelligence (Operation Data Trust D2) — drives the SHIPPED functions against real
// Postgres, the jobs_closure_order lesson: a test that reimplements the logic passes while
// production carries the bug.
//
//   DATABASE_URL=postgres://localhost:5432/bell_intel node --test tests/award_intel.test.mjs
//
// Covers:
//   · matchBidCrs — zero-padded / suffixed CRs resolve to live companies; registry bodies
//     outrank harvest bodies; short fragments never match.
//   · composeAward — winner flag by stated name, ICV passthrough, absent stays absent,
//     report URL admin-only.
//   · the migration-119 drift guard — EXPLAIN proves the shipped containment query still
//     rides idx_tenders_award_bids_gin (the migration-113 lesson: an expression index that
//     drifts from its query keeps answering correctly at full-scan speed).
//   · splitStatusBanner — only the four verbatim Monaqasat status banners are ever stripped.

import test from 'node:test';
import assert from 'node:assert/strict';
import { query, pool } from '../db.js';
import { matchBidCrs, composeAward } from '../routes/tenders.js';
import { STATUS_BANNERS, splitStatusBanner } from '../tenders/scrape_monaqasat.js';

// A CR base no real register reaches (Qatar CRs are ≤6 digits today).
const CR_BASE = '98765432';
const CR_BASE2 = '98765431';   // the composeAward test needs its OWN base — bases resolve to the oldest registry holder
const cleanup = [];

test.after(async () => {
  for (const fn of cleanup.reverse()) await fn().catch(() => {});
  await pool.end();
});

async function makeCompany(name, body, number) {
  const c = (await query(
    `INSERT INTO companies (name, name_normalized) VALUES ($1, lower($1)) RETURNING id`,
    [name])).rows[0];
  cleanup.push(() => query(`DELETE FROM companies WHERE id = $1`, [c.id]));
  await query(
    `INSERT INTO company_registrations (company_id, body, number, registration_type)
     VALUES ($1, $2, $3, 'commercial_registration')`,
    [c.id, body, number]);
  cleanup.push(() => query(`DELETE FROM company_registrations WHERE company_id = $1`, [c.id]));
  return Number(c.id);
}

test('matchBidCrs resolves zero-padded and suffixed CRs to the registry company', async () => {
  const registryId = await makeCompany('Award Test Registry Co', 'MOCI', CR_BASE + '/2');
  const harvestId = await makeCompany('Award Test Harvest Co', 'website', '00' + CR_BASE);

  const m = await matchBidCrs(['00' + CR_BASE, '123']);
  const hit = m.get(CR_BASE);
  assert.ok(hit, 'zero-padded CR resolves through its base');
  assert.equal(hit.id, registryId, 'registry body outranks harvest body for the same base');
  assert.ok(!m.has('123'), 'a fragment under 4 chars never matches');
  assert.notEqual(hit.id, harvestId);
});

test('composeAward: winner by stated name, ICV passthrough, absent stays absent', async () => {
  const coId = await makeCompany('Award Test Bidder Co', 'QCCI', '000' + CR_BASE2);
  const t = {
    award_company_id: null,
    award_company_name: null,
    raw: {
      award_report: {
        url: 'https://example.invalid/report/1',
        winner: { name: 'AWARD TEST BIDDER CO', registrations: ['000' + CR_BASE2], approved_value: '123456.78', currency: 'QAR' },
        bids: [
          { name: 'AWARD TEST BIDDER CO', registrations: ['000' + CR_BASE2], proposal_amount: '123456.78', local_value_ratio: '17.5' },
          { name: 'SOMEBODY ELSE', registrations: [], proposal_amount: null },
        ],
      },
    },
  };

  const a = await composeAward(t, { admin: false });
  assert.equal(a.winner.name, 'AWARD TEST BIDDER CO');
  assert.equal(a.winner.company_id, coId, 'winner company resolved via its stated CR');
  assert.equal(a.bids.length, 2);
  assert.equal(a.bids[0].is_winner, true);
  assert.equal(a.bids[0].icv, '17.5', 'ICV passes through verbatim');
  assert.equal(a.bids[0].company_id, coId);
  assert.equal(a.bids[1].is_winner, false);
  assert.equal(a.bids[1].company_id, null, 'a bid with no CR stays unmatched');
  assert.equal(a.bids[1].proposal_amount, null, 'absent amount stays absent');
  assert.ok(!('report_url' in a), 'report URL is admin-only');

  const b = await composeAward(t, { admin: true });
  assert.equal(b.report_url, 'https://example.invalid/report/1');

  assert.equal(await composeAward({ raw: {} }), null, 'no award report → null, not an empty shape');
});

test('composeAward speaks the Ashghal shape — raw.bidders, values verbatim', async () => {
  const t = {
    raw: {
      bidders: [
        { name: 'Galaxy Food Centre [Alternative]', rank: '1', icv: '24.66%', accepted_price: 10877777.3, winner: true },
        { name: 'Fabulous Trading & Services', rank: 'Out of ICV Boundary', icv: '20.53%', accepted_price: 13088286.99, winner: false },
      ],
    },
  };
  const a = await composeAward(t, { admin: false });
  assert.equal(a.winner.name, 'Galaxy Food Centre [Alternative]');
  assert.equal(a.bids[0].is_winner, true);
  assert.equal(a.bids[0].icv, '24.66', 'ICV keeps only its number — the UI adds the %');
  assert.equal(a.bids[0].financial_result, 'rank 1');
  assert.equal(a.bids[1].financial_result, 'Out of ICV Boundary', "the page's own wording, verbatim");
  assert.equal(a.bids[1].company_id, null, 'Ashghal states no CRs — names never guessed to companies');
  assert.equal(await composeAward({ raw: { bidders: [] } }), null, 'an empty bidder list is no award result');
});

test('migration 119 drift guard: the shipped containment query rides the GIN index', async () => {
  const idx = await query(`SELECT 1 FROM pg_indexes WHERE indexname = 'idx_tenders_award_bids_gin'`);
  assert.equal(idx.rows.length, 1, 'idx_tenders_award_bids_gin exists (migration 119)');
  // The EXACT WHERE shape routes/tenders.js ships for lost bids.
  const plan = await query(
    `EXPLAIN (FORMAT JSON)
     SELECT t.id FROM tenders t, unnest($2::text[]) AS cr
      WHERE t.raw->'award_report' IS NOT NULL
        AND t.raw->'award_report'->'bids' @> jsonb_build_array(jsonb_build_object('registrations', jsonb_build_array(cr)))
        AND COALESCE(t.award_company_id, 0) <> $1`, [1, ['65011']]);
  const flat = JSON.stringify(plan.rows);
  assert.ok(flat.includes('idx_tenders_award_bids_gin'),
    'planner uses the award-bids GIN — if this fails the query and migration 119 have drifted apart');
});

test('migration 120 drift guard: base-CR lookups ride idx_company_registrations_base', async () => {
  const idx = await query(`SELECT 1 FROM pg_indexes WHERE indexname = 'idx_company_registrations_base'`);
  assert.equal(idx.rows.length, 1, 'idx_company_registrations_base exists (migration 120)');
  // The EXACT lookup shape matchBidCrs / the awards route / linkAwardWinnersByCr ship.
  const plan = await query(
    `EXPLAIN (FORMAT JSON)
     SELECT r.company_id FROM company_registrations r
      WHERE ltrim(split_part(r.number,'/',1),'0') = ANY($1::text[])`, [['65011']]);
  assert.ok(JSON.stringify(plan.rows).includes('idx_company_registrations_base'),
    'planner uses the base-CR index — if this fails the expression and migration 120 have drifted');
});

test('linkAwardWinnersByCr links by stated CR and refuses ambiguity', async () => {
  const { linkAwardWinnersByCr } = await import('../tenders/ingest.js');
  const coId = await makeCompany('Award CR Link Co', 'MOCI', '98765429');
  const otherId = await makeCompany('Award CR Other Co', 'MOCI', '98765428');

  const mkTender = async (ref, regs) => {
    const t = (await query(
      `INSERT INTO tenders (source, source_ref, title, status, raw)
       VALUES ('monaqasat', $1, 'CR link test tender', 'awarded',
               jsonb_build_object('award_report', jsonb_build_object(
                 'winner', jsonb_build_object('name', 'AWARD CR LINK CO', 'registrations', $2::jsonb))))
       RETURNING id`, [ref, JSON.stringify(regs)])).rows[0];
    cleanup.push(() => query(`DELETE FROM tenders WHERE id = $1`, [t.id]));
    return Number(t.id);
  };

  // A zero-padded stated CR resolves to the registry company.
  const t1 = await mkTender('99001/2099', ['00098765429']);
  // Two stated CRs resolving to two DIFFERENT companies — must be refused, not guessed.
  const t2 = await mkTender('99002/2099', ['98765429', '98765428']);

  await linkAwardWinnersByCr();
  const r1 = (await query(`SELECT award_company_id FROM tenders WHERE id = $1`, [t1])).rows[0];
  const r2 = (await query(`SELECT award_company_id FROM tenders WHERE id = $1`, [t2])).rows[0];
  assert.equal(r1.award_company_id, coId, 'stated CR links the winner');
  assert.equal(r2.award_company_id, null, 'ambiguous CRs refuse rather than pick');
  assert.notEqual(coId, otherId);
});

test('splitStatusBanner strips only the four verbatim banners', () => {
  assert.equal(STATUS_BANNERS.length, 4);
  const s1 = splitStatusBanner('Tender is violation due to delay \n\n MAINTENANCE CONTRACT');
  assert.equal(s1.banner, 'Tender is violation due to delay');
  assert.equal(s1.title, 'MAINTENANCE CONTRACT');

  const ar = splitStatusBanner('مناقصة مخالفة بسبب التأخير \n\n توريد مستلزمات المختبر');
  assert.equal(ar.banner, 'مناقصة مخالفة بسبب التأخير');
  assert.equal(ar.title, 'توريد مستلزمات المختبر');

  // A banner over no usable title: banner recorded, title left untouched — never blanked.
  const s2 = splitStatusBanner('Tender is violation due to delay \n\n 0');
  assert.equal(s2.banner, 'Tender is violation due to delay');
  assert.equal(s2.title, 'Tender is violation due to delay \n\n 0');

  // A genuine multi-line title is NOT a banner — measured: every other pre-\n\n line is real.
  const s3 = splitStatusBanner('توريد ادوية س.ل.م/2025/8541\n\nsecond line of a real title');
  assert.equal(s3.banner, null);
  assert.equal(s3.title, 'توريد ادوية س.ل.م/2025/8541\n\nsecond line of a real title');

  assert.equal(splitStatusBanner('Ordinary title').banner, null);
});

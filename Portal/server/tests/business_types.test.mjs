// Unit tests for the business-type vocabulary bridge (lib/business_types.js).
// Pure-function coverage only — the DB-backed matcher is proven against the
// live vocabulary separately (see the 2026-07-20 session verification).
// Run: node tests/business_types.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stemToken, queryNamesIndustry, businessTypeCondition, businessTypeFilterCondition } from '../lib/business_types.js';

test('stemToken: -ies → y (laundries, pharmacies)', () => {
  assert.equal(stemToken('laundries'), 'laundry');
  assert.equal(stemToken('pharmacies'), 'pharmacy');
  assert.equal(stemToken('companies'), 'company');
});

test('stemToken: plain plural strips -s, keeps -ss', () => {
  assert.equal(stemToken('salons'), 'salon');
  assert.equal(stemToken('gifts'), 'gift');
  assert.equal(stemToken('glass'), 'glass');
  assert.equal(stemToken('gas'), 'gas');       // short word untouched
});

test('queryNamesIndustry: naming the industry qualifies', () => {
  assert.equal(queryNamesIndustry('Construction & Contracting', 'construction'), true);
  assert.equal(queryNamesIndustry('Information Technology', 'it'), true);
  assert.equal(queryNamesIndustry('Information Technology', 'information technology'), true);
  assert.equal(queryNamesIndustry('Healthcare', 'medical'), true);
  assert.equal(queryNamesIndustry('Facilities & Cleaning', 'cleaning'), true);
});

test('queryNamesIndustry: a trade word must NOT unlock its parent industry', () => {
  assert.equal(queryNamesIndustry('Healthcare', 'pharmacy'), false);
  assert.equal(queryNamesIndustry('Facilities & Cleaning', 'laundry'), false);
  assert.equal(queryNamesIndustry('Automotive', 'car rental'), false);
  assert.equal(queryNamesIndustry('Beauty & Wellness', 'beauty salon'), false);
  assert.equal(queryNamesIndustry('Hospitality & F&B', 'restaurant'), false);
});

test('queryNamesIndustry: name-like queries never qualify', () => {
  assert.equal(queryNamesIndustry('Trading & Distribution', 'faisal trading co'), false);
  assert.equal(queryNamesIndustry('Banking & Finance', 'doha bank tower'), false);
});

test('businessTypeCondition: routes each source to its own column', () => {
  const params = [];
  const sql = businessTypeCondition([
    { label: 'Gifts', src: 'registry' },
    { label: 'Restaurants', src: 'tag' },
    { label: 'Gift shop', src: 'google' },
  ], params);
  assert.match(sql, /btrim\(companies\.sector\) = ANY/);
  assert.match(sql, /companies\.industries &&/);
  assert.match(sql, /gmaps_categories/);
  assert.equal(params.length, 3);
  assert.deepEqual(params[0], ['Gifts']);
});

test('businessTypeCondition: empty input yields empty condition', () => {
  const params = [];
  assert.equal(businessTypeCondition([], params), '');
  assert.equal(params.length, 0);
});

test('businessTypeFilterCondition: a bare label is tried on all three columns', () => {
  const params = [];
  const sql = businessTypeFilterCondition(['Gifts'], params);
  assert.match(sql, /sector/);
  assert.match(sql, /industries/);
  assert.match(sql, /gmaps_categories/);
});

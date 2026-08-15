// The QCCI directory reader, proven against the pages the site ACTUALLY serves.
//
// Both fixtures are real captures from 2026-08-15, not hand-written approximations:
//   qatarcid_kbe_gulf.html   — browser-serialized DOM of a live listing (the §2.2 rule: verify
//                              against BROWSER HTML, not fetch HTML), captured from the pane
//                              that passed Cloudflare.
//   qatarcid_challenge.html  — the ACTUAL Cloudflare challenge the Mac's headless browser
//                              received (403). The first proving run parsed this page as a
//                              company named "www.qatarcid.com"; a blocked night would have fed
//                              2,000 of those into the ingest.
//
// Ground truth for KBE Gulf read off the live page by eye the same day. Pure parsing, no network.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseListing } from '../sources/qatarcid/reader.js';

const fixture = (f) => readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');
// The runner hands parseListing renderPage output, which includes extracted text. The fixtures
// are raw HTML, so derive text the same way a renderer would (tags stripped, line per element).
const asPage = (html) => ({
  html,
  text: html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ')
    .split('\n').map((s) => s.trim()).filter(Boolean).join('\n'),
});

const KBE = parseListing(asPage(fixture('qatarcid_kbe_gulf.html')), 'https://www.qatarcid.com/listing/kbe-gulf/');

test('a real listing parses to the values the page states', () => {
  assert.equal(KBE.name, 'KBE Gulf');
  assert.equal(KBE.cr_number, '00034243');
  assert.equal(KBE.qcci_membership_number, '01-12515-00');
  assert.equal(KBE.po_box, '00024301');
  assert.equal(KBE.phone, '44362811');
  assert.equal(KBE.fax, '44327420');
  assert.equal(KBE.contact_person, 'SHAHEEN JASSIM AL SULAITI');
  assert.equal(KBE.category, 'Contracting');
  assert.equal(KBE.sub_category, 'Air Conditioning Contractors');
});

test('the "Click to see" theatre is read without clicking', () => {
  // Full values are split across data-mxe + data-mx; the click only concatenates them.
  assert.equal(KBE.mobile, '55850192', 'sidebar mobile: "5585019" + "2"');
  assert.equal(KBE.email, 'hassankousa@live.com', 'email: "hassank" + "ousa@live.com"');
});

test('a sponsor banner is NOT the company website', () => {
  // The live page carries an Ashghal ad in the sidebar, and the first version of the reader
  // stored https://www.ashghal.gov.qa/ as KBE Gulf's website. An advert on the page is not a
  // statement about the company. KBE states no website, so none is claimed.
  assert.equal(KBE.website, null);
});

test('a Cloudflare challenge page is unreadable, not a company', () => {
  const r = parseListing(asPage(fixture('qatarcid_challenge.html')), 'https://www.qatarcid.com/listing/roya-holding/');
  assert.equal(r, null, 'the challenge h1 is the bare hostname and must never become a record');
});

test('an empty or non-listing page yields nothing', () => {
  assert.equal(parseListing({ html: '', text: '' }, 'https://x/listing/a/'), null);
  assert.equal(parseListing(asPage('<html><h1>Some Blog Post</h1><p>hello</p></html>'), 'https://x/listing/a/'), null,
    'a page without the directory vocabulary is not a listing');
});

test('fields the page does not state stay null', () => {
  // KBE's page states no Company Type and no Owner Name — the June Firecrawl records carry them
  // for other companies. Absent must stay absent (Rule 2.1).
  assert.equal(KBE.company_type, null);
  assert.equal(KBE.owner_name, null);
  assert.equal(KBE.address, null);
});

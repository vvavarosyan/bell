// The name-on-page gate for search-found website candidates (task #96, applied to the queue).
//
// The rule under test: a website is APPROVED only when the page ITSELF states the company's
// distinctive name — anchored in the title or the domain — REJECTED only on hard evidence
// (parked host/content, 404), and left PENDING otherwise, because absence of proof is not proof
// of absence (Rule 2.1). Pure function; no network, no database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gateDecision } from '../scripts/confirm_website_candidates.js';

const page = (title, body) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;
const d = (companyName, url, html, status = 200) => gateDecision({ companyName, url, status, html });

test('approved: the page states the distinctive name in its title', () => {
  const r = d('Al Sharq Insurance Co. W.L.L.', 'https://www.sharqinsurance.com.qa',
    page('Sharq Insurance — Home', 'Welcome to Sharq Insurance, Doha.'));
  assert.equal(r.verdict, 'approve');
  assert.ok(r.matched.includes('sharq'));
});

test('approved: name anchored by the DOMAIN when the title is generic', () => {
  const r = d('Almana Motors Company', 'https://almanamotors.qa',
    page('Home', 'Almana Motors is the authorised distributor in Doha. Contact Almana Motors today.'));
  assert.equal(r.verdict, 'approve');
});

test('pending: distinctive token appears only in body text — not title, not domain', () => {
  // Weakest signal: a mention could be a client list or a news item about someone else.
  const r = d('Fakhroo Trading', 'https://qatarbusinesshub.com',
    page('Qatar Business Hub', 'Our tenants include Fakhroo and others.'));
  assert.equal(r.verdict, 'pending');
});

test('pending: a distinctive token is missing from the page entirely', () => {
  const r = d('Encon Corporation', 'https://someothersite.com', page('Some Other Site', 'We sell things.'));
  assert.equal(r.verdict, 'pending');
  assert.match(r.why, /does not state/);
});

test('pending: a fully generic name can never be proven by tokens', () => {
  // "Qatar Trading Company" matches half the internet — humans decide these.
  const r = d('Qatar Trading Company', 'https://qatartradingcompany.com',
    page('Qatar Trading Company', 'Qatar Trading Company welcomes you'));
  assert.equal(r.verdict, 'pending');
  assert.match(r.why, /no distinctive token/);
});

test('rejected: a parked host is hard evidence', () => {
  const r = d('Harbour Holdings', 'https://harbourholdings.sedo.com', page('x', 'y'));
  assert.equal(r.verdict, 'reject');
});

test('rejected: parking-page CONTENT on a vanity domain', () => {
  const r = d('Harbour Holdings', 'https://harbourholdings.com',
    page('harbourholdings.com', 'harbourholdings.com is for sale on GoDaddy. Own it today for $4,995'));
  assert.equal(r.verdict, 'reject');
  assert.match(r.why, /parking/);
});

test('rejected: HTTP 404', () => {
  assert.equal(d('Anything Co', 'https://x.qa', '', 404).verdict, 'reject');
});

test('pending: unreachable tonight is not a verdict', () => {
  assert.equal(d('Anything Co', 'https://x.qa', '', 0).verdict, 'pending');
});

test('the "&" spelling difference does not break the match', () => {
  const r = d('Nasser & Fakhroo Est.', 'https://nasserfakhroo.com',
    page('Nasser and Fakhroo', 'Nasser and Fakhroo, established 1952 in Doha'));
  assert.equal(r.verdict, 'approve');
});

test('REGRESSION: novoresume.com is NOT Novo Trade — a substring domain match anchors nothing', () => {
  // Caught live in the first preview (Rule 2.2): the lone token 'novo' matched as a substring of
  // 'novoresume' and a famous CV-builder nearly became a Qatar trading company's website.
  const r = gateDecision({
    companyName: 'Novo Trade QFZ LLC', url: 'https://novoresume.com', status: 200,
    html: '<html><head><title>Novorésumé: Professional Resume Builder</title></head><body>novo resume builder for professionals</body></html>',
  });
  assert.notEqual(r.verdict, 'approve');
});

test('an exact token-concatenation domain still anchors a two-token name', () => {
  const r = gateDecision({
    companyName: 'Al Sharq Insurance Co', url: 'https://www.sharqinsurance.com.qa', status: 200,
    html: '<html><head><title>Home</title></head><body>Sharq Insurance company of Doha. Contact sharq insurance today.</body></html>',
  });
  assert.equal(r.verdict, 'approve');
});

test('REGRESSION: a common-word company name cannot claim the famous site', () => {
  // Preview #2 approved "Marvel Group" → marvelfandom.com and "Zoom Contracting" → zoom.us.
  // The word is on the page; the COMPANY is not — and neither page mentions Qatar.
  const marvel = gateDecision({
    companyName: 'Marvel Group', url: 'https://www.marvelfandom.com', status: 200,
    html: '<html><head><title>Marvel Database | Fandom</title></head><body>Marvel comics group of heroes</body></html>',
  });
  assert.notEqual(marvel.verdict, 'approve');
  const zoom = gateDecision({
    companyName: 'Zoom Contracting', url: 'https://zoom.us', status: 200,
    html: '<html><head><title>Zoom: One platform to connect</title></head><body>Zoom video meetings</body></html>',
  });
  assert.notEqual(zoom.verdict, 'approve');
});

test('a page stating the phrase but with no Qatar context stays pending', () => {
  const r = gateDecision({
    companyName: 'Gema Trading & Contracting', url: 'https://gema-group.com', status: 200,
    html: '<html><head><title>Gema Trading and Contracting</title></head><body>Gema Trading and Contracting projects worldwide</body></html>',
  });
  assert.equal(r.verdict, 'pending');
  assert.match(r.why, /Qatar context/);
});

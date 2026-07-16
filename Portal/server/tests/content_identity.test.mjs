// Proves content_identity.contentIdentity() on REAL captured page fixtures (Rule 2.2:
// these are the actual title/og:site_name/description/text browser-serialized on
// 2026-07-15, not invented). Run: node --test server/tests/content_identity.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contentIdentity } from '../enrichment/local/content_identity.js';

// --- REAL fixtures (captured live via browser) ---

// EXAMPLE 3: foundationendowment.com — domain matches "Qatar Foundation Endowment"
// but the site is a "Smart Evolution" tech blog. THE case Val reported.
const QF_ENDOWMENT = { name: 'Qatar Foundation Endowment Holding LLC' };
const QF_PAGE = {
  ok: true,
  meta: {
    title: 'Digital Innovation Daily: Instagram Trends for Growth',
    ogSiteName: 'Smart Evolution',
    description: 'Explore the latest trends and expert insights on how Instagram is driving personal and business growth in the digital era.',
    keywords: null,
  },
  text: 'Skip to content Menu Smart Home Privacy Concerns Emerge Over New Voice Assistant Leaks In recent years, the popularity of smart home devices has skyrocketed, offering convenience and connectivity like never before. Among these innovations, voice assistants such as Amazon Alexa, Google Assistant, and Apple Siri have become household staples. OpenAI Nonprofit Parent Takes Equity Stake.',
};

// A correct, distinctive-named site: Doha Clinic Hospital on its own site.
const DOHA_CLINIC = { name: 'DOHA CLINIC HOSPITAL' };
const DOHA_PAGE = {
  ok: true,
  meta: {
    title: 'Doha Clinic Hospital',
    ogSiteName: null,
    description: 'Doha Clinic Hospital (DCH) is the first and Best fully integrated private hospital in Qatar, established since 30 years. It has the best doctors in all medical specialties.',
    keywords: null,
  },
  text: 'العربية Search Patient Portal Book an Appointment Thirty (30) Years By Your Side . Doha Clinic Hospital New Al Mirqab Street, Fereej Al Nasr Doha-Qatar P.O.Box: 9958 Tel: 4438 4333 E-mail: info@dchqatar.com Doha Clinic Abu Sidra.',
};

// Generic-named company — cannot be verified by tokens, must SKIP (not flag).
const DOC_MEDICAL = { name: 'DOC MEDICAL CENTER' };
const DOC_PAGE = {
  ok: true,
  meta: { title: 'DOC Medical Center | Best Medical Center in Qatar', ogSiteName: null,
    description: "Qatar's leading medical center for orthopedics, physiotherapy, neurology." },
  text: 'Best Medical Center in Qatar Our Locations DOC Medical Centers.',
};

test('content-conflict: foundationendowment serves Smart Evolution → flagged', () => {
  const r = contentIdentity(QF_ENDOWMENT, { ...QF_PAGE, url: 'https://www.foundationendowment.com/' });
  assert.equal(r.verdict, 'content-conflict', JSON.stringify(r));
  assert.match(r.brand, /smart evolution/i);
});

// FALSE-POSITIVE GUARD (the Rimads/Avey case Val caught in Preview): a company operating
// under a PRODUCT brand on its OWN domain must NOT be flagged. "Rimads QSTP-LLC" runs
// avey.ai, branded "Avey" — legal name absent, but the domain (avey) IS the content brand.
test('ok: company under a product brand on its own domain (Rimads → avey.ai) → not flagged', () => {
  const r = contentIdentity({ name: 'Rimads QSTP-LLC' }, {
    ok: true, url: 'https://avey.ai',
    meta: { title: 'Avey — Empowering health through AI', ogSiteName: 'Avey',
      description: 'Avey is a tech company that aims to empower health through the endless possibilities of AI.' },
    text: 'Avey is a tech company that aims to empower health through the endless possibilities of AI. support@avey.ai',
  });
  assert.equal(r.verdict, 'ok', JSON.stringify(r));
  assert.notEqual(r.verdict, 'content-conflict');
});

test('ok: Doha Clinic Hospital on its own site → name present, not flagged', () => {
  const r = contentIdentity(DOHA_CLINIC, DOHA_PAGE);
  assert.equal(r.verdict, 'ok', JSON.stringify(r));
});

test('ok even when company name appears via the DOC generic case is a SKIP, never a flag', () => {
  const r = contentIdentity(DOC_MEDICAL, DOC_PAGE);
  // DOC/Medical/Center are all generic/short → cannot verify → skip (never content-conflict).
  assert.equal(r.verdict, 'skip', JSON.stringify(r));
  assert.notEqual(r.verdict, 'content-conflict');
});

// FALSE-POSITIVE GUARD (the Global Pure / OVHcloud case Val caught): a re-fetch that hits
// a hosting/parking placeholder must SKIP — a transient outage is not proof the stored
// (correct) data is wrong.
test('skip: OVHcloud/hosting placeholder page → never flagged (Global Pure Trading)', () => {
  const r = contentIdentity({ name: 'Global Pure Trading QFZ LLC' }, {
    ok: true, url: 'https://globalpuretrading.com/en/',
    meta: { title: 'OVHcloud', ogSiteName: 'OVHcloud', description: '' },
    text: 'Your website will be available very soon. This website is hosted by OVHcloud.',
  });
  assert.equal(r.verdict, 'skip', JSON.stringify(r));
  assert.notEqual(r.verdict, 'content-conflict');
});

test('skip: generic "coming soon" / under construction placeholder → never flagged', () => {
  const r = contentIdentity({ name: 'Some Distinctive Brandname Co' }, {
    ok: true, url: 'https://example-brand.com',
    meta: { title: 'Coming Soon', ogSiteName: null, description: 'Website under construction' },
    text: 'Our website is coming soon. Under construction. Check back later.',
  });
  assert.equal(r.verdict, 'skip', JSON.stringify(r));
});

// ── REGRESSION: every false positive from Val's live Apply run (2026-07-16) ──────────
// The bar for all of these is simply "NOT content-conflict" — i.e. Bell must not hide a
// correct company's data. 'ok' and 'skip' are both acceptable; only a flag is a failure.
const notFlagged = (label, company, url, meta, text) => {
  test(`no false flag: ${label}`, () => {
    const r = contentIdentity({ name: company }, { ok: true, url, meta, text });
    assert.notEqual(r.verdict, 'content-conflict', `${label} → ${JSON.stringify(r)}`);
  });
};

// Accent folding — the company's OWN name was in the title, but stripping non-[a-z0-9]
// turned "stratèze" into "strat ze" so it never matched.
notFlagged('Stratèze LLC on strateze.com (accented own name)', 'Strateze LLC', 'https://www.strateze.com/en',
  { title: 'Stratèze — SaaS Management Solutions | Micro-Systems & Systems-Expert' },
  'Stratèze propose des solutions de gestion SaaS.');
notFlagged('Wärtsilä (accented own name)', 'Wartsila doha', 'https://www.wartsila.com',
  { title: 'Wärtsilä - The global leader in innovative technologies', ogSiteName: 'Wärtsilä' },
  'Wärtsilä is the global leader in innovative technologies.');
// Title TAGLINES are not brands — this was the single biggest false-positive class.
notFlagged('Gannett Fleming tagline', 'GANNETT FLEMING', 'https://www.gannettfleming.com',
  { title: 'Ingenuity That Shapes Lives', ogSiteName: null }, 'Ingenuity that shapes lives. Engineering firm.');
notFlagged('Consolidated Contractors tagline', 'Consolidated Contractors Group S.A.', 'https://www.ccc.gr',
  { title: 'Building Legacies, Honoring Values', ogSiteName: null }, 'Building legacies honoring values since 1952.');
notFlagged('Servicio tagline', 'Servicio LLC', 'https://servicio.qa',
  { title: '- We delivered the excellence', ogSiteName: null }, 'We delivered the excellence in facility management.');
// HTML entity in the company's own name.
notFlagged("Engier&#39;s entity", 'Qatar Engieers Trading And Contracting', 'https://qatarengieers.com',
  { title: 'Engier&#39;s', ogSiteName: null }, "Engier&#39;s trading and contracting in Doha.");
// Parked / expired / blocked / template pages prove nothing.
notFlagged('Website Expired', 'Asia for Marble & Granite', 'https://asiamarble.qa',
  { title: 'Website Expired' }, 'This website has expired. Contact the administrator.');
notFlagged('ConnectYourDomain Error', 'SANDRA BEAUTY TRADING', 'https://sandrabeauty.qa',
  { title: 'ConnectYourDomain Error' }, 'ConnectYourDomain Error. Domain not connected.');
notFlagged('"My Website" default', 'Q AL SABA TRADING AND CONTRACTING', 'https://qalsaba.com',
  { title: 'My Website' }, 'My Website. Welcome home about us contact services page.');
notFlagged('ThemeForest template', 'qatar executive', 'https://qatarexecutive.qa',
  { title: 'ThemeForest' }, 'ThemeForest premium website templates and themes here.');
notFlagged('Not Acceptable (blocked)', 'One Thousand And One LLC', 'https://www.onethousandone.com',
  { title: 'Not Acceptable!' }, 'Not Acceptable! An appropriate representation could not be found.');

test('skip: unrendered/empty shell page → never flagged', () => {
  const r = contentIdentity(QF_ENDOWMENT, { ok: true, meta: {}, text: '' });
  assert.equal(r.verdict, 'skip', JSON.stringify(r));
});

test('skip: page fetch failed → never flagged', () => {
  const r = contentIdentity(QF_ENDOWMENT, { ok: false, meta: {}, text: '' });
  assert.equal(r.verdict, 'skip');
});

test('ok: the correct company on a DIFFERENT-but-legit brandful page is not flagged if name present', () => {
  // Guard against over-flagging: if any distinctive token is present, we trust it.
  const r = contentIdentity({ name: 'Qatar Foundation Endowment Holding LLC' }, {
    ok: true,
    meta: { title: 'Qatar Foundation Endowment — Home', ogSiteName: 'Smart Evolution', description: 'x' },
    text: 'welcome to qatar foundation endowment holding',
  });
  assert.equal(r.verdict, 'ok', JSON.stringify(r));
});

test('no false-positive on a plain correct site whose title is just the brand', () => {
  const r = contentIdentity({ name: 'Al Meera Consumer Goods Company' }, {
    ok: true, meta: { title: 'Al Meera — Qatar Supermarket', ogSiteName: 'Al Meera' },
    text: 'al meera consumer goods company retail stores across qatar',
  });
  assert.equal(r.verdict, 'ok', JSON.stringify(r));
});

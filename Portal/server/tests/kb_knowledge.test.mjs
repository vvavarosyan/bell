// Qatar Knowledge Base — Batch B tests (Phase 6, 2026-07-13).
// Proves, against REAL captured HTML (Rule 2.2):
//   • conservative entity extraction (laws/bodies/amounts/officials + proof),
//   • the Al Meezan law-page parser (accepts real laws, rejects the home page),
//   • the ASP.NET <form>-drop fix in extractContent,
//   • per-source extractLinks options (www-alias, query, include/exclude).
// Fixtures: kb_almeezan_law.html (LawPage id=2, "Law No. 10 of 1987"),
//           kb_mofa_home.html (MOFA English home), kb_almeezan_home.html (synthetic).
// Run:  node server/tests/kb_knowledge.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  extractEntities, extractLawRefs, extractBodies, extractOfficials, extractAmounts, summarizeEntities,
} from '../knowledge/entities.js';
import { extractContent, extractLinks } from '../knowledge/crawl.js';
import { cleanTitle, lawBody, isLawPage } from '../knowledge/crawl_almeezan.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => readFileSync(join(here, 'fixtures', n), 'utf8');
const lawHtml = fx('kb_almeezan_law.html');
const mofaHtml = fx('kb_mofa_home.html');
const homeHtml = fx('kb_almeezan_home.html');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

// ── entities: law_refs ────────────────────────────────────────────────────────
console.log('\nentities — law references:');
// upsertPage extracts from title + body together (a law's own number is in the
// title; referenced laws are in the body) — mirror that here.
const lawText = `${cleanTitle(lawHtml)}\n${lawBody(lawHtml)}`;
const refs = extractLawRefs(lawText);
t('captures the primary (from title) + referenced (from body) laws verbatim', () => {
  const texts = refs.map((r) => r.text);
  assert.ok(texts.includes('Law No. 10 of 1987'), 'primary law');
  assert.ok(texts.some((x) => /Law No\. 2 of 1962/i.test(x)), 'a referenced law');
  assert.ok(refs.length >= 3);
});
t('every law_ref carries number + year + proof', () => {
  for (const r of refs) { assert.ok(/^\d{1,4}$/.test(r.number)); assert.ok(/^(19|20)\d{2}$/.test(r.year)); assert.ok(r.proof && r.proof.length > 5); }
});
t('handles parenthesised numbers "No. (10) of 1987"', () => {
  const r = extractLawRefs('Pursuant to Law No. (10) of 1987 concerning property');
  assert.equal(r.length, 1); assert.equal(r[0].number, '10'); assert.equal(r[0].year, '1987');
});
t('handles "Decree-Law No. 8 of 2016" and "Amiri Decision No. 22 of 2014"', () => {
  const r = extractLawRefs('See Decree-Law No. 8 of 2016 and Amiri Decision No. 22 of 2014.');
  assert.equal(r.length, 2);
});
t('captures an ARABIC law citation (Cabinet resolution) with normalised digits', () => {
  const r = extractLawRefs('قرار مجلس الوزراء رقم (1) لسنة 1976 بشأن التسجيل العقاري');
  assert.equal(r.length, 1);
  assert.equal(r[0].lang, 'ar');
  assert.equal(r[0].number, '1');
  assert.equal(r[0].year, '1976');
});
t('normalises Arabic-Indic digits in a citation', () => {
  const r = extractLawRefs('قانون رقم ٥ لسنة ٢٠١٥');   // ٥=5, ٢٠١٥=2015
  assert.equal(r.length, 1); assert.equal(r[0].number, '5'); assert.equal(r[0].year, '2015');
});

// ── entities: bodies (controlled vocabulary, no guessing) ─────────────────────
console.log('\nentities — government bodies:');
const mofaText = extractContent(mofaHtml).text;
t('finds real ministries mentioned on the MOFA page', () => {
  const names = extractBodies(mofaText).map((b) => b.name);
  assert.ok(names.includes('Ministry of Foreign Affairs'));
  assert.ok(names.length >= 2);
});
t('NEVER emits a body that is not present (Rule 2.1)', () => {
  const names = extractBodies('The weather in Doha is warm today.').map((b) => b.name);
  assert.equal(names.length, 0);
});
t('matches British/US spelling variants', () => {
  assert.equal(extractBodies('the Ministry of Defence acted').length, 1);
  assert.equal(extractBodies('the Ministry of Labour issued').length, 1);
});
t('carries the VERBATIM matched phrase (never a canonical it did not use)', () => {
  const soc = extractBodies('The Ministry of Social Affairs decided…');
  assert.equal(soc.length, 1);
  assert.equal(soc[0].matched, 'Ministry of Social Affairs');   // not folded into "…Development and Family"
  assert.equal(soc[0].name, 'Ministry of Social Affairs');
});

// ── entities: amounts (fees in QAR) ───────────────────────────────────────────
console.log('\nentities — monetary amounts:');
t('captures QAR fees both orderings, with numeric value', () => {
  const a = extractAmounts('An application fee of QAR 5,000 applies; a penalty of 10000 Qatari Riyals may follow.');
  const vals = a.map((x) => x.value).sort((m, n) => m - n);
  assert.deepEqual(vals, [5000, 10000]);
});
t('keeps the DECIMAL part of a fee (value not silently truncated)', () => {
  const a = extractAmounts('A fee of QAR 1,000.50 and a fine of 0.50 QR.');
  const vals = a.map((x) => x.value).sort((m, n) => m - n);
  assert.deepEqual(vals, [0.5, 1000.5]);
  assert.ok(a.some((x) => x.text === 'QAR 1,000.50'));
});

// ── entities: officials (PDPPL-sensitive) ─────────────────────────────────────
console.log('\nentities — officials (public capacity):');
t('extracts an honorific+name, flagged sensitive, no truncated duplicate', () => {
  const offs = extractOfficials(mofaText);
  assert.ok(offs.length >= 1);
  assert.ok(offs.every((o) => o.sensitive === true));
  // No kept name should be a strict prefix of another kept name.
  for (const a of offs) for (const b of offs) if (a !== b) assert.ok(!b.name.toLowerCase().startsWith(a.name.toLowerCase() + ' '));
});
t('does not treat two plain capitalised words as a person', () => {
  assert.equal(extractOfficials('The Doha Forum convened yesterday.').length, 0);
});
t('REJECTS a landmark that starts with an honorific (Rule 2.1 — not a person)', () => {
  // "Sheikh Jassim Bin Mohammed Grand Mosque" is a mosque, not an official.
  const offs = extractOfficials('The event was held at the Sheikh Jassim Bin Mohammed Grand Mosque in Doha.');
  assert.equal(offs.length, 0);
});
t('REJECTS a headline fragment folded into a name', () => {
  const offs = extractOfficials('His Highness The Amir Patronizes The Opening of the new hospital.');
  assert.equal(offs.length, 0);
});
t('REJECTS an institution beginning with an honorific', () => {
  assert.equal(extractOfficials('He visited Sheikh Khalifa Medical City today.').length, 0);
});
t('KEEPS real officials with an Arabic name particle', () => {
  const a = extractOfficials('His Highness Sheikh Tamim bin Hamad Al Thani, Amir of Qatar, said…');
  const b = extractOfficials('The report was signed by Dr. Mohammed Al Kuwari.');
  assert.ok(a.length === 1 && /Tamim bin Hamad/.test(a[0].name));
  assert.ok(b.length === 1 && /Mohammed Al Kuwari/.test(b[0].name));
});

// ── extractEntities aggregate ─────────────────────────────────────────────────
console.log('\nentities — aggregate:');
t('returns null on trivial text; object on rich text; summary is a string', () => {
  assert.equal(extractEntities('hi'), null);
  const e = extractEntities(lawText);
  assert.ok(e && e.law_refs && e.law_refs.length);
  assert.equal(typeof summarizeEntities(e), 'string');
});

// ── Al Meezan law-page parser ─────────────────────────────────────────────────
console.log('\nAl Meezan — law-page parser:');
t('cleanTitle strips the portal prefix → bare law title', () => {
  assert.equal(cleanTitle(lawHtml), 'Law No. 10 of 1987 with regard to Public and Private State Property');
});
t('lawBody extracts the decree text (contains the enacting clause)', () => {
  const b = lawBody(lawHtml);
  assert.ok(b.length > 150);
  assert.ok(/Emir of Qatar/i.test(b));
});
t('isLawPage ACCEPTS a real law', () => {
  assert.equal(isLawPage(cleanTitle(lawHtml), lawBody(lawHtml)), true);
});
t('isLawPage REJECTS the portal home page (no false positive)', () => {
  assert.equal(isLawPage(cleanTitle(homeHtml), lawBody(homeHtml)), false);
});
t('isLawPage REJECTS a law-ish title with an empty body', () => {
  assert.equal(isLawPage('Law No. 5 of 2020 on something', ''), false);
});
t('isLawPage ACCEPTS the Constitution (title starts with "The Permanent Constitution")', () => {
  assert.equal(isLawPage('The Permanent Constitution of the State of Qatar', 'x'.repeat(300)), true);
});
t('isLawPage ACCEPTS an Arabic-only law', () => {
  assert.equal(isLawPage('قرار مجلس الوزراء رقم (1) لسنة 1976 بشأن التسجيل العقاري', 'x'.repeat(300)), true);
});

// ── extractContent: ASP.NET <form>-drop fix ───────────────────────────────────
console.log('\nextractContent — ASP.NET <form> fix:');
t('yields real text from a WebForms page (was 0 before the fix)', () => {
  const { text } = extractContent(lawHtml);
  assert.ok(text.length > 500, `expected >500 chars, got ${text.length}`);
});

// ── extractLinks: per-source options ──────────────────────────────────────────
console.log('\nextractLinks — per-source options:');
const html = `
  <a href="https://www.imo.gov.qa/state-of-qatar/his-highness-the-amir">amir</a>
  <a href="https://imo.gov.qa/ar/state-of-qatar">arabic</a>
  <a href="/about-the-imo">about</a>
  <a href="https://imo.gov.qa/assets/logo.png">logo</a>
  <a href="https://other.gov.qa/x">offsite</a>`;
t('www and non-www hosts are the same site', () => {
  const links = extractLinks(html, 'https://imo.gov.qa/en/', 'https://imo.gov.qa/');
  assert.ok(links.some((l) => l.includes('his-highness-the-amir')));
  assert.ok(links.some((l) => l.endsWith('/about-the-imo')));
});
t('exclude_pattern drops the Arabic mirror; assets + offsite always dropped', () => {
  const links = extractLinks(html, 'https://imo.gov.qa/en/', 'https://imo.gov.qa/', { excludeRe: /\/ar(\/|$)/i });
  assert.ok(!links.some((l) => l.includes('/ar/')));
  assert.ok(!links.some((l) => l.includes('logo.png')));
  assert.ok(!links.some((l) => l.includes('other.gov.qa')));
});
const qHtml = `<a href="https://www.almeezan.qa/LawPage.aspx?id=2&language=en">law</a>
               <a href="https://www.almeezan.qa/LawPage.aspx?id=9&language=ar">ar</a>`;
t('follow_query keeps the law id; include/exclude patterns apply to full URL', () => {
  const links = extractLinks(qHtml, 'https://www.almeezan.qa/', 'https://www.almeezan.qa/', {
    followQuery: true, includeRe: /LawPage\.aspx/i, excludeRe: /language=ar/i,
  });
  assert.ok(links.some((l) => l.includes('id=2') && l.includes('language=en')));
  assert.ok(!links.some((l) => l.includes('language=ar')));
});
t('without follow_query, query strings are stripped', () => {
  const links = extractLinks(qHtml, 'https://www.almeezan.qa/', 'https://www.almeezan.qa/');
  assert.ok(links.every((l) => !l.includes('?')));
});

console.log(`\n${pass} passed\n`);

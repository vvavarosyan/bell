// QSE disclosures (Phase 2 C1) — parser + row-builder tests.
//
// Fixtures in ./fixtures/ are VERBATIM captures from qe.com.qa, 2026-07-10:
//   qse_news_var.txt         the raw request_NewsEventsOnQuoteDetailPage_responseXML
//                            value from the QNBK company-profile page (URL-encoded XML)
//   qse_marketwatch_rows.json  two verbatim rows (1 COMP, 1 V) of /pps/qse_files/MarketWatch.txt
//   qse_fs.xml               two verbatim <Record>s of the financial-statements resource (year 2025)
//   qse_notices.xml          two verbatim notices (16 flat <Record>s) of the market-notices resource (year 2026)
//
// Run:  node server/tests/qse_disclosures.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  decodeFormEncoded, decodePercent, xmlUnescape, htmlToPlainText, attachmentUrl,
  parseMarketWatch, extractEmbeddedNewsVar, parseNewsXml,
  parseFsXml, parseNoticeDate, parseNoticesXml,
  classifyDisclosure, newsToRow, fsToRow, noticeToRow,
} from '../qse/scrape_qse.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (f) => readFileSync(join(FIX, f), 'utf8');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

console.log('\nform decoding + entities:');
t('decodeFormEncoded: + is a space, %XX decodes', () => {
  assert.equal(decodeFormEncoded('a+b%3Cc%3E'), 'a b<c>');
});
t('decodeFormEncoded: malformed input returns null, never throws', () => {
  assert.equal(decodeFormEncoded('%E0%A4%A'), null);
});
t('decodePercent keeps a literal + (market-notice fields are %20-encoded)', () => {
  assert.equal(decodePercent('Q%20%26%20A+session'), 'Q & A+session');
  assert.equal(decodeFormEncoded('Q%20%26%20A+session'), 'Q & A session');   // the form decoder would eat it
});
t('xmlUnescape handles &lt; &gt; &amp; and &#xD;', () => {
  assert.equal(xmlUnescape('&lt;p&gt;a &amp; b&lt;/p&gt;&#xD;'), '<p>a & b</p>\r');
});
t('htmlToPlainText strips tags, resolves BOTH entity layers', () => {
  assert.equal(htmlToPlainText('&lt;p&gt;Hello &amp; bye&lt;/p&gt;&lt;br/&gt;next'), 'Hello & bye\nnext');
  // description text is HTML escaped inside XML → 'Q&A' arrives as &amp;amp;
  assert.equal(htmlToPlainText('&lt;p&gt;Q&amp;amp;A results&lt;/p&gt;'), 'Q&A results');
});

console.log('\nMarketWatch (listed-company universe):');
const mw = read('qse_marketwatch_rows.json');
t('parseMarketWatch keeps COMP + V rows with symbol/name/sector', () => {
  const rows = parseMarketWatch(mw);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].symbol, 'QNBK');
  assert.equal(rows[0].name_en, 'QNB');
  assert.equal(rows[0].sector, 'Banks & Financial Services');
  assert.equal(rows[0].comp_type, 'COMP');
  assert.equal(rows[1].symbol, 'TQES');
  assert.equal(rows[1].comp_type, 'V');
});
t('parseMarketWatch: junk input degrades to []', () => {
  assert.deepEqual(parseMarketWatch('not json'), []);
  assert.deepEqual(parseMarketWatch('{"rows": "nope"}'), []);
});

console.log('\ncompany-profile embedded announcements (QNBK, verbatim):');
const rawVar = read('qse_news_var.txt');
t('extractEmbeddedNewsVar finds the var in a page-shaped wrapper', () => {
  const page = `<script>\nrequest_NewsEventsOnQuoteDetailPage_responseXML = '${rawVar}';\n</script>`;
  assert.equal(extractEmbeddedNewsVar(page), rawVar);
});
const decoded = decodeFormEncoded(rawVar);
const news = parseNewsXml(decoded);
t('parses all 6 embedded announcements', () => {
  assert.equal(news.length, 6);
});
t('first announcement: exchange id, ISO publish date, headline verbatim', () => {
  assert.equal(news[0].detail_id, '46358');
  assert.equal(news[0].published_at, new Date('2026-07-08T13:50:10+03:00').toISOString());
  assert.ok(news[0].headline.startsWith('QNB will hold its investors relation conference call on 13/07/2026'));
});
t('description → readable body + attachment URL extracted', () => {
  assert.ok(news[0].body.includes('conference call with the Investors'));
  assert.ok(!news[0].body.includes('<'));
  assert.equal(news[0].url,
    'https://www.qe.com.qa/qdisclosure/api/NonFS/downloadAttachmentFileAPI?ig=c1fcf5e4-e21b-4950-a45a-191e1f65be20');
});
t('second announcement is the semi-annual statement disclosure', () => {
  assert.equal(news[1].detail_id, '46356');
  assert.equal(news[1].headline, 'QNB : Disclose the Semi-annual financial statement of 2026');
});

console.log('\nfinancial statements (verbatim year-2025 records):');
const fs = parseFsXml(read('qse_fs.xml'), 2025);
t('one row per published quarter document (4 + 3 = 7)', () => {
  assert.equal(fs.length, 7);
  assert.equal(fs.filter((d) => d.symbol === 'QATR').length, 4);
  assert.equal(fs.filter((d) => d.symbol === 'AKHI').length, 3);
});
t('quarter numbering + decoded document URLs', () => {
  const q1 = fs.find((d) => d.symbol === 'QATR' && d.quarter === 1);
  assert.equal(q1.company_name, 'Al Rayan Qatar ETF');
  assert.equal(q1.year, 2025);
  assert.ok(q1.url.startsWith('https://www.qe.com.qa/documents/'));
  assert.ok(!q1.url.includes('%2F'), 'url must be decoded');
});
t('a drifted record shape is SKIPPED, never quarter-guessed (positional numbering)', () => {
  const drifted = '<xml><Record><key>Some+Co</key><value>u1</value><value>u2</value><value>TICK</value></Record></xml>';
  assert.deepEqual(parseFsXml(drifted, 2025), []);
});
t('a non-ISO PublishDate stays null — ambiguous dates are never guessed', () => {
  const xml = '<News><InformationTypeDetailID>9</InformationTypeDetailID><Headline>x</Headline><PublishDate>05-01-2026 09:30</PublishDate></News>';
  assert.equal(parseNewsXml(xml)[0].published_at, null);
});

console.log('\nmarket notices (verbatim year-2026 records):');
t('parseNoticeDate: DD-MM-YYYY (proven by day 26) → ISO', () => {
  assert.equal(parseNoticeDate('26-01-2026'), new Date('2026-01-26T00:00:00+03:00').toISOString());
  assert.equal(parseNoticeDate('2026-01-26'), null);   // unknown format stays null
});
const notices = parseNoticesXml(read('qse_notices.xml'));
t('flat key/value records group into 2 notices', () => {
  assert.equal(notices.length, 2);
  assert.equal(notices[0].subject, 'Listing and Trading of Doha Bank Bonds at Qatar Stock Exchange');
  assert.equal(notices[0].number, '1');
  assert.equal(notices[0].published_at, new Date('2026-01-12T00:00:00+03:00').toISOString());
  assert.equal(notices[1].subject, 'Name Change Qatar Electricity & Water Co');
});

console.log('\nclassification (a tag with an honest fallback — real headlines):');
t('real QNB headlines classify correctly', () => {
  assert.equal(classifyDisclosure('QNB : Disclose the Semi-annual financial statement of 2026'), 'financial_results');
  assert.equal(classifyDisclosure('(QNB): Share Buyback Suspension Update'), 'capital_action');
  assert.equal(classifyDisclosure('QNB will hold its investors relation conference call on 13/07/2026 to discuss the financial results'), 'financial_results');
  assert.equal(classifyDisclosure('Board of Directors meeting results'), 'board');
  assert.equal(classifyDisclosure('Invitation to the Annual General Assembly Meeting'), 'agm');
  assert.equal(classifyDisclosure('Distribution of cash dividends for 2025'), 'dividend');
});
t('unrecognized headline stays general — never a guess', () => {
  assert.equal(classifyDisclosure('Trading resumption update'), 'general');
});

console.log('\nrow builders (shapes ingest_qse.js writes):');
t('newsToRow: stable source_uid from the exchange id', () => {
  const row = newsToRow(news[1], { symbol: 'QNBK', name_en: 'QNB', sector: 'Banks & Financial Services' });
  assert.equal(row.source_uid, 'news:46356');
  assert.equal(row.dtype, 'news');
  assert.equal(row.symbol, 'QNBK');
  assert.equal(row.category, 'financial_results');
  assert.equal(row.raw.detail_id, '46356');
});
t('fsToRow: stable source_uid, no invented publish date', () => {
  const row = fsToRow(fs.find((d) => d.symbol === 'QATR' && d.quarter === 4));
  assert.equal(row.source_uid, 'fs:QATR:2025:Q4');
  assert.equal(row.published_at, null);   // the page states year+quarter only
  assert.equal(row.category, 'financial_results');
});
t('noticeToRow: no company attribution from free text', () => {
  const row = noticeToRow(notices[1]);
  assert.equal(row.source_uid, 'notice:2026:2');
  assert.equal(row.symbol, null);
  assert.equal(row.company_name, null);
  assert.ok(row.url.startsWith('https://www.qe.com.qa/'));
});

console.log(`\n${pass}/${pass} PASS\n`);

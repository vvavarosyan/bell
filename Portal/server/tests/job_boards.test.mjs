// Board identity — the key every job row is upserted against.
//
// It must be STABLE: correcting which company owns a board must not change the key, or every job
// on it is re-inserted as new and the originals look withdrawn. And it must be UNIQUE per
// employer, or two companies' vacancies collide.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardKeyFor, platformOf } from '../jobs/boards.js';

test('hosted platforms are recognised from the host', () => {
  assert.equal(platformOf('ejqa.fa.em2.oraclecloud.com'), 'oracle_cloud');
  assert.equal(platformOf('fa-eolw-saasfaprod1.fa.ocs.oraclecloud.com'), 'oracle_cloud');
  assert.equal(platformOf('qatarairways.wd3.myworkdayjobs.com'), 'workday');
  assert.equal(platformOf('careers.icims.com'), 'icims');
  assert.equal(platformOf('career2.successfactors.eu'), 'successfactors');
  assert.equal(platformOf('www.milaha.com'), null, "a company's own domain is not a platform");
  assert.equal(platformOf(''), null);
  assert.equal(platformOf(null), null);
});

test('a hosted board is identified by its TENANT HOST alone', () => {
  // Oracle's paths vary by product version; the tenant host is what identifies the employer, so
  // the key must not move when the URL does.
  const a = boardKeyFor({ url: 'https://ejqa.fa.em2.oraclecloud.com/hcmUI/CandidateExperience', host: 'ejqa.fa.em2.oraclecloud.com', kind: 'ats' });
  const b = boardKeyFor({ url: 'https://ejqa.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/requisitions', host: 'ejqa.fa.em2.oraclecloud.com', kind: 'ats' });
  assert.equal(a, b, 'the same tenant must yield the same key regardless of path');
  assert.equal(a, 'oracle_cloud:ejqa.fa.em2.oraclecloud.com');
});

test('two employers on the same platform get different keys', () => {
  const milaha = boardKeyFor({ url: 'https://ejqa.fa.em2.oraclecloud.com/x', host: 'ejqa.fa.em2.oraclecloud.com', kind: 'ats' });
  const vodafone = boardKeyFor({ url: 'https://elat.fa.em2.oraclecloud.com/x', host: 'elat.fa.em2.oraclecloud.com', kind: 'ats' });
  assert.notEqual(milaha, vodafone,
    'Oracle requisition ids are small per-tenant integers — sharing a key would let one board steal another\'s jobs');
});

test("a company's own careers page includes the path", () => {
  // One host really can serve several brands' boards — careers.powerholding-intl.com/BaladnaCareers
  // is a live, measured example — so the path is part of the identity here.
  const baladna = boardKeyFor({ url: 'https://careers.powerholding-intl.com/BaladnaCareers', host: 'careers.powerholding-intl.com', kind: 'external' });
  const other = boardKeyFor({ url: 'https://careers.powerholding-intl.com/OtherBrand', host: 'careers.powerholding-intl.com', kind: 'external' });
  assert.notEqual(baladna, other);
  assert.equal(baladna, 'site:careers.powerholding-intl.com/baladnacareers');
});

test('the key is case- and trailing-slash-insensitive', () => {
  const a = boardKeyFor({ url: 'https://WWW.Milaha.com/EN/Careers/', host: 'WWW.Milaha.com', kind: 'own' });
  const b = boardKeyFor({ url: 'https://www.milaha.com/en/careers', host: 'www.milaha.com', kind: 'own' });
  assert.equal(a, b, 'a re-crawl that differs only in case must not mint a second board');
});

test('a malformed url still yields a usable key rather than throwing', () => {
  const k = boardKeyFor({ url: 'not a url', host: 'example.qa', kind: 'own' });
  assert.equal(k, 'site:example.qa');
});

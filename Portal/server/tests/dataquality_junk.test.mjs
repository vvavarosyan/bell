// Data-quality guards (Val 2026-07-13): placeholder person names + Cloudflare
// email decode/junk detection. Run: node server/tests/dataquality_junk.test.mjs
import assert from 'node:assert/strict';
import { isPlaceholderName, isFakePerson, decodeCloudflareEmail, isJunkEmail } from '../lib/dataquality.js';
import { normalizeEmail } from '../lib/contacts.js';

let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ✓ ' + n); };

console.log('\nplaceholder person names:');
t('rejects the registry blank-field placeholders', () => {
  for (const n of ['Required - OWNER NAME', 'Required - CONTACT PERSON', 'OWNER NAME', 'Contact Person', 'Company Name', 'To Be Updated', 'N/A - Not Available', 'TBD']) {
    assert.equal(isPlaceholderName(n), true, n);
    assert.equal(isFakePerson({ name: n }), true, n);
  }
});
t('keeps real Qatari/expat names (no false positives)', () => {
  for (const n of ['SAOUD OMAR H A AL-MANA', 'Hamad Saleh H A Al-Nabit', 'Ryan McGonagill', 'Nasser Hassan J. Al-Jaber', 'Rosalina D. William', 'Mohammed Al Kuwari']) {
    assert.equal(isPlaceholderName(n), false, n);
    assert.equal(isFakePerson({ name: n }), false, n);
  }
});

console.log('\nCloudflare email decode:');
t('decodes cdn-cgi hex to the real address', () => {
  assert.equal(decodeCloudflareEmail('/cdn-cgi/l/email-protection#19786a717f78686c7c3778757874597b6b786f7c776d37777c6d'), 'ashfaque.alam@bravent.net');
  assert.equal(decodeCloudflareEmail('/cdn-cgi/l/email-protection#dab4bbbeb3b4a3b4a99ab2b5aeb7bbb3b6f4b9b5b7'), 'nadinyns@hotmail.com');
});
t('returns null for garbage hex', () => {
  assert.equal(decodeCloudflareEmail('/cdn-cgi/l/email-protection#00'), null);
  assert.equal(decodeCloudflareEmail('not-a-cf-link'), null);
});

console.log('\njunk-email detection + normalization:');
t('isJunkEmail flags cdn-cgi / images / malformed, passes real', () => {
  for (const j of ['/cdn-cgi/l/email-protection#19786a', 'logo.png', '[email protected]', 'javascript:void', 'nope']) assert.equal(isJunkEmail(j), true, j);
  assert.equal(isJunkEmail('info@bravent.net'), false);
});
t('normalizeEmail DECODES a cdn-cgi value to the real email', () => {
  assert.equal(normalizeEmail('/cdn-cgi/l/email-protection#19786a717f78686c7c3778757874597b6b786f7c776d37777c6d'), 'ashfaque.alam@bravent.net');
  assert.equal(normalizeEmail('  Info@Bravent.net '), 'info@bravent.net');
  assert.equal(normalizeEmail('/cdn-cgi/l/email-protection#00'), null);   // undecodable → rejected
});

console.log(`\n${pass} passed\n`);

// PII encryption tests (Phase 4 QID/Passport verification, Val 2026-07-12).
// AES-256-GCM roundtrip + tamper detection + ID validation. A key is injected
// via BDI_KEY_PII so the test is self-contained.
// Run:  node server/tests/pii.test.mjs

import assert from 'node:assert/strict';
process.env.BDI_KEY_PII = 'a'.repeat(64);   // 32-byte hex test key (set BEFORE import)

const { encryptPII, decryptPII, idLast4, normalizeId, piiConfigured } = await import('../lib/pii.js');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };
const at = async (name, fn) => { await fn(); pass++; console.log(`  ✓ ${name}`); };

console.log('\nencrypt/decrypt:');
await at('a QID round-trips exactly', async () => {
  const blob = await encryptPII('28412345678');
  assert.notEqual(blob, '28412345678');            // not plaintext
  assert.ok(!blob.includes('2841'));               // no plaintext leak
  assert.equal(await decryptPII(blob), '28412345678');
});
await at('two encryptions of the same value differ (random IV)', async () => {
  const a = await encryptPII('AB1234567');
  const b = await encryptPII('AB1234567');
  assert.notEqual(a, b);
  assert.equal(await decryptPII(a), 'AB1234567');
  assert.equal(await decryptPII(b), 'AB1234567');
});
await at('tampered ciphertext is REJECTED (GCM auth)', async () => {
  const blob = await encryptPII('28412345678');
  const buf = Buffer.from(blob, 'base64'); buf[buf.length - 1] ^= 0xff;   // flip a byte
  await assert.rejects(() => decryptPII(buf.toString('base64')));
});
await at('key is configured in this test', async () => {
  assert.equal(await piiConfigured(), true);
});

console.log('\nmasking:');
t('last4 for display', () => {
  assert.equal(idLast4('28412345678'), '5678');
  assert.equal(idLast4('AB 123 4567'), '4567');
});

console.log('\nvalidation (never guesses):');
t('QID must be 11 digits', () => {
  assert.deepEqual(normalizeId('qid', '28412345678'), { ok: true, value: '28412345678', type: 'qid' });
  assert.equal(normalizeId('qid', '1234').ok, false);
  assert.equal(normalizeId('qid', '2841234567A').ok, false);
});
t('passport is 5–15 alphanumeric, upper-cased + trimmed', () => {
  assert.deepEqual(normalizeId('passport', 'ab123456'), { ok: true, value: 'AB123456', type: 'passport' });
  assert.deepEqual(normalizeId('passport', ' k 12 345 '), { ok: true, value: 'K12345', type: 'passport' });
  assert.equal(normalizeId('passport', '!!!').ok, false);
  assert.equal(normalizeId('passport', 'A234').ok, false);   // too short
});
t('an unknown ID type fails loudly', () => {
  assert.equal(normalizeId('ssn', '123').ok, false);
  assert.equal(normalizeId('', 'x').ok, false);
});

console.log(`\n${pass}/${pass} PASS\n`);

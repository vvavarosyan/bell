// Currency → QAR conversion (lib/fx.js). Run: node server/tests/fx.test.mjs
import assert from 'node:assert/strict';
import { toQar, qarCaseSql, QAR_PER } from '../lib/fx.js';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); fail++; } };

console.log('toQar — QAR native, USD at the fixed peg, foreign converted, unknown → null:');
t('QAR is native (×1)', () => assert.equal(toQar(100000, 'QAR'), 100000));
t('USD at the official 3.64 peg', () => assert.equal(toQar(1000, 'USD'), 3640));
t('EUR/GBP convert with their rate', () => {
  assert.equal(toQar(1000, 'EUR'), 1000 * QAR_PER.EUR);
  assert.equal(toQar(1000, 'GBP'), 1000 * QAR_PER.GBP);
});
t('lowercase currency still resolves', () => assert.equal(toQar(1000, 'usd'), 3640));
t('unknown currency → null (never guessed)', () => assert.equal(toQar(1000, 'JPY'), null));
t('null/blank currency → null (not assumed QAR)', () => {
  assert.equal(toQar(1000, null), null);
  assert.equal(toQar(1000, ''), null);
});
t('null value → null', () => assert.equal(toQar(null, 'QAR'), null));

console.log('\nqarCaseSql — SQL CASE maps each known currency, unknown → NULL:');
t('produces a CASE with every known currency and an ELSE NULL', () => {
  const sql = qarCaseSql('cf.value_num', 'cf.currency');
  assert.ok(/upper\(cf\.currency\)/.test(sql));
  assert.ok(/WHEN 'QAR' THEN cf\.value_num \* 1/.test(sql));
  assert.ok(/WHEN 'USD' THEN cf\.value_num \* 3\.64/.test(sql));
  assert.ok(/ELSE NULL END/.test(sql));
});

console.log(`\n${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);

// Streamed-speech segmentation tests (ui/lib/speech.js is pure — node-testable).
// Run:  node server/tests/speech_segments.test.mjs

import assert from 'node:assert/strict';
import { cutSpeechSegment, segmentAll } from '../../ui/lib/speech.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`);
};

console.log('\nstreaming cuts:');
t('no cut until a real sentence of useful length exists', () => {
  assert.equal(cutSpeechSegment('Yes.'), null);
  assert.equal(cutSpeechSegment('I found 3 Interior Design companies'), null);
});
t('cuts at the first sentence end once long enough', () => {
  const buf = 'I found three Interior Design companies with strong signals this week. The first one is Al Waab';
  const cut = cutSpeechSegment(buf);
  assert.equal(cut.segment, 'I found three Interior Design companies with strong signals this week.');
  assert.equal(cut.rest.trim(), 'The first one is Al Waab');
});
t('decimal numbers and mid-word dots never cut', () => {
  const buf = 'Their revenue grew 3.5 times over 2.5 years according to the disclosure they filed this week. More';
  const cut = cutSpeechSegment(buf);
  assert.ok(cut.segment.endsWith('filed this week.'));
});
t('Arabic sentence enders work', () => {
  const ar = 'وجدت ثلاث شركات تصميم داخلي قوية في قطر هذا الأسبوع مع إشارات شراء واضحة؟ الشركة الأولى';
  const cut = cutSpeechSegment(ar);
  assert.ok(cut.segment.endsWith('؟'));
});
t('a rambling no-punctuation stream force-cuts on a word boundary', () => {
  const long = ('word '.repeat(100)).trim();
  const cut = cutSpeechSegment(long);
  assert.ok(cut && cut.segment.length <= 320 && !cut.segment.endsWith(' wor'));
});
t('the [choices: …] tail is never spoken and never cut into', () => {
  assert.equal(cutSpeechSegment('Want me to widen the window to 90 days instead [choices: Yes | No]'), null);
  const buf = 'I can widen the search window to ninety days if you want me to look further back. [choices: Yes | No]';
  const cut = cutSpeechSegment(buf);
  assert.ok(cut.segment.endsWith('further back.'));
  assert.ok(!cut.segment.includes('[choices'));
});

console.log('\nfull-text segmentation (chat replies spoken in voice mode):');
t('multi-sentence reply becomes ordered segments with nothing lost', () => {
  const text = 'I checked the tenders for you and found four open matches in Information Technology this week. Two of them close within ten days so they deserve attention first. Want the details? [choices: Yes | No]';
  const segs = segmentAll(text);
  assert.equal(segs.length, 3);
  assert.ok(segs[0].endsWith('this week.'));
  assert.ok(segs[2].endsWith('Want the details?') || segs[2] === 'Want the details?');
  assert.ok(!segs.join(' ').includes('[choices'));
});
t('short reply = one segment, empty reply = none', () => {
  assert.deepEqual(segmentAll('Done.'), ['Done.']);
  assert.deepEqual(segmentAll('  '), []);
});

console.log(`\n${pass}/${pass} PASS\n`);

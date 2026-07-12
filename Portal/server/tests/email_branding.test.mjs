// Email branding render tests (Val 2026-07-12: "outgoing emails look too plain
// — users must have their email header, footer, signature… Bella must use the
// same header and footer set up in settings"). renderBrandedEmail wraps the
// body in the sender's header/footer/signature and always returns a plain-text
// twin. Run:  node server/tests/email_branding.test.mjs

import assert from 'node:assert/strict';
import { renderBrandedEmail, hasBranding } from '../lib/email_branding.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

console.log('\nno branding:');
t('nothing set → plain text, no html wrapper', () => {
  const { html, text } = renderBrandedEmail({ bodyText: 'Hello there.', branding: {} });
  assert.equal(html, null);
  assert.equal(text, 'Hello there.');
});
t('hasBranding is false without a header/footer', () => {
  assert.equal(hasBranding({}), false);
  assert.equal(hasBranding({ signature: 'x' }), false);
  assert.equal(hasBranding({ header: '<b>Acme</b>' }), true);
});

console.log('\nheader + footer + signature:');
const branding = {
  header: '<div style="font-weight:700">Acme Trading</div>',
  footer: '<div>Doha, Qatar · acme.qa</div>',
  signature: 'Sara Ali\nHead of Sales',
  appendSignature: true,
};
const { html, text } = renderBrandedEmail({ bodyText: 'Hi Omar,\n\nWe help utilities cut costs.\n\nWorth a chat?', branding });
t('html wraps body between header and footer', () => {
  assert.ok(html.includes('Acme Trading'));                 // header present
  assert.ok(html.includes('Doha, Qatar'));                  // footer present
  assert.ok(html.indexOf('Acme Trading') < html.indexOf('We help utilities'));   // header ABOVE body
  assert.ok(html.indexOf('We help utilities') < html.indexOf('Doha, Qatar'));    // footer BELOW body
});
t('plain-text twin carries the body + a tag-stripped signature', () => {
  assert.ok(text.startsWith('Hi Omar,'));
  assert.ok(text.includes('We help utilities cut costs.'));
  assert.ok(text.includes('Sara Ali'));
  assert.ok(!/[<>]/.test(text));                            // no tags leak into text
});
t('body newlines become paragraphs/<br>, not a wall of text', () => {
  assert.ok(html.includes('<p'));
  assert.ok(html.includes('Worth a chat?'));
});

console.log('\nsafety + escaping:');
t('active content in trusted HTML is stripped', () => {
  const b = { header: '<div onclick="steal()">Hi<script>evil()</script></div>', footer: '' };
  const r = renderBrandedEmail({ bodyText: 'x', branding: b });
  assert.ok(!/script/i.test(r.html));
  assert.ok(!/onclick/i.test(r.html));
});
t('a plain-text body is HTML-escaped (no injection via the message)', () => {
  const r = renderBrandedEmail({ bodyText: 'Look <b>here</b> & <there>', branding });
  assert.ok(r.html.includes('&lt;b&gt;here&lt;/b&gt;'));
  assert.ok(r.html.includes('&amp;'));
});
t('append-signature OFF drops the signature from both html and text', () => {
  const r = renderBrandedEmail({ bodyText: 'Hi', branding: { ...branding, appendSignature: false } });
  assert.ok(!r.text.includes('Sara Ali'));
  assert.ok(!r.html.includes('Sara Ali'));
  assert.ok(r.html.includes('Acme Trading'));               // header still wraps it
});
t('signature only (no header/footer) still brands the email', () => {
  const r = renderBrandedEmail({ bodyText: 'Hi', branding: { signature: 'Sara', appendSignature: true } });
  assert.ok(r.html);                                        // wrapper rendered for the signature
  assert.ok(r.html.includes('Sara'));
});

console.log(`\n${pass}/${pass} PASS\n`);

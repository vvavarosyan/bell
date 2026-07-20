// Tests for the Google-Maps link → coordinates extractor (enrichment/local/maplinks.js).
// Run: node tests/maplinks.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMapCoords, extractMapLinks } from '../enrichment/local/maplinks.js';

// A real Al Sadd / central Doha point (DOC Medical Center HQ ≈ 25.2779, 51.5053).
const LAT = 25.2779, LNG = 51.5053;
const near = (a, b) => Math.abs(a - b) < 0.001;
const okDoc = (c) => c && near(c.lat, LAT) && near(c.lng, LNG);

test('/@lat,lng,zoom form', () => {
  assert.ok(okDoc(extractMapCoords(`https://www.google.com/maps/@${LAT},${LNG},17z`)));
});
test('/place/.../@lat,lng form', () => {
  assert.ok(okDoc(extractMapCoords(`https://www.google.com/maps/place/DOC+Medical+Center/@${LAT},${LNG},17z/data=!3m1`)));
});
test('?q=lat,lng form', () => {
  assert.ok(okDoc(extractMapCoords(`https://maps.google.com/?q=${LAT},${LNG}`)));
});
test('search api query=lat,lng form', () => {
  assert.ok(okDoc(extractMapCoords(`https://www.google.com/maps/search/?api=1&query=${LAT},${LNG}`)));
});
test('embed iframe !3d<lat>!2d<lng> form', () => {
  assert.ok(okDoc(extractMapCoords(`https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3607!2d${LNG}!3d${LAT}!2m3!1f0`)));
});
test('q=loc:lat,lng form', () => {
  assert.ok(okDoc(extractMapCoords(`https://maps.google.com/maps?q=loc:${LAT},${LNG}&z=16`)));
});

test('coordinate order is disambiguated by Qatar bbox (swapped input still resolves)', () => {
  // A link that mistakenly puts lng first — bbox validation must still land the pin in Qatar.
  const c = extractMapCoords(`https://www.google.com/maps/@${LNG},${LAT},17z`);
  assert.ok(okDoc(c), 'swapped @lng,lat should be corrected to Qatar-valid lat,lng');
});

test('rejects a non-Qatar coordinate (never a false pin)', () => {
  assert.equal(extractMapCoords('https://www.google.com/maps/@42.3314,-83.0458,17z'), null); // Detroit
  assert.equal(extractMapCoords('https://www.google.com/maps/@0,0,3z'), null);               // Null Island
});
test('rejects a non-maps URL', () => {
  assert.equal(extractMapCoords('https://docmedc.com/contact-us/'), null);
  assert.equal(extractMapCoords(''), null);
});

test('extractMapLinks pulls multiple branches from page HTML + dedupes', () => {
  const html = `
    <iframe src="https://www.google.com/maps/embed?pb=!1m18!2d${LNG}!3d${LAT}"></iframe>
    <a href="https://maps.google.com/?q=25.3548,51.1839">Lusail branch</a>
    <a href="https://www.google.com/maps/@25.3548,51.1839,17z">same Lusail (dup)</a>
    <a href="https://docmedc.com/about">not a map</a>`;
  const { coords } = extractMapLinks(html, []);
  assert.equal(coords.length, 2, 'two distinct branches, dedup collapses the repeat');
  assert.ok(coords.some((c) => okDoc(c)));
});

test('extractMapLinks decodes &amp; entities and surfaces short links', () => {
  const html = `<a href="https://www.google.com/maps/search/?api=1&amp;query=${LAT},${LNG}">HQ</a>
                <a href="https://maps.app.goo.gl/AbCdEf123">short</a>`;
  const { coords, shortLinks } = extractMapLinks(html, []);
  assert.ok(coords.some((c) => okDoc(c)), 'entity-encoded & must be decoded');
  assert.equal(shortLinks.length, 1);
});

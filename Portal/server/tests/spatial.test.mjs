// Point-in-polygon + grid index (gis/spatial.js). Run: node server/tests/spatial.test.mjs
import assert from 'node:assert/strict';
import { pointInPolygon, ringsBbox, buildPolygonIndex, locateInIndex } from '../gis/spatial.js';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); console.log('  ✓ ' + name); pass++; } catch (e) { console.log('  ✗ ' + name + '\n    ' + e.message); fail++; } };

// A 10×10 square from (0,0) to (10,10), with a 2×2 hole from (4,4) to (6,6).
const square = [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]];
const withHole = [
  [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
  [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
];

console.log('point-in-polygon:');
t('centre is inside', () => assert.equal(pointInPolygon(5, 5, square), true));
t('outside to the right', () => assert.equal(pointInPolygon(15, 5, square), false));
t('outside below', () => assert.equal(pointInPolygon(5, -1, square), false));
t('a point in the hole is OUTSIDE', () => assert.equal(pointInPolygon(5, 5, withHole), false));
t('a point in the solid part (with a hole) is inside', () => assert.equal(pointInPolygon(1, 1, withHole), true));

console.log('\nbbox + grid index:');
t('bbox of the square', () => assert.deepEqual(ringsBbox(square), [0, 0, 10, 10]));
t('locate finds the containing polygon', () => {
  const feats = [
    { id: 'A', rings: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]], bbox: [0, 0, 10, 10] },
    { id: 'B', rings: [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]], bbox: [20, 20, 30, 30] },
  ];
  const idx = buildPolygonIndex(feats, 5);
  assert.equal(locateInIndex(idx, 5, 5), 'A');
  assert.equal(locateInIndex(idx, 25, 25), 'B');
  assert.equal(locateInIndex(idx, 15, 15), null);   // between the two — inside neither
});
t('locate returns null outside all polygons', () => {
  const idx = buildPolygonIndex([{ id: 'A', rings: square, bbox: [0, 0, 10, 10] }], 5);
  assert.equal(locateInIndex(idx, 100, 100), null);
});

console.log(`\n${pass}/${pass + fail} PASS`);
if (fail) process.exit(1);

// Minimal spatial helpers (no PostGIS). Point-in-polygon + a bbox grid index so
// we can locate each of the ~250k parcels inside one of the 846 districts without
// a spatial database. Coordinates are [lng, lat] (WGS84).

// Ray-casting: is point inside a single ring?
export function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) inside = !inside;
  }
  return inside;
}

// Even-odd across all rings (handles exterior + holes correctly).
export function pointInPolygon(x, y, rings) {
  let crossings = 0;
  for (const ring of rings) if (ring.length >= 4 && pointInRing(x, y, ring)) crossings++;
  return crossings % 2 === 1;
}

export function ringsBbox(rings) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const ring of rings) for (const p of ring) {
    if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
    if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
  }
  return [minx, miny, maxx, maxy];
}

export function polygonCentroid(rings) {
  const ring = rings && rings[0];
  if (!ring || !ring.length) return null;
  let sx = 0, sy = 0, n = 0;
  for (const p of ring) { sx += p[0]; sy += p[1]; n++; }
  return n ? { lng: sx / n, lat: sy / n } : null;
}

// Build a grid index over polygon features: { id, rings, bbox }. A feature is
// registered in every grid cell its bbox touches, so a lookup only tests the few
// polygons near the query point.
export function buildPolygonIndex(features, cellDeg = 0.02) {
  const grid = new Map();
  for (const f of features) {
    const [minx, miny, maxx, maxy] = f.bbox;
    for (let cx = Math.floor(minx / cellDeg); cx <= Math.floor(maxx / cellDeg); cx++) {
      for (let cy = Math.floor(miny / cellDeg); cy <= Math.floor(maxy / cellDeg); cy++) {
        const k = cx + ':' + cy;
        let bucket = grid.get(k);
        if (!bucket) { bucket = []; grid.set(k, bucket); }
        bucket.push(f);
      }
    }
  }
  return { grid, cellDeg };
}

// Return the id of the polygon feature containing (lng,lat), or null.
export function locateInIndex(index, lng, lat) {
  if (lng == null || lat == null) return null;
  const bucket = index.grid.get(Math.floor(lng / index.cellDeg) + ':' + Math.floor(lat / index.cellDeg));
  if (!bucket) return null;
  for (const f of bucket) {
    const b = f.bbox;
    if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
    if (pointInPolygon(lng, lat, f.rings)) return f.id;
  }
  return null;
}

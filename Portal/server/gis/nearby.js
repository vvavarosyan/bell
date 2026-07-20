// Geospatial helpers — "what's near this point" over Bell's own data (companies,
// GIS buildings, cadastre parcels + land-use). All Bell data is Qatar and every
// table carries lat/lng (or a centroid), so a bbox pre-filter + Haversine refine
// is exact enough and needs no PostGIS. Powers Bella's map-knowledge tools AND
// the reliable DB-backed land layer.

import { query } from '../db.js';

const EARTH_M = 6371000;
const toRad = (x) => (x * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.sqrt(a));
}

// A generous lat/lng box for a radius (refined by Haversine after the fetch).
function bboxFor(lat, lng, radiusM) {
  const dLat = radiusM / 111320;
  const dLng = radiusM / ((111320 * Math.cos(toRad(lat))) || 1);
  return { xmin: lng - dLng, ymin: lat - dLat, xmax: lng + dLng, ymax: lat + dLat };
}

const inQatar = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng)
  && lng >= 50.55 && lng <= 51.85 && lat >= 24.40 && lat <= 26.30;

/** Resolve a center point from {lat,lng} | {companyId} | {name}. Returns
 *  { lat, lng, label } or null. */
export async function resolveCenter({ lat, lng, companyId, name } = {}) {
  if (inQatar(Number(lat), Number(lng))) return { lat: Number(lat), lng: Number(lng), label: 'the point' };
  if (companyId) {
    const r = await query(`SELECT name, latitude, longitude FROM companies WHERE id=$1`, [Number(companyId)]);
    const c = r.rows[0];
    if (c && inQatar(Number(c.latitude), Number(c.longitude))) return { lat: Number(c.latitude), lng: Number(c.longitude), label: c.name };
  }
  if (name && String(name).trim().length >= 2) {
    const n = String(name).trim();
    // A company with coords, then a named GIS building.
    const c = await query(
      `SELECT name, latitude, longitude FROM companies
        WHERE latitude IS NOT NULL AND COALESCE(archived,false)=false AND name ILIKE '%' || $1 || '%'
        ORDER BY (lower(name)=lower($1)) DESC LIMIT 1`, [n]);
    if (c.rows[0] && inQatar(Number(c.rows[0].latitude), Number(c.rows[0].longitude)))
      return { lat: Number(c.rows[0].latitude), lng: Number(c.rows[0].longitude), label: c.rows[0].name };
    const b = await query(
      `SELECT ename, latitude, longitude FROM gis_landmarks
        WHERE latitude IS NOT NULL AND ename ILIKE '%' || $1 || '%' ORDER BY (lower(ename)=lower($1)) DESC LIMIT 1`, [n]);
    if (b.rows[0] && inQatar(Number(b.rows[0].latitude), Number(b.rows[0].longitude)))
      return { lat: Number(b.rows[0].latitude), lng: Number(b.rows[0].longitude), label: b.rows[0].ename };
  }
  return null;
}

/** Companies within radiusM of (lat,lng), nearest first (each with distance_m). */
export async function companiesNear(lat, lng, radiusM, limit = 20) {
  const b = bboxFor(lat, lng, radiusM);
  const r = await query(
    `SELECT id, name, industry, city, website, latitude, longitude
       FROM companies
      WHERE COALESCE(archived,false)=false
        AND latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4`,
    [b.ymin, b.ymax, b.xmin, b.xmax]);
  return r.rows
    .map((c) => ({ id: c.id, name: c.name, industry: c.industry, city: c.city, website: c.website,
      distance_m: Math.round(haversine(lat, lng, Number(c.latitude), Number(c.longitude))) }))
    .filter((c) => c.distance_m <= radiusM)
    .sort((a, c) => a.distance_m - c.distance_m)
    .slice(0, limit);
}

/** OpenStreetMap places (restaurants, shops, clinics…) within radiusM, nearest first. */
export async function placesNear(lat, lng, radiusM, limit = 20, group = null) {
  const b = bboxFor(lat, lng, radiusM);
  const params = [b.ymin, b.ymax, b.xmin, b.xmax];
  let extra = '';
  if (group) { params.push(group); extra = ` AND category_group = $${params.length}`; }
  const r = await query(
    `SELECT id, name, category, category_group, phone, website, latitude, longitude, matched_company_id
       FROM osm_places
      WHERE latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4${extra}`,
    params).catch(() => ({ rows: [] }));
  return r.rows
    .map((p) => ({ id: p.id, name: p.name, category: p.category, group: p.category_group,
      phone: p.phone, website: p.website, company_id: p.matched_company_id || null,
      distance_m: Math.round(haversine(lat, lng, Number(p.latitude), Number(p.longitude))) }))
    .filter((p) => p.distance_m <= radiusM)
    .sort((a, c) => a.distance_m - c.distance_m)
    .slice(0, limit);
}

/** GIS buildings/landmarks within radiusM of (lat,lng), nearest first. */
export async function buildingsNear(lat, lng, radiusM, limit = 20) {
  const b = bboxFor(lat, lng, radiusM);
  const r = await query(
    `SELECT ename, category, subcategory_name, district_ename, street_ename, zone_no, latitude, longitude, company_id
       FROM gis_landmarks
      WHERE latitude BETWEEN $1 AND $2 AND longitude BETWEEN $3 AND $4`,
    [b.ymin, b.ymax, b.xmin, b.xmax]);
  return r.rows
    .map((x) => ({ name: x.ename, category: x.category, subcategory: x.subcategory_name,
      district: x.district_ename, street: x.street_ename, zone_no: x.zone_no, company_id: x.company_id,
      distance_m: Math.round(haversine(lat, lng, Number(x.latitude), Number(x.longitude))) }))
    .filter((x) => x.distance_m <= radiusM)
    .sort((a, c) => a.distance_m - c.distance_m)
    .slice(0, limit);
}

/** The parcel + land-use nearest to (lat,lng): size in m², zoning, plot id. */
export async function landAt(lat, lng) {
  const b = bboxFor(lat, lng, 300);   // parcels are small; 300m box always contains the enclosing plot
  const plot = (await query(
    `SELECT pin, area_sqm, centroid_lat, centroid_lng FROM gis_cadastre_plots
      WHERE centroid_lat BETWEEN $1 AND $2 AND centroid_lng BETWEEN $3 AND $4`,
    [b.ymin, b.ymax, b.xmin, b.xmax])).rows
    .map((p) => ({ ...p, d: haversine(lat, lng, Number(p.centroid_lat), Number(p.centroid_lng)) }))
    .sort((a, c) => a.d - c.d)[0] || null;
  const zone = (await query(
    `SELECT zoning, zoning_label, area_sqm, centroid_lat, centroid_lng FROM gis_landuse
      WHERE centroid_lat BETWEEN $1 AND $2 AND centroid_lng BETWEEN $3 AND $4`,
    [b.ymin, b.ymax, b.xmin, b.xmax])).rows
    .map((z) => ({ ...z, d: haversine(lat, lng, Number(z.centroid_lat), Number(z.centroid_lng)) }))
    .sort((a, c) => a.d - c.d)[0] || null;
  if (!plot && !zone) return null;
  return {
    plot_id: plot?.pin || null,
    plot_area_sqm: plot?.area_sqm != null ? Math.round(plot.area_sqm) : null,
    zoning: zone?.zoning_label || zone?.zoning || null,
    zoning_area_sqm: zone?.area_sqm != null ? Math.round(zone.area_sqm) : null,
  };
}

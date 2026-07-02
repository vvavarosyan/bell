// Map view — Mapbox GL JS, full intelligence dashboard.
//
// Features:
//   • Globe intro: spinning earth → smooth flyTo Qatar
//   • Mapbox Standard style by default (3D buildings + dynamic light)
//   • Clustered company markers, colored by source
//   • Heatmap density layer (toggle)
//   • Live Traffic v1 layer (toggle — uses your Mapbox tile quota)
//   • Weather radar overlay via RainViewer (toggle — free, no auth)
//   • Source filter chips (QFC / QFZ / MOCI / QSTP)
//   • Year-founded range slider (filter by founding year)
//   • Isochrone tool: click map → draw 15/30/45-min drive-time polygons
//   • Polygon lasso: draw a shape → count companies inside, export list
//   • Geocoder search box (Qatar-scoped)
//   • Spider expand for over-clustered points

import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

// --- CDN-pinned deps ------------------------------------------------------
const MAPBOX_VERSION   = '3.7.0';
const MAPBOX_JS_URL    = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.js`;
const MAPBOX_CSS_URL   = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.css`;
const GEOCODER_VERSION = '5.0.2';
const GEOCODER_JS_URL  = `https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v${GEOCODER_VERSION}/mapbox-gl-geocoder.min.js`;
const GEOCODER_CSS_URL = `https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/v${GEOCODER_VERSION}/mapbox-gl-geocoder.css`;
const DRAW_VERSION     = '1.4.3';
const DRAW_JS_URL      = `https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v${DRAW_VERSION}/mapbox-gl-draw.js`;
const DRAW_CSS_URL     = `https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v${DRAW_VERSION}/mapbox-gl-draw.css`;

// Doha center for fly-to + isochrone default
const DOHA = [51.5310, 25.2854];

// Per-source colors
const SOURCE_COLOR = {
  QFC:  '#8bb0ff',
  QFZ:  '#c5a3ff',
  MOCI: '#ffc594',
  QSTP: '#9fefb8',
};
const DEFAULT_COLOR = '#8a93a6';
const SOURCES = ['QFC', 'QFZ', 'MOCI', 'QSTP'];

// Isochrone contour colors (in order from largest → smallest area, so 15min sits on top)
const ISO_COLORS = {
  45: { fill: '#5b8cff', alpha: 0.10 },
  30: { fill: '#7ec8ff', alpha: 0.18 },
  15: { fill: '#9fefb8', alpha: 0.28 },
};

// --- Loader helpers -------------------------------------------------------

function loadStylesheet(href) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = href;
  document.head.appendChild(link);
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load',  () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Script load failed: ' + src)), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload  = () => { s.dataset.loaded = 'true'; resolve(); };
    s.onerror = () => reject(new Error('Script load failed: ' + src));
    document.head.appendChild(s);
  });
}
let mapboxLoading = null;
function loadMapboxGL() {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (mapboxLoading) return mapboxLoading;
  loadStylesheet(MAPBOX_CSS_URL);
  mapboxLoading = loadScript(MAPBOX_JS_URL).then(() => window.mapboxgl);
  return mapboxLoading;
}
let geocoderLoading = null;
function loadGeocoder() {
  if (window.MapboxGeocoder) return Promise.resolve(window.MapboxGeocoder);
  if (geocoderLoading) return geocoderLoading;
  loadStylesheet(GEOCODER_CSS_URL);
  geocoderLoading = loadScript(GEOCODER_JS_URL).then(() => window.MapboxGeocoder);
  return geocoderLoading;
}
let drawLoading = null;
function loadDraw() {
  if (window.MapboxDraw) return Promise.resolve(window.MapboxDraw);
  if (drawLoading) return drawLoading;
  loadStylesheet(DRAW_CSS_URL);
  drawLoading = loadScript(DRAW_JS_URL).then(() => window.MapboxDraw);
  return drawLoading;
}

// --- Globe spin ----------------------------------------------------------

function startGlobeSpin(map, speedDegPerSec = 16) {
  let stopped = false;
  let last = performance.now();
  function frame(now) {
    if (stopped) return;
    const dt = (now - last) / 1000;
    last = now;
    const c = map.getCenter();
    c.lng -= speedDegPerSec * dt;
    if (c.lng < -180) c.lng += 360;
    map.setCenter(c);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return () => { stopped = true; };
}

// --- Geometry helpers ----------------------------------------------------

// Ray-casting point-in-polygon — accepts a [[lng,lat],...] ring
function pointInPolygon(pt, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = ((yi > pt[1]) !== (yj > pt[1])) &&
      (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi || 1e-12) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

// --- Signals on the map (Phase D) ------------------------------------------
// Same kind palette as the Signals radar — distinct from company source dots.
const SIGNAL_COLOR = {
  hiring: '#22c55e', newly_licensed: '#5b8cff', partnership: '#14b8a6',
  leadership: '#a855f7', news_event: '#f59e0b',
};
const sigColorExpr = () => ['match', ['get', 'kind'],
  'hiring', SIGNAL_COLOR.hiring, 'newly_licensed', SIGNAL_COLOR.newly_licensed,
  'partnership', SIGNAL_COLOR.partnership, 'leadership', SIGNAL_COLOR.leadership,
  'news_event', SIGNAL_COLOR.news_event, '#5b8cff'];

// --- Network arcs (Phase D) --------------------------------------------------
// Click a company → animated arcs spread to its partners / clients / group
// members (Engine 3 edges) that have coordinates. Background click clears.
const relColorExpr = () => ['match', ['get', 'relation'],
  'partner', '#14b8a6', 'client', '#22c55e', 'affiliate', '#a855f7',
  'parent', '#f59e0b', 'subsidiary', '#f59e0b', '#5b8cff'];

// Quadratic-bezier "great-circle feel" arc between two [lng,lat] points.
function arcCoords(a, b, steps = 32) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const dist = Math.sqrt(dx * dx + dy * dy) || 1e-9;
  const lift = Math.min(dist * 0.25, 3);
  const cx = mx - (dy / dist) * lift, cy = my + (dx / dist) * lift;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    pts.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]);
  }
  return pts;
}

let arcAnimTimer = null;
function clearNetwork(map) {
  if (arcAnimTimer) { clearInterval(arcAnimTimer); arcAnimTimer = null; }
  try { if (map.getLayer('network-arcs')) map.removeLayer('network-arcs'); } catch { /* ignore */ }
  try { if (map.getLayer('network-arcs-glow')) map.removeLayer('network-arcs-glow'); } catch { /* ignore */ }
  try { if (map.getSource('network')) map.removeSource('network'); } catch { /* ignore */ }
}

async function showNetwork(map, companyId, origin) {
  try {
    const r = await api.companyMapNetwork(companyId);
    clearNetwork(map);
    const all = r.edges || [];
    const edges = all.filter((e) => Number.isFinite(Number(e.t_lng)) && Number.isFinite(Number(e.t_lat)));
    if (!edges.length) {
      if (all.length) toast(`${all.length} network link${all.length === 1 ? '' : 's'} known — none with map coordinates yet.`);
      return;
    }
    const fc = {
      type: 'FeatureCollection',
      features: edges.map((e) => ({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: arcCoords(origin, [Number(e.t_lng), Number(e.t_lat)]) },
        properties: { relation: e.relation_type, name: e.target_name },
      })),
    };
    map.addSource('network', { type: 'geojson', data: fc });
    map.addLayer({
      id: 'network-arcs-glow', type: 'line', source: 'network',
      paint: { 'line-color': relColorExpr(), 'line-width': 5, 'line-opacity': 0.18, 'line-blur': 3 },
    });
    map.addLayer({
      id: 'network-arcs', type: 'line', source: 'network',
      paint: { 'line-color': relColorExpr(), 'line-width': 1.8, 'line-opacity': 0.9, 'line-dasharray': [0, 4, 3] },
    });
    // Marching-ants flow animation (stepped dasharray cycle).
    const seq = [[0, 4, 3], [0.5, 4, 2.5], [1, 4, 2], [1.5, 4, 1.5], [2, 4, 1], [2.5, 4, 0.5], [3, 4, 0]];
    let step = 0;
    arcAnimTimer = setInterval(() => {
      step = (step + 1) % seq.length;
      try { map.setPaintProperty('network-arcs', 'line-dasharray', seq[step]); }
      catch { clearInterval(arcAnimTimer); arcAnimTimer = null; }
    }, 90);
    const more = all.length - edges.length;
    toast(`Network: ${edges.length} link${edges.length === 1 ? '' : 's'} drawn${more > 0 ? ` · ${more} more without coordinates` : ''}`);
  } catch { /* soft — the popup already opened */ }
}

// --- Component ------------------------------------------------------------

export function MapTab() {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const tokenRef = useRef(null);
  const geoDataRef = useRef(null);              // raw GeoJSON for client-side filtering

  // UI state
  const [status, setStatus] = useState('booting');
  const [errorMsg, setErrorMsg] = useState('');
  const [stats, setStats] = useState(null);
  const [showHeatmap,  setShowHeatmap]  = useState(false);
  const [showTraffic,  setShowTraffic]  = useState(false);
  const [showWeather,  setShowWeather]  = useState(false);
  const [showSignals,  setShowSignals]  = useState(true);   // Phase D — live signal pins
  const [toolsOpen,    setToolsOpen]    = useState(true);   // collapsible toolbox
  const [activeSources, setActiveSources] = useState(new Set(SOURCES));
  const [yearRange,    setYearRange]    = useState({ min: 1950, max: new Date().getFullYear() });
  const [yearBounds,   setYearBounds]   = useState({ min: 1950, max: new Date().getFullYear() });
  const [activeTool,   setActiveTool]   = useState(null);   // null | 'isochrone' | 'lasso'
  const [lassoResult,  setLassoResult]  = useState(null);   // { count, sample }

  // ---- React filter changes back into Mapbox layer filters ---------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    refilter(map, activeSources, yearRange);
    setLayerVisibility(map, 'company-heatmap', showHeatmap);
    setLayerVisibility(map, 'traffic',         showTraffic);
    setLayerVisibility(map, 'weather-radar',   showWeather);
    setLayerVisibility(map, 'signal-rings',    showSignals);
    setLayerVisibility(map, 'signal-points',   showSignals);
  }, [showHeatmap, showTraffic, showWeather, showSignals, activeSources, yearRange]);

  // ---- Boot -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    let map = null;
    let stopSpin = null;

    (async () => {
      try {
        let token;
        try {
          const r = await api.publicToken('mapbox');
          token = r.value;
          tokenRef.current = token;
        } catch (err) {
          if (cancelled) return;
          setStatus('no_token');
          return;
        }
        const settingsRes = await api.settings().catch(() => null);
        const style = settingsRes?.settings?.mapbox_style || 'mapbox://styles/mapbox/standard';

        setStatus('loading');

        const [mapboxgl, MapboxGeocoder, MapboxDraw] = await Promise.all([
          loadMapboxGL(),
          loadGeocoder(),
          loadDraw(),
        ]);
        mapboxgl.accessToken = token;

        // Fetch company GeoJSON + weather timestamp + live signals in parallel
        const [geo, weatherMeta, sigData] = await Promise.all([
          api.companiesMap(),
          fetch('https://api.rainviewer.com/public/weather-maps.json').then(r => r.json()).catch(() => null),
          api.signalsMap().catch(() => ({ rows: [] })),
        ]);
        if (cancelled) return;
        geoDataRef.current = geo;
        setStats({ total: geo.total });
        const sigGeo = {
          type: 'FeatureCollection',
          features: (sigData.rows || []).map((s) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [Number(s.longitude), Number(s.latitude)] },
            properties: { kind: s.kind, title: s.title, company_id: s.company_id, company_name: s.company_name },
          })),
        };

        // Compute year bounds from data for slider
        const years = (geo.features || [])
          .map(f => Number(f.properties.year))
          .filter(y => Number.isFinite(y) && y > 1800 && y <= new Date().getFullYear());
        if (years.length > 0) {
          const bounds = { min: Math.min(...years), max: Math.max(...years) };
          setYearBounds(bounds);
          setYearRange(bounds);
        }

        // Mount map with globe intro
        map = new mapboxgl.Map({
          container: containerRef.current,
          style,
          projection: 'globe',
          center: [25, 25], zoom: 1.5,
          attributionControl: false,
        });
        mapRef.current = map;

        map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'top-right');
        map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
        map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-right');
        map.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

        // Phase D: the search box now finds BELL COMPANIES as well as places —
        // company matches (from the loaded map data) merge into the dropdown
        // above Mapbox's place results.
        const companyGeocoder = (q) => {
          const ql = String(q || '').trim().toLowerCase();
          if (ql.length < 2) return [];
          return (geoDataRef.current?.features || [])
            .filter((f) => String(f.properties.name || '').toLowerCase().includes(ql))
            .slice(0, 6)
            .map((f) => ({
              type: 'Feature',
              geometry: f.geometry,
              center: f.geometry.coordinates,
              place_name: `● ${f.properties.name}${f.properties.city ? ' — ' + f.properties.city : ''}`,
              place_type: ['place'],
              text: f.properties.name,
              properties: f.properties,
            }));
        };
        const geocoder = new MapboxGeocoder({
          accessToken: token, mapboxgl: window.mapboxgl,
          marker: { color: '#5b8cff' },
          placeholder: 'Search companies & places…',
          countries: 'qa', bbox: [50.55, 24.40, 51.85, 26.30],
          proximity: { longitude: DOHA[0], latitude: DOHA[1] },
          flyTo: { zoom: 13, speed: 1.4 },
          localGeocoder: companyGeocoder,
        });
        map.addControl(geocoder, 'top-left');

        // Draw plugin — initialized but disabled. Activated via lasso tool.
        const draw = new MapboxDraw({
          displayControlsDefault: false,
          controls: {},
          defaultMode: 'simple_select',
        });
        drawRef.current = draw;
        map.addControl(draw);

        map.on('style.load', () => {
          if (cancelled) return;
          try {
            map.setFog({
              color: 'rgb(13, 16, 24)',
              'high-color': 'rgb(36, 92, 223)',
              'horizon-blend': 0.04,
              'space-color': '#000510',
              'star-intensity': 0.6,
            });
          } catch {}
        });

        map.on('load', () => {
          if (cancelled) return;

          stopSpin = startGlobeSpin(map, 16);
          setTimeout(() => {
            if (cancelled) return;
            stopSpin?.();
            map.flyTo({
              center: DOHA, zoom: 9, pitch: 35, bearing: 0,
              duration: 4500, curve: 1.42, speed: 1.2, essential: true,
            });
          }, 2500);

          // ---- Companies source + layers ------------------------------
          map.addSource('companies', {
            type: 'geojson', data: geo,
            cluster: true, clusterMaxZoom: 14, clusterRadius: 50,
          });

          map.addLayer({
            id: 'company-heatmap', type: 'heatmap', source: 'companies',
            maxzoom: 14, layout: { visibility: 'none' },
            paint: {
              'heatmap-weight': 1,
              'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 14, 3],
              'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(0,0,60,0)',
                0.2, 'rgba(91,140,255,0.5)',
                0.4, 'rgba(126,200,255,0.7)',
                0.6, 'rgba(123,227,168,0.8)',
                0.8, 'rgba(251,191,36,0.85)',
                1,   'rgba(255,80,80,0.9)',
              ],
              'heatmap-radius':  ['interpolate', ['linear'], ['zoom'], 0, 10, 14, 40],
              'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0.85, 14, 0.4],
            },
          });

          map.addLayer({
            id: 'clusters', type: 'circle', source: 'companies',
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': '#5b8cff',
              'circle-opacity': 0.85,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#a8c0ff',
              'circle-radius': ['step', ['get', 'point_count'], 14, 10, 20, 50, 28, 200, 36],
            },
          });
          map.addLayer({
            id: 'cluster-count', type: 'symbol', source: 'companies',
            filter: ['has', 'point_count'],
            layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'], 'text-size': 12 },
            paint: { 'text-color': '#ffffff' },
          });
          map.addLayer({
            id: 'company-points', type: 'circle', source: 'companies',
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 5, 14, 9, 18, 14],
              'circle-color': [
                'case',
                ['in', 'QFC',  ['get', 'sources']], SOURCE_COLOR.QFC,
                ['in', 'QFZ',  ['get', 'sources']], SOURCE_COLOR.QFZ,
                ['in', 'MOCI', ['get', 'sources']], SOURCE_COLOR.MOCI,
                ['in', 'QSTP', ['get', 'sources']], SOURCE_COLOR.QSTP,
                DEFAULT_COLOR,
              ],
              'circle-stroke-color': '#0d1018',
              'circle-stroke-width': 2,
              'circle-opacity': 0.95,
            },
          });

          // ---- Traffic (toggle off by default) -------------------------
          map.addSource('mapbox-traffic-source', {
            type: 'vector',
            url: 'mapbox://mapbox.mapbox-traffic-v1',
          });
          map.addLayer({
            id: 'traffic',
            type: 'line',
            source: 'mapbox-traffic-source',
            'source-layer': 'traffic',
            layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
            paint: {
              'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 14, 2.5, 18, 6],
              'line-color': [
                'match', ['get', 'congestion'],
                'low',      '#4caf50',
                'moderate', '#ffc107',
                'heavy',    '#ff5722',
                'severe',   '#b71c1c',
                'rgba(0,0,0,0)',
              ],
              'line-opacity': 0.85,
            },
          }, 'company-heatmap');   // place underneath company markers

          // ---- Weather radar (RainViewer) ------------------------------
          if (weatherMeta && weatherMeta.host && weatherMeta.radar && weatherMeta.radar.nowcast?.length) {
            // Pick the most recent nowcast frame
            const frames = [...(weatherMeta.radar.past || []), ...(weatherMeta.radar.nowcast || [])];
            const latest = frames[frames.length - 1];
            const tileUrl = `${weatherMeta.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`;
            map.addSource('weather-radar-source', {
              type: 'raster',
              tiles: [tileUrl],
              tileSize: 256,
              attribution: '<a href="https://www.rainviewer.com" target="_blank">RainViewer</a>',
            });
            map.addLayer({
              id: 'weather-radar',
              type: 'raster',
              source: 'weather-radar-source',
              layout: { visibility: 'none' },
              paint: { 'raster-opacity': 0.65 },
            }, 'clusters');
          }

          // ---- SIGNALS layer (Phase D) — market movement pinned on the map,
          // visually DISTINCT from company dots (white core stroke + halo ring,
          // kind-colored — the same palette as the Signals radar).
          map.addSource('signals', { type: 'geojson', data: sigGeo });
          map.addLayer({
            id: 'signal-rings', type: 'circle', source: 'signals',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 9, 14, 16],
              'circle-color': sigColorExpr(),
              'circle-opacity': 0.18,
            },
          });
          map.addLayer({
            id: 'signal-points', type: 'circle', source: 'signals',
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 14, 5.5],
              'circle-color': sigColorExpr(),
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 1.4,
              'circle-opacity': 0.95,
            },
          });
          map.on('click', 'signal-points', (e) => {
            const f = e.features[0]; if (!f) return;
            const p = f.properties || {};
            const el = document.createElement('div');
            el.style.cssText = 'font-size:12px;max-width:250px;line-height:1.45';
            const kindEl = document.createElement('div');
            kindEl.style.cssText = `text-transform:uppercase;font-size:9.5px;letter-spacing:.08em;font-weight:700;color:${SIGNAL_COLOR[p.kind] || '#5b8cff'}`;
            kindEl.textContent = String(p.kind || 'signal').replace(/_/g, ' ');
            const titleEl = document.createElement('div');
            titleEl.style.cssText = 'font-weight:600;margin:3px 0 6px;color:#111';
            titleEl.textContent = p.title || '';
            el.appendChild(kindEl); el.appendChild(titleEl);
            if (p.company_id) {
              const btn = document.createElement('button');
              btn.textContent = (p.company_name || 'Open company') + ' →';
              btn.style.cssText = 'background:none;border:none;padding:0;color:#3b64c4;font-size:12px;font-weight:600;cursor:pointer';
              btn.onclick = () => navigateTo('companies', Number(p.company_id));
              el.appendChild(btn);
            }
            new mapboxgl.Popup({ offset: 10 }).setLngLat(f.geometry.coordinates).setDOMContent(el).addTo(map);
          });

          // ---- Cluster click → zoom or spider --------------------------
          map.on('click', 'clusters', (e) => {
            const features = map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const f = features[0]; if (!f) return;
            const clusterId = f.properties.cluster_id;
            const src = map.getSource('companies');
            src.getClusterExpansionZoom(clusterId, (err, zoom) => {
              if (err) return;
              const targetZoom = Math.min(zoom, 17);
              if (map.getZoom() >= 15 && targetZoom <= map.getZoom() + 0.5) {
                src.getClusterLeaves(clusterId, 100, 0, (err2, leaves) => {
                  if (err2 || !leaves?.length) return;
                  spiderfy(map, f.geometry.coordinates, leaves, mapboxgl);
                });
              } else {
                map.easeTo({ center: f.geometry.coordinates, zoom: targetZoom });
              }
            });
          });

          // ---- Point click → popup + network spread (Phase D) ----------
          map.on('click', 'company-points', (e) => {
            const f = e.features[0]; if (!f) return;
            openPopup(map, f.geometry.coordinates, f.properties, mapboxgl);
            // Spread this company's network: animated arcs to its partners /
            // clients / group members that have coordinates.
            const cid = Number(f.properties.id);
            if (Number.isFinite(cid) && cid > 0) {
              showNetwork(map, cid, f.geometry.coordinates.slice());
            }
          });

          // Background click (no pin under the cursor) clears the arcs.
          map.on('click', (e) => {
            const layers = ['company-points', 'clusters', 'signal-points'].filter((l) => map.getLayer(l));
            const hits = layers.length ? map.queryRenderedFeatures(e.point, { layers }) : [];
            if (!hits.length) clearNetwork(map);
          });

          ['clusters', 'company-points', 'signal-points'].forEach(layer => {
            map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
          });

          // ---- Draw events (lasso polygon → count companies inside) ----
          const updateLasso = () => {
            const features = draw.getAll().features;
            const poly = features[features.length - 1];
            if (!poly || poly.geometry.type !== 'Polygon') {
              setLassoResult(null);
              return;
            }
            const ring = poly.geometry.coordinates[0];
            const companies = (geoDataRef.current?.features || [])
              .filter(c => pointInPolygon(c.geometry.coordinates, ring));
            setLassoResult({
              count: companies.length,
              sample: companies.slice(0, 5).map(c => c.properties.name),
              all:    companies,
            });
          };
          map.on('draw.create', updateLasso);
          map.on('draw.update', updateLasso);
          map.on('draw.delete', () => setLassoResult(null));

          setStatus('ready');
        });

        map.on('error', (e) => {
          if (cancelled) return;
          const msg = e?.error?.message || 'Mapbox failed to load';
          setErrorMsg(msg); setStatus('error');
        });
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err.message); setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      stopSpin?.();
      if (arcAnimTimer) { clearInterval(arcAnimTimer); arcAnimTimer = null; }
      try { mapRef.current?.remove(); } catch {}
      mapRef.current = null;
    };
  }, []);

  // --- Tool handlers ---------------------------------------------------

  const toggleSource = (src) => {
    setActiveSources(prev => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src); else next.add(src);
      return next;
    });
  };

  const flyToQatar = () => mapRef.current?.flyTo({
    center: DOHA, zoom: 9, pitch: 35, duration: 1400,
  });

  // Isochrone tool — single click anywhere on map sets the origin
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (activeTool !== 'isochrone') return;
    const handler = async (e) => {
      const center = e.lngLat;
      await drawIsochrone(map, [center.lng, center.lat], tokenRef.current);
      setActiveTool(null);   // single-shot tool
      map.getCanvas().style.cursor = '';
    };
    map.getCanvas().style.cursor = 'crosshair';
    map.once('click', handler);
    return () => {
      map.off('click', handler);
      map.getCanvas().style.cursor = '';
    };
  }, [activeTool]);

  // Lasso tool — switch draw plugin into polygon mode
  useEffect(() => {
    const draw = drawRef.current;
    if (!draw) return;
    if (activeTool === 'lasso') {
      draw.changeMode('draw_polygon');
      mapRef.current.getCanvas().style.cursor = 'crosshair';
    } else {
      try { draw.changeMode('simple_select'); } catch {}
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = '';
    }
  }, [activeTool]);

  const clearLasso = () => {
    try { drawRef.current?.deleteAll(); } catch {}
    setLassoResult(null);
    setActiveTool(null);
  };

  const clearIsochrones = () => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of [45, 30, 15]) {
      const id = 'iso-' + m;
      if (map.getLayer(id))      map.removeLayer(id);
      if (map.getLayer(id+'-line')) map.removeLayer(id+'-line');
      if (map.getSource(id))     map.removeSource(id);
    }
  };

  const exportLassoCSV = () => {
    if (!lassoResult?.all?.length) return;
    const rows = [['BIN', 'Name', 'Industry', 'City', 'Sources']];
    for (const f of lassoResult.all) {
      const p = f.properties;
      rows.push([
        p.bin || '',
        '"' + (p.name || '').replace(/"/g, '""') + '"',
        '"' + (p.industry || '').replace(/"/g, '""') + '"',
        '"' + (p.city || '').replace(/"/g, '""') + '"',
        Array.isArray(p.sources) ? p.sources.join('|') : '',
      ]);
    }
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `lasso-companies-${Date.now()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return html`
    <div class="map-shell">
      ${status === 'no_token' ? html`
        <div class="map-overlay">
          <div class="map-overlay-card">
            <h3>Mapbox token required</h3>
            <p class="muted small">Add your free Mapbox public token in Settings → Mapbox.</p>
            <ol style=${{paddingLeft:'18px', fontSize:'13px', lineHeight:'1.55'}}>
              <li>Sign up at <a href="https://account.mapbox.com/auth/signup/" target="_blank" rel="noreferrer">account.mapbox.com</a></li>
              <li>Copy your <code>pk.…</code> token from <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer">Access tokens</a></li>
              <li>Paste into Settings → Mapbox</li>
            </ol>
          </div>
        </div>
      ` : null}
      ${status === 'error' ? html`
        <div class="map-overlay">
          <div class="map-overlay-card" style=${{borderColor:'var(--red)'}}>
            <h3 style=${{color:'var(--red)'}}>Map failed to load</h3>
            <p class="muted small">${errorMsg}</p>
          </div>
        </div>
      ` : null}
      ${status === 'loading' || status === 'booting' ? html`
        <div class="map-loading">Loading map…</div>
      ` : null}

      <div class="map-container" ref=${containerRef}></div>

      ${status === 'ready' ? html`
        <div class="map-controls">
          <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}
            onClick=${() => setToolsOpen(o => !o)} title=${toolsOpen ? 'Collapse tools' : 'Expand tools'}>
            <strong style=${{ fontSize: '11px', letterSpacing: '.09em', color: 'var(--text)' }}>BELL MAP TOOLS</strong>
            <span style=${{ flex: 1 }}></span>
            <span class="muted small">${toolsOpen ? '▾' : '▸'}</span>
          </div>
          ${toolsOpen ? html`
          <div class="map-controls-section">
            <div class="map-controls-label">Layers</div>
            <label class="map-toggle">
              <input type="checkbox" checked=${showSignals}
                onChange=${e => setShowSignals(e.target.checked)} />
              <span>Signals</span>
              <span class="map-toggle-hint">live · 7d</span>
            </label>
            <label class="map-toggle">
              <input type="checkbox" checked=${showHeatmap}
                onChange=${e => setShowHeatmap(e.target.checked)} />
              <span>Heatmap density</span>
            </label>
            <label class="map-toggle">
              <input type="checkbox" checked=${showTraffic}
                onChange=${e => setShowTraffic(e.target.checked)} />
              <span>Live traffic</span>
              <span class="map-toggle-hint">tile quota</span>
            </label>
            <label class="map-toggle">
              <input type="checkbox" checked=${showWeather}
                onChange=${e => setShowWeather(e.target.checked)} />
              <span>Weather radar</span>
              <span class="map-toggle-hint">RainViewer</span>
            </label>
          </div>
          <div class="map-controls-section">
            <div class="map-controls-label">Sources</div>
            <div class="map-source-chips">
              ${SOURCES.map(s => html`
                <button key=${s}
                  class=${'map-source-chip ' + (activeSources.has(s) ? 'on' : 'off')}
                  style=${{
                    borderColor: activeSources.has(s) ? SOURCE_COLOR[s] : 'transparent',
                    color:       activeSources.has(s) ? SOURCE_COLOR[s] : 'var(--text-dim)',
                  }}
                  onClick=${() => toggleSource(s)}
                >${s}</button>
              `)}
            </div>
          </div>
          <div class="map-controls-section">
            <div class="map-controls-label">Year founded</div>
            <div class="map-year-row">
              <span class="map-year-val">${yearRange.min}</span>
              <input
                type="range" class="map-year-slider"
                min=${yearBounds.min} max=${yearBounds.max} step="1"
                value=${yearRange.min}
                onInput=${e => setYearRange(r => ({ ...r, min: Math.min(Number(e.target.value), r.max) }))}
              />
            </div>
            <div class="map-year-row">
              <span class="map-year-val">${yearRange.max}</span>
              <input
                type="range" class="map-year-slider"
                min=${yearBounds.min} max=${yearBounds.max} step="1"
                value=${yearRange.max}
                onInput=${e => setYearRange(r => ({ ...r, max: Math.max(Number(e.target.value), r.min) }))}
              />
            </div>
          </div>
          <div class="map-controls-section">
            <div class="map-controls-label">Tools</div>
            <button class=${'map-tool-btn ' + (activeTool === 'isochrone' ? 'active' : '')}
              onClick=${() => setActiveTool(activeTool === 'isochrone' ? null : 'isochrone')}>
              ${activeTool === 'isochrone' ? '✕ Cancel — click map' : '⊙ Isochrone (drive time)'}
            </button>
            <button class="map-tool-btn-secondary" onClick=${clearIsochrones}>Clear isochrones</button>
            <button class=${'map-tool-btn ' + (activeTool === 'lasso' ? 'active' : '')}
              onClick=${() => setActiveTool(activeTool === 'lasso' ? null : 'lasso')}>
              ${activeTool === 'lasso' ? '✕ Cancel — draw polygon' : '◇ Lasso (select area)'}
            </button>
            <button class="map-tool-btn-secondary" onClick=${clearLasso}>Clear lasso</button>
            <button class="map-flyto-btn" onClick=${flyToQatar}>↻ Recenter on Qatar</button>
            <div class="muted small" style=${{ marginTop: '6px', lineHeight: 1.45 }}>
              Tip: click any company pin to spread its <b>network arcs</b> — partners, clients, and group members. Click empty map to clear.
            </div>
          </div>` : null}
        </div>
      ` : null}

      ${lassoResult ? html`
        <div class="map-lasso-result">
          <div class="map-lasso-count"><strong>${lassoResult.count}</strong> compan${lassoResult.count === 1 ? 'y' : 'ies'} inside</div>
          ${lassoResult.sample.length > 0 ? html`
            <div class="muted small">${lassoResult.sample.join(', ')}${lassoResult.count > lassoResult.sample.length ? `, +${lassoResult.count - lassoResult.sample.length} more` : ''}</div>
          ` : null}
          ${lassoResult.count > 0 ? html`<button class="map-tool-btn" onClick=${exportLassoCSV}>↓ Export CSV</button>` : null}
        </div>
      ` : null}

      ${stats ? html`
        <div class="map-stats">
          <strong>${stats.total.toLocaleString()}</strong> geocoded compan${stats.total === 1 ? 'y' : 'ies'}
          ${stats.total === 0 ? html`<span class="muted small"> — run Stage 5 to populate lat/lng.</span>` : null}
        </div>
      ` : null}
    </div>
  `;
}

// --- Filter helpers ------------------------------------------------------

function refilter(map, activeSources, yearRange) {
  const wantedSources = [...activeSources];
  const partsForSources = wantedSources.length === SOURCES.length
    ? null
    : ['any', ...wantedSources.map(s => ['in', s, ['get', 'sources']])];

  const yearPart = [
    'any',
    ['!', ['has', 'year']],
    ['all',
      ['>=', ['to-number', ['get', 'year']], yearRange.min],
      ['<=', ['to-number', ['get', 'year']], yearRange.max],
    ],
  ];

  const filter = ['all', ['!', ['has', 'point_count']]];
  if (partsForSources) filter.push(partsForSources);
  filter.push(yearPart);

  try { map.setFilter('company-points', filter); } catch {}
}
function setLayerVisibility(map, id, on) {
  if (!map.getLayer(id)) return;
  map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
}

// --- Isochrones ---------------------------------------------------------

async function drawIsochrone(map, origin, token) {
  if (!token) { toast('No Mapbox token', 'error'); return; }
  try {
    const profile = 'driving';
    const url = `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${origin[0]},${origin[1]}`
      + `?contours_minutes=15,30,45&polygons=true&access_token=${token}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error('Isochrone API ' + r.status);
    const fc = await r.json();
    // Render each contour as its own layer so they stack with proper opacity
    for (const feat of fc.features) {
      const minutes = feat.properties.contour;
      const color = ISO_COLORS[minutes] || ISO_COLORS[45];
      const id = 'iso-' + minutes;
      if (map.getLayer(id))         map.removeLayer(id);
      if (map.getLayer(id + '-line'))   map.removeLayer(id + '-line');
      if (map.getSource(id))        map.removeSource(id);
      map.addSource(id, { type: 'geojson', data: feat });
      map.addLayer({
        id, type: 'fill', source: id,
        paint: { 'fill-color': color.fill, 'fill-opacity': color.alpha },
      }, 'company-points');
      map.addLayer({
        id: id + '-line', type: 'line', source: id,
        paint: { 'line-color': color.fill, 'line-width': 2, 'line-opacity': 0.8 },
      }, 'company-points');
    }
    // Drop a marker on the origin
    new (window.mapboxgl.Marker)({ color: '#5b8cff' }).setLngLat(origin).addTo(map);
    toast('Drive-time isochrones drawn (15/30/45 min)');
  } catch (err) {
    toast('Isochrone failed: ' + err.message, 'error');
  }
}

// --- Spider expand ------------------------------------------------------

let activeSpider = null;
function clearSpider() {
  if (!activeSpider) return;
  for (const m of activeSpider.markers) m.remove();
  activeSpider = null;
}
function spiderfy(map, centerLngLat, leaves, mapboxgl) {
  clearSpider();
  const markers = [];
  const radius = 0.0005;
  const step = (2 * Math.PI) / leaves.length;
  leaves.forEach((leaf, i) => {
    const angle = i * step;
    const lng = centerLngLat[0] + Math.cos(angle) * radius;
    const lat = centerLngLat[1] + Math.sin(angle) * radius;
    const el = document.createElement('div');
    el.className = 'map-spider-marker';
    el.title = leaf.properties.name;
    el.style.background = pickSourceColor(leaf.properties.sources);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openPopup(map, [lng, lat], leaf.properties, mapboxgl);
    });
    markers.push(new mapboxgl.Marker(el).setLngLat([lng, lat]).addTo(map));
  });
  activeSpider = { markers };
  const dismiss = () => { clearSpider(); map.off('click', dismiss); };
  setTimeout(() => map.on('click', dismiss), 100);
}
function pickSourceColor(sources) {
  if (!Array.isArray(sources)) return DEFAULT_COLOR;
  for (const s of SOURCES) if (sources.includes(s)) return SOURCE_COLOR[s];
  return DEFAULT_COLOR;
}

// --- Popup factory ------------------------------------------------------

function openPopup(map, coords, p, mapboxgl) {
  new mapboxgl.Popup({
    closeButton: true, closeOnClick: true,
    maxWidth: '280px', className: 'map-popup', offset: 14,
  })
    .setLngLat(coords)
    .setHTML(`
      <div class="map-popup-body">
        <div class="map-popup-name">${escapeHtml(p.name)}</div>
        ${p.industry ? `<div class="map-popup-line">${escapeHtml(p.industry)}</div>` : ''}
        ${p.city ? `<div class="map-popup-line">${escapeHtml(p.city)}</div>` : ''}
        ${p.year ? `<div class="map-popup-line">Founded ${escapeHtml(p.year)}</div>` : ''}
        <a class="map-popup-link" href="/companies?id=${p.id}" onclick="window.__bdiNavigate('companies', ${p.id}); return false;">Open in Companies &rarr;</a>
      </div>
    `)
    .addTo(map);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));
}

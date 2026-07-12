// Shared Mapbox GL loader — loads the CDN script/style once and resolves to the
// global mapboxgl. Mirrors the loader inside MapTab so the Real Estate map can
// reuse it without touching that (working) component.

const MAPBOX_VERSION = '3.7.0';
const MAPBOX_JS_URL  = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.js`;
const MAPBOX_CSS_URL = `https://api.mapbox.com/mapbox-gl-js/v${MAPBOX_VERSION}/mapbox-gl.css`;

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
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Script load failed: ' + src)), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => { s.dataset.loaded = 'true'; resolve(); };
    s.onerror = () => reject(new Error('Script load failed: ' + src));
    document.head.appendChild(s);
  });
}

let mapboxLoading = null;
export function loadMapboxGL() {
  if (window.mapboxgl) return Promise.resolve(window.mapboxgl);
  if (mapboxLoading) return mapboxLoading;
  loadStylesheet(MAPBOX_CSS_URL);
  mapboxLoading = loadScript(MAPBOX_JS_URL).then(() => window.mapboxgl);
  return mapboxLoading;
}

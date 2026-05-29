// Tiny History-API router for the Portal SPA (replaces the old #hash routing).
//
// URL shape:
//   /companies            → tab "companies"
//   /people?id=123        → tab "people", open record 123 (deep-link)
//
// Navigation flow: navigateTo() pushes a clean URL and fires a 'bdi:navigate'
// event. app.js (for the active tab) and the grid tabs (for deep-link record
// opening) listen to that event + the browser's 'popstate' (back/forward).
//
// index.html loads /app.js and /styles.css with ABSOLUTE paths, and ES module
// imports resolve relative to the module URL — so one-segment clean paths load
// assets correctly without a <base> tag.

/** Read the current route from the address bar. */
export function currentRoute() {
  const seg = (window.location.pathname || '/').replace(/^\/+/, '').split('/')[0] || '';
  const rawId = new URLSearchParams(window.location.search).get('id');
  const id = rawId != null && rawId !== '' && !Number.isNaN(Number(rawId)) ? Number(rawId) : null;
  return { tab: seg, id };
}

/**
 * Navigate to a tab (optionally opening a record). Pushes a clean URL and
 * notifies listeners — no full page reload.
 */
export function navigateTo(tab, id) {
  const hasId = id !== null && id !== undefined && id !== '';
  const url = '/' + tab + (hasId ? ('?id=' + encodeURIComponent(id)) : '');
  if (url !== (window.location.pathname + window.location.search)) {
    window.history.pushState({}, '', url);
  }
  window.dispatchEvent(new CustomEvent('bdi:navigate', {
    detail: { tab, id: hasId ? Number(id) : null },
  }));
}

// Expose globally so non-React contexts (e.g. Mapbox popup HTML strings) can
// navigate without a full page reload: onclick="window.__bdiNavigate('companies', 5)".
if (typeof window !== 'undefined') {
  window.__bdiNavigate = navigateTo;
}

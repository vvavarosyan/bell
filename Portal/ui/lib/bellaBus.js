// Bella UI-action bus (client side).
//
// Bella's server tools can emit a "ui_action" over SSE (see server/bella tools
// with a uiAction()). BellaChat + BellaVoice re-dispatch each one as a window
// 'bella:ui-action' event; app.js and the grid tabs listen and drive the REAL
// UI — navigate, open a specific record, filter a grid, or fill a form field.
// This is what lets Bella ACT on the app instead of only talking about it.

export const BELLA_ACTION_EVENT = 'bella:ui-action';

// A show_* action fired just before we navigate to its tab is stashed here so
// the tab can pick it up the moment it mounts (the live event fires before the
// component exists). The tab reads + clears it on mount.
export function stashPending(action) { try { window.__bellaPending = action || null; } catch { /* ignore */ } }
export function takePending(type) {
  try {
    const p = window.__bellaPending;
    if (p && (!type || p.type === type)) { window.__bellaPending = null; return p; }
  } catch { /* ignore */ }
  return null;
}

/** Fire a Bella UI action to every listening surface. */
export function emitBellaAction(action) {
  if (!action || typeof action !== 'object') return;
  try { window.dispatchEvent(new CustomEvent(BELLA_ACTION_EVENT, { detail: action })); } catch { /* ignore */ }
}

// Set a React-controlled input's value the way a user typing would, so React's
// onChange fires and component state actually updates. (Plain `el.value = x` is
// invisible to React's synthetic event system.)
export function setNativeValue(el, value) {
  const proto = el instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype
    : el instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set;
  try { if (setter) setter.call(el, value); else el.value = value; } catch { el.value = value; }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function isVisible(el) {
  if (!el || el.disabled || el.readOnly) return false;
  if (el.type === 'hidden') return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const st = window.getComputedStyle(el);
  return st.visibility !== 'hidden' && st.display !== 'none';
}

// Best-effort human label for an input: an explicit data-bella-fill key, a
// wrapping/associated <label>, aria-label, placeholder, name, or id.
function fieldHints(el) {
  const bits = [];
  const dbf = el.getAttribute('data-bella-fill'); if (dbf) bits.push(dbf);
  if (el.id) { try { const l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]'); if (l) bits.push(l.textContent); } catch { /* ignore */ } }
  const wrap = el.closest('label'); if (wrap) bits.push(wrap.textContent);
  bits.push(el.getAttribute('aria-label'), el.getAttribute('placeholder'), el.name, el.id);
  return norm(bits.filter(Boolean).join(' '));
}

/** Find the on-screen field that best matches a human hint ("company name"). */
export function findFillTarget(hint) {
  const key = norm(hint);
  if (!key) return null;
  // 1) explicit opt-in target wins outright.
  try {
    const sel = '[data-bella-fill="' + (window.CSS && CSS.escape ? CSS.escape(hint) : hint) + '"]';
    const exact = document.querySelector(sel);
    if (exact && isVisible(exact)) return exact;
  } catch { /* ignore */ }
  // 2) otherwise, best fuzzy match over visible inputs.
  const els = Array.from(document.querySelectorAll('input, textarea, select')).filter(isVisible);
  let best = null, bestScore = 0;
  for (const el of els) {
    const h = fieldHints(el);
    if (!h) continue;
    let score = 0;
    if (h === key) score = 100;
    else if (h.includes(key) || key.includes(h)) score = 60;
    else { const kw = key.split(' ').filter(Boolean); const hit = kw.filter((w) => w.length > 2 && h.includes(w)).length; if (hit) score = 20 * hit; }
    if (score > bestScore) { bestScore = score; best = el; }
  }
  return bestScore >= 20 ? best : null;
}

/** Fill a form field Bella pointed at. Returns true if a field was found+set. */
export function bellaFillField({ field, value } = {}) {
  const el = findFillTarget(field);
  if (!el) return false;
  setNativeValue(el, value == null ? '' : String(value));
  try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); } catch { /* ignore */ }
  return true;
}

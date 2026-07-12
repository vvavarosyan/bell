// Bella UI-action bus (client side).
//
// Bella's server tools can emit a "ui_action" over SSE (see server/bella tools
// with a uiAction()). BellaChat + BellaVoice re-dispatch each one as a window
// 'bella:ui-action' event; app.js and the grid tabs listen and drive the REAL
// UI — navigate, open a specific record, filter a grid, or fill a form field.
// This is what lets Bella ACT on the app instead of only talking about it.

export const BELLA_ACTION_EVENT = 'bella:ui-action';

// Which window events a completed Bella tool should fire, so open tabs (CRM
// list, credit pill, Settings forms) refresh live instead of serving stale
// state. Shared by BellaChat AND BellaVoice — voice-driven writes must refresh
// the UI too, or the stale Settings form silently reverts them on Save.
export const TOOL_EFFECTS = {
  reveal_companies: ['bdi:crm-changed', 'bdi:credits-changed'],
  add_to_crm: ['bdi:crm-changed'], add_crm_note: ['bdi:crm-changed'],
  update_crm_note: ['bdi:crm-changed'], delete_crm_note: ['bdi:crm-changed'],
  add_crm_task: ['bdi:crm-changed'], update_crm_task: ['bdi:crm-changed'],
  delete_crm_task: ['bdi:crm-changed'], set_crm_status: ['bdi:crm-changed'],
  create_deal: ['bdi:crm-changed'], update_deal: ['bdi:crm-changed'],
  delete_deal: ['bdi:crm-changed'], send_email: ['bdi:crm-changed'],
  enroll_in_sequence: ['bdi:crm-changed'], send_whatsapp: ['bdi:crm-changed'],
  update_icp: ['bdi:icp-changed'], update_account_prefs: ['bdi:account-changed'],
};
export const fireToolEffects = (toolName) => (TOOL_EFFECTS[toolName] || []).forEach((ev) => {
  try { window.dispatchEvent(new CustomEvent(ev)); } catch { /* ignore */ }
});

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

// ── Shared "active Bella conversation" (chat ↔ voice) ────────────────────────
// Chat and voice are separate components but must share ONE thread, or a voice
// turn lands in a conversation the chat panel never shows (Val 2026-07-12:
// "voice communication did not store as chat"). The same store also drives the
// new-chat policy: a FRESH visit starts a new discussion, while several
// conversations WITHIN a session stay resumable. sessionStorage scopes "this
// session" (cleared when the tab closes); the staleness window means a long
// idle gap in the same tab also opens fresh.
export const BELLA_CONV_EVENT = 'bdi:bella-conversation';
export const BELLA_CONV_STALE_MS = 60 * 60 * 1000;   // 60 min idle → a new visit is a new chat
const CONV_KEY = 'bdi_bella_active_conv';

/** Record the session's active conversation and tell the other surface. */
export function setActiveConversation(id, { broadcast = true } = {}) {
  try {
    if (id == null) window.sessionStorage.removeItem(CONV_KEY);
    else window.sessionStorage.setItem(CONV_KEY, JSON.stringify({ id, ts: Date.now() }));
  } catch { /* private mode / storage disabled — event still fires */ }
  if (broadcast) { try { window.dispatchEvent(new CustomEvent(BELLA_CONV_EVENT, { detail: { id: id ?? null } })); } catch { /* ignore */ } }
}

// "Bella does it for me" (Phase 4 onboarding): open the chat with a seeded
// instruction that auto-sends. BellaDock opens the panel on the event; BellaChat
// consumes the seed — on mount if it was just opened, or via the event listener
// if it's already open — and sends it. One-shot: takeBellaSeed clears the slot.
export const BELLA_OPEN_EVENT = 'bdi:bella-open';
export function openBella(message) {
  try { window.__bellaSeed = message ? String(message) : null; } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent(BELLA_OPEN_EVENT)); } catch { /* ignore */ }
}
export function takeBellaSeed() {
  try { const s = window.__bellaSeed; window.__bellaSeed = null; return s || null; } catch { return null; }
}

/** The session's active conversation id, or null if none / gone stale. */
export function getActiveConversation(staleMs = BELLA_CONV_STALE_MS) {
  try {
    const raw = window.sessionStorage.getItem(CONV_KEY);
    if (!raw) return null;
    const { id, ts } = JSON.parse(raw);
    if (id == null || (Date.now() - Number(ts)) > staleMs) return null;
    return id;
  } catch { return null; }
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
    else {
      // Keyword tier: a MULTI-word hint must hit >= 2 words — one shared
      // generic word ("name") must never claim the field (it typed company
      // names into the email display-name box). Single-word hints keep 1.
      const kw = key.split(' ').filter(Boolean);
      const hit = kw.filter((w) => w.length > 2 && h.includes(w)).length;
      if (hit >= Math.min(2, kw.length)) score = 20 * hit;
    }
    if (score > bestScore) { bestScore = score; best = el; }
  }
  return bestScore >= 20 ? best : null;
}

// Fired after a fill attempt so the chat can tell Bella the truth when a fill
// MISSED (no field by that label on screen) — see BellaChat + brain.js.
export const BELLA_FILL_RESULT_EVENT = 'bdi:bella-fill-result';

/** A human label for a field: its data-bella-fill key, associated <label>,
 *  placeholder, or aria-label — whichever is cleanest (NOT normalized). */
function humanFieldLabel(el) {
  const dbf = el.getAttribute && el.getAttribute('data-bella-fill');
  if (dbf) return dbf.trim();
  if (el.id) {
    try { const l = document.querySelector('label[for="' + (window.CSS && CSS.escape ? CSS.escape(el.id) : el.id) + '"]'); if (l && l.textContent) return l.textContent.trim(); } catch { /* ignore */ }
  }
  const wrap = el.closest && el.closest('label');
  if (wrap && wrap.textContent) return wrap.textContent.trim();
  return (el.getAttribute && (el.getAttribute('placeholder') || el.getAttribute('aria-label'))) || '';
}

/** The labels of the fillable fields currently on screen, so Bella can offer
 *  the real one when the user names a field that doesn't exist. */
export function visibleFillLabels(max = 24) {
  try {
    const els = Array.from(document.querySelectorAll('[data-bella-fill], input, textarea, select')).filter(isVisible);
    const seen = new Set(); const out = [];
    for (const el of els) {
      let t = humanFieldLabel(el).replace(/[[\]|]/g, ' ').replace(/\s+/g, ' ').trim();
      if (t.length > 48) t = t.slice(0, 48);
      const key = t.toLowerCase();
      if (t && !seen.has(key)) { seen.add(key); out.push(t); }
      if (out.length >= max) break;
    }
    return out;
  } catch { return []; }
}

const TRUTHY = new Set(['true', 'yes', 'on', '1', 'checked', 'enable', 'enabled']);

/** Fill a form field Bella pointed at. Returns true if a field was found+set. */
export function bellaFillField({ field, value } = {}) {
  const el = findFillTarget(field);
  if (!el) return false;
  // Checkboxes/radios: React listens to clicks, not value writes. Click only
  // when the current state differs from the requested one.
  if (el.type === 'checkbox' || el.type === 'radio') {
    const want = TRUTHY.has(String(value ?? '').toLowerCase().trim());
    if (el.checked !== want) { try { el.click(); } catch { /* ignore */ } }
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { /* ignore */ }
    return el.checked === want;
  }
  setNativeValue(el, value == null ? '' : String(value));
  // Chip-style inputs commit their draft only on Enter (e.g. the ICP target
  // lists) — they opt in via data-bella-commit="enter" and we press it.
  if (el.getAttribute('data-bella-commit') === 'enter') {
    try { el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); } catch { /* ignore */ }
  }
  try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.focus({ preventScroll: true }); } catch { /* ignore */ }
  return true;
}

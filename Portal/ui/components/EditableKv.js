// Drawer-style key/value row with double-click-to-edit. Used in CompanyDetail
// and PersonDetail to make every editable field editable.
//
// Props:
//   label       — displayed label (the <dt>)
//   value       — current value
//   field       — column name to PATCH on save
//   onSave      — async (field, newValue) → updated row  (parent does the API
//                 call so we keep this component dumb)
//   editable    — boolean (default true). System fields (id/timestamps/JSON)
//                 pass false and render display-only.
//   type        — 'text' (default) | 'number' | 'boolean' | 'date' | 'url'
//
// Editing UX:
//   - Double-click anywhere in the value cell → text input appears
//   - Enter saves, Esc cancels
//   - Blur saves
//   - Boolean values render as a toggle pill that swaps on single click

import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';

function fmtDisplay(value, type) {
  if (value === null || value === undefined || value === '') {
    return html`<span class="muted">—</span>`;
  }
  if (type === 'boolean') {
    return value
      ? html`<span class="pill active">true</span>`
      : html`<span class="pill inactive">false</span>`;
  }
  if (type === 'date') {
    try { return new Date(value).toLocaleString(); } catch { return String(value); }
  }
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) {
      return html`<a href=${value} target="_blank" rel="noreferrer">${value}</a>`;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try { return new Date(value).toLocaleString(); } catch {}
    }
    return value;
  }
  if (typeof value === 'number') return value.toLocaleString();
  if (Array.isArray(value) || typeof value === 'object') {
    return html`<pre class="readonly-json">${JSON.stringify(value, null, 2)}</pre>`;
  }
  return String(value);
}

export function EditableKv({ label, value, field, onSave, editable = true, type = 'text' }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  // Booleans: single-click toggle (no edit mode)
  const toggleBool = async () => {
    if (!editable) return;
    try { await onSave(field, !value); } catch { /* parent surfaces */ }
  };

  const finish = async (commit) => {
    setEditing(false);
    if (!commit) { setDraft(value ?? ''); return; }
    let next = draft;
    if (next === '') next = null;
    if (type === 'number' && next !== null) {
      const n = Number(next);
      next = Number.isFinite(n) ? n : null;
    }
    if ((value ?? null) === next) return;
    try { await onSave(field, next); }
    catch { /* parent surfaces toast */ }
  };

  if (!editable) {
    return html`
      <div class="kv readonly" key=${field}>
        <dt>${label}</dt>
        <dd>${fmtDisplay(value, type)}</dd>
      </div>
    `;
  }

  if (type === 'boolean') {
    return html`
      <div class="kv editable-kv" key=${field} title="Click to toggle">
        <dt>${label}</dt>
        <dd>
          <button class="kv-bool-toggle" onClick=${toggleBool}>
            ${value
              ? html`<span class="pill active">true</span>`
              : html`<span class="pill inactive">false</span>`}
          </button>
        </dd>
      </div>
    `;
  }

  if (editing) {
    return html`
      <div class="kv editable-kv editing" key=${field}>
        <dt>${label}</dt>
        <dd>
          <input
            ref=${inputRef}
            type=${type === 'number' ? 'number' : (type === 'date' ? 'date' : 'text')}
            class="kv-edit-input"
            value=${draft ?? ''}
            onChange=${e => setDraft(e.target.value)}
            onBlur=${() => finish(true)}
            onKeyDown=${e => {
              if (e.key === 'Enter')  { e.preventDefault(); finish(true); }
              if (e.key === 'Escape') { finish(false); }
            }}
          />
        </dd>
      </div>
    `;
  }

  const tooltip = (value !== null && value !== undefined && value !== '')
    ? 'Double-click to edit'
    : 'Double-click to set a value';
  return html`
    <div class="kv editable-kv" key=${field}
         onDoubleClick=${(e) => { e.preventDefault(); setEditing(true); }}
         title=${tooltip}>
      <dt>${label}</dt>
      <dd>${fmtDisplay(value, type)}</dd>
    </div>
  `;
}

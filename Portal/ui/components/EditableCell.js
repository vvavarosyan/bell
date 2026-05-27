import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';

export function EditableCell({ value, onSave, type = 'text', className = '', formatter }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const inputRef = useRef(null);

  useEffect(() => { setDraft(value ?? ''); }, [value]);
  useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  const display = formatter ? formatter(value) : (value ?? html`<span style=${{color:'var(--text-dim)'}}>—</span>`);

  if (!editing) {
    const tooltip = (value !== null && value !== undefined && value !== '')
      ? String(value)
      : 'Double-click to edit';
    return html`<td
      class=${'editable ' + className}
      onDoubleClick=${(e) => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
      title=${tooltip}
    >${display}</td>`;
  }

  const finish = async (commit) => {
    setEditing(false);
    if (!commit) { setDraft(value ?? ''); return; }
    if ((value ?? '') === draft) return;
    try { await onSave(draft); }
    catch (err) { /* parent handles toast */ }
  };

  return html`<td class=${className}>
    <input
      ref=${inputRef}
      type=${type}
      class="cell-edit"
      value=${draft}
      onChange=${e => setDraft(e.target.value)}
      onBlur=${() => finish(true)}
      onKeyDown=${e => {
        if (e.key === 'Enter') { e.preventDefault(); finish(true); }
        if (e.key === 'Escape') { finish(false); }
      }}
    />
  </td>`;
}

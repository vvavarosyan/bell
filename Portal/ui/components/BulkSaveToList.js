// Bulk save-to-list — a button + popover for the Companies bulk-bar. Adds ALL currently
// selected entities to one saved list at once (or a brand-new list). FREE (no reveal /
// no credit) — same switching-cost lock-in as the per-company ★ Save, at scale.
// Add-only (idempotent via the server's unnest ... ON CONFLICT DO NOTHING); removal stays
// on the per-company popover / the Lists view. All hooks precede any return (hook-order rule).

import { useState, useEffect, useRef, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

export function BulkSaveToList({ entityIds = [], entityType = 'company', onDone }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  const count = entityIds.length;

  const load = useCallback(async () => {
    setLoading(true);
    try { const ls = await api.lists(); setLists(ls.rows || []); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const addTo = async (list) => {
    if (busy || !count) return;
    setBusy(true);
    try {
      const r = await api.listAddMembers(list.id, entityIds, entityType);
      const added = r?.added ?? 0;
      const already = count - added;
      toast(`Saved ${added} to “${list.name}”${already > 0 ? ` · ${already} already there` : ''}`);
      setOpen(false);
      onDone?.();
      try { window.dispatchEvent(new Event('bdi:lists-changed')); } catch { /* no-op */ }
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name || busy || !count) return;
    setBusy(true);
    try {
      const l = await api.listCreate(name);
      await api.listAddMembers(l.id, entityIds, entityType);
      setNewName('');
      toast(`Saved ${count} to new list “${name}”`);
      setOpen(false);
      onDone?.();
      try { window.dispatchEvent(new Event('bdi:lists-changed')); } catch { /* no-op */ }
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const rowHover = (e, on) => { e.currentTarget.style.background = on ? 'var(--bg-elev)' : 'transparent'; };

  return html`<div ref=${ref} style=${{ position: 'relative', display: 'inline-block' }}>
    <button onClick=${() => setOpen((o) => !o)} disabled=${!count} title="Save all selected companies to a list (free — no reveal)">
      ☆ Save to list ▶
    </button>
    ${open ? html`<div style=${{ position: 'absolute', bottom: 'calc(100% + 6px)', right: 0, zIndex: 80, width: '270px',
        background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 12px 34px rgba(0,0,0,0.45)', padding: '10px' }}>
      <div class="filt-label" style=${{ marginBottom: '8px' }}>Save ${count} selected to…</div>
      ${loading ? html`<div class="muted small" style=${{ padding: '8px 2px' }}>Loading…</div>`
        : html`<div style=${{ maxHeight: '230px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
          ${lists.length === 0 ? html`<div class="muted small" style=${{ padding: '2px 2px 8px' }}>No lists yet — create your first below.</div>`
            : lists.map((l) => html`<button key=${l.id} disabled=${busy}
                onMouseEnter=${(e) => rowHover(e, true)} onMouseLeave=${(e) => rowHover(e, false)}
                onClick=${() => addTo(l)}
                style=${{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 7px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', background: 'transparent', border: 'none', color: 'var(--text)', textAlign: 'left', width: '100%' }}>
              <span aria-hidden="true">☆</span>
              <span style=${{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${l.name}</span>
              <span class="muted small" style=${{ fontVariantNumeric: 'tabular-nums' }}>${l.member_count || 0}</span>
            </button>`)}
        </div>`}
      <div style=${{ display: 'flex', gap: '6px', marginTop: '8px', paddingTop: '9px', borderTop: '1px solid var(--border)' }}>
        <input value=${newName} onInput=${(e) => setNewName(e.target.value)} placeholder="New list name…"
          onKeyDown=${(e) => { if (e.key === 'Enter') createAndAdd(); }}
          style=${{ flex: 1, padding: '6px 9px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elev)', color: 'var(--text)', fontSize: '12.5px' }} />
        <button onClick=${createAndAdd} disabled=${busy || !newName.trim()}
          style=${{ padding: '6px 12px', borderRadius: '6px', border: 'none', background: newName.trim() ? 'var(--accent)' : 'var(--bg-elev)', color: '#fff', cursor: newName.trim() ? 'pointer' : 'default', fontSize: '12.5px', fontWeight: 600 }}>Add</button>
      </div>
    </div>` : null}
  </div>`;
}

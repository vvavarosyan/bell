// Save-to-list — a star button + popover to add/remove a company (or person) to the
// tenant's curated saved lists, or spin up a new one. FREE (no reveal/credit): this is
// the switching-cost lock-in — workspace a customer authors while browsing and won't
// want to abandon. Reusable on the company detail, company rows, people, etc.
// All hooks precede any return (hook-order rule).

import { useState, useEffect, useRef, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

export function SaveToList({ entityId, entityType = 'company', compact = false, onChanged }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState([]);
  const [memberOf, setMemberOf] = useState(new Set());   // list_ids that contain this entity
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ls, mem] = await Promise.all([api.lists(), api.listMemberships(entityId, entityType)]);
      setLists(ls.rows || []);
      setMemberOf(new Set(mem.list_ids || []));
    } catch (e) { toast(e.message, 'error'); } finally { setLoading(false); }
  }, [entityId, entityType]);

  // Reflect the saved state on the button as soon as the company opens (not only after
  // the popover is opened) — so a saved company reads "★ Saved" while browsing.
  useEffect(() => {
    let dead = false;
    api.listMemberships(entityId, entityType).then((mem) => { if (!dead) setMemberOf(new Set(mem.list_ids || [])); }).catch(() => {});
    return () => { dead = true; };
  }, [entityId, entityType]);
  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = async (list) => {
    const inList = memberOf.has(list.id);
    setBusy(true);
    try {
      if (inList) { await api.listRemoveMembers(list.id, [entityId], entityType); memberOf.delete(list.id); toast(`Removed from “${list.name}”`); }
      else { await api.listAddMembers(list.id, [entityId], entityType); memberOf.add(list.id); toast(`Saved to “${list.name}”`); }
      setMemberOf(new Set(memberOf));
      setLists((ls) => ls.map((l) => (l.id === list.id ? { ...l, member_count: (l.member_count || 0) + (inList ? -1 : 1) } : l)));
      onChanged?.();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const createAndAdd = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const l = await api.listCreate(name);
      await api.listAddMembers(l.id, [entityId], entityType);
      setNewName('');
      toast(`Saved to new list “${name}”`);
      await load();
      onChanged?.();
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };

  const savedCount = memberOf.size;
  const btn = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: compact ? '3px 8px' : '5px 11px', borderRadius: '6px',
    border: '1px solid ' + (savedCount ? 'var(--accent)' : 'var(--border)'), cursor: 'pointer',
    fontSize: compact ? '11px' : '12px', fontWeight: 600, whiteSpace: 'nowrap',
    background: savedCount ? 'var(--accent)' : 'transparent', color: savedCount ? '#fff' : 'var(--text-muted)',
  };
  const rowHover = (e, on) => { e.currentTarget.style.background = on ? 'var(--bg-elev)' : 'transparent'; };

  return html`<div ref=${ref} style=${{ position: 'relative', display: 'inline-block' }}>
    <button onClick=${() => setOpen((o) => !o)} title="Save to a list" style=${btn}>
      <span aria-hidden="true">${savedCount ? '★' : '☆'}</span>${compact && !savedCount ? '' : html`<span>${savedCount ? (savedCount > 1 ? `Saved · ${savedCount}` : 'Saved') : 'Save'}</span>`}
    </button>
    ${open ? html`<div style=${{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 70, width: '264px',
        background: 'var(--bg-elev-2)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 12px 34px rgba(0,0,0,0.45)', padding: '10px' }}>
      <div class="filt-label" style=${{ marginBottom: '8px' }}>Save to list</div>
      ${loading ? html`<div class="muted small" style=${{ padding: '8px 2px' }}>Loading…</div>`
        : html`<div style=${{ maxHeight: '230px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1px' }}>
          ${lists.length === 0 ? html`<div class="muted small" style=${{ padding: '2px 2px 8px' }}>No lists yet — create your first below.</div>`
            : lists.map((l) => html`<label key=${l.id}
                onMouseEnter=${(e) => rowHover(e, true)} onMouseLeave=${(e) => rowHover(e, false)}
                style=${{ display: 'flex', alignItems: 'center', gap: '9px', padding: '6px 7px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>
              <input type="checkbox" checked=${memberOf.has(l.id)} disabled=${busy} onChange=${() => toggle(l)} style=${{ cursor: 'pointer' }} />
              <span style=${{ flex: 1, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${l.name}</span>
              <span class="muted small" style=${{ fontVariantNumeric: 'tabular-nums' }}>${l.member_count || 0}</span>
            </label>`)}
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

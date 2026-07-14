// Saved Lists — the customer's curated company lists (the switching-costs workspace).
// Create lists, browse a list's companies, export to CSV, rename/remove. Companies are
// added free via the ☆ Save button anywhere they're browsed. Hooks precede any return.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—');

export function ListsTab({ embedded = false } = {}) {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [newName, setNewName] = useState('');

  const loadLists = useCallback(async () => {
    setLoading(true);
    try { const r = await api.lists(); setLists(r.rows || []); }
    catch (e) { toast(e.message, 'error'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadLists(); }, [loadLists]);

  const create = async () => {
    const name = newName.trim(); if (!name) return;
    try { await api.listCreate(name); setNewName(''); toast(`List “${name}” created`); loadLists(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const body = openId
    ? html`<${ListDetail} id=${openId} onBack=${() => { setOpenId(null); loadLists(); }} onChanged=${loadLists} />`
    : html`<div>
      <div style=${{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', padding: '4px 0 14px' }}>
        <h2 style=${{ margin: 0, fontSize: '18px' }}>Saved Lists</h2>
        <span class="muted small">Your curated company lists — build them free while you browse, export any time.</span>
      </div>
      <div class="filt-bar">
        <input value=${newName} onInput=${(e) => setNewName(e.target.value)} placeholder="New list name…" onKeyDown=${(e) => { if (e.key === 'Enter') create(); }}
          style=${{ minWidth: '220px', padding: '7px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-elev)', color: 'var(--text)' }} />
        <button class="btn btn-primary" onClick=${create} disabled=${!newName.trim()}>Create list</button>
      </div>
      ${loading ? html`<div class="empty">Loading…</div>`
        : lists.length === 0 ? html`<div class="empty" style=${{ lineHeight: 1.6 }}>No lists yet. Create one above, or hit <b>☆ Save</b> on any company to start a list.</div>`
        : html`<div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px', marginTop: '6px' }}>
          ${lists.map((l) => html`<div key=${l.id} onClick=${() => setOpenId(l.id)}
            style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '14px 16px', cursor: 'pointer' }}>
            <div style=${{ fontSize: '15px', fontWeight: 700, color: 'var(--text)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${l.name}</div>
            <div class="muted small">${(l.company_count || 0).toLocaleString()} compan${l.company_count === 1 ? 'y' : 'ies'}${l.person_count ? ` · ${l.person_count} people` : ''}</div>
            <div class="muted small" style=${{ marginTop: '6px', opacity: 0.7 }}>Updated ${fmtDate(l.updated_at)}</div>
          </div>`)}
        </div>`}
    </div>`;
  return embedded ? body : html`<div class="page-fill"><div class="page-scroll">${body}</div></div>`;
}

function ListDetail({ id, onBack, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [nameEdit, setNameEdit] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api.list(id); setData(d); setNameEdit(d.name); }
    catch (e) { toast(e.message, 'error'); } finally { setLoading(false); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const rename = async () => {
    const n = nameEdit.trim(); if (!n) return;
    try { await api.listUpdate(id, { name: n }); setRenaming(false); toast('Renamed'); load(); onChanged?.(); }
    catch (e) { toast(e.message, 'error'); }
  };
  const removeList = async () => {
    if (!window.confirm(`Delete list “${data?.name}”? This removes the list, not the companies themselves.`)) return;
    try { await api.listDelete(id); toast('List deleted'); onBack(); } catch (e) { toast(e.message, 'error'); }
  };
  const removeMember = async (m) => {
    try { await api.listRemoveMembers(id, [m.entity_id], m.entity_type); toast('Removed from list'); load(); onChanged?.(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const members = data?.members || [];
  return html`<div>
    <button class="btn btn-ghost" onClick=${onBack} style=${{ marginBottom: '12px' }}>← All lists</button>
    ${loading ? html`<div class="empty">Loading…</div>` : !data ? html`<div class="empty">List not found.</div>` : html`
    <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '14px' }}>
      ${renaming
        ? html`<input value=${nameEdit} onInput=${(e) => setNameEdit(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') rename(); }}
            style=${{ fontSize: '18px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-elev)', color: 'var(--text)' }} />`
        : html`<h2 style=${{ margin: 0, fontSize: '20px' }}>${data.name}</h2>`}
      <span class="muted small">${members.length} compan${members.length === 1 ? 'y' : 'ies'}</span>
      <span style=${{ flex: 1 }}></span>
      ${renaming
        ? html`<button class="btn btn-secondary" onClick=${rename}>Save name</button>`
        : html`<button class="btn btn-ghost" onClick=${() => setRenaming(true)}>Rename</button>`}
      <button class="btn btn-secondary" onClick=${() => api.listExportCsv(id, data.name)} disabled=${!members.length}>Export CSV</button>
      <button class="btn btn-ghost" onClick=${removeList} style=${{ color: 'var(--danger, #e8776b)' }}>Delete list</button>
    </div>
    ${members.length === 0
      ? html`<div class="empty" style=${{ lineHeight: 1.6 }}>This list is empty. Hit <b>☆ Save</b> on any company to add it here.</div>`
      : html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        ${members.map((m) => html`<div key=${m.member_id} style=${{ display: 'flex', alignItems: 'center', gap: '10px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', padding: '10px 13px' }}>
          <div style=${{ flex: 1, minWidth: 0, cursor: m.entity_type === 'company' ? 'pointer' : 'default' }}
            onClick=${() => { if (m.entity_type === 'company') navigateTo('companies', m.entity_id); }}>
            <div style=${{ fontSize: '14px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${m.company_name || m.person_name || '—'}</div>
            <div class="muted small">${[m.industry, m.city, m.bin].filter(Boolean).join(' · ') || '—'}</div>
          </div>
          <button class="btn btn-ghost" onClick=${() => removeMember(m)} title="Remove from list" style=${{ fontSize: '12px' }}>Remove</button>
        </div>`)}
      </div>`}
    `}
  </div>`;
}

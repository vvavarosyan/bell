// Header notification bell + notification center dropdown.
// Polls the unread count; opens a panel listing recent notifications with
// unread highlighting, mark-all-read, and click-to-navigate.

import { useState, useEffect, useCallback, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { navigateTo } from '../lib/router.js';
import { toast } from '../lib/toast.js';

const CAT_DOT = {
  data:         'var(--accent, #3B6CF6)',
  account:      'var(--amber, #e0a32e)',
  engagement:   'var(--green, #6fcf97)',
  announcement: '#a855f7',
  system:       'var(--text-dim)',
};

function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60)     return 'just now';
  if (s < 3600)   return Math.floor(s / 60) + 'm ago';
  if (s < 86400)  return Math.floor(s / 3600) + 'h ago';
  if (s < 604800) return Math.floor(s / 86400) + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function goTo(link) {
  if (!link) return;
  try {
    const u = new URL(link, window.location.origin);
    const tab = u.pathname.replace(/^\//, '').split('/')[0] || 'market-feed';
    const id = u.searchParams.get('id');
    navigateTo(tab, id || undefined);
  } catch { /* ignore bad links */ }
}

export function NotificationBell() {
  const [open, setOpen]       = useState(false);
  const [rows, setRows]       = useState([]);
  const [unread, setUnread]   = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  const refreshCount = useCallback(async () => {
    try { const r = await api.notificationsUnread(); setUnread(r.unread || 0); } catch { /* ignore */ }
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try { const r = await api.notifications({ limit: 30 }); setRows(r.rows || []); setUnread(r.unread || 0); }
    catch (err) { toast('Could not load notifications: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  // Poll the unread count (cheap) every 45s, plus on a custom event.
  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 15000);
    const onChange = () => refreshCount();
    window.addEventListener('bdi:notifications-changed', onChange);
    return () => { clearInterval(t); window.removeEventListener('bdi:notifications-changed', onChange); };
  }, [refreshCount]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const toggle = () => { const next = !open; setOpen(next); if (next) loadList(); };

  const markAll = async () => {
    try { await api.markAllNotificationsRead(); setRows(prev => prev.map(r => ({ ...r, read_at: r.read_at || new Date().toISOString() }))); setUnread(0); }
    catch (err) { toast('Failed: ' + err.message, 'error'); }
  };

  const openOne = async (n) => {
    if (!n.read_at) {
      try { await api.markNotificationRead(n.id); } catch { /* ignore */ }
      setRows(prev => prev.map(r => r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r));
      setUnread(u => Math.max(0, u - 1));
    }
    if (n.link) { setOpen(false); goTo(n.link); }
  };

  return html`
    <div class="notif-wrap" ref=${wrapRef} style=${{ position: 'relative' }}>
      <button class="notif-bell" onClick=${toggle} title="Notifications" aria-label="Notifications"
        style=${{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        ${unread > 0 ? html`<span class="notif-badge" style=${{ position: 'absolute', top: '-5px', right: '-5px', minWidth: '17px', height: '17px', padding: '0 4px', borderRadius: '9px', background: 'var(--red, #ff5d5d)', color: '#fff', fontSize: '10px', fontWeight: '700', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>${unread > 99 ? '99+' : unread}</span>` : null}
      </button>

      ${open ? html`
        <div class="notif-panel" style=${{ position: 'absolute', top: '42px', right: 0, width: '380px', maxWidth: '92vw', maxHeight: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: '12px', boxShadow: '0 18px 50px rgba(0,0,0,.35)', zIndex: 1000 }}>
          <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <strong style=${{ fontSize: '14px' }}>Notifications</strong>
            ${rows.some(r => !r.read_at) ? html`<button class="linkbtn" onClick=${markAll} style=${{ background: 'transparent', border: 'none', color: 'var(--accent-bright, #6ea0ff)', cursor: 'pointer', fontSize: '12px' }}>Mark all read</button>` : null}
          </div>
          <div style=${{ overflowY: 'auto' }}>
            ${loading ? html`<div class="muted small" style=${{ padding: '18px', textAlign: 'center' }}>Loading…</div>` : null}
            ${!loading && rows.length === 0 ? html`<div class="muted small" style=${{ padding: '26px 18px', textAlign: 'center' }}>You're all caught up. 🎉</div>` : null}
            ${rows.map(n => html`
              <div key=${n.id} class="notif-item" onClick=${() => openOne(n)}
                style=${{ display: 'flex', gap: '10px', padding: '11px 14px', borderBottom: '1px solid var(--border)', cursor: n.link ? 'pointer' : 'default', background: n.read_at ? 'transparent' : 'var(--accent-fade, rgba(91,140,255,.06))' }}>
                <span style=${{ flexShrink: 0, width: '8px', height: '8px', borderRadius: '50%', marginTop: '5px', background: n.read_at ? 'transparent' : (CAT_DOT[n.category] || CAT_DOT.system), border: n.read_at ? '1px solid var(--border)' : 'none' }}></span>
                <div style=${{ minWidth: 0, flex: 1 }}>
                  <div style=${{ fontSize: '13px', fontWeight: n.read_at ? 500 : 700, color: 'var(--text)', whiteSpace: 'normal' }}>${n.title}</div>
                  ${n.body ? html`<div class="muted small" style=${{ marginTop: '2px', lineHeight: 1.4 }}>${n.body}</div>` : null}
                  <div class="muted small" style=${{ marginTop: '3px', fontSize: '11px' }}>${timeAgo(n.created_at)}</div>
                </div>
              </div>
            `)}
          </div>
        </div>
      ` : null}
    </div>
  `;
}

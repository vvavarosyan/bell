// Admin Announcements — platform_admin composes a broadcast (in-app notification
// to users), sees what's been sent, and can RECALL one (removes it from every
// recipient's bell). Email delivery layers on later via the branded template.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const card = {
  background: 'var(--bg-elev)', border: '1px solid var(--border)',
  borderRadius: '12px', padding: '18px 20px',
};
const field = {
  width: '100%', padding: '9px 11px', borderRadius: '8px',
  background: 'var(--bg-elev-2)', color: 'var(--text)',
  border: '1px solid var(--border)', fontSize: '13px', boxSizing: 'border-box',
};
const labelStyle = { display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', margin: '0 0 5px' };

function when(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString();
}

export function AnnouncementsTab() {
  const [title, setTitle]   = useState('');
  const [body, setBody]     = useState('');
  const [link, setLink]     = useState('');
  const [allTenants, setAll] = useState(true);
  const [sending, setSending] = useState(false);
  const [rows, setRows]     = useState([]);
  const [busy, setBusy]     = useState(() => new Set());

  const load = useCallback(async () => {
    try { const r = await api.listAnnouncements(); setRows(r.rows || []); }
    catch (err) { toast('Could not load announcements: ' + err.message, 'error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    if (title.trim().length < 2) { toast('Add a title', 'error'); return; }
    if (allTenants && !window.confirm('Broadcast this to EVERY user across the whole platform?')) return;
    setSending(true);
    try {
      const r = await api.sendAnnouncement({
        title: title.trim(), body: body.trim() || undefined,
        link: link.trim() || undefined, all_tenants: allTenants,
      });
      toast(`Sent to ${r.sent} user${r.sent === 1 ? '' : 's'}`);
      window.dispatchEvent(new Event('bdi:notifications-changed'));
      setTitle(''); setBody(''); setLink('');
      load();
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setSending(false); }
  };

  const recall = async (a) => {
    if (!window.confirm(`Recall "${a.title}"? It will be removed from every recipient's notifications.`)) return;
    setBusy(prev => new Set(prev).add(a.id));
    try {
      const r = await api.recallAnnouncement(a.id);
      toast(`Recalled — removed from ${r.removed} inbox${r.removed === 1 ? '' : 'es'}`);
      window.dispatchEvent(new Event('bdi:notifications-changed'));
      load();
    } catch (err) { toast('Recall failed: ' + err.message, 'error'); }
    finally { setBusy(prev => { const n = new Set(prev); n.delete(a.id); return n; }); }
  };

  return html`
    <div style=${{ maxWidth: '760px', margin: '0 auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '22px' }}>

      <!-- Compose -->
      <div style=${card}>
        <h2 style=${{ margin: '0 0 4px', fontSize: '17px' }}>New announcement</h2>
        <p class="muted small" style=${{ margin: '0 0 16px' }}>Broadcast an in-app notification. It appears in recipients' bell instantly. You can recall it below.</p>

        <div style=${{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style=${labelStyle}>Title</label>
            <input type="text" value=${title} onInput=${e => setTitle(e.target.value)}
              placeholder="e.g. New: Manual Company Lookup is live" style=${field} />
          </div>
          <div>
            <label style=${labelStyle}>Message</label>
            <textarea rows="5" value=${body} onInput=${e => setBody(e.target.value)}
              placeholder="What do you want users to know?" style=${{ ...field, resize: 'vertical', lineHeight: 1.5 }}></textarea>
          </div>
          <div>
            <label style=${labelStyle}>Link <span style=${{ fontWeight: 400 }}>(optional — where clicking the notification goes)</span></label>
            <input type="text" value=${link} onInput=${e => setLink(e.target.value)}
              placeholder="/market-feed" style=${field} />
          </div>

          <div style=${{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
            <label style=${{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
              <input type="checkbox" checked=${allTenants} onChange=${e => setAll(e.target.checked)} />
              Send to <strong style=${{ color: 'var(--text)' }}>all users on the platform</strong> (off = your organization only)
            </label>
            <button class="accent" onClick=${send} disabled=${sending}>${sending ? 'Sending…' : 'Send announcement ▶'}</button>
          </div>
        </div>
      </div>

      <!-- Sent -->
      <div>
        <div style=${{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 2px 10px' }}>
          <h3 style=${{ margin: 0, fontSize: '14px' }}>Sent announcements</h3>
          <button onClick=${load} class="linkbtn" style=${{ background: 'transparent', border: 'none', color: 'var(--accent-bright, #6ea0ff)', cursor: 'pointer', fontSize: '12px' }}>Refresh</button>
        </div>

        ${rows.length === 0 ? html`<div class="muted small" style=${{ ...card, textAlign: 'center', padding: '26px' }}>No announcements yet.</div>` : null}

        <div style=${{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          ${rows.map(a => html`
            <div key=${a.id} style=${{ ...card, padding: '14px 16px', opacity: a.recalled_at ? 0.55 : 1 }}>
              <div style=${{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                <div style=${{ minWidth: 0 }}>
                  <div style=${{ fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    ${a.title}
                    <span class="request-pill" style=${{ borderColor: a.scope === 'platform' ? 'var(--accent)' : 'var(--border)', color: 'var(--text-muted)', fontSize: '10px' }}>${a.scope === 'platform' ? 'all users' : 'my org'}</span>
                    ${a.recalled_at ? html`<span class="request-pill" style=${{ borderColor: 'var(--red)', color: 'var(--red)', fontSize: '10px' }}>recalled</span>` : null}
                  </div>
                  ${a.body ? html`<div class="muted small" style=${{ marginTop: '4px', lineHeight: 1.45 }}>${a.body}</div>` : null}
                  <div class="muted small" style=${{ marginTop: '5px', fontSize: '11px' }}>
                    ${when(a.created_at)} · sent to ${a.sent_count} ${a.sent_count === 1 ? 'user' : 'users'}${a.created_by ? ' · ' + a.created_by : ''}
                  </div>
                </div>
                ${!a.recalled_at ? html`<button class="ghost" disabled=${busy.has(a.id)} onClick=${() => recall(a)} style=${{ flexShrink: 0 }}>Recall</button>` : null}
              </div>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}

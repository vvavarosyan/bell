// Admin Announcements — platform_admin broadcasts an in-app notification to
// users (their own organization by default, or the whole platform). Email
// delivery layers on later via the branded template.

import { useState } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

export function AnnouncementsTab() {
  const [title, setTitle]   = useState('');
  const [body, setBody]     = useState('');
  const [link, setLink]     = useState('');
  const [allTenants, setAll] = useState(false);
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (title.trim().length < 2) { toast('Add a title', 'error'); return; }
    if (allTenants && !window.confirm('Broadcast this to EVERY user across the whole platform?')) return;
    setSending(true);
    try {
      const r = await api.sendAnnouncement({
        title: title.trim(),
        body:  body.trim() || undefined,
        link:  link.trim() || undefined,
        all_tenants: allTenants,
      });
      toast(`Announcement sent to ${r.sent} user${r.sent === 1 ? '' : 's'}`);
      window.dispatchEvent(new Event('bdi:notifications-changed'));
      setTitle(''); setBody(''); setLink('');
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setSending(false); }
  };

  const inputStyle = { width: '100%', padding: '8px 10px', borderRadius: '6px', background: 'var(--bg-elev-2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: '13px', marginTop: '4px' };

  return html`
    <div class="settings-shell" style=${{ maxWidth: '720px', padding: '18px 20px' }}>
      <h2 style=${{ margin: '0 0 4px' }}>Announcements</h2>
      <p class="muted small" style=${{ margin: '0 0 16px' }}>Broadcast an in-app notification to users. It appears in their notification bell instantly. (Email delivery is the next step.)</p>

      <div style=${{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <label class="small">Title
          <input type="text" value=${title} onInput=${e => setTitle(e.target.value)} placeholder="e.g. New: Manual Company Lookup is live" style=${inputStyle} />
        </label>
        <label class="small">Message
          <textarea rows="5" value=${body} onInput=${e => setBody(e.target.value)} placeholder="What do you want users to know?" style=${{ ...inputStyle, resize: 'vertical' }}></textarea>
        </label>
        <label class="small">Link (optional — where clicking the notification goes)
          <input type="text" value=${link} onInput=${e => setLink(e.target.value)} placeholder="/market-feed" style=${inputStyle} />
        </label>
        <label class="small" style=${{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input type="checkbox" checked=${allTenants} onChange=${e => setAll(e.target.checked)} />
          Send to <strong>ALL users on the platform</strong> (otherwise only your own organization)
        </label>
        <div>
          <button class="accent" onClick=${send} disabled=${sending}>${sending ? 'Sending…' : 'Send announcement ▶'}</button>
        </div>
      </div>
    </div>
  `;
}

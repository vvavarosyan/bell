// Admin Email Templates — edit the HTML + subject of Bell's emails with a live
// preview. Overrides save to the DB; "Reset to default" reverts to the built-in
// template. Editing the 'base' template restyles every email (announcements,
// welcome, etc.). Edit on admin.bell.qa to affect production emails.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

export function EmailTemplatesTab() {
  const [list, setList]       = useState([]);
  const [key, setKey]         = useState('base');
  const [tpl, setTpl]         = useState(null);
  const [subject, setSubject] = useState('');
  const [body, setBody]       = useState('');     // the HTML
  const [preview, setPreview] = useState('');
  const [saving, setSaving]   = useState(false);

  const loadList = useCallback(async () => {
    try { const r = await api.emailTemplates(); setList(r.rows || []); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
  }, []);
  const loadTpl = useCallback(async (k) => {
    try {
      const t = await api.emailTemplate(k);
      setTpl(t); setSubject(t.subject || ''); setBody(t.html || '');
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { loadTpl(key); }, [key, loadTpl]);

  // Debounced live preview (server renders with sample data, same substitution).
  useEffect(() => {
    if (!tpl) return;
    const t = setTimeout(async () => {
      try { const r = await api.previewEmailTemplate({ subject, html: body }); setPreview(r.html || ''); }
      catch { /* ignore mid-edit errors */ }
    }, 450);
    return () => clearTimeout(t);
  }, [subject, body, tpl]);

  const save = async () => {
    setSaving(true);
    try { await api.saveEmailTemplate(key, { subject, html: body }); toast('Saved — live for new emails'); loadList(); }
    catch (err) { toast('Save failed: ' + err.message, 'error'); }
    finally { setSaving(false); }
  };
  const reset = async () => {
    if (!window.confirm('Reset this template to the built-in default? Your custom edits will be removed.')) return;
    try { await api.resetEmailTemplate(key); toast('Reset to default'); loadTpl(key); loadList(); }
    catch (err) { toast('Reset failed: ' + err.message, 'error'); }
  };

  const inputBase = { background: 'var(--bg-elev-2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px' };

  return html`
    <div style=${{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div class="grid-toolbar">
        <strong>Email Templates</strong>
        <select value=${key} onChange=${e => setKey(e.target.value)}>
          ${list.map(t => html`<option key=${t.key} value=${t.key}>${t.name}${t.customized ? ' · edited' : ''}</option>`)}
        </select>
        <span class="muted small">Saved edits go live for new emails. Edit on admin.bell.qa to affect production.</span>
        <span class="spacer"></span>
        <button onClick=${reset} title="Revert to the built-in default template">Reset to default</button>
        <button class="accent" onClick=${save} disabled=${saving}>${saving ? 'Saving…' : 'Save'}</button>
      </div>

      <div style=${{ display: 'flex', flex: 1, minHeight: 0 }}>
        <!-- Editor -->
        <div style=${{ flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', borderRight: '1px solid var(--border)' }}>
          <div class="muted small">Subject line</div>
          <input type="text" value=${subject} onInput=${e => setSubject(e.target.value)} style=${{ ...inputBase, padding: '8px 10px', fontSize: '13px' }} />
          <div class="muted small" style=${{ marginTop: '4px' }}>
            HTML${tpl?.variables ? html` · placeholders: <code style=${{ color: 'var(--accent-bright, #6ea0ff)' }}>${tpl.variables.join('  ')}</code>` : ''}
          </div>
          <textarea value=${body} onInput=${e => setBody(e.target.value)} spellcheck="false"
            style=${{ ...inputBase, flex: 1, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '12px', lineHeight: 1.5, padding: '10px', resize: 'none', minHeight: 0 }}></textarea>
        </div>
        <!-- Live preview -->
        <div style=${{ flex: '1 1 50%', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div class="muted small" style=${{ padding: '12px 14px 6px' }}>Live preview (sample data)</div>
          <iframe title="email preview" srcdoc=${preview} style=${{ flex: 1, width: '100%', border: 'none', background: '#f4f6fb' }}></iframe>
        </div>
      </div>
    </div>
  `;
}

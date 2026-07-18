// Marketing — Bell's self-marketing outreach command center (admin-only). See the whole
// addressable market, build/preview/pause campaigns, and read EVERY outgoing and incoming
// email. Sends nothing on its own — the engine only sends when armed on the server
// (BDI_OUTREACH_ENABLED). This is Bell marketing ITSELF, never a customer feature.
//
// Rule 2.6: all hooks are declared before any early return.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const num = (n) => (n == null ? '0' : Number(n).toLocaleString());
const STATUS_TINT = {
  active: '#1e8449', paused: '#b7791f', draft: 'var(--muted)', done: 'var(--muted)',
  sent: '#3f7fd8', replied: '#1e8449', pending: 'var(--muted)', skipped: '#b7791f',
  failed: '#c0392b', bounced: '#c0392b', unsubscribed: '#8a4fbf',
};

export function MarketingTab() {
  const [summary, setSummary] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', audience_tier: 'role_mailbox', lang_mode: 'en', daily_cap: 30 });
  const [drafts, setDrafts] = useState(null);       // {campaignId, rows} for the preview panel
  const [mailDir, setMailDir] = useState('out');
  const [mail, setMail] = useState([]);
  const [openMail, setOpenMail] = useState(null);   // full email body in the reader

  const loadTop = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([api.mktSummary(), api.mktCampaigns()]);
      setSummary(s); setCampaigns(c.campaigns || []);
    } catch (err) { toast('Marketing load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);
  const loadMail = useCallback(async (dir) => {
    try { const r = await api.mktMail(dir, 200); setMail(r.mail || []); }
    catch (err) { toast('Mail load failed: ' + err.message, 'error'); }
  }, []);
  useEffect(() => { loadTop(); }, [loadTop]);
  useEffect(() => { loadMail(mailDir); }, [mailDir, loadMail]);

  const createCampaign = async () => {
    if (!form.name.trim()) { toast('Give the campaign a name.', 'error'); return; }
    setBusy(true);
    try { await api.mktCreateCampaign(form); setShowCreate(false); setForm({ name: '', goal: '', audience_tier: 'role_mailbox', lang_mode: 'en', daily_cap: 30 }); await loadTop(); toast('Campaign created (draft).'); }
    catch (err) { toast('Create failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };
  const plan = async (id) => {
    setBusy(true);
    try { const r = await api.mktPlan(id); toast('Queued ' + num(r.inserted) + ' new targets.'); await loadTop(); }
    catch (err) { toast('Plan failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };
  const preview = async (id) => {
    setBusy(true);
    try { const r = await api.mktPreview(id, 5); setDrafts({ campaignId: id, rows: r.drafts || [] }); }
    catch (err) { toast('Preview failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };
  const setStatus = async (id, status) => {
    setBusy(true);
    try { await api.mktSetStatus(id, status); await loadTop(); }
    catch (err) { toast('Status change failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };
  const addRecipient = async (id) => {
    const email = window.prompt('Add ONE recipient to this campaign (for a controlled test send):');
    if (!email) return;
    setBusy(true);
    try {
      const r = await api.mktAddTarget(id, email.trim(), null);
      if (r.added) toast('Added ' + email + (r.company ? ' (' + r.company + ')' : '') + ' to the queue.');
      else toast('Not added: ' + (r.reason || 'already queued'), 'error');
      await loadTop();
    } catch (err) { toast('Add failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };
  const sendNow = async (id) => {
    if (!window.confirm('Send NOW to the test recipients you added to this campaign? (Only addresses you added by hand — never the bulk list.)')) return;
    setBusy(true);
    try {
      const r = await api.mktSendNow(id);
      if (r.considered === 0) toast('No hand-added recipients to send to. Use "＋ recipient" first.', 'error');
      else toast('Sent ' + r.sent + ', skipped ' + r.skipped + ', failed ' + r.failed + '.');
      await loadTop(); setMailDir('out'); await loadMail('out');
    } catch (err) { toast('Send now failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };
  const logReply = async () => {
    const fromEmail = window.prompt('Test the Incoming flow: whose email replied? (their address)');
    if (!fromEmail) return;
    const text = window.prompt('What did they say? (reply text)') || '(no text)';
    try {
      const r = await api.mktLogReply(fromEmail.trim(), 'Re: Bell', text);
      toast(r.matched ? 'Reply logged, and that address is now marked replied (reply-stop).' : 'Reply logged (no matching sent email found).');
      setMailDir('in'); await loadMail('in');
    } catch (err) { toast('Log reply failed: ' + err.message, 'error'); }
  };
  const readMail = async (id) => {
    try { const r = await api.mktMailOne(id); setOpenMail(r.email); }
    catch (err) { toast('Could not open message: ' + err.message, 'error'); }
  };

  if (loading) return html`<div class="page-fill"><div class="page-scroll"><div class="empty">Loading marketing…</div></div></div>`;
  if (!summary) return html`<div class="page-fill"><div class="page-scroll"><div class="empty">Marketing unavailable.</div></div></div>`;

  const e = summary.engine || {};
  const a = summary.addressable || {};

  const chip = (label, value, tint) => html`
    <div key=${label} style=${{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', padding: '10px 14px', minWidth: 0 }}>
      <div style=${{ fontSize: '19px', fontWeight: 700, color: tint || 'var(--text)' }}>${value}</div>
      <div class="muted small" style=${{ marginTop: '1px' }}>${label}</div>
    </div>`;

  // --- engine banner --------------------------------------------------------
  const banner = html`
    <div style=${{ border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px',
        background: e.send_enabled ? 'rgba(192,57,43,0.08)' : 'rgba(30,132,73,0.08)' }}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style=${{ fontWeight: 700, fontSize: '15px', color: e.send_enabled ? '#c0392b' : '#1e8449' }}>
          ${e.send_enabled ? '● SENDING IS LIVE' : '● Sending OFF — safe test mode'}
        </div>
        <div class="muted small">
          ${e.send_enabled
            ? 'The engine will send within Qatar hours, under the warmup + daily cap.'
            : 'The engine is fully built but sends nothing until it is armed on the server. Preview freely.'}
        </div>
      </div>
      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '10px', marginTop: '12px' }}>
        ${chip('Scheduler', e.scheduler_on ? 'On' : 'Off', e.scheduler_on ? '#1e8449' : 'var(--muted)')}
        ${chip('Qatar working hours', e.within_qatar_hours ? 'Yes' : 'No', e.within_qatar_hours ? '#1e8449' : 'var(--muted)')}
        ${chip('Sent today', num(e.sent_today) + ' / ' + num(e.global_daily_cap))}
        ${chip('Channel', 'go.bell.qa')}
        ${chip('Qatar time', (e.qatar_time || '').split(' ').slice(-2).join(' ') || '—')}
      </div>
    </div>`;

  // --- addressable market ---------------------------------------------------
  const market = html`
    <div class="section-title" style=${{ marginBottom: '8px' }}>Addressable market</div>
    <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '10px', marginBottom: '20px' }}>
      ${chip('Candidate addresses', num(a.candidates))}
      ${chip('Role mailboxes', num(a.role_mailbox), '#1e8449')}
      ${chip('Named person', num(a.named_person), '#b7791f')}
      ${chip('Unclassified', num(a.unclassified))}
      ${chip('Unique sendable', num(a.selected), '#3f7fd8')}
      ${chip('Excluded (unsub/supp)', num((a.excluded_suppressed || 0) + (a.excluded_withdrawn || 0)), '#8a4fbf')}
    </div>`;

  // --- campaigns ------------------------------------------------------------
  const campaignRow = (c) => {
    const counts = c.counts || {};
    return html`
      <div key=${c.id} style=${{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', padding: '12px 14px', marginBottom: '10px' }}>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div>
            <span style=${{ fontWeight: 700 }}>${c.name}</span>
            <span style=${{ marginLeft: '8px', fontSize: '12px', fontWeight: 700, color: STATUS_TINT[c.status] || 'var(--muted)', textTransform: 'uppercase' }}>${c.status}</span>
            <div class="muted small" style=${{ marginTop: '2px' }}>
              ${c.audience_tier} · ${c.lang_mode.toUpperCase()} · cap ${c.daily_cap}/day (warmup from ${c.warmup_start})
              ${c.goal ? ' · ' + c.goal : ''}
            </div>
          </div>
          <div style=${{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button class="btn btn-sm" disabled=${busy} onClick=${() => plan(c.id)}>Plan</button>
            <button class="btn btn-sm" disabled=${busy} onClick=${() => addRecipient(c.id)}>＋ recipient</button>
            <button class="btn btn-sm" disabled=${busy} onClick=${() => sendNow(c.id)}>Send now (test)</button>
            <button class="btn btn-sm" disabled=${busy} onClick=${() => preview(c.id)}>Preview</button>
            ${c.status === 'active'
              ? html`<button class="btn btn-sm" disabled=${busy} onClick=${() => setStatus(c.id, 'paused')}>Pause</button>`
              : html`<button class="btn btn-sm btn-primary" disabled=${busy} onClick=${() => setStatus(c.id, 'active')}>Activate</button>`}
          </div>
        </div>
        <div style=${{ display: 'flex', gap: '14px', marginTop: '8px', flexWrap: 'wrap' }}>
          ${['pending', 'sent', 'replied', 'skipped', 'failed'].map((k) => html`
            <span key=${k} class="small" style=${{ color: STATUS_TINT[k] }}>${k}: <b>${num(counts[k] || 0)}</b></span>`)}
        </div>
      </div>`;
  };

  const campaignsSection = html`
    <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
      <div class="section-title">Campaigns</div>
      <button class="btn btn-sm btn-primary" onClick=${() => setShowCreate((v) => !v)}>${showCreate ? 'Cancel' : '+ New campaign'}</button>
    </div>
    ${showCreate ? html`
      <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', padding: '14px', marginBottom: '12px' }}>
        <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '10px' }}>
          <label class="small">Name<input class="input" value=${form.name} onInput=${(ev) => setForm({ ...form, name: ev.target.value })} placeholder="e.g. Qatar SMEs — pilot" /></label>
          <label class="small">Goal<input class="input" value=${form.goal} onInput=${(ev) => setForm({ ...form, goal: ev.target.value })} placeholder="what this push is for" /></label>
          <label class="small">Audience
            <select class="input" value=${form.audience_tier} onChange=${(ev) => setForm({ ...form, audience_tier: ev.target.value })}>
              <option value="role_mailbox">Role mailboxes (safest)</option>
              <option value="named_person">Named person</option>
              <option value="unclassified">Unclassified</option>
              <option value="all">All</option>
            </select></label>
          <label class="small">Language
            <select class="input" value=${form.lang_mode} onChange=${(ev) => setForm({ ...form, lang_mode: ev.target.value })}>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
              <option value="bilingual">Bilingual</option>
            </select></label>
          <label class="small">Daily cap<input class="input" type="number" value=${form.daily_cap} onInput=${(ev) => setForm({ ...form, daily_cap: Number(ev.target.value) })} /></label>
        </div>
        <div style=${{ marginTop: '10px' }}><button class="btn btn-primary btn-sm" disabled=${busy} onClick=${createCampaign}>Create draft</button></div>
      </div>` : null}
    ${campaigns.length ? campaigns.map(campaignRow) : html`<div class="muted small" style=${{ marginBottom: '16px' }}>No campaigns yet. Create one, click Plan to build its queue, then Preview to read the drafts.</div>`}`;

  // --- mail log -------------------------------------------------------------
  const mailSection = html`
    <div class="section-title" style=${{ marginTop: '22px', marginBottom: '8px' }}>Mail log</div>
    <div style=${{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
      <button class="btn btn-sm ${mailDir === 'out' ? 'btn-primary' : ''}" onClick=${() => setMailDir('out')}>Outgoing</button>
      <button class="btn btn-sm ${mailDir === 'in' ? 'btn-primary' : ''}" onClick=${() => setMailDir('in')}>Incoming (replies)</button>
      <button class="btn btn-sm" onClick=${logReply} style=${{ marginLeft: 'auto' }}>Log a reply (test)</button>
      <button class="btn btn-sm" onClick=${() => loadMail(mailDir)}>Refresh</button>
    </div>
    ${mail.length ? html`
      <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        ${mail.map((m, i) => html`
          <div key=${m.id} onClick=${() => readMail(m.id)} style=${{ display: 'flex', gap: '12px', alignItems: 'center', padding: '9px 12px', cursor: 'pointer',
              borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <div style=${{ flex: '0 0 190px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              ${mailDir === 'out' ? m.to_email : m.from_email}
            </div>
            <div style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${m.subject || '(no subject)'}</div>
            <div class="small" style=${{ flex: '0 0 auto', color: STATUS_TINT[m.status] || 'var(--muted)' }}>${m.status}</div>
            <div class="muted small" style=${{ flex: '0 0 auto' }}>${(m.sent_at || m.created_at || '').slice(0, 16).replace('T', ' ')}</div>
          </div>`)}
      </div>` : html`<div class="muted small">${mailDir === 'out' ? 'No outreach emails sent yet.' : 'No replies captured yet. Replies are captured once inbound is wired (they land in ' + '(reply inbox)' + ').'}</div>`}`;

  // --- preview panel (overlay) ---------------------------------------------
  const previewPanel = drafts ? html`
    <div onClick=${() => setDrafts(null)} style=${{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick=${(ev) => ev.stopPropagation()} style=${{ width: 'min(560px,100%)', background: 'var(--bg)', height: '100%', overflowY: 'auto', padding: '18px', boxShadow: '-8px 0 24px rgba(0,0,0,0.3)' }}>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style=${{ fontWeight: 700 }}>Preview drafts (not sent)</div>
          <button class="btn btn-sm" onClick=${() => setDrafts(null)}>Close</button>
        </div>
        ${drafts.rows.length ? drafts.rows.map((d, i) => html`
          <div key=${i} style=${{ border: '1px solid var(--border)', borderRadius: '10px', marginBottom: '12px', overflow: 'hidden' }}>
            <div style=${{ padding: '8px 12px', background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)' }}>
              <div style=${{ fontWeight: 600, fontSize: '13px' }}>${d.company_name || '(no name)'}</div>
              <div class="muted small">${d.email} · ${d.address_class} · ${d.lang} · by ${d.source}</div>
            </div>
            <div style=${{ padding: '10px 12px' }}>
              <div style=${{ fontWeight: 600, marginBottom: '6px' }}>${d.subject}</div>
              <div style=${{ whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.55 }}>${d.text}</div>
            </div>
          </div>`) : html`<div class="muted small">No pending targets to preview. Click Plan first.</div>`}
      </div>
    </div>` : null;

  // --- mail reader (overlay) ------------------------------------------------
  const mailReader = openMail ? html`
    <div onClick=${() => setOpenMail(null)} style=${{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick=${(ev) => ev.stopPropagation()} style=${{ width: 'min(620px,100%)', background: 'var(--bg)', height: '100%', overflowY: 'auto', padding: '18px', boxShadow: '-8px 0 24px rgba(0,0,0,0.3)' }}>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <div style=${{ fontWeight: 700 }}>${openMail.direction === 'in' ? 'Reply received' : 'Outreach email'}</div>
          <button class="btn btn-sm" onClick=${() => setOpenMail(null)}>Close</button>
        </div>
        <div class="muted small">${openMail.direction === 'in' ? 'From: ' + openMail.from_email : 'To: ' + openMail.to_email} · ${(openMail.sent_at || openMail.created_at || '').slice(0, 16).replace('T', ' ')} · ${openMail.status}</div>
        <div style=${{ fontWeight: 700, margin: '10px 0' }}>${openMail.subject || '(no subject)'}</div>
        ${openMail.body_html
          ? html`<div dangerouslySetInnerHTML=${{ __html: openMail.body_html }} style=${{ border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', background: '#fff', color: '#111' }} />`
          : html`<div style=${{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 1.6 }}>${openMail.body_text || '(no body)'}</div>`}
        ${openMail.error ? html`<div style=${{ marginTop: '10px', color: '#c0392b' }} class="small">Error: ${openMail.error}</div>` : null}
      </div>
    </div>` : null;

  return html`
    <div class="page-fill"><div class="page-scroll" style=${{ padding: '18px', maxWidth: '1000px' }}>
      <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
        <h2 style=${{ margin: 0 }}>Marketing</h2>
        <div class="muted small">Bell reaching Qatar · admin only</div>
      </div>
      <div class="muted small" style=${{ marginBottom: '16px' }}>Every outgoing and incoming outreach email is logged below.</div>
      ${banner}
      ${market}
      ${campaignsSection}
      ${mailSection}
      ${previewPanel}
      ${mailReader}
    </div></div>`;
}

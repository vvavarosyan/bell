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
// Timestamps shown in QATAR time — raw UTC in the log confused Val ("17:56" was 20:56 Doha).
const qtime = (ts) => {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString('en-GB', { timeZone: 'Asia/Qatar', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch { return String(ts).slice(0, 16).replace('T', ' '); }
};
const STATUS_TINT = {
  active: '#1e8449', paused: '#b7791f', draft: 'var(--muted)', done: 'var(--muted)',
  sent: '#3f7fd8', replied: '#1e8449', pending: 'var(--muted)', skipped: '#b7791f',
  failed: '#c0392b', bounced: '#c0392b', unsubscribed: '#8a4fbf',
};

export function MarketingTab() {
  const [summary, setSummary] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [machine, setMachine] = useState(null);     // breaker / preflight / holiday
  const [hotLeads, setHotLeads] = useState([]);
  const [stats, setStats] = useState(null);         // {campaign, funnel, arms} for the stats drawer
  const [recipients, setRecipients] = useState(null); // per-campaign target list for the stats drawer
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', goal: '', audience_tier: 'role_mailbox', lang_mode: 'en', daily_cap: 30 });
  const [drafts, setDrafts] = useState(null);       // {campaignId, rows} for the preview panel
  const [mailDir, setMailDir] = useState('out');
  const [mailSys, setMailSys] = useState('all');
  const [mail, setMail] = useState([]);
  const [openMail, setOpenMail] = useState(null);   // full email body in the reader
  const [supp, setSupp] = useState(null);           // suppression list (null = collapsed)
  const [overview, setOverview] = useState(null);   // whole-of-Bell email counts
  const [digest, setDigest] = useState(null);       // digest preview drawer

  const loadTop = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c, m, h, o] = await Promise.all([
        api.mktSummary(), api.mktCampaigns(),
        api.mktMachine().catch(() => null), api.mktHotLeads().catch(() => ({ leads: [] })),
        api.mktEmailOverview().catch(() => null),
      ]);
      setSummary(s); setCampaigns(c.campaigns || []); setMachine(m); setHotLeads(h.leads || []); setOverview(o);
    } catch (err) { toast('Marketing load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);
  const loadMail = useCallback(async (dir, sys) => {
    try { const r = await api.mktMail(dir, 200, sys || 'all'); setMail(r.mail || []); }
    catch (err) { toast('Mail load failed: ' + err.message, 'error'); }
  }, []);
  useEffect(() => { loadTop(); }, [loadTop]);
  useEffect(() => { loadMail(mailDir, mailSys); }, [mailDir, mailSys, loadMail]);

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
      else {
        const parts = ['Sent ' + r.sent];
        if (r.skipped) parts.push(r.skipped + ' skipped (suppressed/opted out)');
        if (r.deferred) parts.push(r.deferred + ' deferred (daily domain limit — retries next tick)');
        if (r.raced) parts.push(r.raced + ' already being handled');
        if (r.failed) parts.push(r.failed + ' FAILED (open the mail log entry for the error)');
        toast(parts.join(' · '), r.sent > 0 ? undefined : 'error');
      }
      await loadTop(); setMailDir('out'); await loadMail('out');
    } catch (err) { toast('Send now failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };
  const openStats = async (c) => {
    setBusy(true);
    setRecipients(null);
    try {
      const [r, t] = await Promise.all([api.mktStats(c.id), api.mktTargets(c.id, '', 500).catch(() => ({ targets: [] }))]);
      setStats({ campaign: c, ...r });
      setRecipients(t.targets || []);
    }
    catch (err) { toast('Stats failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };
  const resumeBreaker = async () => {
    if (!window.confirm('Resume sending? Only do this after understanding why the breaker tripped (bad addresses? spam complaint?).')) return;
    try { await api.mktResetBreaker(); toast('Breaker reset — the machine may send again.'); await loadTop(); }
    catch (err) { toast('Reset failed: ' + err.message, 'error'); }
  };
  const clearTests = async () => {
    if (!window.confirm('Remove ALL test artifacts (test sends, test replies, hand-added recipients)? Real engine sends and the consent ledger are never touched.')) return;
    try {
      const r = await api.mktClearTests();
      toast('Cleared: ' + r.removed.test_sends + ' test sends, ' + r.removed.test_replies + ' test replies, ' + r.removed.manual_targets + ' manual recipients.');
      await loadTop(); await loadMail(mailDir);
    } catch (err) { toast('Clear failed: ' + err.message, 'error'); }
  };
  const loadSupp = async () => {
    try { const r = await api.mktSuppressions(); setSupp(r.suppressions || []); }
    catch (err) { toast('Suppression list failed: ' + err.message, 'error'); }
  };
  const unsuppress = async (email) => {
    if (!window.confirm('Remove ' + email + ' from the do-not-send list?\n\nOnly do this for TEST addresses, or someone who ASKED to hear from Bell again. Never for a real prospect who unsubscribed.')) return;
    try { await api.mktUnsuppress(email); toast(email + ' un-suppressed.'); await loadSupp(); await loadTop(); }
    catch (err) { toast('Un-suppress failed: ' + err.message, 'error'); }
  };
  const previewDigest = async () => {
    setBusy(true);
    try { setDigest(await api.mktDigestPreview()); }
    catch (err) { toast('Digest preview failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };
  const sendDigest = async () => {
    const subs = digest?.subscribers ?? '?';
    if (!window.confirm('Send the market-update digest NOW to all ' + subs + ' subscribers?')) return;
    setBusy(true);
    try {
      const r = await api.mktDigestSend();
      toast('Digest: sent ' + r.sent + ' of ' + r.subscribers + (r.failed ? ' · ' + r.failed + ' failed' : '') + '.');
      setDigest(null); await loadTop(); setMailDir('out'); setMailSys('digest'); await loadMail('out', 'digest');
    } catch (err) { toast('Digest send failed: ' + err.message, 'error'); }
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
  const g = summary.engagement || {};

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

  // --- machine safety panel (breaker + pre-flight + holiday) ----------------
  const br = machine?.breaker;
  const pf = machine?.preflight;
  const machinePanel = html`
    ${br?.tripped ? html`
      <div style=${{ border: '1px solid #c0392b', borderRadius: '12px', padding: '14px 16px', marginBottom: '14px', background: 'rgba(192,57,43,0.12)' }}>
        <div style=${{ fontWeight: 700, color: '#c0392b' }}>⛔ CIRCUIT BREAKER TRIPPED — the machine paused itself</div>
        <div class="small" style=${{ margin: '6px 0' }}>${br.reason} (${qtime(br.at)})</div>
        <button class="btn btn-sm" onClick=${resumeBreaker}>I investigated — resume sending</button>
      </div>` : null}
    ${machine?.holiday?.holiday ? html`
      <div style=${{ border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 16px', marginBottom: '14px', background: 'var(--bg-elev)' }}>
        <span class="small">🕌 Today is a Qatar holiday (${machine.holiday.name}) — the machine stays silent today.</span>
      </div>` : null}
    ${pf && !pf.ok ? html`
      <div style=${{ border: '1px solid #b7791f', borderRadius: '12px', padding: '10px 16px', marginBottom: '14px', background: 'rgba(183,121,31,0.1)' }}>
        <div style=${{ fontWeight: 700, color: '#b7791f' }}>⚠ Pre-flight self-test failing — sending is blocked</div>
        ${(pf.checks || []).filter((c) => !c.ok).map((c) => html`<div key=${c.name} class="small">${c.name}: ${c.detail}</div>`)}
      </div>` : null}`;

  // --- engagement (real totals, not just the company list) ------------------
  const engagement = html`
    <div class="section-title" style=${{ marginBottom: '8px' }}>Engagement</div>
    <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: '10px', marginBottom: '20px' }}>
      ${chip('Emailed (total)', num(g.emailed), '#3f7fd8')}
      ${chip('Replied', num(g.replied), '#1e8449')}
      ${chip('Unsubscribed', num(g.unsubscribed), '#8a4fbf')}
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
            <button class="btn btn-sm" disabled=${busy} onClick=${() => openStats(c)}>Stats</button>
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

  // --- whole-of-Bell email overview (the observatory) -----------------------
  const SYSTEM_LABEL = {
    'outreach-engine': 'Outreach (machine)', 'outreach-test': 'Outreach (tests)', 'outreach-forward': 'Reply forwards',
    digest: 'Market digest', 'optin-welcome': 'Subscribe welcome', sequence: 'CRM sequences', crm: 'CRM sends',
    'crm-forward': 'CRM reply forwards', invite: 'Team invites', notification: 'Notifications',
    'template-test': 'Template tests', transactional: 'Other transactional',
  };
  const ov = overview;
  const overviewSection = ov ? html`
    <div class="section-title" style=${{ marginTop: '4px', marginBottom: '8px' }}>All Bell email — every system</div>
    <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '10px', marginBottom: '10px' }}>
      ${chip('Sent today (all systems)', num(ov.totals?.today))}
      ${chip('Last 7 days', num(ov.totals?.last7d))}
      ${chip('All-time (since 19 Jul)', num(ov.totals?.total))}
      ${chip('Failed', num(ov.totals?.failed), ov.totals?.failed ? '#c0392b' : 'var(--muted)')}
      ${chip('Replies in (7d)', num(ov.inbound?.last7d), '#1e8449')}
    </div>
    ${(ov.by_system || []).length ? html`
      <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '20px' }}>
        <div style=${{ display: 'flex', gap: '10px', padding: '7px 12px', background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: '12px', color: 'var(--muted)' }}>
          <div style=${{ flex: 1 }}>System</div>
          <div style=${{ flex: '0 0 56px', textAlign: 'right' }}>Total</div>
          <div style=${{ flex: '0 0 56px', textAlign: 'right' }}>Today</div>
          <div style=${{ flex: '0 0 66px', textAlign: 'right' }}>Delivered</div>
          <div style=${{ flex: '0 0 56px', textAlign: 'right' }}>Opened</div>
          <div style=${{ flex: '0 0 60px', textAlign: 'right' }}>Bounced</div>
          <div style=${{ flex: '0 0 50px', textAlign: 'right' }}>Failed</div>
        </div>
        ${(ov.by_system || []).map((s, i) => html`
          <div key=${s.system + s.channel} style=${{ display: 'flex', gap: '10px', padding: '7px 12px', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: '13px' }}>
            <div style=${{ flex: 1, fontWeight: 600 }}>${SYSTEM_LABEL[s.system] || s.system}
              <span class="muted small" style=${{ marginLeft: '6px' }}>${s.channel === 'outreach' ? 'go.bell.qa' : 'bell.qa'}</span></div>
            <div style=${{ flex: '0 0 56px', textAlign: 'right' }}>${num(s.total)}</div>
            <div style=${{ flex: '0 0 56px', textAlign: 'right' }}>${num(s.today)}</div>
            <div style=${{ flex: '0 0 66px', textAlign: 'right', color: '#3f7fd8' }}>${num(s.delivered + s.opened)}</div>
            <div style=${{ flex: '0 0 56px', textAlign: 'right', color: '#7fb0e8' }}>${num(s.opened)}</div>
            <div style=${{ flex: '0 0 60px', textAlign: 'right', color: s.bounced ? '#c0392b' : 'var(--muted)' }}>${num(s.bounced + s.complained)}</div>
            <div style=${{ flex: '0 0 50px', textAlign: 'right', color: s.failed ? '#c0392b' : 'var(--muted)' }}>${num(s.failed)}</div>
          </div>`)}
      </div>` : html`<div class="muted small" style=${{ marginBottom: '20px' }}>The all-email ledger starts counting from today — every send from every Bell system will appear here.</div>`}` : null;

  // --- digest card (the engine behind bell.qa/market-updates) ---------------
  const digestCard = html`
    <div class="section-title" style=${{ marginBottom: '8px' }}>Market-updates digest</div>
    <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', padding: '12px 14px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
      <div class="small" style=${{ flex: 1, minWidth: '220px' }}>
        Subscribers from <b>bell.qa/market-updates</b> get a welcome email instantly and the weekly
        digest (Sundays 09:00 Qatar): real tender + signal numbers, with links into Bell.
      </div>
      <button class="btn btn-sm" disabled=${busy} onClick=${previewDigest}>Preview this week's digest</button>
    </div>`;

  // --- physical letters (the offline channel — no spam filter) --------------
  const letterCard = html`
    <div class="section-title" style=${{ marginBottom: '8px' }}>Physical letters</div>
    <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', padding: '12px 14px', marginBottom: '20px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
      <div class="small" style=${{ flex: 1, minWidth: '220px' }}>
        Print-ready bilingual letter (EN + AR) on Bell letterhead, addressed with the company's
        real address and live tender numbers. Print it, mail it — no spam filter in the way.
      </div>
      <button class="btn btn-sm" onClick=${() => {
        const q = window.prompt('Company name (or id) for the letter:');
        if (q) window.open('/api/marketing/letter?' + (/^\d+$/.test(q.trim()) ? 'company_id=' + q.trim() : 'q=' + encodeURIComponent(q.trim())), '_blank');
      }}>Generate letter</button>
    </div>`;

  // --- hot leads (the machine's output tray) --------------------------------
  const hotLeadsSection = hotLeads.length ? html`
    <div class="section-title" style=${{ marginTop: '22px', marginBottom: '8px' }}>🔥 Hot leads — replied "interested"</div>
    <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '4px' }}>
      ${hotLeads.map((l, i) => html`
        <div key=${l.id} style=${{ padding: '10px 12px', borderTop: i ? '1px solid var(--border)' : 'none' }}>
          <div style=${{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
            <div style=${{ fontWeight: 700 }}>${l.company_name || l.email}
              ${l.converted_at ? html`<span style=${{ marginLeft: '8px', color: '#1e8449', fontSize: '12px', fontWeight: 700 }}>✓ SIGNED UP</span>` : null}
            </div>
            <div class="muted small">${l.email} · ${l.campaign_name} · ${qtime(l.replied_at)}</div>
          </div>
          ${l.reply_text ? html`<div class="small" style=${{ marginTop: '4px', color: 'var(--muted)', whiteSpace: 'pre-wrap' }}>${String(l.reply_text).slice(0, 300)}</div>` : null}
        </div>`)}
    </div>` : null;

  // --- mail log -------------------------------------------------------------
  const mailSection = html`
    <div class="section-title" style=${{ marginTop: '22px', marginBottom: '8px' }}>Mail log</div>
    <div style=${{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
      <button class="btn btn-sm ${mailDir === 'out' ? 'btn-primary' : ''}" onClick=${() => setMailDir('out')}>Outgoing</button>
      <button class="btn btn-sm ${mailDir === 'in' ? 'btn-primary' : ''}" onClick=${() => setMailDir('in')}>Incoming (replies)</button>
      <button class="btn btn-sm" onClick=${logReply} style=${{ marginLeft: 'auto' }}>Log a reply (test)</button>
      <button class="btn btn-sm" onClick=${clearTests}>Clear test data</button>
      <button class="btn btn-sm" onClick=${() => loadMail(mailDir)}>Refresh</button>
    </div>
    ${mailDir === 'out' ? html`
      <div style=${{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap' }}>
        ${[['all', 'All outreach'], ['outreach', 'Cold emails'], ['digest', 'Digest'], ['welcome', 'Welcomes'], ['forwards', 'Forwards'], ['crm', 'CRM & sequences']].map(([k, label]) => html`
          <button key=${k} class="btn btn-sm ${mailSys === k ? 'btn-primary' : ''}" onClick=${() => setMailSys(k)}>${label}</button>`)}
      </div>` : null}
    ${mail.length ? html`
      <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        ${mail.map((m, i) => html`
          <div key=${m.id} onClick=${() => readMail(m.id)} style=${{ display: 'flex', gap: '12px', alignItems: 'center', padding: '9px 12px', cursor: 'pointer',
              borderTop: i ? '1px solid var(--border)' : 'none' }}>
            <div style=${{ flex: '0 0 220px', minWidth: 0 }}>
              <div style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: m.company_name ? 600 : 400 }}>
                ${m.company_name || (mailDir === 'out' ? m.to_email : m.from_email)}
              </div>
              ${m.company_name ? html`<div class="muted small" style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${mailDir === 'out' ? m.to_email : m.from_email}</div>` : null}
            </div>
            <div style=${{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${m.subject || '(no subject)'}</div>
            <div class="small" style=${{ flex: '0 0 auto', color: STATUS_TINT[m.status] || 'var(--muted)' }}>${m.status}</div>
            <div class="muted small" style=${{ flex: '0 0 auto' }}>${qtime(m.sent_at || m.created_at)}</div>
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

  // --- suppressed addresses (the do-not-send list, with WHY + unsuppress) ---
  const suppSection = html`
    <div class="section-title" style=${{ marginTop: '22px', marginBottom: '8px' }}>
      Suppressed addresses
      <button class="btn btn-sm" style=${{ marginLeft: '10px' }} onClick=${() => (supp === null ? loadSupp() : setSupp(null))}>
        ${supp === null ? 'Show' : 'Hide'}
      </button>
    </div>
    ${supp !== null ? (supp.length ? html`
      <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
        ${supp.map((s, i) => html`
          <div key=${s.email} style=${{ display: 'flex', gap: '12px', alignItems: 'center', padding: '9px 12px', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
            <div style=${{ flex: '0 0 220px', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>${s.email}</div>
            <div class="small" style=${{ flex: 1, minWidth: '160px', color: 'var(--muted)' }}>
              ${s.reason || '—'}${s.detail ? ' · ' + s.detail : ''}${s.source ? ' · via ' + s.source : ''}
            </div>
            <div class="muted small" style=${{ flex: '0 0 auto' }}>${qtime(s.updated_at || s.created_at)}</div>
            <button class="btn btn-sm" onClick=${() => unsuppress(s.email)}>Un-suppress</button>
          </div>`)}
      </div>` : html`<div class="muted small">Nothing is suppressed.</div>`) : null}`;

  // --- stats drawer (funnel + arms) -----------------------------------------
  const statsPanel = stats ? (() => {
    const f = stats.funnel || {};
    const stages = [
      ['Targets', f.targets, 'var(--text)'], ['Emailed', f.emailed, '#3f7fd8'],
      ['Delivered', f.delivered, '#3f7fd8'], ['Opened', f.opened, '#7fb0e8'],
      ['Replied', f.replied, '#1e8449'], ['Interested', f.interested, '#1e8449'],
      ['Converted', f.converted, '#0e6e3e'],
    ];
    const maxV = Math.max(1, ...stages.map((s) => s[1] || 0));
    return html`
      <div onClick=${() => { setStats(null); setRecipients(null); }} style=${{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
        <div onClick=${(ev) => ev.stopPropagation()} style=${{ width: 'min(620px,100%)', background: 'var(--bg)', height: '100%', overflowY: 'auto', padding: '18px', boxShadow: '-8px 0 24px rgba(0,0,0,0.3)' }}>
          <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <div style=${{ fontWeight: 700 }}>${stats.campaign.name} — funnel</div>
            <button class="btn btn-sm" onClick=${() => { setStats(null); setRecipients(null); }}>Close</button>
          </div>
          ${stages.map(([label, v, tint]) => html`
            <div key=${label} style=${{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '7px' }}>
              <div class="small" style=${{ flex: '0 0 90px', textAlign: 'right', color: 'var(--muted)' }}>${label}</div>
              <div style=${{ flex: 1, background: 'var(--bg-elev)', borderRadius: '6px', overflow: 'hidden', height: '22px', position: 'relative' }}>
                <div style=${{ width: Math.max(2, Math.round(100 * (v || 0) / maxV)) + '%', height: '100%', background: tint, opacity: 0.55 }}></div>
                <div class="small" style=${{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: '8px', fontWeight: 700 }}>${num(v)}</div>
              </div>
            </div>`)}
          <div class="small" style=${{ margin: '6px 0 16px', color: 'var(--muted)' }}>
            Also: ${num(f.followups_sent)} follow-ups · ${num(f.unsubscribed)} unsubscribed · ${num(f.bounced)} bounced · ${num(f.clicked)} clicked
          </div>
          <div class="section-title" style=${{ marginBottom: '8px' }}>A/B angles (the machine leans toward what gets replies)</div>
          ${(stats.arms || []).map((a) => html`
            <div key=${a.id} style=${{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', marginBottom: '8px', background: 'var(--bg-elev)' }}>
              <div style=${{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <div style=${{ fontWeight: 700 }}>${a.key}${a.is_active ? '' : ' (off)'}</div>
                <div class="small">sent <b>${num(a.sent)}</b> · replied <b style=${{ color: '#1e8449' }}>${num(a.replied)}</b> · interested <b>${num(a.positive)}</b></div>
              </div>
              <div class="muted small" style=${{ marginTop: '3px' }}>${a.angle}</div>
            </div>`)}

          <div class="section-title" style=${{ margin: '16px 0 8px' }}>Recipients${recipients ? ` (${recipients.length})` : ''}</div>
          ${recipients === null ? html`<div class="muted small">Loading…</div>`
            : recipients.length === 0 ? html`<div class="muted small">No recipients queued yet. Click Plan (or ＋ recipient) to add targets.</div>`
            : html`<div style=${{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              ${recipients.map((t, i) => html`
                <div key=${t.id} style=${{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
                  <div style=${{ flex: '1 1 220px', minWidth: 0 }}>
                    <div style=${{ fontWeight: 600, wordBreak: 'break-all' }}>${t.email}</div>
                    <div class="muted small">${t.company_name || '—'}${t.address_class === 'manual' ? ' · manual test' : ''}${t.lang && t.lang !== 'en' ? ' · ' + t.lang.toUpperCase() : ''}</div>
                  </div>
                  <div style=${{ textAlign: 'right' }}>
                    <span class="pill" style=${{ background: (STATUS_TINT[t.status] || 'var(--muted)') + '22', color: STATUS_TINT[t.status] || 'var(--muted)', fontWeight: 700, fontSize: '11px', padding: '2px 8px', borderRadius: '999px' }}>${t.status}</span>
                    <div class="muted small" style=${{ marginTop: '2px' }}>${t.sent_at ? 'sent ' + qtime(t.sent_at) : (t.skip_reason ? t.skip_reason : '')}</div>
                  </div>
                </div>`)}
            </div>`}
          <div class="muted small" style=${{ marginTop: '8px' }}>Times shown in Qatar time. Every recipient's send, delivery, open and reply is also in Marketing → Mail and the email log.</div>
        </div>
      </div>`;
  })() : null;

  // --- digest preview drawer ------------------------------------------------
  const digestPanel = digest ? html`
    <div onClick=${() => setDigest(null)} style=${{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick=${(ev) => ev.stopPropagation()} style=${{ width: 'min(620px,100%)', background: 'var(--bg)', height: '100%', overflowY: 'auto', padding: '18px', boxShadow: '-8px 0 24px rgba(0,0,0,0.3)' }}>
        <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '8px', flexWrap: 'wrap' }}>
          <div style=${{ fontWeight: 700 }}>This week's digest — ${num(digest.subscribers)} subscriber${digest.subscribers === 1 ? '' : 's'}</div>
          <div style=${{ display: 'flex', gap: '6px' }}>
            <button class="btn btn-sm btn-primary" disabled=${busy || !digest.subscribers} onClick=${sendDigest}>Send now to ${num(digest.subscribers)}</button>
            <button class="btn btn-sm" onClick=${() => setDigest(null)}>Close</button>
          </div>
        </div>
        <div style=${{ fontWeight: 700, marginBottom: '10px' }}>${digest.subject}</div>
        <div dangerouslySetInnerHTML=${{ __html: digest.html }} style=${{ border: '1px solid var(--border)', borderRadius: '8px', padding: '14px', background: '#fff', color: '#111' }} />
        <div class="muted small" style=${{ marginTop: '10px' }}>Every recipient also gets a personal unsubscribe footer. The weekly auto-send runs Sundays from 09:00 Qatar time.</div>
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
        <div class="muted small">${openMail.direction === 'in' ? 'From: ' + openMail.from_email : 'To: ' + openMail.to_email} · ${qtime(openMail.sent_at || openMail.created_at)} · ${openMail.status}</div>
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
      ${machinePanel}
      ${overviewSection}
      ${engagement}
      ${market}
      ${campaignsSection}
      ${digestCard}
      ${letterCard}
      ${hotLeadsSection}
      ${mailSection}
      ${suppSection}
      ${previewPanel}
      ${statsPanel}
      ${digestPanel}
      ${mailReader}
    </div></div>`;
}

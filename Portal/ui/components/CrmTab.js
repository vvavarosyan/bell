// CRM — the per-tenant action layer (Phase 1: records, notes, activity, tasks).
// Companies + People sub-tabs; revealed entities land here automatically. Click a
// row to open the record drawer: profile, status, notes, activity timeline, tasks.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

const STATUS_META = {
  new:       { label: 'New',       color: 'rgb(165 195 255)' },
  contacted: { label: 'Contacted', color: 'rgb(91 140 255)'  },
  engaged:   { label: 'Engaged',   color: 'rgb(255 196 99)'  },
  won:       { label: 'Won',       color: 'rgb(111 207 151)' },
  lost:      { label: 'Lost',      color: 'rgb(232 142 168)' },
};
const STATUSES = ['new', 'contacted', 'engaged', 'won', 'lost'];

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
const recName = (r) => r.entity_type === 'company' ? (r.company_name || '—') : (r.person_name || '—');
const recSub  = (r) => r.entity_type === 'company'
  ? [r.company_industry, r.company_city].filter(Boolean).join(' · ')
  : (r.person_headline || '');

function StatusPill({ status }) {
  const m = STATUS_META[status] || STATUS_META.new;
  return html`<span style=${{
    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
    color: m.color, background: m.color.replace('rgb', 'rgba').replace(')', ' / 0.12)'),
    border: '1px solid ' + m.color.replace('rgb', 'rgba').replace(')', ' / 0.3)'),
    borderRadius: '999px', padding: '2px 9px',
  }}>${m.label}</span>`;
}

export function CrmTab() {
  const [entityType, setEntityType] = useState('company');
  const [revealedOnly, setRevealedOnly] = useState(false);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openedId, setOpenedId] = useState(null);
  const [view, setView] = useState('records');   // records | pipeline | sequences
  const [selected, setSelected] = useState(() => new Set());
  const [segments, setSegments] = useState([]);
  const [seqList, setSeqList] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bulkSeq, setBulkSeq] = useState('');
  const [bulkCompose, setBulkCompose] = useState(null);   // null = closed; {subject,body} = open
  const [bulkSending, setBulkSending] = useState(false);
  const [emailMetrics, setEmailMetrics] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { entity_type: entityType };
      if (status) params.status = status;
      if (revealedOnly) params.source = 'reveal';
      if (q.trim()) params.q = q.trim();
      const [r, s] = await Promise.all([api.crmRecords(params), api.crmStats()]);
      setRows(r.rows || []);
      setStats(s);
    } catch (err) { if (!silent) toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [entityType, status, revealedOnly, q]);

  useEffect(() => { load(); }, [load]);
  // Clear selection whenever the visible set changes.
  useEffect(() => { setSelected(new Set()); }, [entityType, status, revealedOnly, q, view]);
  // One-time loads: role (for admin-only bulk enroll), saved segments, sequences.
  useEffect(() => {
    (async () => { try { const m = await api.authMe(); setIsAdmin(m?.user?.role === 'platform_admin'); } catch { /* ignore */ } })();
    (async () => { try { const r = await api.crmSegments(); setSegments(r.rows || []); } catch { /* ignore */ } })();
    (async () => { try { setEmailMetrics(await api.crmEmailMetrics()); } catch { /* ignore */ } })();
    (async () => { try { const r = await api.crmSequences(); setSeqList((r.rows || []).filter(s => s.status === 'active' && s.step_count > 0)); } catch { /* ignore */ } })();
  }, []);

  const toggleSel = (id) => setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map(r => r.id)));
  const clearSel = () => setSelected(new Set());
  const bulk = async (action, extra = {}) => {
    const ids = [...selected];
    if (!ids.length) return;
    try {
      const r = await api.crmBulk(ids, action, extra);
      toast(action === 'enroll' ? `Enrolled ${r.enrolled} record${r.enrolled === 1 ? '' : 's'}` : `Updated ${r.updated} record${r.updated === 1 ? '' : 's'}`);
      clearSel(); setBulkSeq(''); await load({ silent: true });
    } catch (err) {
      toast(/admin_only/i.test(err.message) ? 'Running sequences is admin-only for now' : 'Bulk action failed: ' + err.message, 'error');
    }
  };
  const bulkSend = async () => {
    const ids = [...selected];
    if (!ids.length || !bulkCompose) return;
    if (!(bulkCompose.subject || '').trim() && !(bulkCompose.body || '').trim()) { toast('Add a subject or message', 'error'); return; }
    setBulkSending(true);
    try {
      const r = await api.crmBulk(ids, 'send', { subject: bulkCompose.subject, body: bulkCompose.body });
      const parts = [`${r.sent} sent`];
      if (r.no_email) parts.push(`${r.no_email} had no email`);
      if (r.capped) parts.push(`${r.capped} over daily limit`);
      if (r.failed) parts.push(`${r.failed} failed`);
      toast(parts.join(' · '), r.sent ? 'success' : 'info');
      setBulkCompose(null); clearSel(); await load({ silent: true });
    } catch (e) {
      toast(/daily_limit/i.test(e.message) ? 'Daily sending limit reached — try again tomorrow.' : 'Send failed: ' + (e.message || ''), 'error');
    } finally { setBulkSending(false); }
  };
  const applySegment = (seg) => {
    const f = seg.filters || {};
    setEntityType(f.entity_type || 'company');
    setStatus(f.status || '');
    setRevealedOnly(f.source === 'reveal');
    setQ(f.q || '');
  };
  const saveSegment = async () => {
    const name = window.prompt('Name this view:');
    if (!name || !name.trim()) return;
    try {
      const filters = { entity_type: entityType };
      if (status) filters.status = status;
      if (revealedOnly) filters.source = 'reveal';
      if (q.trim()) filters.q = q.trim();
      const r = await api.crmSaveSegment(name.trim(), filters);
      setSegments(s => [...s, r]); toast('View saved');
    } catch (err) { toast('Save failed: ' + err.message, 'error'); }
  };
  const deleteSegment = async (id) => {
    try { await api.crmDeleteSegment(id); setSegments(s => s.filter(x => x.id !== id)); }
    catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  };

  return html`
    <div class="page-fill">
      <div class="page-scroll">
      <!-- View toggle: Records | Pipeline | Sequences -->
      <div style=${{ display: 'inline-flex', gap: '4px', marginBottom: '14px' }}>
        ${[['records', 'Records'], ['pipeline', 'Pipeline'], ['sequences', 'Sequences'], ['timeline', 'Timeline']].map(([k, lbl]) => html`
          <button key=${k} class=${'toolbar-toggle' + (view === k ? ' accent' : '')}
            onClick=${() => { setView(k); setOpenedId(null); }}>${lbl}</button>`)}
      </div>

      ${view === 'sequences' ? html`<${SequencesView} />`
        : view === 'pipeline' ? html`<${PipelineView} />`
        : view === 'timeline' ? html`<${TimelineView} />`
        : html`
      <!-- Toolbar -->
      <div style=${{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <div style=${{ display: 'inline-flex', gap: '4px' }}>
          ${[['company', 'Companies'], ['person', 'People']].map(([k, lbl]) => html`
            <button key=${k}
              class=${'toolbar-toggle' + (entityType === k ? ' accent' : '')}
              onClick=${() => { setEntityType(k); setOpenedId(null); }}>${lbl}</button>`)}
        </div>
        <button class=${'toolbar-toggle' + (revealedOnly ? ' accent' : '')} onClick=${() => setRevealedOnly(v => !v)}
          title="Show only entities added by revealing them">Revealed</button>
        <select value=${status} onChange=${e => setStatus(e.target.value)}
          style=${{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px' }}>
          <option value="">All statuses</option>
          ${STATUSES.map(s => html`<option key=${s} value=${s}>${STATUS_META[s].label}</option>`)}
        </select>
        <input type="text" placeholder="Search…" value=${q}
          onChange=${e => setQ(e.target.value)}
          style=${{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: '6px', fontSize: '12px', minWidth: '180px' }} />
        <span style=${{ flex: 1 }}></span>
        <button class="toolbar-toggle" onClick=${saveSegment} title="Save the current filters as a reusable view">Save view</button>
        <button class="toolbar-toggle" onClick=${() => load()}>Refresh</button>
      </div>

      ${segments.length ? html`<div style=${{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        ${segments.map(seg => html`<span key=${seg.id} style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '999px', padding: '3px 10px' }}>
          <button onClick=${() => applySegment(seg)} style=${{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '11.5px' }}>${seg.name}</button>
          <button onClick=${() => deleteSegment(seg.id)} title="Delete view" style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '11px' }}>✕</button>
        </span>`)}
      </div>` : null}

      ${emailMetrics && emailMetrics.sent > 0 ? html`<div style=${{ display: 'flex', gap: '18px', fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '10px' }}>
        <span>✉ <strong style=${{ color: 'var(--text)' }}>${emailMetrics.sent}</strong> sent</span>
        <span>Open rate <strong style=${{ color: 'var(--text)' }}>${emailMetrics.open_rate}%</strong></span>
        <span>Reply rate <strong style=${{ color: 'var(--text)' }}>${emailMetrics.reply_rate}%</strong></span>
        ${emailMetrics.replies ? html`<span><strong style=${{ color: 'var(--text)' }}>${emailMetrics.replies}</strong> repl${emailMetrics.replies === 1 ? 'y' : 'ies'}</span>` : null}
      </div>` : null}

      ${selected.size > 0 ? html`<div style=${{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', marginBottom: '10px', background: 'rgba(91,140,255,0.1)', border: '1px solid rgba(91,140,255,0.35)', borderRadius: '10px', flexWrap: 'wrap' }}>
        <strong style=${{ fontSize: '12.5px', color: 'var(--text)' }}>${selected.size} selected</strong>
        <span style=${{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Set status:</span>
        ${STATUSES.map(s => html`<button key=${s} onClick=${() => bulk('status', { status: s })}
          style=${{ background: 'transparent', border: '1px solid var(--border)', color: STATUS_META[s].color, borderRadius: '6px', padding: '3px 9px', fontSize: '11px', cursor: 'pointer' }}>${STATUS_META[s].label}</button>`)}
        ${seqList.length ? html`<span style=${{ width: '1px', height: '18px', background: 'var(--border)' }}></span>
          <select value=${bulkSeq} onChange=${e => setBulkSeq(e.target.value)}
            style=${{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '4px 8px', fontSize: '11.5px' }}>
            <option value="">Enroll in sequence…</option>
            ${seqList.map(s => html`<option key=${s.id} value=${s.id}>${s.name}</option>`)}
          </select>
          <button onClick=${() => bulkSeq && bulk('enroll', { sequence_id: Number(bulkSeq) })} disabled=${!bulkSeq}
            style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '4px 12px', fontSize: '11.5px', fontWeight: 600, cursor: bulkSeq ? 'pointer' : 'not-allowed' }}>Enroll</button>` : null}
        <button onClick=${() => setBulkCompose({ subject: '', body: '' })} style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '4px 12px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>Send email</button>
        <span style=${{ flex: 1 }}></span>
        <button onClick=${() => bulk('archive', { archived: true })} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '4px 10px', fontSize: '11.5px', cursor: 'pointer' }}>Archive</button>
        <button onClick=${clearSel} style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '11.5px' }}>Clear</button>
      </div>` : null}

      ${bulkCompose ? html`
        <div onClick=${() => !bulkSending && setBulkCompose(null)} style=${{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div onClick=${e => e.stopPropagation()} style=${{ width: 'min(560px, 92vw)', background: 'var(--bg-elev-2, #1a2034)', border: '1px solid var(--border)', borderRadius: '10px', padding: '18px 20px' }}>
            <div style=${{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Send email to ${selected.size} ${selected.size === 1 ? 'record' : 'records'}</div>
            <div style=${{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>Each email is personalized per recipient. Tokens: <code>{company} {name} {first_name} {industry} {city} {title} {website}</code></div>
            <input value=${bulkCompose.subject} onInput=${e => setBulkCompose(c => ({ ...c, subject: e.target.value }))} placeholder="Subject" style=${{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 10px', fontSize: '13px', marginBottom: '8px' }} />
            <textarea value=${bulkCompose.body} onInput=${e => setBulkCompose(c => ({ ...c, body: e.target.value }))} placeholder="Hi {first_name}, …" style=${{ width: '100%', boxSizing: 'border-box', minHeight: '160px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '8px 10px', fontSize: '13px', resize: 'vertical' }}></textarea>
            <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
              <button onClick=${() => setBulkCompose(null)} disabled=${bulkSending} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '7px 14px', fontSize: '12.5px', cursor: 'pointer' }}>Cancel</button>
              <button onClick=${bulkSend} disabled=${bulkSending} style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 16px', fontSize: '12.5px', fontWeight: 600, cursor: bulkSending ? 'wait' : 'pointer' }}>${bulkSending ? 'Sending…' : `Send to ${selected.size}`}</button>
            </div>
          </div>
        </div>` : null}

      ${rows.length > 0 ? html`<label style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px', cursor: 'pointer' }}>
        <input type="checkbox" checked=${allSelected} onChange=${toggleAll} /> Select all (${rows.length})
      </label>` : null}

      <!-- List -->
      ${loading ? html`<div style=${{ color: 'var(--text-dim)', textAlign: 'center', padding: '50px 0', fontSize: '12px' }}>Loading…</div>`
        : rows.length === 0 ? html`<div style=${{ color: 'var(--text-dim)', textAlign: 'center', padding: '50px 0', fontSize: '12.5px', lineHeight: 1.6 }}>
            No ${entityType === 'company' ? 'companies' : 'people'} in your CRM yet.<br/>
            <span class="muted small">Reveal a ${entityType} in the ${entityType === 'company' ? 'Companies' : 'People'} tab and it lands here automatically.</span>
          </div>`
        : html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            ${rows.map(r => html`<div key=${r.id}
              onClick=${() => setOpenedId(r.id)}
              style=${{
                display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 14px', cursor: 'pointer',
                background: selected.has(r.id) ? 'rgba(91,140,255,0.12)' : openedId === r.id ? 'rgba(91,140,255,0.08)' : 'linear-gradient(180deg, rgba(19,24,41,.6), rgba(13,18,35,.6))',
                border: '1px solid ' + (selected.has(r.id) || openedId === r.id ? 'rgba(91,140,255,0.35)' : 'var(--border)'), borderRadius: '10px',
              }}>
              <input type="checkbox" checked=${selected.has(r.id)} onClick=${e => e.stopPropagation()} onChange=${() => toggleSel(r.id)} style=${{ flexShrink: 0 }} />
              <div style=${{
                width: '34px', height: '34px', borderRadius: '8px', flexShrink: 0,
                background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '14px',
              }}>${(recName(r)[0] || '?').toUpperCase()}</div>
              <div style=${{ minWidth: 0, flex: 1 }}>
                <div style=${{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${recName(r)}</div>
                <div style=${{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${recSub(r) || '—'}</div>
              </div>
              ${r.source === 'reveal' ? html`<span style=${{ fontSize: '9.5px', color: 'var(--text-dim)', border: '1px solid var(--border)', borderRadius: '4px', padding: '1px 5px' }}>revealed</span>` : null}
              <${StatusPill} status=${r.status} />
              <span style=${{ fontSize: '10.5px', color: 'var(--text-dim)', minWidth: '60px', textAlign: 'right' }}>${timeAgo(r.last_activity_at)}</span>
            </div>`)}
          </div>`}

      ${openedId ? html`<${RecordDrawer} recordId=${openedId} onClose=${() => setOpenedId(null)} onChanged=${() => load({ silent: true })} />` : null}
      `}
      </div>
    </div>
  `;
}

// ── Sequences view (list + builder) ─────────────────────────────────────────
function SequencesView() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [name, setName] = useState('');
  const [steps, setSteps] = useState([{ delay_days: 0, subject: '', body: '' }]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.crmSequences(); setRows(r.rows || []); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStep = (i, key, val) => setSteps(s => s.map((st, j) => j === i ? { ...st, [key]: val } : st));
  const addStep = () => setSteps(s => [...s, { delay_days: 3, subject: '', body: '' }]);
  const removeStep = (i) => setSteps(s => s.filter((_, j) => j !== i));
  const save = async () => {
    if (!name.trim()) { toast('Name the sequence', 'error'); return; }
    if (!steps.some(s => (s.subject || '').trim() || (s.body || '').trim())) { toast('Add at least one step with content', 'error'); return; }
    setSaving(true);
    try {
      await api.crmCreateSequence({ name: name.trim(), steps: steps.map(s => ({ delay_days: Number(s.delay_days) || 0, subject: s.subject, body: s.body })) });
      toast('Sequence created');
      setBuilding(false); setName(''); setSteps([{ delay_days: 0, subject: '', body: '' }]);
      await load();
    } catch (err) { toast('Create failed: ' + err.message, 'error'); }
    finally { setSaving(false); }
  };

  return html`
    <div>
      <div style=${{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
        <div style=${{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Automated multi-step email follow-ups. Enroll a record from its drawer.</div>
        <span style=${{ flex: 1 }}></span>
        ${!building ? html`<button onClick=${() => setBuilding(true)}
          style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>+ New sequence</button>` : null}
      </div>

      ${building ? html`<div style=${{ border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)' }}>
        <input type="text" placeholder="Sequence name (e.g. Cold outreach — 3 touches)" value=${name} onChange=${e => setName(e.target.value)}
          style=${{ width: '100%', marginBottom: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }} />
        <div style=${{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '12px' }}>Personalize each step with ${'{name}'}, ${'{first_name}'}, ${'{company}'}, ${'{industry}'}, ${'{city}'}, ${'{title}'} — filled in per enrolled record when it sends.</div>
        ${steps.map((st, i) => html`<div key=${i} style=${{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
          <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <span style=${{ fontSize: '11px', fontWeight: 700, color: 'var(--text-dim)' }}>STEP ${i + 1}</span>
            <span style=${{ fontSize: '11px', color: 'var(--text-muted)' }}>send after</span>
            <input type="number" min="0" value=${st.delay_days} onChange=${e => setStep(i, 'delay_days', e.target.value)}
              style=${{ width: '56px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 6px', borderRadius: '5px', fontSize: '12px' }} />
            <span style=${{ fontSize: '11px', color: 'var(--text-muted)' }}>days ${i === 0 ? '(0 = immediately)' : ''}</span>
            <span style=${{ flex: 1 }}></span>
            ${steps.length > 1 ? html`<button onClick=${() => removeStep(i)} style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '14px' }}>✕</button>` : null}
          </div>
          <input type="text" placeholder="Subject" value=${st.subject} onChange=${e => setStep(i, 'subject', e.target.value)}
            style=${{ width: '100%', marginBottom: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 9px', borderRadius: '6px', fontSize: '12.5px', boxSizing: 'border-box' }} />
          <textarea placeholder="Message…" value=${st.body} onChange=${e => setStep(i, 'body', e.target.value)}
            style=${{ width: '100%', minHeight: '70px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 9px', borderRadius: '6px', fontSize: '12.5px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}></textarea>
        </div>`)}
        <div style=${{ display: 'flex', gap: '8px', marginTop: '4px' }}>
          <button onClick=${addStep} style=${{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>+ Add step</button>
          <span style=${{ flex: 1 }}></span>
          <button onClick=${save} disabled=${saving} style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>${saving ? 'Saving…' : 'Create sequence'}</button>
          <button onClick=${() => setBuilding(false)} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
        </div>
      </div>` : null}

      ${loading ? html`<div style=${{ color: 'var(--text-dim)', padding: '30px 0', textAlign: 'center', fontSize: '12px' }}>Loading…</div>`
        : rows.length === 0 ? html`<div style=${{ color: 'var(--text-dim)', padding: '30px 0', textAlign: 'center', fontSize: '12.5px' }}>No sequences yet. Create one to start automating follow-ups.</div>`
        : html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            ${rows.map(s => html`<div key=${s.id} style=${{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', background: 'linear-gradient(180deg, rgba(19,24,41,.6), rgba(13,18,35,.6))', border: '1px solid var(--border)', borderRadius: '10px' }}>
              <div style=${{ flex: 1 }}>
                <div style=${{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>${s.name}</div>
                <div style=${{ fontSize: '11px', color: 'var(--text-muted)' }}>${s.step_count} step${s.step_count === 1 ? '' : 's'} · ${s.active_enrollments} active</div>
              </div>
              <span style=${{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: s.status === 'active' ? 'rgb(111 207 151)' : 'var(--text-dim)' }}>${s.status}</span>
            </div>`)}
          </div>`}
    </div>
  `;
}

// ── Timeline / Gantt (tasks by due date) ────────────────────────────────────
function TimelineView() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.crmTasks({ status: 'open' }); setTasks(r.rows || []); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const complete = async (t) => {
    setTasks(ts => ts.filter(x => x.id !== t.id));
    try { await api.crmUpdateTask(t.id, { status: 'done' }); } catch (err) { toast('Update failed: ' + err.message, 'error'); load(); }
  };

  if (loading) return html`<div style=${{ color: 'var(--text-dim)', padding: '30px 0', textAlign: 'center', fontSize: '12px' }}>Loading timeline…</div>`;

  // Build buckets: Overdue, then the next 21 days, then Someday (no due date).
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const today = startOfDay(new Date());
  const DAYS = 21;
  const cols = [];
  cols.push({ key: 'overdue', label: 'Overdue', tasks: [], overdue: true });
  for (let i = 0; i < DAYS; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    cols.push({ key: 'd' + i, label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }), date: d, tasks: [] });
  }
  const someday = { key: 'someday', label: 'No due date', tasks: [] };

  for (const t of tasks) {
    if (!t.due_at) { someday.tasks.push(t); continue; }
    const due = startOfDay(t.due_at);
    if (due < today) { cols[0].tasks.push(t); continue; }
    const diff = Math.round((due - today) / 86400000);
    if (diff >= 0 && diff < DAYS) cols[diff + 1].tasks.push(t);
    else someday.tasks.push(t);   // beyond the window → Someday lane
  }
  const allCols = [...cols, someday].filter(c => c.tasks.length > 0 || c.key === 'overdue' || c.key.startsWith('d'));

  const taskName = (t) => t.entity_type === 'company' ? t.company_name : t.entity_type === 'person' ? t.person_name : null;

  return html`
    <div>
      <div style=${{ fontSize: '12.5px', color: 'var(--text-muted)', marginBottom: '12px' }}>Open tasks across your CRM, by due date. Tick to complete.</div>
      <div style=${{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '8px' }}>
        ${allCols.map(c => html`<div key=${c.key} style=${{ minWidth: '180px', width: '180px', flexShrink: 0 }}>
          <div style=${{ fontSize: '11px', fontWeight: 700, marginBottom: '8px', color: c.overdue ? 'rgb(232 142 168)' : c.key === 'd0' ? 'var(--accent-bright)' : 'var(--text-muted)' }}>
            ${c.label} <span style=${{ color: 'var(--text-dim)', fontWeight: 400 }}>${c.tasks.length || ''}</span>
          </div>
          <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px', minHeight: '40px' }}>
            ${c.tasks.map(t => html`<div key=${t.id} style=${{ background: 'linear-gradient(180deg, rgba(19,24,41,.8), rgba(13,18,35,.8))', border: '1px solid ' + (c.overdue ? 'rgba(232,142,168,0.4)' : 'var(--border)'), borderRadius: '8px', padding: '8px 9px' }}>
              <div style=${{ display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
                <input type="checkbox" onChange=${() => complete(t)} style=${{ marginTop: '2px' }} />
                <div style=${{ minWidth: 0 }}>
                  <div style=${{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.3 }}>${t.title}</div>
                  ${taskName(t) ? html`<div style=${{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '2px' }}>${taskName(t)}</div>` : null}
                  ${t.assignee_email ? html`<div style=${{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '1px' }}>${t.assignee_email}</div>` : null}
                </div>
              </div>
            </div>`)}
          </div>
        </div>`)}
      </div>
    </div>
  `;
}

// ── Pipeline (Kanban) ───────────────────────────────────────────────────────
function money(v, cur) {
  if (v == null) return '';
  const n = Number(v);
  const s = n >= 1e6 ? (n / 1e6).toFixed(n < 1e7 ? 1 : 0) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(0) + 'K' : String(n);
  return (cur || 'QAR') + ' ' + s;
}
function PipelineView() {
  const [stages, setStages] = useState([]);
  const [deals, setDeals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [dragId, setDragId] = useState(null);
  const [overStage, setOverStage] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.crmPipeline(); setStages(r.stages || []); setDeals(r.deals || []); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const move = async (dealId, stageId) => {
    const deal = deals.find(d => d.id === dealId);
    if (deal && Number(deal.stage_id) === Number(stageId)) return;
    // optimistic
    setDeals(ds => ds.map(d => d.id === dealId ? { ...d, stage_id: Number(stageId) } : d));
    try { await api.crmUpdateDeal(dealId, { stage_id: Number(stageId) }); await load(); }
    catch (err) { toast('Move failed: ' + err.message, 'error'); await load(); }
  };
  const onDrop = (stageId) => { const id = dragId; setDragId(null); setOverStage(null); if (id != null) move(id, stageId); };
  const addDeal = async () => {
    if (!title.trim()) { toast('Name the deal', 'error'); return; }
    try {
      await api.crmCreateDeal({ title: title.trim(), value_num: value ? Number(value) : null });
      setTitle(''); setValue(''); setAdding(false); await load();
    } catch (err) { toast('Create failed: ' + err.message, 'error'); }
  };

  if (loading) return html`<div style=${{ color: 'var(--text-dim)', padding: '30px 0', textAlign: 'center', fontSize: '12px' }}>Loading pipeline…</div>`;

  const dealName = (d) => d.entity_type === 'company' ? d.company_name : d.entity_type === 'person' ? d.person_name : null;

  return html`
    <div>
      <div style=${{ display: 'flex', alignItems: 'center', marginBottom: '12px' }}>
        <div style=${{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Drag deals through your stages. Move with the selector on each card.</div>
        <span style=${{ flex: 1 }}></span>
        ${adding ? html`<div style=${{ display: 'flex', gap: '6px' }}>
          <input type="text" placeholder="Deal title" value=${title} onChange=${e => setTitle(e.target.value)}
            style=${{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 9px', borderRadius: '6px', fontSize: '12px' }} />
          <input type="number" placeholder="Value" value=${value} onChange=${e => setValue(e.target.value)}
            style=${{ width: '90px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 9px', borderRadius: '6px', fontSize: '12px' }} />
          <button onClick=${addDeal} style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Add</button>
          <button onClick=${() => setAdding(false)} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
        </div>` : html`<button onClick=${() => setAdding(true)} style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>+ New deal</button>`}
      </div>

      <div style=${{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px' }}>
        ${stages.map(st => {
          const col = deals.filter(d => d.stage_id === st.id);
          const sum = col.reduce((a, d) => a + (Number(d.value_num) || 0), 0);
          return html`<div key=${st.id} style=${{ minWidth: '230px', width: '230px', flexShrink: 0 }}>
            <div style=${{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px', padding: '0 2px' }}>
              <span style=${{ fontSize: '11.5px', fontWeight: 700, color: st.is_won ? 'rgb(111 207 151)' : st.is_lost ? 'rgb(232 142 168)' : 'var(--text)' }}>${st.name}</span>
              <span style=${{ fontSize: '10.5px', color: 'var(--text-dim)' }}>${col.length}</span>
              <span style=${{ flex: 1 }}></span>
              ${sum > 0 ? html`<span style=${{ fontSize: '10.5px', color: 'var(--text-muted)' }}>${money(sum, col[0]?.currency)}</span>` : null}
            </div>
            <div
              onDragOver=${e => { e.preventDefault(); setOverStage(st.id); }}
              onDragLeave=${() => setOverStage(s => s === st.id ? null : s)}
              onDrop=${() => onDrop(st.id)}
              style=${{ background: overStage === st.id ? 'rgba(91,140,255,0.1)' : 'rgba(255,255,255,0.02)', border: '1px solid ' + (overStage === st.id ? 'rgba(91,140,255,0.5)' : 'var(--border)'), borderRadius: '10px', padding: '8px', minHeight: '120px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              ${col.length === 0 ? html`<div style=${{ color: 'var(--text-dim)', fontSize: '11px', textAlign: 'center', padding: '14px 0' }}>—</div>`
                : col.map(d => html`<div key=${d.id}
                    draggable=${true}
                    onDragStart=${() => setDragId(d.id)}
                    onDragEnd=${() => { setDragId(null); setOverStage(null); }}
                    style=${{ background: 'linear-gradient(180deg, rgba(19,24,41,.9), rgba(13,18,35,.9))', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 10px', cursor: 'grab', opacity: dragId === d.id ? 0.4 : 1 }}>
                  <div style=${{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text)', marginBottom: '3px' }}>${d.title}</div>
                  ${dealName(d) ? html`<div style=${{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '4px' }}>${dealName(d)}</div>` : null}
                  <div style=${{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ${d.value_num != null ? html`<span style=${{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-bright)' }}>${money(d.value_num, d.currency)}</span>` : null}
                    <span style=${{ flex: 1 }}></span>
                    <select value=${d.stage_id} onClick=${e => e.stopPropagation()} onChange=${e => move(d.id, e.target.value)}
                      style=${{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '5px', fontSize: '10.5px', padding: '2px 4px' }}>
                      ${stages.map(s2 => html`<option key=${s2.id} value=${s2.id}>${s2.name}</option>`)}
                    </select>
                  </div>
                </div>`)}
            </div>
          </div>`;
        })}
      </div>
    </div>
  `;
}

// ── Record drawer ───────────────────────────────────────────────────────────
function RecordDrawer({ recordId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [composing, setComposing] = useState(false);
  const [emTo, setEmTo] = useState('');
  const [emSubject, setEmSubject] = useState('');
  const [emBody, setEmBody] = useState('');
  const [templates, setTemplates] = useState([]);
  const [sending, setSending] = useState(false);
  const [recipients, setRecipients] = useState({ cc: [], reveal: [] });
  const [ccSel, setCcSel] = useState(new Set());
  const [seqList, setSeqList] = useState([]);
  const [selSeq, setSelSeq] = useState('');
  const [openEmail, setOpenEmail] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [editNoteText, setEditNoteText] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.crmRecord(recordId)); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [recordId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    (async () => { try { const r = await api.crmSequences(); setSeqList((r.rows || []).filter(s => s.status === 'active' && s.step_count > 0)); } catch { /* ignore */ } })();
  }, []);

  const enroll = async () => {
    if (!selSeq) return;
    try { await api.crmEnroll(recordId, Number(selSeq)); toast('Enrolled in sequence'); setSelSeq(''); await load(); onChanged?.(); }
    catch (err) { toast(/already_enrolled/i.test(err.message) ? 'Already enrolled in that sequence' : /admin_only/i.test(err.message) ? 'Running sequences is admin-only for now' : (err.message || 'Enroll failed'), 'error'); }
  };
  const stopEnroll = async (id) => {
    try { await api.crmStopEnrollment(id); toast('Sequence stopped'); await load(); onChanged?.(); }
    catch (err) { toast('Stop failed: ' + err.message, 'error'); }
  };
  const addDeal = async () => {
    try {
      const t = (data?.record ? recName(data.record) : 'New') + ' — opportunity';
      await api.crmCreateDeal({ title: t, record_id: recordId });
      toast('Deal created — set its value & stage in Pipeline');
      await load(); onChanged?.();
    } catch (err) { toast('Create deal failed: ' + err.message, 'error'); }
  };

  const rec = data?.record;
  const setStatus = async (s) => {
    try { await api.crmUpdateRecord(recordId, { status: s }); await load(); onChanged?.(); }
    catch (err) { toast('Update failed: ' + err.message, 'error'); }
  };
  const addNote = async () => {
    const body = noteText.trim(); if (!body) return;
    try { await api.crmAddNote(recordId, body); setNoteText(''); await load(); onChanged?.(); }
    catch (err) { toast('Note failed: ' + err.message, 'error'); }
  };
  const addTask = async () => {
    const title = taskTitle.trim(); if (!title) return;
    try { await api.crmAddTask(recordId, { title }); setTaskTitle(''); await load(); onChanged?.(); }
    catch (err) { toast('Task failed: ' + err.message, 'error'); }
  };
  const toggleTask = async (t) => {
    try { await api.crmUpdateTask(t.id, { status: t.status === 'done' ? 'open' : 'done' }); await load(); onChanged?.(); }
    catch (err) { toast('Task update failed: ' + err.message, 'error'); }
  };
  const removeTask = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try { await api.crmDeleteTask(id); await load(); onChanged?.(); }
    catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  };
  const removeDeal = async (id) => {
    if (!window.confirm('Delete this deal?')) return;
    try { await api.crmDeleteDeal(id); await load(); onChanged?.(); }
    catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  };
  const beginEditNote = (n) => { setEditingNote(n.id); setEditNoteText(n.body || ''); };
  const saveEditNote = async () => {
    const text = editNoteText.trim(); if (!text) return;
    try { await api.crmUpdateNote(editingNote, text); setEditingNote(null); setEditNoteText(''); await load(); onChanged?.(); }
    catch (err) { toast('Save failed: ' + err.message, 'error'); }
  };
  const removeNote = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    try { await api.crmDeleteNote(id); await load(); onChanged?.(); }
    catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  };
  // Small inline row action button (✎ / ✕).
  const ROW_X = { background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '12px', padding: '0 3px', lineHeight: 1, flexShrink: 0 };
  const openCompose = async () => {
    setEmTo(data?.suggested_to || '');
    setComposing(true);
    setCcSel(new Set());
    try { const r = await api.crmTemplates(); setTemplates(r.rows || []); } catch { /* ignore */ }
    try { setRecipients(await api.crmRecipients(recordId)); } catch { setRecipients({ cc: [], reveal: [] }); }
  };
  const revealFromCompose = async (personId) => {
    const before = recipients.cc.length;
    try {
      await api.revealPerson(personId);
      const rec = await api.crmRecipients(recordId);
      setRecipients(rec);
      onChanged?.();   // refresh so they show revealed in People too
      toast(rec.cc.length > before ? 'Revealed — added to the CC list.' : 'Revealed (and now unlocked in People) — but no email is on file for them yet.', rec.cc.length > before ? 'success' : 'info');
    } catch (e) {
      toast(/insufficient|402/i.test(e.message || '') ? 'Not enough credits to reveal this person.' : 'Reveal failed: ' + (e.message || ''), 'error');
    }
  };
  const applyTemplate = (id) => {
    const t = templates.find(x => String(x.id) === String(id));
    if (t) { if (t.subject) setEmSubject(t.subject); if (t.body) setEmBody(t.body); }
  };
  const sendEmail = async () => {
    if (!emSubject.trim() && !emBody.trim()) { toast('Write a subject or message', 'error'); return; }
    setSending(true);
    try {
      await api.crmSendEmail(recordId, { to: emTo.trim(), subject: emSubject, body: emBody, cc: [...ccSel] });
      toast('Email sent');
      setComposing(false); setEmSubject(''); setEmBody('');
      await load(); onChanged?.();
    } catch (err) {
      toast(/admin_only/i.test(err.message) ? 'Email sending is admin-only for now' : (err.message || 'Send failed'), 'error');
    } finally { setSending(false); }
  };

  const sectionLabel = (t) => html`<div style=${{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: 'var(--text-dim)', margin: '20px 0 8px' }}>${t}</div>`;

  return html`
    <div onClick=${onClose} style=${{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(6,9,17,0.55)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick=${e => e.stopPropagation()} style=${{
        width: 'min(640px, 96vw)', height: '100%', overflowY: 'auto',
        background: 'linear-gradient(180deg, #131826 0%, #0e1322 100%)', borderLeft: '1px solid var(--border)', boxShadow: '-24px 0 64px rgba(0,0,0,0.5)',
      }}>
        ${loading || !rec ? html`<div style=${{ padding: '24px', color: 'var(--text-dim)', fontSize: '12px' }}>Loading…</div>` : html`
          <!-- header -->
          <div style=${{ padding: '18px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#131826', zIndex: 2 }}>
            <div style=${{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style=${{ minWidth: 0, flex: 1 }}>
                <div style=${{ fontSize: '18px', fontWeight: 700, color: 'var(--text)' }}>${recName(rec)}</div>
                <div style=${{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>${recSub(rec) || (rec.entity_type === 'company' ? 'Company' : 'Person')}</div>
              </div>
              <button onClick=${onClose} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
              <select value=${rec.status} onChange=${e => setStatus(e.target.value)}
                style=${{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '5px 9px', borderRadius: '6px', fontSize: '12px' }}>
                ${STATUSES.map(s => html`<option key=${s} value=${s}>${STATUS_META[s].label}</option>`)}
              </select>
              ${(rec.entity_type === 'company' ? rec.company_linkedin : rec.person_linkedin)
                ? html`<a href=${rec.entity_type === 'company' ? rec.company_linkedin : rec.person_linkedin} target="_blank" rel="noopener" style=${{ fontSize: '11.5px', color: 'var(--accent-bright)' }}>LinkedIn ↗</a>` : null}
              ${rec.company_website ? html`<a href=${rec.company_website} target="_blank" rel="noopener" style=${{ fontSize: '11.5px', color: 'var(--accent-bright)' }}>Website ↗</a>` : null}
              <span style=${{ flex: 1 }}></span>
              <button class="linkbtn" style=${{ fontSize: '11.5px', color: 'var(--text-muted)', background: 'transparent', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}
                onClick=${() => navigateTo(rec.entity_type === 'company' ? 'companies' : 'people', rec.entity_id)}>View full profile →</button>
            </div>
          </div>

          <div style=${{ padding: '4px 22px 28px' }}>
            <!-- Email -->
            ${sectionLabel('Email')}
            ${data.can_send ? html`
              ${!composing ? html`
                <button onClick=${openCompose}
                  style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '8px 14px', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}>
                  ✉ Compose email
                </button>
              ` : html`
                <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', background: 'rgba(255,255,255,0.02)' }}>
                  ${templates.length ? html`<select onChange=${e => applyTemplate(e.target.value)}
                    style=${{ width: '100%', marginBottom: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 8px', borderRadius: '6px', fontSize: '12px' }}>
                    <option value="">Use a template…</option>
                    ${templates.map(t => html`<option key=${t.id} value=${t.id}>${t.name}</option>`)}
                  </select>` : null}
                  <input type="text" placeholder="To" value=${emTo} onChange=${e => setEmTo(e.target.value)}
                    style=${{ width: '100%', marginBottom: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 9px', borderRadius: '6px', fontSize: '12.5px', boxSizing: 'border-box' }} />
                  ${recipients.cc.length ? html`<div style=${{ marginBottom: '8px' }}>
                    <div style=${{ fontSize: '10.5px', color: 'var(--text-dim)', marginBottom: '4px' }}>Also CC (people you've revealed at this company):</div>
                    ${recipients.cc.map(c => html`<label key=${c.email} style=${{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: 'var(--text-muted)', marginRight: '14px', cursor: 'pointer' }}>
                      <input type="checkbox" checked=${ccSel.has(c.email)} onChange=${() => setCcSel(prev => { const n = new Set(prev); n.has(c.email) ? n.delete(c.email) : n.add(c.email); return n; })} style=${{ accentColor: 'var(--accent)' }} /> ${c.label}
                    </label>`)}
                  </div>` : null}
                  ${recipients.reveal.length ? html`<div style=${{ marginBottom: '8px', padding: '8px 10px', background: 'rgba(91,140,255,0.08)', border: '1px solid rgba(91,140,255,0.3)', borderRadius: '6px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    <div style=${{ marginBottom: '5px' }}>Decision-makers here you haven't revealed — reveal to reach the right person and lift your reply rate:</div>
                    ${recipients.reveal.map(r => html`<span key=${r.person_id} style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginRight: '10px', marginBottom: '4px' }}>
                      <span style=${{ color: 'var(--text)' }}>${r.name}</span>${r.title ? html`<span style=${{ color: 'var(--text-dim)' }}>· ${r.title}</span>` : null}
                      <button onClick=${() => revealFromCompose(r.person_id)} style=${{ background: 'var(--accent)', border: 'none', color: '#fff', borderRadius: '4px', padding: '2px 9px', fontSize: '10.5px', cursor: 'pointer' }}>Reveal</button>
                    </span>`)}
                  </div>` : null}
                  <input type="text" placeholder="Subject" value=${emSubject} onChange=${e => setEmSubject(e.target.value)}
                    style=${{ width: '100%', marginBottom: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 9px', borderRadius: '6px', fontSize: '12.5px', boxSizing: 'border-box' }} />
                  <textarea placeholder="Write your message…  Use {name}, {company}… to personalize." value=${emBody} onChange=${e => setEmBody(e.target.value)}
                    style=${{ width: '100%', minHeight: '120px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 9px', borderRadius: '6px', fontSize: '12.5px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}></textarea>
                  <div style=${{ fontSize: '10.5px', color: 'var(--text-dim)', marginTop: '4px' }}>Personalize: ${'{name}'} ${'{first_name}'} ${'{company}'} ${'{industry}'} ${'{city}'} ${'{title}'}</div>
                  <div style=${{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <button onClick=${sendEmail} disabled=${sending}
                      style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 16px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                      ${sending ? 'Sending…' : 'Send'}</button>
                    <button onClick=${() => setComposing(false)}
                      style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                    <span style=${{ flex: 1 }}></span>
                    <span style=${{ fontSize: '10.5px', color: 'var(--text-dim)', alignSelf: 'center' }}>from bell.qa · replies → you</span>
                  </div>
                </div>
              `}
            ` : html`<div class="muted small">Email outreach from your own domain is coming soon.</div>`}

            ${(data.emails || []).length ? html`<div style=${{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              ${data.emails.map(e => {
                const inbound = e.direction === 'in';
                const open = openEmail === e.id;
                return html`<div key=${e.id} style=${{ border: '1px solid ' + (open ? 'var(--border)' : 'transparent'), borderRadius: '8px', background: open ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                  <div onClick=${() => setOpenEmail(open ? null : e.id)} style=${{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', cursor: 'pointer', borderBottom: open ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
                    <span title=${inbound ? 'Reply received' : 'Sent'} style=${{ fontSize: '11px', color: inbound ? 'rgb(91 140 255)' : e.status === 'sent' ? 'rgb(111 207 151)' : e.status === 'failed' ? 'rgb(232 142 168)' : 'var(--text-dim)' }}>${inbound ? '↙' : e.status === 'failed' ? '✕' : '↗'}</span>
                    <span style=${{ flex: 1, minWidth: 0, fontSize: '12px', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>${e.subject || '(no subject)'}</span>
                    <span style=${{ fontSize: '10.5px', color: 'var(--text-dim)' }}>${timeAgo(e.created_at)}</span>
                  </div>
                  ${open ? html`<div style=${{ padding: '4px 12px 12px' }}>
                    <div style=${{ fontSize: '10.5px', color: 'var(--text-dim)', marginBottom: '8px' }}>
                      ${inbound ? 'From ' + (e.from_email || '—') : 'To ' + (e.to_email || '—')} · ${new Date(e.created_at).toLocaleString()}${!inbound ? ' · ' + (e.status || '') : ''}
                    </div>
                    <div style=${{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>${e.body_text || html`<span class="muted small">(no text content)</span>`}</div>
                  </div>` : null}
                </div>`;
              })}
            </div>` : null}

            <!-- Sequences -->
            ${sectionLabel('Sequences')}
            ${(data.enrollments || []).map(e => html`<div key=${e.id} style=${{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style=${{ flex: 1, fontSize: '12.5px', color: 'var(--text)' }}>${e.sequence_name}
                <span style=${{ color: 'var(--text-dim)', fontSize: '11px' }}> · step ${Math.min(e.current_step, e.total_steps)}/${e.total_steps}</span></span>
              <span style=${{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', color: e.status === 'active' ? 'rgb(111 207 151)' : e.status === 'errored' ? 'rgb(232 142 168)' : 'var(--text-dim)' }}>${e.status}</span>
              ${e.status === 'active' ? html`<button onClick=${() => stopEnroll(e.id)} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '5px', padding: '3px 8px', fontSize: '10.5px', cursor: 'pointer' }}>Stop</button>` : null}
            </div>`)}
            ${data.can_send ? html`<div style=${{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <select value=${selSeq} onChange=${e => setSelSeq(e.target.value)}
                style=${{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 9px', borderRadius: '6px', fontSize: '12px' }}>
                <option value="">Enroll in a sequence…</option>
                ${seqList.map(s => html`<option key=${s.id} value=${s.id}>${s.name}</option>`)}
              </select>
              <button onClick=${enroll} disabled=${!selSeq} style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '6px 14px', fontSize: '12px', fontWeight: 600, cursor: selSeq ? 'pointer' : 'not-allowed' }}>Enroll</button>
            </div>` : html`<div class="muted small">Automated sequences run from your own domain — coming soon.</div>`}

            <!-- Deals -->
            ${sectionLabel('Deals')}
            ${(data.deals || []).length === 0 ? html`<div class="muted small" style=${{ marginBottom: '8px' }}>No deals yet.</div>`
              : data.deals.map(d => html`<div key=${d.id} style=${{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style=${{ flex: 1, fontSize: '12.5px', color: 'var(--text)' }}>${d.title}</span>
                  ${d.value_num != null ? html`<span style=${{ fontSize: '11px', color: 'var(--accent-bright)' }}>${money(d.value_num, d.currency)}</span>` : null}
                  <span style=${{ fontSize: '10.5px', color: d.status === 'won' ? 'rgb(111 207 151)' : d.status === 'lost' ? 'rgb(232 142 168)' : 'var(--text-dim)' }}>${d.stage_name || d.status}</span>
                  <button title="Delete deal" onClick=${() => removeDeal(d.id)} style=${ROW_X}>✕</button>
                </div>`)}
            <button onClick=${addDeal} style=${{ marginTop: '8px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>+ New deal</button>

            <!-- Tasks -->
            ${sectionLabel('Tasks')}
            <div style=${{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input type="text" placeholder="Add a task…" value=${taskTitle}
                onChange=${e => setTaskTitle(e.target.value)} onKeyDown=${e => { if (e.key === 'Enter') addTask(); }}
                style=${{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 10px', borderRadius: '6px', fontSize: '12.5px' }} />
              <button onClick=${addTask} style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Add</button>
            </div>
            ${(data.tasks || []).length === 0 ? html`<div class="muted small" style=${{ padding: '2px 0 6px' }}>No tasks yet.</div>`
              : data.tasks.map(t => html`<div key=${t.id} style=${{ display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <input type="checkbox" checked=${t.status === 'done'} onChange=${() => toggleTask(t)} />
                  <span style=${{ flex: 1, fontSize: '12.5px', color: 'var(--text)', textDecoration: t.status === 'done' ? 'line-through' : 'none', opacity: t.status === 'done' ? 0.55 : 1 }}>${t.title}</span>
                  ${t.due_at ? html`<span style=${{ fontSize: '10.5px', color: 'var(--text-dim)' }}>${new Date(t.due_at).toLocaleDateString()}</span>` : null}
                  <button title="Delete task" onClick=${() => removeTask(t.id)} style=${ROW_X}>✕</button>
                </div>`)}

            <!-- Notes -->
            ${sectionLabel('Notes')}
            <div style=${{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
              <textarea placeholder="Add a note (visible to your team)…" value=${noteText}
                onChange=${e => setNoteText(e.target.value)}
                style=${{ flex: 1, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: '6px', fontSize: '12.5px', minHeight: '52px', resize: 'vertical', fontFamily: 'inherit' }}></textarea>
              <button onClick=${addNote} style=${{ alignSelf: 'flex-end', background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
            </div>
            ${(data.notes || []).map(n => html`<div key=${n.id} style=${{ padding: '8px 10px', marginBottom: '6px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                ${editingNote === n.id ? html`
                  <textarea value=${editNoteText} onChange=${e => setEditNoteText(e.target.value)}
                    style=${{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 9px', borderRadius: '6px', fontSize: '12.5px', minHeight: '52px', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}></textarea>
                  <div style=${{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    <button onClick=${saveEditNote} style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '5px', padding: '4px 12px', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}>Save</button>
                    <button onClick=${() => { setEditingNote(null); setEditNoteText(''); }} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '5px', padding: '4px 10px', fontSize: '11.5px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                ` : html`
                  <div style=${{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <div style=${{ flex: 1, fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>${n.body}</div>
                    <button title="Edit note" onClick=${() => beginEditNote(n)} style=${ROW_X}>✎</button>
                    <button title="Delete note" onClick=${() => removeNote(n.id)} style=${ROW_X}>✕</button>
                  </div>
                  <div style=${{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '5px' }}>${n.author_email || 'someone'} · ${timeAgo(n.created_at)}${n.updated_at && n.updated_at !== n.created_at ? ' · edited' : ''}</div>
                `}
              </div>`)}

            <!-- Activity timeline -->
            ${sectionLabel('Activity')}
            ${(data.activities || []).length === 0 ? html`<div class="muted small">No activity yet.</div>`
              : html`<div style=${{ borderLeft: '2px solid var(--border)', paddingLeft: '14px', marginLeft: '4px' }}>
                  ${data.activities.map(a => html`<div key=${a.id} style=${{ position: 'relative', paddingBottom: '12px' }}>
                    <span style=${{ position: 'absolute', left: '-21px', top: '4px', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-bright)' }}></span>
                    <div style=${{ fontSize: '12px', color: 'var(--text)' }}>${a.summary || a.type}</div>
                    <div style=${{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>${a.actor_email ? a.actor_email + ' · ' : ''}${timeAgo(a.occurred_at)}</div>
                  </div>`)}
                </div>`}
          </div>
        `}
      </div>
    </div>
  `;
}

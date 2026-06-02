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

  return html`
    <div style=${{ padding: '20px 24px', height: '100%', overflowY: 'auto' }}>
      <!-- Header -->
      <div style=${{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '18px', flexWrap: 'wrap' }}>
        <div>
          <div style=${{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>CRM</div>
          <div style=${{ fontSize: '12px', color: 'var(--text-muted)' }}>Your companies & people — act on the data.</div>
        </div>
        <div style=${{ flex: 1 }}></div>
        ${stats ? html`<div style=${{ display: 'flex', gap: '20px' }}>
          ${[['Companies', stats.companies], ['People', stats.people], ['Revealed', stats.revealed], ['Open tasks', stats.open_tasks]].map(([l, n]) => html`
            <div key=${l} style=${{ textAlign: 'center' }}>
              <div style=${{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>${(n ?? 0).toLocaleString()}</div>
              <div style=${{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-dim)' }}>${l}</div>
            </div>`)}
        </div>` : null}
      </div>

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
        <button class="toolbar-toggle" onClick=${() => load()}>Refresh</button>
      </div>

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
                background: openedId === r.id ? 'rgba(91,140,255,0.08)' : 'linear-gradient(180deg, rgba(19,24,41,.6), rgba(13,18,35,.6))',
                border: '1px solid ' + (openedId === r.id ? 'rgba(91,140,255,0.35)' : 'var(--border)'), borderRadius: '10px',
              }}>
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
    </div>
  `;
}

// ── Record drawer ───────────────────────────────────────────────────────────
function RecordDrawer({ recordId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [taskTitle, setTaskTitle] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.crmRecord(recordId)); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [recordId]);
  useEffect(() => { load(); }, [load]);

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
                <div style=${{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>${n.body}</div>
                <div style=${{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '5px' }}>${n.author_email || 'someone'} · ${timeAgo(n.created_at)}</div>
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

// Bella — the chat panel (Phase G1). Drops down from the header center,
// above everything. Streams tokens over SSE (api.bellaChat), shows tool
// activity as small chips, and navigates the portal when Bella says so.
//
// Conversations are per-user (server-enforced). "New" just clears the panel —
// the server creates the conversation row on the first message.

import { useState, useEffect, useRef, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { currentRoute, navigateTo } from '../lib/router.js';
import { emitBellaAction, stashPending, fireToolEffects } from '../lib/bellaBus.js';

const SUGGESTIONS = [
  'How many construction companies are in Qatar?',
  "What's in today's market feed?",
  "Show me this week's signals",
];

const TOOL_LABELS = {
  search_companies: 'Searching companies',
  get_company: 'Opening company',
  show_companies: 'Showing companies',
  open_company: 'Opening company',
  show_people: 'Showing people',
  open_person: 'Opening person',
  fill_field: 'Filling in',
  search_jobs: 'Searching jobs',
  get_market_feed: 'Reading the feed',
  get_news: 'Reading the news',
  get_signals: 'Checking signals',
  get_in_market_companies: 'Finding in-market companies',
  get_tenders: 'Checking tenders',
  get_data_stats: 'Reading data stats',
  get_credits: 'Checking credits',
  get_icp: 'Reading your ICP',
  get_crm_records: 'Reading your CRM',
  get_crm_record: 'Opening CRM record',
  get_sequences: 'Reading sequences',
  get_whatsapp_thread: 'Reading WhatsApp',
  list_scheduled_tasks: 'Checking scheduled tasks',
  reveal_companies: 'Revealing companies',
  add_to_crm: 'Adding to CRM',
  add_crm_note: 'Adding note',
  update_crm_note: 'Editing note',
  delete_crm_note: 'Deleting note',
  add_crm_task: 'Creating task',
  update_crm_task: 'Updating task',
  delete_crm_task: 'Deleting task',
  set_crm_status: 'Updating status',
  create_deal: 'Creating deal',
  update_deal: 'Updating deal',
  delete_deal: 'Deleting deal',
  send_email: 'Sending email',
  create_sequence: 'Creating sequence',
  enroll_in_sequence: 'Enrolling in sequence',
  update_icp: 'Updating your ICP',
  send_whatsapp: 'Sending WhatsApp',
  schedule_task: 'Scheduling work',
  cancel_scheduled_task: 'Cancelling task',
  navigate: 'Navigating',
};

// Tool → window-event effects live in bellaBus.js (shared with BellaVoice —
// voice-driven writes must refresh open tabs too, or the stale Settings form
// silently reverts them on Save).
const fireEffects = fireToolEffects;

// "14:32" today, "Jul 3 · 14:32" otherwise.
const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const hm = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? hm
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + hm;
};

// Bella ends closed questions with "[choices: Yes | No]" (prompt rule 12) —
// strip the line and surface the options as tap buttons.
const CHOICES_RX = /\n?\s*\[choices:\s*([^\]]+)\]\s*$/i;
const splitChoices = (text) => {
  const m = CHOICES_RX.exec(text || '');
  if (!m) return { text: text || '', choices: null };
  const choices = m[1].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  return { text: (text || '').replace(CHOICES_RX, '').trimEnd(), choices: choices.length >= 2 ? choices : null };
};

// Server action status → card status (server knows the truth on reload).
const APPROVAL_STATE = { proposed: 'pending', done: 'approved', denied: 'denied', error: 'error' };

export function BellaChat({ onClose }) {
  const [convs, setConvs] = useState([]);
  const [convId, setConvId] = useState(null);
  const [msgs, setMsgs] = useState([]);          // {role, content, tools?:[{name,status,summary}]}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);
  const scrollRef = useRef(null);
  const streamRef = useRef(null);
  const busyRef = useRef(false);
  const convIdRef = useRef(null);  // avoids stale closures (new convs get their id mid-turn)
  const lastIdRef = useRef(0);     // newest server message id we've applied
  const syncSeqRef = useRef(0);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { convIdRef.current = convId; }, [convId]);

  const refreshConvs = useCallback(async () => {
    try { const r = await api.bellaConversations(); setConvs(r.conversations || []); return r.conversations || []; } catch { return []; }
  }, []);

  const mapServerMessages = (rows) => (rows || []).map((m) => {
    const parsed = m.role === 'assistant' ? splitChoices(m.content || '') : { text: m.content || '', choices: null };
    return {
      role: m.role,
      content: parsed.text,
      choices: parsed.choices,
      at: m.created_at || null,
      tools: m.meta?.tools || [],
      approvals: (m.meta?.approvals || []).map((a) => ({
        ...a, status: APPROVAL_STATE[a.status] || 'pending',
      })),
    };
  }).filter((m) => m.content || (m.tools && m.tools.length) || (m.approvals && m.approvals.length));

  const applyServer = (rows) => {
    lastIdRef.current = Math.max(lastIdRef.current, ...((rows || []).map((m) => Number(m.id) || 0)), 0);
    setMsgs(mapServerMessages(rows));
  };

  // Sync the open conversation from the server (idle only, newest-write-wins).
  // Brings in scheduled-task results, cross-device turns, and live approval
  // statuses without a page refresh (Val's comment #3).
  const syncFromServer = useCallback(async (cid, { force = false } = {}) => {
    if (!cid) return;
    const seq = ++syncSeqRef.current;
    try {
      const r = await api.bellaMessages(cid);
      if (seq !== syncSeqRef.current || busyRef.current) return;
      const maxId = Math.max(...((r.messages || []).map((m) => Number(m.id) || 0)), 0);
      if (force || maxId > lastIdRef.current) applyServer(r.messages);
    } catch { /* ignore */ }
  }, []);

  // On open: load conversations and auto-open the latest one (Val's #4).
  useEffect(() => {
    (async () => {
      const list = await refreshConvs();
      if (list.length) openConversation(list[0].id);
    })();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // Idle poll — picks up overnight/scheduled results while the panel is open.
  useEffect(() => {
    const t = setInterval(() => { if (!busyRef.current && convId) syncFromServer(convId); }, 15_000);
    return () => clearInterval(t);
  }, [convId, syncFromServer]);

  // Keep the view pinned to the newest message while streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // Abort an in-flight stream if the panel unmounts mid-answer.
  useEffect(() => () => { try { streamRef.current?.abort(); } catch { /* ignore */ } }, []);

  const openConversation = async (id) => {
    setShowList(false);
    if (busyRef.current) return;
    try {
      const r = await api.bellaMessages(id);
      setConvId(id);
      lastIdRef.current = 0;
      applyServer(r.messages);
    } catch { /* ignore */ }
  };

  const newChat = () => { if (!busy) { setConvId(null); setMsgs([]); setShowList(false); lastIdRef.current = 0; } };

  const removeConversation = async (id, ev) => {
    ev.stopPropagation();
    try {
      await api.bellaDeleteConversation(id);
      if (id === convId) newChat();
      refreshConvs();
    } catch { /* ignore */ }
  };

  // Mutate the LAST message immutably (the streaming assistant bubble).
  const patchLast = (fn) => setMsgs((list) => {
    if (!list.length) return list;
    const next = list.slice();
    next[next.length - 1] = fn({ ...next[next.length - 1] });
    return next;
  });

  // Patch one approval card by action id, wherever its message sits.
  const patchApproval = (actionId, fn) => setMsgs((list) => list.map((m) => {
    if (!m.approvals || !m.approvals.some((a) => a.action_id === actionId)) return m;
    return { ...m, approvals: m.approvals.map((a) => (a.action_id === actionId ? fn({ ...a }) : a)) };
  }));

  // Approve/Deny click → server executes/denies → hidden continuation turn
  // lets Bella narrate the outcome (no user bubble for it).
  const decide = async (actionId, verdict) => {
    if (busy) return;
    patchApproval(actionId, (a) => ({ ...a, status: 'busy' }));
    try {
      const r = verdict === 'approved' ? await api.bellaApprove(actionId) : await api.bellaDeny(actionId);
      if (verdict === 'approved') {
        // Live-refresh open tabs for whatever this action touched.
        const tool = msgs.flatMap((m) => m.approvals || []).find((a) => a.action_id === actionId)?.tool;
        if (tool) fireEffects(tool);
      }
      patchApproval(actionId, (a) => ({ ...a, status: verdict, note: r?.summary || null }));
      send(`[[action:${actionId}:${verdict}]]`, { hidden: true });
    } catch (err) {
      patchApproval(actionId, (a) => ({ ...a, status: 'error', note: err?.message || 'failed' }));
    }
  };

  const send = async (textArg, opts = {}) => {
    const text = String(textArg ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    busyRef.current = true;
    const now = new Date().toISOString();
    // Hidden turns (approval continuations) show no user bubble.
    setMsgs((list) => [...list,
      ...(opts.hidden ? [] : [{ role: 'user', content: text, at: now }]),
      { role: 'assistant', content: '', tools: [], streaming: true, at: now },
    ]);

    let spokenText = '';   // final reply — voiced when Bella Voice is active
    try {
      const stream = await api.bellaChat(
        { conversation_id: convId, message: text, context: { section: currentRoute().tab } },
        {
          onMeta: (m) => { if (m.conversation_id) setConvId(m.conversation_id); },
          onToken: (d) => { spokenText += d.t || ''; patchLast((m) => ({ ...m, content: m.content + d.t })); },
          onTool: (t) => {
            if (t.status === 'done') fireEffects(t.name);   // live-refresh open tabs (Val's #2)
            patchLast((m) => {
              const tools = (m.tools || []).slice();
              const i = tools.findIndex((x) => x.name === t.name && x.status === 'running');
              if (t.status === 'running') tools.push({ name: t.name, status: 'running' });
              else if (i >= 0) tools[i] = { name: t.name, status: t.status, summary: t.summary };
              else tools.push({ name: t.name, status: t.status, summary: t.summary });
              return { ...m, tools };
            });
          },
          onNavigate: (n) => {
            if (n?.section) {
              try {
                // Sub-section (e.g. Settings → Company & ICP): stash before
                // navigating so AccountTab applies it on mount; if it's already
                // mounted its live listener catches the emitted event instead.
                if (n.subsection) {
                  const act = { type: 'settings_section', id: n.subsection };
                  if (currentRoute().tab === n.section) emitBellaAction(act);
                  else stashPending(act);
                }
                navigateTo(n.section);
              } catch { /* ignore */ }
            }
            patchLast((m) => ({ ...m, tools: [...(m.tools || []), { name: 'navigate', status: 'done', summary: '→ ' + (n?.section || '') + (n?.subsection ? ' · ' + n.subsection : '') }] }));
          },
          onUiAction: (a) => {
            try { emitBellaAction(a); } catch { /* ignore */ }
            const label = a?.type === 'open_record' ? ('→ ' + (a.tab || 'record') + ' #' + a.id)
              : a?.type === 'show_companies' ? 'showing companies'
              : a?.type === 'show_people' ? 'showing people'
              : a?.type === 'fill_field' ? ('typed into “' + String(a.field || '').slice(0, 30) + '” — check the field')
              : (a?.type || 'ui');
            patchLast((m) => ({ ...m, tools: [...(m.tools || []), { name: 'ui', status: 'done', summary: label }] }));
          },
          onApproval: (a) => patchLast((m) => ({
            ...m,
            approvals: [...(m.approvals || []), { action_id: a.action_id, tool: a.tool, summary: a.summary, status: 'pending' }],
          })),
          onError: (e) => patchLast((m) => ({ ...m, streaming: false, error: e?.message || 'Something went wrong.' })),
          onDone: () => patchLast((m) => {
            const parsed = splitChoices(m.content);
            return { ...m, streaming: false, content: parsed.text, choices: parsed.choices };
          }),
        }
      );
      streamRef.current = stream;
      await stream.done;
    } catch (err) {
      patchLast((m) => ({ ...m, streaming: false, error: err?.message || 'Connection lost.' }));
    } finally {
      // Safety net: if the stream ended without a done/error event (proxy drop,
      // server hiccup), never leave the bubble spinning on "…" forever.
      patchLast((m) => m.streaming
        ? { ...m, streaming: false, error: (m.content || m.error) ? m.error : "Bella didn't respond — please try again." }
        : m);
      setBusy(false);
      busyRef.current = false;
      streamRef.current = null;
      refreshConvs();
      // Voice bridge: when Bella Voice is active, she SPEAKS chat replies too
      // (incl. the narration after an Approve click).
      if (typeof window !== 'undefined' && window.__bellaVoiceActive && spokenText.trim()) {
        try { window.dispatchEvent(new CustomEvent('bdi:bella-say', { detail: { text: spokenText } })); } catch { /* ignore */ }
      }
      // Post-turn sync: normalizes local state to the server's (real ids,
      // timestamps, live approval statuses) so later polls diff correctly.
      setTimeout(() => { if (convIdRef.current && !busyRef.current) syncFromServer(convIdRef.current, { force: true }); }, 400);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  return html`
    <div class="bella-panel">
      <div class="bella-panel-head">
        <span class="bella-panel-title"><span class="bella-orb-mini"></span> Bella</span>
        <span class="bella-panel-spacer"></span>
        <button class="bella-head-btn" title="Conversations" onClick=${() => setShowList((s) => !s)}>History</button>
        <button class="bella-head-btn" onClick=${newChat}>New</button>
        <button class="bella-head-btn" title="Close" onClick=${onClose}>✕</button>
      </div>

      ${showList ? html`
        <div class="bella-convlist">
          ${convs.length === 0 ? html`<div class="bella-convlist-empty">No conversations yet.</div>` : null}
          ${convs.map((c) => html`
            <div key=${c.id} class=${'bella-convitem' + (c.id === convId ? ' active' : '')} onClick=${() => openConversation(c.id)}>
              <span class="bella-convitem-title">${c.title || 'Conversation'}</span>
              <span class="bella-convitem-time">${fmtTime(c.updated_at)}</span>
              <button class="bella-convitem-del" title="Delete" onClick=${(ev) => removeConversation(c.id, ev)}>✕</button>
            </div>`)}
        </div>` : null}

      <div class="bella-msgs" ref=${scrollRef}>
        ${msgs.length === 0 ? html`
          <div class="bella-empty">
            <div class="bella-empty-title">Hi — I'm Bella.</div>
            <div class="bella-empty-sub">Ask me anything about Qatar's companies, jobs, news, and signals — or tell me where to take you.</div>
            <div class="bella-suggestions">
              ${SUGGESTIONS.map((s) => html`<button key=${s} class="bella-suggestion" onClick=${() => send(s)}>${s}</button>`)}
            </div>
          </div>` : null}
        ${msgs.map((m, i) => html`
          <div key=${i} class=${'bella-msg ' + m.role}>
            ${(m.tools || []).map((t, j) => html`
              <div key=${j} class=${'bella-chip' + (t.status === 'error' ? ' error' : '')}>
                ${TOOL_LABELS[t.name] || t.name}${t.summary ? ' — ' + t.summary : (t.status === 'running' ? '…' : '')}
              </div>`)}
            ${m.content ? html`<div class="bella-bubble">${m.content}</div>` : null}
            ${(m.approvals || []).map((a) => html`
              <div key=${a.action_id} class="bella-approval">
                <div class="bella-approval-summary">${a.summary || a.tool}</div>
                ${a.status === 'pending' ? html`
                  <div class="bella-approval-btns">
                    <button class="bella-approve" disabled=${busy} onClick=${() => decide(a.action_id, 'approved')}>Approve</button>
                    <button class="bella-deny" disabled=${busy} onClick=${() => decide(a.action_id, 'denied')}>Deny</button>
                  </div>` : html`
                  <div class=${'bella-approval-state ' + a.status}>
                    ${a.status === 'busy' ? 'Working…'
                      : a.status === 'approved' ? ('✓ Approved' + (a.note ? ' — ' + a.note : ''))
                      : a.status === 'denied' ? '✕ Denied'
                      : ('Couldn’t process' + (a.note ? ' — ' + a.note : ''))}
                  </div>`}
              </div>`)}
            ${m.streaming && !m.content ? html`<div class="bella-bubble bella-thinking">…</div>` : null}
            ${m.error ? html`<div class="bella-chip error">${m.error}</div>` : null}
            ${m.at && !m.streaming ? html`<div class="bella-time">${fmtTime(m.at)}</div>` : null}
            ${m.choices && i === msgs.length - 1 && !busy ? html`
              <div class="bella-choices">
                ${m.choices.map((c) => html`<button key=${c} class="bella-choice" onClick=${() => send(c)}>${c}</button>`)}
              </div>` : null}
          </div>`)}
      </div>

      <div class="bella-inputrow">
        <textarea class="bella-input" rows="1" placeholder="Ask Bella…" value=${input}
          onInput=${(e) => setInput(e.target.value)} onKeyDown=${onKeyDown} disabled=${busy}></textarea>
        <button class="bella-send" disabled=${busy || !input.trim()} onClick=${() => send()}>${busy ? '…' : 'Send'}</button>
      </div>
    </div>`;
}

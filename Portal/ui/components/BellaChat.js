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

const SUGGESTIONS = [
  'How many construction companies are in Qatar?',
  "What's in today's market feed?",
  "Show me this week's signals",
];

const TOOL_LABELS = {
  search_companies: 'Searching companies',
  get_company: 'Opening company',
  search_jobs: 'Searching jobs',
  get_market_feed: 'Reading the feed',
  get_signals: 'Checking signals',
  get_data_stats: 'Reading data stats',
  get_credits: 'Checking credits',
  get_icp: 'Reading your ICP',
  navigate: 'Navigating',
};

export function BellaChat({ onClose }) {
  const [convs, setConvs] = useState([]);
  const [convId, setConvId] = useState(null);
  const [msgs, setMsgs] = useState([]);          // {role, content, tools?:[{name,status,summary}]}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);
  const scrollRef = useRef(null);
  const streamRef = useRef(null);

  const refreshConvs = useCallback(async () => {
    try { const r = await api.bellaConversations(); setConvs(r.conversations || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { refreshConvs(); }, [refreshConvs]);

  // Keep the view pinned to the newest message while streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // Abort an in-flight stream if the panel unmounts mid-answer.
  useEffect(() => () => { try { streamRef.current?.abort(); } catch { /* ignore */ } }, []);

  const openConversation = async (id) => {
    setShowList(false);
    if (busy) return;
    try {
      const r = await api.bellaMessages(id);
      setConvId(id);
      setMsgs((r.messages || []).map((m) => ({
        role: m.role,
        content: m.content || '',
        tools: m.meta?.tools || [],
      })).filter((m) => m.content || (m.tools && m.tools.length)));
    } catch { /* ignore */ }
  };

  const newChat = () => { if (!busy) { setConvId(null); setMsgs([]); setShowList(false); } };

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

  const send = async (textArg) => {
    const text = String(textArg ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((list) => [...list,
      { role: 'user', content: text },
      { role: 'assistant', content: '', tools: [], streaming: true },
    ]);

    try {
      const stream = await api.bellaChat(
        { conversation_id: convId, message: text, context: { section: currentRoute().tab } },
        {
          onMeta: (m) => { if (m.conversation_id) setConvId(m.conversation_id); },
          onToken: (d) => patchLast((m) => ({ ...m, content: m.content + d.t })),
          onTool: (t) => patchLast((m) => {
            const tools = (m.tools || []).slice();
            const i = tools.findIndex((x) => x.name === t.name && x.status === 'running');
            if (t.status === 'running') tools.push({ name: t.name, status: 'running' });
            else if (i >= 0) tools[i] = { name: t.name, status: t.status, summary: t.summary };
            else tools.push({ name: t.name, status: t.status, summary: t.summary });
            return { ...m, tools };
          }),
          onNavigate: (n) => {
            if (n?.section) { try { navigateTo(n.section); } catch { /* ignore */ } }
            patchLast((m) => ({ ...m, tools: [...(m.tools || []), { name: 'navigate', status: 'done', summary: '→ ' + (n?.section || '') }] }));
          },
          onError: (e) => patchLast((m) => ({ ...m, streaming: false, error: e?.message || 'Something went wrong.' })),
          onDone: () => patchLast((m) => ({ ...m, streaming: false })),
        }
      );
      streamRef.current = stream;
      await stream.done;
    } catch (err) {
      patchLast((m) => ({ ...m, streaming: false, error: err?.message || 'Connection lost.' }));
    } finally {
      setBusy(false);
      streamRef.current = null;
      refreshConvs();
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
            ${m.streaming && !m.content ? html`<div class="bella-bubble bella-thinking">…</div>` : null}
            ${m.error ? html`<div class="bella-chip error">${m.error}</div>` : null}
          </div>`)}
      </div>

      <div class="bella-inputrow">
        <textarea class="bella-input" rows="1" placeholder="Ask Bella…" value=${input}
          onInput=${(e) => setInput(e.target.value)} onKeyDown=${onKeyDown} disabled=${busy}></textarea>
        <button class="bella-send" disabled=${busy || !input.trim()} onClick=${() => send()}>${busy ? '…' : 'Send'}</button>
      </div>
    </div>`;
}

'use client';

/**
 * Bella — the marketing-site assistant (Phase G3).
 *
 * A round orb bottom-right on every page. Opens a chat panel that streams
 * from the PORTAL's public endpoint (app.bell.qa/api/public/bella — the
 * marketing service holds no AI key and no data; that's by design).
 *
 * She can navigate the visitor around the site: the server emits `navigate`
 * events ({path, anchor?}); we router.push, then scroll to + highlight the
 * anchored section ([data-bella="…"], styled by .bella-hl in globals.css).
 *
 * History is per-visit (sessionStorage) — nothing is stored server-side.
 */

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const API = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.bell.qa').replace(/\/$/, '');
const STORE_KEY = 'bella_chat_v1';

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  at?: string;
  choices?: string[] | null;
  error?: string;
  streaming?: boolean;
};

const SUGGESTIONS = [
  'What is Bell.qa?',
  'What does it cost?',
  'What is the 0 Risk programme?',
];

// Bella ends closed questions with "[choices: A | B]" — strip + surface as buttons.
const CHOICES_RX = /\n?\s*\[choices:\s*([^\]]+)\]\s*$/i;
function splitChoices(text: string): { text: string; choices: string[] | null } {
  const m = CHOICES_RX.exec(text || '');
  if (!m) return { text: text || '', choices: null };
  const choices = m[1].split('|').map((s) => s.trim()).filter(Boolean).slice(0, 4);
  return { text: (text || '').replace(CHOICES_RX, '').trimEnd(), choices: choices.length >= 2 ? choices : null };
}

function loadStored(): Msg[] {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(-24) : [];
  } catch { return []; }
}

export function BellaWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Restore the visit's conversation once on mount.
  useEffect(() => { setMsgs(loadStored()); }, []);

  // Persist (light) + keep pinned to the newest message.
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(
        msgs.filter((m) => !m.streaming).map(({ role, content, at }) => ({ role, content, at })).slice(-24)
      ));
    } catch { /* ignore */ }
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchLast = (fn: (m: Msg) => Msg) => setMsgs((list) => {
    if (!list.length) return list;
    const next = list.slice();
    next[next.length - 1] = fn({ ...next[next.length - 1] });
    return next;
  });

  const handleNavigate = (path?: string, anchor?: string) => {
    if (!path) return;
    try { router.push(path); } catch { return; }
    if (!anchor) return;
    // Wait for the destination to render, then scroll + highlight.
    let tries = 0;
    const find = () => {
      const el = document.querySelector(`[data-bella="${anchor}"]`) || document.getElementById(anchor);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bella-hl');
        setTimeout(() => el.classList.remove('bella-hl'), 3600);
      } else if (++tries < 15) {
        setTimeout(find, 250);
      }
    };
    setTimeout(find, 350);
  };

  const send = async (textArg?: string) => {
    const text = String(textArg ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    const now = new Date().toISOString();
    const history = msgs.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMsgs((list) => [...list,
      { role: 'user', content: text, at: now },
      { role: 'assistant', content: '', at: now, streaming: true },
    ]);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch(`${API}/api/public/bella/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, context: { path: pathname } }),
        signal: ctrl.signal,
      });
      if (!r.ok || !(r.headers.get('content-type') || '').includes('text/event-stream')) {
        let msg = 'Bella is unavailable right now — please try again shortly.';
        try { const b = await r.json(); msg = b?.message || msg; } catch { /* ignore */ }
        throw new Error(msg);
      }
      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = 'message';
          const dataLines: string[] = [];
          for (const line of frame.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          if (!dataLines.length) continue;
          let payload: any = null;
          try { payload = JSON.parse(dataLines.join('\n')); } catch { continue; }
          if (event === 'token') patchLast((m) => ({ ...m, content: m.content + (payload.t || '') }));
          else if (event === 'navigate') handleNavigate(payload.path, payload.anchor);
          else if (event === 'error') patchLast((m) => ({ ...m, streaming: false, error: payload.message || 'Something went wrong.' }));
          else if (event === 'done') patchLast((m) => {
            const parsed = splitChoices(m.content);
            return { ...m, streaming: false, content: parsed.text, choices: parsed.choices };
          });
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        patchLast((m) => ({ ...m, streaming: false, error: err?.message || 'Connection lost — please try again.' }));
      }
    } finally {
      patchLast((m) => (m.streaming ? { ...m, streaming: false, error: m.content ? undefined : 'Bella didn\'t respond — please try again.' } : m));
      setBusy(false);
      abortRef.current = null;
    }
  };

  const clearChat = () => { if (!busy) { setMsgs([]); try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ } } };

  const fmtTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Orb */}
      <button
        aria-label={open ? 'Close Bella' : 'Chat with Bella'}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-[90] h-14 w-14 rounded-full border border-accent/50 shadow-[0_0_24px_rgb(var(--accent)/0.45)] transition-transform hover:scale-105"
        style={{ background: 'radial-gradient(circle at 32% 30%, rgb(var(--accent-bright)) 0%, rgb(var(--accent)) 42%, #101b3a 100%)' }}
      >
        <span className="absolute inset-0 m-auto h-3 w-3 rounded-full bg-white/95 shadow-[0_0_10px_rgba(255,255,255,0.9)] animate-pulse" />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-[90] flex w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-border bg-bg-elev shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
          style={{ height: 'min(560px, 72vh)' }}>
          {/* Head */}
          <div className="flex items-center gap-2 border-b border-border bg-bg-elev-2 px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'radial-gradient(circle at 32% 30%, rgb(var(--accent-bright)), rgb(var(--accent)))' }} />
            <span className="text-sm font-semibold text-text">Bella</span>
            <span className="text-[11px] text-text-dim">· Bell.qa guide</span>
            <span className="flex-1" />
            <button onClick={clearChat} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-text-muted hover:text-text hover:border-accent">Clear</button>
            <button aria-label="Close" onClick={() => setOpen(false)} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-text-muted hover:text-text hover:border-accent">✕</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="my-auto text-center">
                <div className="text-base font-semibold text-text">Hi — I&apos;m Bella.</div>
                <div className="mx-auto mt-1.5 max-w-[280px] text-xs leading-relaxed text-text-muted">
                  Ask me anything about Bell — the data, pricing, 0 Risk — and I can take you to the right page while we talk.
                </div>
                <div className="mt-4 flex flex-col items-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)}
                      className="rounded-full border border-border bg-bg-elev-2 px-4 py-1.5 text-xs text-text-muted transition hover:border-accent hover:text-text">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`flex flex-col gap-1 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                {m.content ? (
                  <div className={`max-w-[88%] whitespace-pre-wrap break-words rounded-xl px-3.5 py-2 text-[13px] leading-relaxed ${
                    m.role === 'user'
                      ? 'rounded-br-sm bg-accent font-medium text-[#0b1020]'
                      : 'rounded-bl-sm border border-border bg-bg-elev-2 text-text'
                  }`}>{m.content}</div>
                ) : m.streaming ? (
                  <div className="rounded-xl border border-border bg-bg-elev-2 px-3.5 py-2 text-[13px] text-text-dim animate-pulse">…</div>
                ) : null}
                {m.error && <div className="max-w-[88%] rounded-full border border-danger/40 px-3 py-1 text-[11px] text-danger">{m.error}</div>}
                {m.at && !m.streaming && <div className="text-[10px] text-text-dim">{fmtTime(m.at)}</div>}
                {m.choices && i === msgs.length - 1 && !busy && (
                  <div className="mt-1 flex flex-wrap gap-2">
                    {m.choices.map((c) => (
                      <button key={c} onClick={() => send(c)}
                        className="rounded-full border border-accent/50 bg-bg-elev-2 px-3.5 py-1 text-xs text-text transition hover:border-accent hover:bg-accent/10">
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="flex gap-2 border-t border-border bg-bg-elev-2 p-3">
            <textarea
              rows={1}
              value={input}
              disabled={busy}
              placeholder="Ask Bella…"
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="max-h-24 flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-[13px] text-text outline-none placeholder:text-text-dim focus:border-accent"
            />
            <button
              disabled={busy || !input.trim()}
              onClick={() => send()}
              className="rounded-lg bg-accent px-4 text-xs font-bold text-[#0b1020] transition disabled:cursor-default disabled:opacity-40 hover:shadow-[0_0_14px_rgb(var(--accent)/0.5)]"
            >
              {busy ? '…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

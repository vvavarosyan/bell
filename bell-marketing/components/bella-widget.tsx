'use client';

/**
 * Bella — the marketing-site assistant (Phase G3 chat + G-voice).
 *
 * A round orb bottom-right on every page. Opens a chat panel that streams
 * from the PORTAL's public endpoint (app.bell.qa/api/public/bella — the
 * marketing service holds no AI key and no data; that's by design).
 *
 * VOICE (Val's D4): tap the mic → the whole site edge-glows while Bella
 * listens; talk naturally (English or Arabic); she answers out loud. Audio
 * runs through the same public endpoints (/voice/transcribe, /voice/tts),
 * which are tightly rate-limited per visitor. Falls back to text gracefully
 * when voice is unconfigured or capped.
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

// Voice VAD tuning (ported from the portal's proven G4 pipeline).
const SILENCE_MS = 900;       // pause that ends an utterance
const MIN_SPEECH_MS = 350;    // shorter blips are ignored (coughs, clicks)
const MAX_UTTER_MS = 25_000;  // hard stop so a stuck mic can't record forever
const BARGE_MS = 350;         // sustained speech needed to interrupt her
const VOICE_IDLE_MS = 10_000; // auto-close the mic after 10s of silence (saves money — Val 2026-07-04)

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  at?: string;
  choices?: string[] | null;
  error?: string;
  streaming?: boolean;
};

type VState = 'idle' | 'starting' | 'listening' | 'thinking' | 'speaking' | 'error';

type Media = { stream: MediaStream; ctx: AudioContext; analyser: AnalyserNode; recorder: MediaRecorder | null };

const SUGGESTIONS = [
  'What is Bell.qa?',
  'What does it cost?',
  'What is the 0 Risk programme?',
];

const V_TEXT: Record<VState, string> = {
  idle: '', starting: 'Starting…', listening: 'Listening — just talk',
  thinking: 'Thinking…', speaking: 'Speaking — tap to interrupt', error: 'Voice unavailable',
};

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

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function BellaWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [vState, setVStateRaw] = useState<VState>('idle');
  const [vLine, setVLine] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Refs the voice loop reads (so its long-lived closures never go stale).
  const msgsRef = useRef<Msg[]>([]);
  const pathRef = useRef<string>(pathname);
  const voiceOnRef = useRef(false);
  const vStateRef = useRef<VState>('idle');
  const aliveRef = useRef(false);
  const mediaRef = useRef<Media | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stopAudioRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  const busyRef = useRef(false);

  const setVState = (s: VState) => { vStateRef.current = s; setVStateRaw(s); };

  useEffect(() => { msgsRef.current = msgs; }, [msgs]);
  useEffect(() => { busyRef.current = busy; }, [busy]);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);

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

  useEffect(() => () => { abortRef.current?.abort(); stopVoice(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // One chat turn. Streams into the message list; returns the final spoken-safe
  // text so a voice turn can TTS it. `voice` tags the turn for a speakable reply.
  const send = async (textArg?: string, voice = false): Promise<string> => {
    const text = String(textArg ?? input).trim();
    if (!text || busyRef.current) return '';
    setInput('');
    setBusy(true); busyRef.current = true;
    const now = new Date().toISOString();
    const history = msgsRef.current.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
    setMsgs((list) => [...list,
      { role: 'user', content: text, at: now },
      { role: 'assistant', content: '', at: now, streaming: true },
    ]);

    let finalText = '';
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const r = await fetch(`${API}/api/public/bella/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, context: { path: pathRef.current, voice } }),
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
            finalText = parsed.text;
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
      setBusy(false); busyRef.current = false;
      abortRef.current = null;
    }
    return finalText;
  };

  // User-initiated send: while voice is active, the reply is also spoken.
  const respond = async (textArg?: string) => {
    const voice = voiceOnRef.current;
    if (voice) setVState('thinking');
    const reply = await send(textArg, voice);
    if (voice && aliveRef.current) {
      if (reply) await speak(reply);
      else if (vStateRef.current !== 'listening') setVState('listening');
    }
  };

  // ---- Voice ---------------------------------------------------------------

  // Fallback voice: the browser's own speech synthesizer. Free, no key — so
  // Bella ALWAYS speaks, even if ElevenLabs is unavailable (missing key on the
  // API host, or the monthly voice quota is spent). Lower fidelity, but never
  // silent — which is what Val needs.
  const browserSpeak = (text: string) => new Promise<void>((resolve) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return resolve();
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.05;
      const isAr = /[؀-ۿ]/.test(text);
      const v = (synth.getVoices() || []).find((vc) => (isAr ? /^ar/i : /^en/i).test(vc.lang));
      if (v) u.voice = v;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      stopAudioRef.current = () => { try { synth.cancel(); } catch { /* ignore */ } resolve(); };
      synth.speak(u);
    } catch { resolve(); }
  });

  const speak = async (text: string) => {
    const clean = (text || '').replace(CHOICES_RX, '').trim();
    if (!clean || !voiceOnRef.current) { if (voiceOnRef.current) setVState('listening'); return; }
    setVState('speaking');
    setVLine(clean.slice(0, 120));
    try {
      const r = await fetch(`${API}/api/public/bella/voice/tts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clean.slice(0, 600) }),
      }).catch(() => null);
      const blob = r && r.ok ? await r.blob().catch(() => null) : null;
      if (blob && blob.size > 200) {
        const url = URL.createObjectURL(blob);
        await new Promise<void>((resolve) => {
          const a = new Audio(url);
          audioRef.current = a;
          stopAudioRef.current = () => { try { a.pause(); } catch { /* ignore */ } resolve(); };
          a.onended = () => resolve();
          a.onerror = () => resolve();
          a.play().catch(() => resolve());
        });
        audioRef.current = null;
        stopAudioRef.current = null;
        URL.revokeObjectURL(url);
      } else {
        // ElevenLabs unavailable (no key / quota / rate) → speak with the browser voice.
        await browserSpeak(clean);
        stopAudioRef.current = null;
      }
    } catch { try { await browserSpeak(clean); } catch { /* ignore */ } stopAudioRef.current = null; }
    if (aliveRef.current && voiceOnRef.current && vStateRef.current === 'speaking') { setVLine(''); setVState('listening'); }
  };

  const processUtterance = async (blob: Blob) => {
    if (!aliveRef.current || !blob || blob.size < 2000) { setVState('listening'); return; }
    setVState('thinking'); setVLine('…');
    try {
      const r = await fetch(`${API}/api/public/bella/voice/transcribe`, {
        method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob,
      });
      if (!r.ok) {
        if (r.status === 429 || r.status === 503) setVLine('Voice needs a short breather — keep chatting by text.');
        setVState('listening');
        return;
      }
      const data = await r.json();
      const text = String(data?.text || '').trim();
      if (!aliveRef.current) return;
      if (!text || text.length < 2) { setVLine(''); setVState('listening'); return; }
      await respond(text);
    } catch {
      if (aliveRef.current) { setVLine(''); setVState('listening'); }
    }
  };

  const startVoice = async () => {
    // Preflight: honest fallback if the deployment has no ElevenLabs key.
    try {
      const s = await fetch(`${API}/api/public/bella/voice/status`).then((r) => r.json()).catch(() => null);
      if (!s?.configured) { setVState('error'); setVLine('Voice isn\'t available right now — chat works!'); return; }
    } catch { /* proceed; the mic step will report if truly broken */ }

    const mime = pickMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) {
      setVState('error'); setVLine('This browser doesn\'t support voice.'); return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setVState('error'); setVLine('Microphone access was denied — allow it and try again.'); return;
    }

    aliveRef.current = true;
    voiceOnRef.current = true;
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    try { if (ctx.state === 'suspended') await ctx.resume(); } catch { /* ignore */ }
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    src.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    mediaRef.current = { stream, ctx, analyser, recorder: null };
    setVState('listening');

    let recorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];
    let speechStart = 0;
    let lastSpeech = 0;
    let bargeTentative = false;
    let noiseFloor = 0.004;
    let lastActivity = performance.now();   // for the idle auto-off
    const t0 = performance.now();

    const startRec = () => {
      chunks = [];
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: (recorder && recorder.mimeType) || mime || 'audio/webm' });
        processUtterance(blob);
      };
      recorder.start();
      if (mediaRef.current) mediaRef.current.recorder = recorder;
    };
    const discardRec = () => {
      if (recorder) {
        try { recorder.ondataavailable = null; recorder.onstop = null; if (recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
      }
      recorder = null; chunks = [];
    };

    const tick = () => {
      if (!aliveRef.current) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();

      if (now - t0 < 700) { noiseFloor = Math.max(noiseFloor, rms * 1.4); rafRef.current = requestAnimationFrame(tick); return; }
      const listenTh = Math.max(0.012, noiseFloor * 2.2);
      const bargeTh = Math.max(0.02, noiseFloor * 3.5);
      const st = vStateRef.current;

      // Idle auto-off (Val 2026-07-04): if she's just listening with no speech
      // for VOICE_IDLE_MS, close the mic to save money. Any speech, her own
      // turn (thinking/speaking), or a mid-utterance resets the timer.
      if (st !== 'listening' || rms > listenTh || speechStart) lastActivity = now;
      if (st === 'listening' && !speechStart && now - lastActivity > VOICE_IDLE_MS) { stopVoice(); return; }

      if (st === 'listening') {
        if (rms > listenTh) { lastSpeech = now; if (!speechStart) { speechStart = now; startRec(); } }
        if (speechStart) {
          const tooLong = now - speechStart > MAX_UTTER_MS;
          const silentEnough = now - lastSpeech > SILENCE_MS;
          if (tooLong || silentEnough) {
            const hadSpeech = lastSpeech - speechStart >= MIN_SPEECH_MS;
            speechStart = 0;
            if (hadSpeech) { try { if (recorder && recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ } }
            else discardRec();
          }
        }
      } else if (st === 'speaking') {
        if (rms > bargeTh) {
          lastSpeech = now;
          if (!speechStart) { speechStart = now; bargeTentative = true; startRec(); if (audioRef.current) { try { audioRef.current.volume = 0.25; } catch { /* ignore */ } } }
        }
        if (speechStart && bargeTentative) {
          if (lastSpeech - speechStart >= BARGE_MS) {
            bargeTentative = false; stopAudioRef.current?.(); setVLine(''); setVState('listening');
          } else if (now - lastSpeech > 450) {
            speechStart = 0; bargeTentative = false; discardRec();
            if (audioRef.current) { try { audioRef.current.volume = 1; } catch { /* ignore */ } }
          }
        }
      } else {
        if (speechStart || bargeTentative) { speechStart = 0; bargeTentative = false; discardRec(); }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  function stopVoice() {
    aliveRef.current = false;
    voiceOnRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    stopAudioRef.current = null;
    const m = mediaRef.current;
    if (m) {
      try { if (m.recorder && m.recorder.state !== 'inactive') m.recorder.stop(); } catch { /* ignore */ }
      try { m.stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
      try { m.ctx.close(); } catch { /* ignore */ }
    }
    mediaRef.current = null;
    setVState('idle'); setVLine('');
  }

  const toggleVoice = () => { if (voiceOnRef.current) stopVoice(); else { setOpen(true); startVoice(); } };
  const interrupt = () => { if (vStateRef.current === 'speaking') { stopAudioRef.current?.(); setVLine(''); setVState('listening'); } };

  const voiceOn = vState !== 'idle';

  const clearChat = () => { if (!busy) { setMsgs([]); try { sessionStorage.removeItem(STORE_KEY); } catch { /* ignore */ } } };

  const fmtTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* Full-viewport edge glow while voice is active */}
      {voiceOn && <div className={`bella-voice-glow ${vState}`} aria-hidden />}

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
            <button
              onClick={toggleVoice}
              aria-label={voiceOn ? 'Stop voice' : 'Talk to Bella'}
              title={voiceOn ? 'Stop voice' : 'Talk to Bella'}
              className={`flex h-7 w-7 items-center justify-center rounded-md border transition ${voiceOn ? 'border-accent bg-accent/15 text-accent-bright' : 'border-border text-text-muted hover:border-accent hover:text-text'}`}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0" /><line x1="12" y1="19" x2="12" y2="22" />
              </svg>
            </button>
            <button onClick={clearChat} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-text-muted hover:text-text hover:border-accent">Clear</button>
            <button aria-label="Close" onClick={() => setOpen(false)} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-text-muted hover:text-text hover:border-accent">✕</button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            {msgs.length === 0 && (
              <div className="my-auto text-center">
                <div className="text-base font-semibold text-text">Hi — I&apos;m Bella.</div>
                <div className="mx-auto mt-1.5 max-w-[280px] text-xs leading-relaxed text-text-muted">
                  Ask me anything about Bell — the data, pricing, 0 Risk — or tap the mic and just talk. I speak English and Arabic.
                </div>
                <div className="mt-4 flex flex-col items-center gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => respond(s)}
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
                      <button key={c} onClick={() => respond(c)}
                        className="rounded-full border border-accent/50 bg-bg-elev-2 px-3.5 py-1 text-xs text-text transition hover:border-accent hover:bg-accent/10">
                        {c}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Voice status strip */}
          {voiceOn && (
            <div onClick={interrupt} className="flex cursor-pointer items-center gap-2 border-t border-border bg-bg-elev-2 px-4 py-2.5">
              <span className={`bella-voice-dot ${vState}`} />
              <span className="text-[12px] font-medium text-text">{V_TEXT[vState]}</span>
              {vLine && <span className="flex-1 truncate text-[11px] text-text-dim">{vLine}</span>}
              <span className="flex-1" />
              <button onClick={(e) => { e.stopPropagation(); stopVoice(); }}
                className="rounded-md border border-border px-2 py-0.5 text-[11px] text-text-muted hover:border-danger hover:text-danger">
                End voice
              </button>
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 border-t border-border bg-bg-elev-2 p-3">
            <textarea
              rows={1}
              value={input}
              disabled={busy}
              placeholder={voiceOn ? 'Talk, or type…' : 'Ask Bella…'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); respond(); } }}
              className="max-h-24 flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-[13px] text-text outline-none placeholder:text-text-dim focus:border-accent"
            />
            <button
              disabled={busy || !input.trim()}
              onClick={() => respond()}
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

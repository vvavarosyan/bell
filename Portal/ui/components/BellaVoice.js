// Bella — voice mode (Phase G4).
//
// Val's spec: click Voice → the whole portal's edges glow night-blue (she's
// listening); talk naturally; she answers out loud; switch chat↔voice any
// time (same conversation server-side).
//
// v1 pipeline (per the Phase-G plan): mic → VAD-lite utterance segmentation
// (RMS threshold + 900ms silence) → /voice/transcribe (ElevenLabs Scribe) →
// the NORMAL Bella chat turn (tools/approvals/budget identical to chat) →
// final text → /voice/tts (ElevenLabs Flash) → playback. While she speaks,
// the mic is ignored (no echo loops); tap the pill to interrupt her.
// Approvals stay visual: she says so, and the pill offers "Open chat".

import { useState, useEffect, useRef, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { currentRoute, navigateTo } from '../lib/router.js';

const SILENCE_MS = 900;      // pause that ends an utterance
const MIN_SPEECH_MS = 350;   // shorter blips are ignored (coughs, clicks)
const MAX_UTTER_MS = 25_000; // hard stop so a stuck mic can't record forever

const CHOICES_RX = /\n?\s*\[choices:\s*([^\]]+)\]\s*$/i;

function pickMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

export function BellaVoice({ onClose, onOpenChat }) {
  const [state, setState] = useState('starting');   // starting|listening|thinking|speaking|error
  const [line, setLine] = useState('');             // transcript / reply snippet on the pill
  const [pendingApprovals, setPendingApprovals] = useState(0);

  const convIdRef = useRef(null);
  const streamRef = useRef(null);
  const mediaRef = useRef(null);      // { stream, ctx, analyser, recorder }
  const audioRef = useRef(null);      // current playback element
  const aliveRef = useRef(true);
  const stateRef = useRef('starting');
  const setSt = (s) => { stateRef.current = s; setState(s); };

  const cleanup = useCallback(() => {
    aliveRef.current = false;
    try { streamRef.current?.abort(); } catch { /* ignore */ }
    try { audioRef.current?.pause(); } catch { /* ignore */ }
    const m = mediaRef.current;
    if (m) {
      try { m.recorder?.state !== 'inactive' && m.recorder.stop(); } catch { /* ignore */ }
      try { m.stream.getTracks().forEach((t) => t.stop()); } catch { /* ignore */ }
      try { m.ctx.close(); } catch { /* ignore */ }
    }
  }, []);
  useEffect(() => () => cleanup(), [cleanup]);

  // Continue Bella's latest conversation (chat↔voice share the thread).
  useEffect(() => {
    (async () => {
      try { const r = await api.bellaConversations(); convIdRef.current = r.conversations?.[0]?.id || null; } catch { /* ignore */ }
    })();
  }, []);

  const speak = async (text) => {
    const clean = text.replace(CHOICES_RX, '').trim();
    if (!clean) { setSt('listening'); return; }
    setSt('speaking');
    setLine(clean.slice(0, 120));
    try {
      const url = await api.bellaTts(clean);
      await new Promise((resolve) => {
        const a = new Audio(url);
        audioRef.current = a;
        a.onended = resolve;
        a.onerror = resolve;
        a.play().catch(resolve);
      });
      URL.revokeObjectURL(url);
    } catch (err) {
      toast('Bella\'s voice: ' + (err.message || 'failed'), 'error');
    }
    if (aliveRef.current) { setLine(''); setSt('listening'); }
  };

  const runTurn = async (text) => {
    setSt('thinking');
    setLine('“' + text.slice(0, 100) + '”');
    let finalText = '';
    let errored = null;
    try {
      const stream = await api.bellaChat(
        { conversation_id: convIdRef.current, message: text, context: { section: currentRoute().tab, voice: true } },
        {
          onMeta: (m) => { if (m.conversation_id) convIdRef.current = m.conversation_id; },
          onToken: (d) => { finalText += d.t || ''; },
          onNavigate: (n) => { if (n?.section) { try { navigateTo(n.section); } catch { /* ignore */ } } },
          onApproval: () => setPendingApprovals((n) => n + 1),
          onError: (e) => { errored = e?.message || 'Something went wrong.'; },
        }
      );
      streamRef.current = stream;
      await stream.done;
    } catch (err) {
      errored = err?.message || 'Connection lost.';
    } finally {
      streamRef.current = null;
    }
    if (!aliveRef.current) return;
    if (errored) { toast('Bella: ' + errored, 'error'); setLine(''); setSt('listening'); return; }
    await speak(finalText);
  };

  const processUtterance = async (blob) => {
    if (!aliveRef.current || !blob || blob.size < 2000) { setSt('listening'); return; }
    setSt('thinking');
    setLine('…');
    try {
      const { text } = await api.bellaTranscribe(blob);
      if (!aliveRef.current) return;
      if (!text || text.length < 2) { setLine(''); setSt('listening'); return; }
      await runTurn(text);
    } catch (err) {
      toast(err.message || 'Couldn\'t hear that.', 'error');
      if (aliveRef.current) { setLine(''); setSt('listening'); }
    }
  };

  // Mic + VAD-lite loop.
  useEffect(() => {
    let raf = null;
    (async () => {
      const mime = pickMime();
      if (mime === null || !navigator.mediaDevices?.getUserMedia) {
        setSt('error'); setLine('This browser doesn\'t support voice.'); return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        setSt('error'); setLine('Microphone access was denied — allow it and try again.'); return;
      }
      if (!aliveRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);

      let recorder = null;
      let chunks = [];
      let speechStart = 0;
      let lastSpeech = 0;
      let noiseFloor = 0.004;
      const t0 = performance.now();

      const startRec = () => {
        chunks = [];
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' });
          processUtterance(blob);
        };
        recorder.start();
      };

      mediaRef.current = { stream, ctx, analyser, recorder: null };
      setSt('listening');

      const tick = () => {
        if (!aliveRef.current) return;
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        const now = performance.now();

        // First 700ms: calibrate the room's noise floor.
        if (now - t0 < 700) { noiseFloor = Math.max(noiseFloor, rms * 1.4); raf = requestAnimationFrame(tick); return; }
        const threshold = Math.max(0.012, noiseFloor * 2.2);

        if (stateRef.current === 'listening') {
          if (rms > threshold) {
            lastSpeech = now;
            if (!speechStart) {
              speechStart = now;
              startRec();
              mediaRef.current.recorder = recorder;
            }
          }
          if (speechStart) {
            const tooLong = now - speechStart > MAX_UTTER_MS;
            const silentEnough = now - lastSpeech > SILENCE_MS;
            if (tooLong || silentEnough) {
              const hadSpeech = lastSpeech - speechStart >= MIN_SPEECH_MS;
              speechStart = 0;
              try {
                if (recorder && recorder.state !== 'inactive') {
                  if (hadSpeech) recorder.stop();          // → onstop → processUtterance
                  else { recorder.ondataavailable = null; recorder.onstop = null; recorder.stop(); }
                }
              } catch { /* ignore */ }
            }
          }
        } else {
          speechStart = 0;   // not listening — drop any partial capture state
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();
    return () => { if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tap the pill while she speaks = interrupt (barge-in without echo risk).
  const interrupt = () => {
    if (stateRef.current === 'speaking') {
      try { audioRef.current?.pause(); } catch { /* ignore */ }
      setLine('');
      setSt('listening');
    }
  };

  const STATE_TEXT = {
    starting: 'Waking Bella up…',
    listening: 'Listening — just talk',
    thinking: 'Thinking…',
    speaking: 'Speaking — tap to interrupt',
    error: 'Voice unavailable',
  };

  return html`
    <div class=${'bella-voice-glow ' + state}></div>
    <div class="bella-voice-pill" onClick=${interrupt}>
      <span class=${'bella-voice-dot ' + state}></span>
      <span class="bella-voice-state">${STATE_TEXT[state] || state}</span>
      ${line ? html`<span class="bella-voice-line">${line}</span>` : null}
      ${pendingApprovals > 0 ? html`
        <button class="bella-voice-btn accent" onClick=${(e) => { e.stopPropagation(); onOpenChat?.(); }}>
          ${pendingApprovals} approval${pendingApprovals > 1 ? 's' : ''} — open chat
        </button>` : null}
      <button class="bella-voice-btn" onClick=${(e) => { e.stopPropagation(); onOpenChat?.(); }}>Chat</button>
      <button class="bella-voice-btn stop" onClick=${(e) => { e.stopPropagation(); cleanup(); onClose?.(); }}>End voice</button>
    </div>`;
}

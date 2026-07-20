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
import { emitBellaAction, stashPending, fireToolEffects, setBellaBusy,
  BELLA_CONV_EVENT, getActiveConversation, setActiveConversation } from '../lib/bellaBus.js';
import { fireApprovalsChanged } from './BellaApprovals.js';
import { cutSpeechSegment, segmentAll } from '../lib/speech.js';

const SILENCE_MS = 900;      // pause that ends an utterance
const MIN_SPEECH_MS = 350;   // shorter blips are ignored (coughs, clicks)
const MAX_UTTER_MS = 25_000; // hard stop so a stuck mic can't record forever
const BARGE_MS = 350;        // sustained speech needed to interrupt her (cough-proof)
const VOICE_IDLE_MS = 10_000; // auto-close voice after 10s of silence (saves money — Val 2026-07-04)

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
  const stopAudioRef = useRef(null);  // stops playback AND resolves speak()'s promise
  const aliveRef = useRef(true);
  const stateRef = useRef('starting');
  const setSt = (s) => { stateRef.current = s; setState(s); };

  const cleanup = useCallback(() => {
    aliveRef.current = false;
    try { speechRunRef.current?.stop(); } catch { /* ignore */ }
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

  // Chat ↔ voice share ONE thread via the session store, so voice turns land in
  // the conversation the chat panel shows (Val 2026-07-12). A fresh visit has no
  // active id → the first voice turn opens a new conversation, matching the
  // new-chat policy. If chat switches/creates a thread, adopt it here.
  useEffect(() => {
    convIdRef.current = getActiveConversation();
    const on = (e) => { convIdRef.current = e?.detail?.id ?? null; };
    window.addEventListener(BELLA_CONV_EVENT, on);
    return () => window.removeEventListener(BELLA_CONV_EVENT, on);
  }, []);

  // While voice is active, CHAT replies are spoken too (Val 2026-07-03: after
  // clicking Approve she answered in text only). BellaChat announces its
  // finished replies on this window event; we voice them when idle-listening.
  useEffect(() => {
    window.__bellaVoiceActive = true;
    const onSay = (e) => {
      const text = e?.detail?.text;
      if (text && (stateRef.current === 'listening')) speak(String(text));
    };
    window.addEventListener('bdi:bella-say', onSay);
    return () => {
      window.__bellaVoiceActive = false;
      window.removeEventListener('bdi:bella-say', onSay);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fallback voice: the browser's own speech synth. Free, no key — so Bella
  // ALWAYS speaks even if ElevenLabs is unavailable (missing key / spent quota).
  const browserSpeak = (text) => new Promise((resolve) => {
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

  // ── sentence-chunked speech (Phase 3): a per-turn queue of short segments.
  // The first sentence goes to TTS while the rest of the reply still streams,
  // and segment N+1's audio is fetched while segment N plays — she starts
  // talking after ONE sentence instead of after the whole turn + whole mp3.
  const speechRunRef = useRef(null);
  const newSpeechRun = () => {
    const run = { stopped: false, items: [], _finished: false };
    let resolveDone;
    run.done = new Promise((r) => { resolveDone = r; });
    let playing = false;
    const maybeFinish = () => { if (run.stopped || (run._finished && !run.items.length && !playing)) resolveDone(); };
    const playLoop = async () => {
      if (playing) return;
      playing = true;
      while (!run.stopped && run.items.length) {
        const item = run.items.shift();
        if (aliveRef.current) { setSt('speaking'); setLine(item.text.slice(0, 120)); }
        const url = await item.urlP;                       // prefetched while previous segment played
        if (run.stopped) { if (url) { try { URL.revokeObjectURL(url); } catch { /* ignore */ } } break; }
        try {
          if (url) {
            await new Promise((resolve) => {
              const a = new Audio(url);
              audioRef.current = a;
              // Interruption handle (tap OR sustained speech): pause + resolve
              // so the turn flow never hangs on a cancelled playback.
              stopAudioRef.current = () => { try { a.pause(); } catch { /* ignore */ } resolve(); };
              a.onended = resolve;
              a.onerror = resolve;
              a.play().catch(resolve);
            });
            audioRef.current = null;
            stopAudioRef.current = null;
            try { URL.revokeObjectURL(url); } catch { /* ignore */ }
          } else {
            await browserSpeak(item.text);                 // free browser voice — never silent
            stopAudioRef.current = null;
          }
        } catch { try { await browserSpeak(item.text); } catch { /* ignore */ } }
      }
      playing = false;
      maybeFinish();
    };
    run.push = (text) => {
      const clean = String(text || '').trim();
      if (!clean || run.stopped) return;
      run.items.push({ text: clean, urlP: api.bellaTts(clean).catch(() => null) });
      playLoop();
    };
    run.finish = () => { run._finished = true; maybeFinish(); };
    run.stop = () => {
      run.stopped = true;
      run.items = [];
      try { stopAudioRef.current?.(); } catch { /* ignore */ }
      maybeFinish();
    };
    speechRunRef.current = run;
    return run;
  };

  // Speak a COMPLETE text (chat replies voiced while voice mode is on).
  const speak = async (text) => {
    const segs = segmentAll(text);
    if (!segs.length) { setSt('listening'); return; }
    const run = newSpeechRun();
    for (const seg of segs) run.push(seg);
    run.finish();
    await run.done;
    if (aliveRef.current && !run.stopped && stateRef.current === 'speaking') { setLine(''); setSt('listening'); }
  };

  const runTurn = async (text) => {
    setSt('thinking');
    setBellaBusy(true);          // orb pulses while she works
    try {
    setLine('“' + text.slice(0, 100) + '”');
    let finalText = '';
    let errored = null;
    // Speech starts the moment the FIRST sentence has streamed.
    const run = newSpeechRun();
    let speechBuf = '';
    const feedSpeech = (t) => {
      if (run.stopped) return;
      speechBuf += t;
      for (;;) {
        const cut = cutSpeechSegment(speechBuf);
        if (!cut) break;
        speechBuf = cut.rest;
        run.push(cut.segment);
      }
    };
    try {
      const stream = await api.bellaChat(
        { conversation_id: convIdRef.current, message: text, context: { section: currentRoute().tab, voice: true } },
        {
          // Persist + broadcast the thread id so the chat panel adopts it and
          // the voice turns appear there as history (Val 2026-07-12).
          onMeta: (m) => { if (m.conversation_id) { convIdRef.current = m.conversation_id; setActiveConversation(m.conversation_id); } },
          onToken: (d) => { finalText += d.t || ''; feedSpeech(d.t || ''); },
          onTool: (t) => { if (t.status === 'done') fireToolEffects(t.name); },   // voice writes refresh open tabs too
          onNavigate: (n) => {
            if (n?.section) {
              try {
                if (n.subsection) {
                  const act = { type: 'settings_section', id: n.subsection };
                  if (currentRoute().tab === n.section) emitBellaAction(act); else stashPending(act);
                }
                navigateTo(n.section);
              } catch { /* ignore */ }
            }
          },
          onUiAction: (a) => { try { emitBellaAction(a); } catch { /* ignore */ } },
          onApproval: () => { fireApprovalsChanged(); setPendingApprovals((n) => n + 1); },   // durable inbox + dock badge
          onError: (e) => { errored = e?.message || 'Something went wrong.'; },
        }
      );
      streamRef.current = stream;
      await stream.done;
    } catch (err) {
      // Interrupting her aborts the stream on purpose — that rejection is expected, not a
      // failure, so it must never surface as an error.
      if (err?.name !== 'AbortError') errored = err?.message || 'Connection lost.';
    } finally {
      streamRef.current = null;
    }
    if (!aliveRef.current) { run.stop(); return; }
    if (errored) {
      // interrupt() / the VAD barge-in stop the run BEFORE aborting the stream, so a
      // stopped run means Val cut her off deliberately — don't alarm him with a red toast
      // for his own interruption.
      const wasInterrupted = run.stopped;
      run.stop();
      if (!wasInterrupted) {
        // Voice must never fail SILENTLY (Val 2026-07-20): speak a short apology
        // out loud, not just a toast he can't hear. Speaking also resets the mic
        // idle timer, so voice won't auto-close right after the failure.
        toast('Bella: ' + errored, 'error');
        await speak('Sorry, something went wrong on my end. Could you try that again?');
      } else { setLine(''); setSt('listening'); }
      return;
    }
    // Flush whatever remains after the stream ended (choices tail is UI-only).
    const rest = speechBuf.replace(CHOICES_RX, '').trim();
    if (rest && !run.stopped) run.push(rest);
    run.finish();
    await run.done;
    // A3: if the whole turn produced NO speakable text (empty server turn or a
    // cut stream) and Val didn't interrupt, say a fallback — never revert to
    // Listening in silence.
    if (aliveRef.current && !run.stopped && !finalText.replace(CHOICES_RX, '').trim()) {
      await speak('Sorry — I didn’t catch that. Could you say it again?');
      return;
    }
    if (aliveRef.current && !run.stopped) { setLine(''); setSt('listening'); }
    } finally { setBellaBusy(false); }
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
      let bargeTentative = false;   // capturing during 'speaking', not yet committed
      let noiseFloor = 0.004;
      let lastActivity = performance.now();   // for the idle auto-off
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
        mediaRef.current.recorder = recorder;
      };
      const discardRec = () => {
        if (recorder) {
          try { recorder.ondataavailable = null; recorder.onstop = null; if (recorder.state !== 'inactive') recorder.stop(); } catch { /* ignore */ }
        }
        recorder = null;
        chunks = [];
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
        const listenTh = Math.max(0.012, noiseFloor * 2.2);
        // Stricter while she speaks: echo cancellation removes most of her own
        // voice from the mic, and this margin absorbs what's left.
        const bargeTh = Math.max(0.02, noiseFloor * 3.5);

        const st = stateRef.current;

        // Idle auto-off (Val 2026-07-04): 10s of silence while just listening
        // closes voice to save money. Any speech, her own turn (thinking/
        // speaking), or a mid-utterance resets the timer.
        if (st !== 'listening' || rms > listenTh || speechStart) lastActivity = now;
        if (st === 'listening' && !speechStart && now - lastActivity > VOICE_IDLE_MS) { onClose?.(); return; }

        if (st === 'listening') {
          if (rms > listenTh) {
            lastSpeech = now;
            if (!speechStart) { speechStart = now; startRec(); }
          }
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
          // Speak-to-interrupt (Val 2026-07-03, ChatGPT-style): first strong
          // frame starts a TENTATIVE capture and ducks her volume; only
          // sustained speech (BARGE_MS) commits the interrupt — a cough or a
          // short blip gets discarded and she carries on at full volume.
          if (rms > bargeTh) {
            lastSpeech = now;
            if (!speechStart) {
              speechStart = now;
              bargeTentative = true;
              startRec();
              if (audioRef.current) { try { audioRef.current.volume = 0.25; } catch { /* ignore */ } }
            }
          }
          if (speechStart && bargeTentative) {
            if (lastSpeech - speechStart >= BARGE_MS) {
              // Real speech — she stops; the running capture becomes the utterance.
              // Stop the whole speech QUEUE and abort the streaming turn — not just the
              // current audio element. Pausing alone (the old `stopAudioRef.current?.()`)
              // left playLoop running, so its next segment immediately re-set state to
              // 'speaking', stomping this 'listening' and deadlocking the capture (the
              // recorder-stop checks live only in the 'listening' branch) — she talked
              // straight over Val. run.stop() also pauses the current audio, and aborting
              // the stream stops us paying for a reply nobody will hear. Mirrors the
              // tap-to-interrupt path (`interrupt()`), which was always correct.
              bargeTentative = false;
              speechRunRef.current?.stop();
              try { streamRef.current?.abort(); } catch { /* ignore */ }
              setLine('');
              setSt('listening');
            } else if (now - lastSpeech > 450) {
              // Just a blip — drop it, restore her voice.
              speechStart = 0;
              bargeTentative = false;
              discardRec();
              if (audioRef.current) { try { audioRef.current.volume = 1; } catch { /* ignore */ } }
            }
          }
        } else {
          // thinking / starting / error: no capture should be in flight
          if (speechStart || bargeTentative) { speechStart = 0; bargeTentative = false; discardRec(); }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();
    return () => { if (raf) cancelAnimationFrame(raf); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tap the pill while she speaks = interrupt (voice barge-in also works —
  // just start talking; the VAD loop commits it after sustained speech).
  const interrupt = () => {
    if (stateRef.current === 'speaking') {
      speechRunRef.current?.stop();
      try { streamRef.current?.abort(); } catch { /* ignore */ }   // speech overlaps streaming now
      setLine('');
      setSt('listening');
    }
  };

  const STATE_TEXT = {
    starting: 'Waking Bella up…',
    listening: 'Listening — just talk',
    thinking: 'Thinking…',
    speaking: 'Speaking — talk or tap to interrupt',
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

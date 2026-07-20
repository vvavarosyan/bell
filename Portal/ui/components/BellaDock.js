// Bella — header dock (Phase G1 + voice in G4). Sits in the CENTER of the
// page header on every page: the Bella orb + Chat + Voice. Chat drops the
// BellaChat panel from the header; Voice edge-glows the whole portal while
// she listens and speaks (BellaVoice). Both can run together — they share
// the same conversation server-side.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { toast } from '../lib/toast.js';
import { api } from '../lib/api.js';
import { BellaChat } from './BellaChat.js';
import { usePendingApprovalCount } from './BellaApprovals.js';
import { BellaVoice } from './BellaVoice.js';
import { BELLA_OPEN_EVENT, BELLA_BUSY_EVENT } from '../lib/bellaBus.js';

export function BellaDock() {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState(false);
  const [working, setWorking] = useState(false);   // orb pulses while a turn runs
  const pendingApprovals = usePendingApprovalCount();   // badge: approvals waiting anywhere

  // "Bella does it for me" (onboarding) opens the chat with a seeded task.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(BELLA_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(BELLA_OPEN_EVENT, onOpen);
  }, []);

  // Reflect Bella's "working" state on the orb so the user sees she's busy even
  // when the panel is closed (Val 2026-07-20).
  useEffect(() => {
    const onBusy = (e) => setWorking(!!e?.detail?.busy);
    window.addEventListener(BELLA_BUSY_EVENT, onBusy);
    return () => window.removeEventListener(BELLA_BUSY_EVENT, onBusy);
  }, []);

  const toggleVoice = async () => {
    if (voice) { setVoice(false); return; }
    try {
      const s = await api.bellaVoiceStatus();
      if (!s.configured) {
        toast('Voice isn\'t set up on this deployment yet (ElevenLabs key).', 'error');
        return;
      }
      setVoice(true);
    } catch { toast('Couldn\'t start voice — try again.', 'error'); }
  };

  return html`
    <div class="bella-dock">
      <button class=${'bella-orb' + (open || voice ? ' open' : '') + (working ? ' working' : '')} title=${working ? 'Bella is working…' : (pendingApprovals ? pendingApprovals + ' Bella action(s) waiting for your approval — click to review' : 'Bella — your Bell assistant')} onClick=${() => setOpen((o) => !o)} style=${{ position: 'relative' }}>
        <span class="bella-orb-core"></span>
        ${pendingApprovals ? html`<span style=${{ position: 'absolute', top: '-4px', right: '-6px', minWidth: '15px', height: '15px', borderRadius: '999px', background: 'var(--amber, #f59e0b)', color: '#111', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>${pendingApprovals}</span>` : null}
      </button>
      <button class=${'bella-dock-btn' + (open ? ' active' : '')} onClick=${() => setOpen((o) => !o)}>
        ${open ? 'Close' : 'Chat'}
      </button>
      <button class=${'bella-dock-btn' + (voice ? ' active' : '')} title="Talk with Bella" onClick=${toggleVoice}>
        ${voice ? 'End voice' : 'Voice'}
      </button>
      ${open ? html`<${BellaChat} onClose=${() => setOpen(false)} />` : null}
      ${voice ? html`<${BellaVoice} onClose=${() => setVoice(false)} onOpenChat=${() => setOpen(true)} />` : null}
    </div>`;
}

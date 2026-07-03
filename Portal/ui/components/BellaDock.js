// Bella — header dock (Phase G1 + voice in G4). Sits in the CENTER of the
// page header on every page: the Bella orb + Chat + Voice. Chat drops the
// BellaChat panel from the header; Voice edge-glows the whole portal while
// she listens and speaks (BellaVoice). Both can run together — they share
// the same conversation server-side.

import { useState } from 'react';
import { html } from '../lib/html.js';
import { toast } from '../lib/toast.js';
import { api } from '../lib/api.js';
import { BellaChat } from './BellaChat.js';
import { BellaVoice } from './BellaVoice.js';

export function BellaDock() {
  const [open, setOpen] = useState(false);
  const [voice, setVoice] = useState(false);

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
      <button class=${'bella-orb' + (open || voice ? ' open' : '')} title="Bella — your Bell assistant" onClick=${() => setOpen((o) => !o)}>
        <span class="bella-orb-core"></span>
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

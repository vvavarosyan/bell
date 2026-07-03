// Bella — header dock (Phase G1). Sits in the CENTER of the page header on
// every page: the Bella orb + Chat + Voice buttons. Chat drops the BellaChat
// panel down from the header (always on top). Voice ships in Phase G4
// (ElevenLabs) — until then the button says so honestly instead of doing
// nothing (no decorative controls — house rule).

import { useState } from 'react';
import { html } from '../lib/html.js';
import { toast } from '../lib/toast.js';
import { BellaChat } from './BellaChat.js';

export function BellaDock() {
  const [open, setOpen] = useState(false);

  return html`
    <div class="bella-dock">
      <button class=${'bella-orb' + (open ? ' open' : '')} title="Bella — your Bell assistant" onClick=${() => setOpen((o) => !o)}>
        <span class="bella-orb-core"></span>
      </button>
      <button class=${'bella-dock-btn' + (open ? ' active' : '')} onClick=${() => setOpen((o) => !o)}>
        ${open ? 'Close' : 'Chat'}
      </button>
      <button class="bella-dock-btn" title="Voice arrives with Bella's voice upgrade (ElevenLabs)"
        onClick=${() => toast('Bella voice is coming soon — chat is live now.', 'success')}>
        Voice
      </button>
      ${open ? html`<${BellaChat} onClose=${() => setOpen(false)} />` : null}
    </div>`;
}

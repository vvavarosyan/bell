// Placeholder for nav items that aren't built yet.

import { html } from '../lib/html.js';

export function ComingSoon({ label }) {
  return html`
    <div class="coming-soon">
      <div class="cs-mark">◇</div>
      <h2>${label}</h2>
      <p class="muted">This module is on the build queue. We'll wire it in after the core enrichment + assembly phases are validated.</p>
    </div>
  `;
}

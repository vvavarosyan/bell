// Local Engines — TEMPORARY minimal diagnostic build. If this renders, the
// problem was in the full dashboard's markup and I rebuild it cleanly. If this
// is ALSO blank, the problem is upstream (routing/app/cache), not this view.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

export function EngineTab() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    (async () => {
      try { setS(await api.enrichmentEngineStatus()); }
      catch (e) { setErr(String((e && e.message) || e)); }
    })();
  }, []);

  return html`
    <div style=${{ padding: '24px', maxWidth: '760px' }}>
      <h2 style=${{ marginTop: 0 }}>Local Engines</h2>
      <p style=${{ color: 'var(--text-muted)', fontSize: '13px' }}>
        If you can read this line, the page renders fine and we've found the culprit.
        The live engine status is below.
      </p>
      ${err ? html`<div style=${{ color: 'var(--red, #e5534b)' }}>Status request failed: ${err}</div>` : null}
      <pre style=${{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px' }}>${s ? JSON.stringify(s, null, 2) : (err ? '(failed)' : 'loading…')}</pre>
    </div>`;
}

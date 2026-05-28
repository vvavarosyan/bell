import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

// Sync to Bell.qa — push the assembled canonical dataset (companies, people,
// jobs + their links/sources) from this local engine up to the production
// database that powers app.bell.qa.
//
//   • Push now      → incremental: only rows changed since the last push.
//   • Full resync   → everything, regardless of the last-push watermark.
//
// Deletions are soft: archiving a record locally hides it on the app; prod rows
// are never hard-deleted by a sync.

const TABLE_LABELS = {
  companies:        'Companies',
  people:           'People',
  jobs:             'Jobs',
  company_sources:  'Company sources',
  person_companies: 'Employment links',
};

function fmtWhen(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString();
}

export function SyncTab() {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(null);   // 'incremental' | 'full' | null
  const [result, setResult]   = useState(null);
  const [tokenDraft, setTokenDraft] = useState('');
  const [urlDraft, setUrlDraft]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await api.syncStatus();
      setStatus(s);
      setUrlDraft(s.target || '');
    } catch (err) {
      toast('Could not load sync status: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveToken = async () => {
    const v = tokenDraft.trim();
    if (!v) return;
    try {
      await api.setApiKey('sync-token', v);
      setTokenDraft('');
      toast('Sync token saved to Keychain');
      load();
    } catch (err) { toast('Save failed: ' + err.message, 'error'); }
  };

  const saveUrl = async () => {
    const v = urlDraft.trim().replace(/\/+$/, '');
    if (!v) return;
    try {
      await api.updateSettings({ sync_target_url: v });
      toast('Target URL saved');
      load();
    } catch (err) { toast('Save failed: ' + err.message, 'error'); }
  };

  const runSync = async (full) => {
    setRunning(full ? 'full' : 'incremental');
    setResult(null);
    try {
      const summary = full ? await api.syncFullResync() : await api.syncPush();
      setResult(summary);
      const n = summary.total_upserted ?? 0;
      toast(`Sync complete — ${n.toLocaleString()} record${n === 1 ? '' : 's'} pushed to Bell.qa`);
      load();
    } catch (err) {
      toast('Sync failed: ' + err.message, 'error');
    } finally {
      setRunning(null);
    }
  };

  if (loading) return html`<div class="settings-shell"><div class="empty">Loading sync status…</div></div>`;

  const s = status || {};
  const pending = s.pending || {};
  const pendingTotal = Object.values(pending).reduce((a, b) => a + (b || 0), 0);
  const ready = s.token_configured;

  return html`
    <div class="settings-shell">
      <div class="settings-body">

        <div class="card">
          <h2>Sync to Bell.qa</h2>
          <div class="hint">
            Push the assembled canonical dataset from this Mac up to the production
            database behind <code>app.bell.qa</code>. Records upsert on their stable
            BIN / PIN / JIN, so re-running is always safe. Archived records are hidden
            on the app, never hard-deleted.
          </div>

          <div class="row">
            <label>Last successful push</label>
            <div class="actions" style=${{flex:1}}>
              <span>${fmtWhen(s.last_sync_at)}</span>
            </div>
          </div>

          <div class="row">
            <label>Pending changes</label>
            <div class="actions" style=${{flex:1, flexDirection:'column', alignItems:'flex-start', gap:'2px'}}>
              <span>${pendingTotal.toLocaleString()} record${pendingTotal === 1 ? '' : 's'} changed since last push</span>
              <span class="muted small">
                ${Object.entries(TABLE_LABELS).map(([k, lbl]) =>
                  `${lbl}: ${(pending[k] || 0).toLocaleString()}`).join('  ·  ')}
              </span>
            </div>
          </div>

          <div class="row">
            <label>Actions</label>
            <div class="actions" style=${{flex:1}}>
              <button
                onClick=${() => runSync(false)}
                disabled=${!ready || running !== null}
              >${running === 'incremental' ? 'Pushing…' : 'Push now'}</button>
              <button
                class="secondary"
                onClick=${() => { if (confirm('Full resync sends every assembled record to Bell.qa. Continue?')) runSync(true); }}
                disabled=${!ready || running !== null}
              >${running === 'full' ? 'Resyncing…' : 'Full resync'}</button>
              ${!ready ? html`<span class="muted small">Configure the sync token below first.</span>` : null}
            </div>
          </div>
        </div>

        ${result ? html`
          <div class="card">
            <h2>Last run</h2>
            <div class="hint">
              ${result.mode === 'full' ? 'Full resync' : 'Incremental push'} ·
              ${result.total_upserted?.toLocaleString() || 0} upserted ·
              ${result.total_skipped?.toLocaleString() || 0} skipped
            </div>
            ${Object.entries(result.tables || {}).map(([k, v]) => html`
              <div class="row" key=${k}>
                <label>${TABLE_LABELS[k] || k}</label>
                <div class="actions" style=${{flex:1}}>
                  <span class="muted small">
                    ${v.selected} selected · ${v.upserted} upserted${v.skipped ? ` · ${v.skipped} skipped` : ''}
                  </span>
                </div>
              </div>
            `)}
            ${(result.errors && result.errors.length) ? html`
              <div class="hint" style=${{marginTop:'8px', color:'var(--danger, #c0392b)'}}>
                ${result.errors.length} row error${result.errors.length === 1 ? '' : 's'} (first few):
                <ul style=${{margin:'4px 0 0', paddingLeft:'18px'}}>
                  ${result.errors.slice(0, 8).map((e, i) => html`
                    <li key=${i} class="small"><code>${e.table}/${e.key || e.index}</code>: ${e.error}</li>
                  `)}
                </ul>
              </div>
            ` : null}
          </div>
        ` : null}

        <div class="card">
          <h2>Configuration</h2>
          <div class="hint">
            The sync token is a shared secret. Set the SAME value here (stored in your
            macOS Keychain) and as the <code>BDI_SYNC_TOKEN</code> environment variable
            on the Bell.qa <code>portal</code> service in Railway.
          </div>

          <div class="row">
            <label>Sync token</label>
            <input
              type="password"
              placeholder=${ready ? '••••••••  (currently stored)' : 'Paste shared secret…'}
              value=${tokenDraft}
              onChange=${e => setTokenDraft(e.target.value)}
              onKeyDown=${e => { if (e.key === 'Enter') saveToken(); }}
            />
            <span class=${'key-status ' + (ready ? 'set' : '')}>${ready ? '✓ stored' : 'not set'}</span>
            <div class="actions">
              <button onClick=${saveToken} disabled=${!tokenDraft.trim()}>${ready ? 'Replace' : 'Save'}</button>
            </div>
          </div>

          <div class="row">
            <label>Target URL</label>
            <input
              type="text"
              placeholder="https://app.bell.qa"
              value=${urlDraft}
              onChange=${e => setUrlDraft(e.target.value)}
              onBlur=${saveUrl}
            />
            <span class="muted small">Bell.qa production base URL.</span>
          </div>
        </div>

      </div>
    </div>
  `;
}

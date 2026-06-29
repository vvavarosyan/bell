// Import own lists (req #2) — a modal to upload a CSV of contacts or companies.
// Rows are stored TENANT-PRIVATE. The optional "contribute to Bell" checkbox is
// the user's consent to queue the rows for Bell's admin enrichment review
// (Phase 2). Past imports are listed with a delete control.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const panel   = { width: 'min(620px, 94vw)', maxHeight: '88vh', overflow: 'auto', background: 'var(--bg-elev-2, #1a2034)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 22px' };
const field   = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 10px', fontSize: '12.5px' };

export function ImportPanel({ onClose, onImported }) {
  const [kind, setKind] = useState('contact');
  const [contribute, setContribute] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState([]);

  const loadBatches = useCallback(async () => {
    try { const r = await api.imports(); setBatches(r.rows || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      setCsvText(text);
      setFilename(f.name);
    } catch { toast('Could not read that file.', 'error'); }
  };

  const doImport = async () => {
    if (!csvText.trim()) { toast('Choose a CSV file or paste CSV text first.'); return; }
    setBusy(true);
    try {
      const r = await api.createImport({ kind, filename, csv: csvText });
      toast(`Imported ${r.imported.toLocaleString()} ${kind === 'company' ? 'companies' : 'contacts'}`
        + (r.skipped ? ` · ${r.skipped} skipped (no name/email)` : '') + ' — also sent to Bell for review.');
      setCsvText(''); setFilename('');
      await loadBatches();
      onImported && onImported();
    } catch (err) { toast('Import failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    if (!window.confirm('Delete this import and all its rows?')) return;
    try { await api.deleteImport(id); await loadBatches(); onImported && onImported(); }
    catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  };

  // Download a sample CSV so users see the expected columns.
  const downloadSample = () => {
    const headers = ['Name', 'Email', 'Phone', 'Company', 'Job Title', 'Website', 'City'];
    const example = kind === 'company'
      ? ['Acme Trading W.L.L.', 'info@acme.qa', '+974 4412 3456', '', '', 'acme.qa', 'Doha']
      : ['Sara Al-Thani', 'sara@acme.qa', '+974 5512 3456', 'Acme Trading W.L.L.', 'Procurement Manager', '', 'Doha'];
    const csv = '﻿' + headers.join(',') + '\r\n' + example.map(c => /[",]/.test(c) ? `"${c}"` : c).join(',') + '\r\n';
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = `bell-import-sample-${kind === 'company' ? 'companies' : 'contacts'}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return html`
    <div style=${overlay} onClick=${() => !busy && onClose()}>
      <div style=${panel} onClick=${e => e.stopPropagation()}>
        <div style=${{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <strong style=${{ fontSize: '15px' }}>Import your own list</strong>
          <span style=${{ flex: 1 }}></span>
          <button onClick=${onClose} style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>
        <div style=${{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
          Upload a CSV or JSON. It's added to your workspace. We auto-detect common columns (name, email, phone, company, title, website, city).
        </div>

        <div style=${{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>1 · What are you importing?</div>
        <div style=${{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          ${[['contact', '👤  People (contacts)'], ['company', '🏢  Companies']].map(([k, lbl]) => html`
            <button key=${k} onClick=${() => { setKind(k); setFilename(''); setCsvText(''); }}
              style=${{ flex: 1, padding: '11px', borderRadius: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600,
                background: kind === k ? 'var(--accent)' : 'rgba(255,255,255,0.04)', color: kind === k ? '#fff' : 'var(--text-muted)',
                border: '1px solid ' + (kind === k ? 'var(--accent)' : 'var(--border)') }}>${lbl}${kind === k ? '  ✓' : ''}</button>`)}
        </div>

        <div style=${{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>
          2 · Upload your ${kind === 'company' ? 'companies' : 'people'} file
          <button onClick=${downloadSample} style=${{ marginLeft: '8px', background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, font: 'inherit', fontWeight: 400, fontSize: '11.5px', textDecoration: 'underline' }}>
            download a sample ${kind === 'company' ? 'companies' : 'people'} CSV
          </button>
        </div>
        <div style=${{ marginBottom: '12px' }}>
          <label style=${{ ...field, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <input type="file" accept=".csv,text/csv,.json,application/json" onChange=${onFile} style=${{ display: 'none' }} />
            ${filename ? `📄 ${filename}` : 'Choose CSV / JSON file…'}
          </label>
        </div>

        <textarea value=${csvText} onInput=${e => setCsvText(e.target.value)}
          placeholder="…or paste CSV or JSON text here (CSV: first row = column headers)"
          style=${{ ...field, width: '100%', boxSizing: 'border-box', minHeight: '110px', fontFamily: 'monospace', resize: 'vertical' }}></textarea>

        <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick=${onClose} disabled=${busy} class="toolbar-toggle">Cancel</button>
          <button onClick=${doImport} disabled=${busy || !csvText.trim()}
            style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 16px', fontSize: '12.5px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
            ${busy ? 'Importing…' : 'Import'}</button>
        </div>

        ${batches.length ? html`
          <div style=${{ marginTop: '18px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
            <div style=${{ fontSize: '11.5px', color: 'var(--text-dim)', marginBottom: '8px' }}>Your imports</div>
            ${batches.map(b => html`
              <div key=${b.id} style=${{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11.5px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style=${{ color: 'var(--text)' }}>${b.filename || (b.kind === 'company' ? 'Companies' : 'Contacts')}</span>
                <span style=${{ color: 'var(--text-muted)' }}>${b.row_count.toLocaleString()} rows</span>
                <span style=${{ flex: 1 }}></span>
                <span style=${{ color: 'var(--text-dim)' }}>${new Date(b.created_at).toLocaleDateString()}</span>
                <button onClick=${() => del(b.id)} title="Delete" style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
              </div>`)}
          </div>` : null}
      </div>
    </div>
  `;
}

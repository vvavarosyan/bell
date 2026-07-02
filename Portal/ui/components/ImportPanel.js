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
  const [csvText, setCsvText] = useState('');         // textarea preview / pasted text
  const [payload, setPayload] = useState(null);       // full data to send when it differs from the preview (e.g. a big xlsx)
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [batches, setBatches] = useState([]);
  const [step, setStep] = useState('form');        // 'form' | 'review'
  const [preview, setPreview] = useState(null);     // preview response when confirming matches
  const [decisions, setDecisions] = useState({});   // review row index -> 'accept' | 'reject'

  const loadBatches = useCallback(async () => {
    try { const r = await api.imports(); setBatches(r.rows || []); } catch { /* ignore */ }
  }, []);
  useEffect(() => { loadBatches(); }, [loadBatches]);

  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      if (/\.(xlsx|xls)$/i.test(f.name)) {
        // Parse Excel in the browser → CSV text. SheetJS reads cell strings as
        // UTF-8, so Arabic names survive (no Windows-1252 / BOM corruption that
        // plagues raw-CSV exports). The CSV then flows through the exact same
        // upload + server parse path as a plain CSV. SheetJS is lazy-loaded from
        // its ESM CDN (pinned in the import map) only when an Excel file is picked.
        const mod = await import('xlsx');
        const XLSX = mod.read ? mod : (mod.default || mod);
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) { toast('That workbook has no sheets.', 'error'); return; }
        const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
        if (!csv.trim()) { toast('That sheet looks empty.', 'error'); return; }
        setPayload(csv);
        // Keep the on-screen preview light for big files; the FULL csv is still sent.
        const lines = csv.split('\n');
        setCsvText(lines.length > 200
          ? lines.slice(0, 200).join('\n') + `\n…  (+${(lines.length - 200).toLocaleString()} more rows — all will be imported)`
          : csv);
        setFilename(f.name);
      } else {
        const text = await f.text();
        setPayload(null);
        setCsvText(text);
        setFilename(f.name);
      }
    } catch (err) { toast('Could not read that file: ' + (err.message || err), 'error'); }
  };

  const resetForm = () => { setCsvText(''); setPayload(null); setFilename(''); setStep('form'); setPreview(null); setDecisions({}); };

  // Build the commit payload from a preview + the user's accept/reject choices,
  // send it, and reset. Matched + accepted-review rows LINK to the Bell record;
  // everything else is created as a new record.
  const commitAll = async (pv, dec) => {
    const isCompany = pv.kind === 'company';
    const rows = pv.rows.map((r) => {
      const accept = r.status === 'matched' || (r.status === 'review' && (dec[r.i] ?? 'accept') === 'accept');
      return accept && r.candidate
        ? { mapped: r.mapped, action: 'link', entity_type: isCompany ? 'company' : 'person', entity_id: r.candidate.id, match_status: r.status, match_confidence: r.confidence }
        : { mapped: r.mapped, action: 'new' };
    });
    const res = await api.commitImport({ kind: pv.kind, filename, rows });
    const skippedNote = res.skipped ? ` · ${res.skipped} skipped (couldn’t be saved)` : '';
    toast(`Imported ${res.total.toLocaleString()} ${isCompany ? 'companies' : 'contacts'} · ${res.linked} linked to Bell, ${res.created} new${skippedNote} — sent to Bell for review.`);
    resetForm(); await loadBatches(); onImported && onImported();
  };

  const doImport = async () => {
    const data = (payload != null ? payload : csvText);
    if (!data.trim()) { toast('Choose a CSV / Excel file or paste CSV text first.'); return; }
    setBusy(true);
    try {
      const pv = await api.previewImport({ kind, csv: data });
      if (pv.truncated) {
        // Large file → import directly (the matched-review step is for files up to the preview cap).
        const r = await api.createImport({ kind, filename, csv: data });
        toast(`Imported ${r.imported.toLocaleString()} ${kind === 'company' ? 'companies' : 'contacts'} (large file — added directly).`);
        resetForm(); await loadBatches(); onImported && onImported();
        return;
      }
      if ((pv.summary.review || 0) > 0) { setPreview(pv); setDecisions({}); setStep('review'); }
      else { await commitAll(pv, {}); }   // nothing to confirm → commit straight away
    } catch (err) { toast('Import failed: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };

  const finishReview = async () => {
    setBusy(true);
    try { await commitAll(preview, decisions); }
    catch (err) { toast('Import failed: ' + err.message, 'error'); }
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

  // ---- Step 2: conservative "confirm matches" review (only when there are
  // uncertain matches). All hooks above run first, so this early return is safe. ----
  if (step === 'review' && preview) {
    const reviewRows = preview.rows.filter((r) => r.status === 'review');
    const s = preview.summary;
    const isCompany = preview.kind === 'company';
    return html`
      <div style=${overlay} onClick=${() => !busy && onClose()}>
        <div style=${panel} onClick=${e => e.stopPropagation()}>
          <div style=${{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
            <strong style=${{ fontSize: '15px' }}>Confirm matches</strong>
            <span style=${{ flex: 1 }}></span>
            <button onClick=${onClose} style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
          </div>
          <div style=${{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
            ${s.matched || 0} will auto-link to Bell · <strong style=${{ color: 'var(--text)' }}>${reviewRows.length} need your confirmation</strong> · ${s.new || 0} will be added as new.
            Uncheck any row that isn't the same ${isCompany ? 'company' : 'person'}.
          </div>
          <div style=${{ maxHeight: '46vh', overflow: 'auto', marginBottom: '14px' }}>
            ${reviewRows.map((r) => {
              const accept = (decisions[r.i] ?? 'accept') === 'accept';
              return html`
                <div key=${r.i} style=${{ border: '1px solid var(--border)', borderRadius: '8px', padding: '10px', marginBottom: '8px', background: 'rgba(255,255,255,0.02)' }}>
                  <div style=${{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <label style=${{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '11.5px', whiteSpace: 'nowrap', color: accept ? 'var(--accent)' : 'var(--text-dim)' }}>
                      <input type="checkbox" checked=${accept} onChange=${e => setDecisions(d => ({ ...d, [r.i]: e.target.checked ? 'accept' : 'reject' }))} />
                      ${accept ? 'Link' : 'Keep separate'}
                    </label>
                    <div style=${{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '11.5px' }}>
                      <div>
                        <div style=${{ color: 'var(--text-dim)', marginBottom: '2px' }}>Your row</div>
                        <div style=${{ color: 'var(--text)' }}>${r.mapped.name || r.mapped.company_name || '—'}</div>
                        <div style=${{ color: 'var(--text-muted)' }}>${[r.mapped.email, r.mapped.website, r.mapped.city].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div>
                        <div style=${{ color: 'var(--text-dim)', marginBottom: '2px' }}>Bell record · ${Math.round((r.confidence || 0) * 100)}% match</div>
                        <div style=${{ color: 'var(--text)' }}>${r.candidate?.name || '—'}</div>
                        <div style=${{ color: 'var(--text-muted)' }}>${[r.candidate?.email, r.candidate?.website, r.candidate?.city].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  </div>
                </div>`;
            })}
          </div>
          <div style=${{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <button onClick=${() => setStep('form')} disabled=${busy} class="toolbar-toggle">← Back</button>
            <button onClick=${finishReview} disabled=${busy}
              style=${{ background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 16px', fontSize: '12.5px', fontWeight: 600, cursor: busy ? 'wait' : 'pointer' }}>
              ${busy ? 'Importing…' : 'Finish import'}</button>
          </div>
        </div>
      </div>`;
  }

  return html`
    <div style=${overlay} onClick=${() => !busy && onClose()}>
      <div style=${panel} onClick=${e => e.stopPropagation()}>
        <div style=${{ display: 'flex', alignItems: 'center', marginBottom: '4px' }}>
          <strong style=${{ fontSize: '15px' }}>Import your own list</strong>
          <span style=${{ flex: 1 }}></span>
          <button onClick=${onClose} style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '18px' }}>✕</button>
        </div>
        <div style=${{ fontSize: '11.5px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
          Upload a CSV, Excel (.xlsx) or JSON. It's added to your workspace. We auto-detect common columns (name, email, phone, company, title, website, city).
        </div>

        <div style=${{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>1 · What are you importing?</div>
        <div style=${{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          ${[['contact', '👤  People (contacts)'], ['company', '🏢  Companies']].map(([k, lbl]) => html`
            <button key=${k} onClick=${() => { setKind(k); setFilename(''); setCsvText(''); setPayload(null); }}
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
            <input type="file" accept=".csv,text/csv,.json,application/json,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange=${onFile} style=${{ display: 'none' }} />
            ${filename ? `📄 ${filename}` : 'Choose CSV / Excel / JSON file…'}
          </label>
        </div>

        <textarea value=${csvText} onInput=${e => { setCsvText(e.target.value); setPayload(null); }}
          placeholder="…or paste CSV or JSON text here (CSV: first row = column headers)"
          style=${{ ...field, width: '100%', boxSizing: 'border-box', minHeight: '110px', fontFamily: 'monospace', resize: 'vertical' }}></textarea>

        <div style=${{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick=${onClose} disabled=${busy} class="toolbar-toggle">Cancel</button>
          <button onClick=${doImport} disabled=${busy || !((payload != null ? payload : csvText).trim())}
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

// People dedup review — pending "same name + shared employer" pairs awaiting an
// admin decision. Side-by-side so you can tell two same-named people apart by
// their source, specialty, license, and employers before merging.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

function Side({ person, label }) {
  if (!person) return html`<div class="dedup-side empty">no person</div>`;
  const rows = [
    ['PIN',        person.pin],
    ['Name',       person.full_name],
    ['Source',     person.source || (person.linkedin_url ? 'LinkedIn' : '—')],
    ['Headline',   person.headline],
    ['Specialty',  person.scope],
    ['License',    person.license],
    ['Email',      person.email],
    ['LinkedIn',   person.linkedin_url],
    ['Employers',  (person.companies || []).join(' · ')],
  ];
  return html`
    <div class="dedup-side">
      <div class="dedup-side-label">${label}</div>
      <table class="dedup-side-table">
        ${rows.map(([k, v]) => html`<tr key=${k}><th>${k}</th><td>${v || html`<span class="muted">—</span>`}</td></tr>`)}
      </table>
    </div>`;
}

export function PeopleReviewList() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.peopleDedupQueue(200); setRows(r.rows || []); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, action) => {
    setDeciding(prev => new Set(prev).add(id));
    try {
      await api.peopleDedupDecide(id, action);
      toast(action === 'keep_separate' ? 'Kept separate' : 'Merged');
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) { toast('Decision failed: ' + err.message, 'error'); }
    finally { setDeciding(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  if (loading) return html`<div class="dedup-list-empty">Loading people queue…</div>`;
  if (rows.length === 0) return html`
    <div class="dedup-list-empty">
      No people pending review.<br/>
      <span class="muted small">Same-name + same-employer pairs appear here after <strong>Run Assembly</strong>.</span>
    </div>`;

  return html`
    <div class="dedup-listing">
      <div class="muted small" style=${{ padding: '8px 4px' }}>
        ${rows.length.toLocaleString()} pending — these share a name and an employer. Merge only if they're the same person.
      </div>
      ${rows.map(r => {
        const busy = deciding.has(r.id);
        const a = r.person_a || {}, b = r.person_b || {};
        return html`
          <div class="dedup-line open" key=${r.id}>
            <div class="dedup-line-body">
              <div class="dedup-pair-body">
                <${Side} person=${a} label="Person A" />
                <${Side} person=${b} label="Person B" />
              </div>
              <div class="dedup-pair-actions">
                <button disabled=${busy} onClick=${() => decide(r.id, 'merge_b_to_a')} title="Keep A, merge B into it">← Merge B into A</button>
                <button disabled=${busy} onClick=${() => decide(r.id, 'merge_a_to_b')} title="Keep B, merge A into it">Merge A into B →</button>
                <span class="spacer"></span>
                <button class="ghost" disabled=${busy} onClick=${() => decide(r.id, 'keep_separate')} title="Different people">Keep separate</button>
              </div>
            </div>
          </div>`;
      })}
    </div>`;
}

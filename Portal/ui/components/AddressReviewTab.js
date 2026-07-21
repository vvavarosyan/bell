// Address Review (local engine only, admin).
//
// Bell can classify most company mailboxes on its own: info@x.qa is a company inbox,
// ahmed.hassan@x.qa is a person. The ones left over are genuinely ambiguous — a bare word
// like haris@ or alwaab@ could be either — and getting it wrong in the sendable direction
// means cold-emailing a real person (PDPPL). So they come here with whatever proof Bell
// holds, and Val decides.
//
// The rule that shapes this screen: NO automatic rule may promote an address to "company
// inbox". None survived adversarial review. Every sendable verdict is a human click.
//
// Rule 2.6: all hooks precede any early return.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const BUCKETS = [
  { key: 'suggested', label: 'Needs your decision',
    blurb: 'Bell found real evidence and suggests an answer — check the proof and confirm, or override it.' },
  { key: 'auto', label: 'Bell decided these',
    blurb: 'Rules that survived adversarial review. Shown so you can see exactly what was written and undo any of it.' },
  { key: 'undecidable', label: 'Nothing settles these',
    blurb: 'Bell holds no evidence either way. They stay OUT of outreach, which is the safe default — you can still label any of them.' },
];

const VERDICT_LABEL = {
  role_mailbox: 'Company inbox',
  named_person: 'A person',
  not_a_company_address: "Not this company's",
  left_unresolved: 'Leave undecided',
};

// Which rules may be accepted in bulk. role_mailbox is deliberately absent: it is the verdict
// that ENABLES cold email, so it is always one row at a time.
const BULK_OK = { P1: 'named_person', P2: 'named_person', P5: 'not_a_company_address' };
const RULE_NAME = {
  A1: 'person linked to this company', A3: 'placeholder website domain',
  P1: 'a given name in Bell\'s registry people', P2: 'person vs. family trade name',
  P3: 'department word + this company', P4: 'the company\'s whole name on its own domain',
  P5: 'shared across several companies',
};

export function AddressReviewTab() {
  const [bucket, setBucket] = useState('suggested');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const loadSummary = useCallback(async () => {
    try { setSummary(await api.addrSummary()); } catch { /* non-fatal */ }
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const r = await api.addrQueue(bucket, 150);
      setRows(r.rows || []); setTotal(r.total || 0);
    } catch (err) { if (!silent) toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [bucket]);

  useEffect(() => { load(); loadSummary(); }, [load, loadSummary]);

  const decide = async (row, verdict) => {
    setBusy(row.email);
    try {
      await api.addrDecide({ email: row.email, verdict, suggested: row.suggested, rule_id: row.rule_id, evidence: row.evidence });
      setRows((rs) => rs.filter((x) => x.email !== row.email));
      setTotal((t) => Math.max(0, t - 1));
      loadSummary();
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusy(''); }
  };

  const acceptRule = async (ruleId, verdict, n) => {
    setBusy('rule:' + ruleId);
    try {
      const r = await api.addrDecideRule(ruleId, verdict);
      toast(`${r.decided} addresses marked "${VERDICT_LABEL[verdict]}".`, 'success');
      await Promise.all([load({ silent: true }), loadSummary()]);
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusy(''); }
  };

  const runAuto = async () => {
    setBusy('auto');
    try {
      const r = await api.addrAutoRun(true);
      toast(`${r.written} decided automatically.`, 'success');
      await Promise.all([load({ silent: true }), loadSummary()]);
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusy(''); }
  };

  const undo = async (row) => {
    setBusy(row.email);
    try {
      await api.addrUndo(row.email);
      setRows((rs) => rs.filter((x) => x.email !== row.email));
      loadSummary();
      toast('Put back in the queue.');
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusy(''); }
  };

  // Evidence chips — the literal proof, never a bare verdict. P4 in particular MUST show the
  // website: greensquare@greensquare.com looks perfect until you see the site is a Copenhagen
  // antiques showroom.
  const chips = (r) => {
    const e = r.evidence || {};
    const out = [];
    if (e.person) out.push(`Bell holds a person here: ${e.person}`);
    if (e.token) out.push(`matched name word: "${e.token}"`);
    if (e.given_name) out.push(`"${e.given_name}" is a given name in ${e.people_with_this_name} registry people`);
    if (e.role_word) out.push(`department word "${e.role_word}" + "${e.anchor}"`);
    if (e.company_count) out.push(`held against ${e.company_count} different companies`);
    if (e.companies && typeof e.companies === 'string') out.push(e.companies);
    if (e.domain && !e.role_word) out.push(`domain: ${e.domain}`);
    if (e.consumer_domain) out.push('personal mail provider — cannot be tied to a company');
    return out;
  };

  const info = BUCKETS.find((b) => b.key === bucket);
  // Rules present in the current view that can be accepted wholesale.
  const rulesHere = [...new Set(rows.map((r) => r.rule_id).filter((x) => x && BULK_OK[x]))]
    .map((id) => ({ id, verdict: BULK_OK[id], n: rows.filter((r) => r.rule_id === id).length }));

  return html`
    <div style=${{ padding: '0 4px' }}>
      <div class="grid-toolbar" style=${{ gap: '6px', flexWrap: 'wrap' }}>
        ${BUCKETS.map((b) => html`
          <button key=${b.key} class=${'toolbar-toggle' + (bucket === b.key ? ' accent' : '')}
            onClick=${() => setBucket(b.key)} style=${{ whiteSpace: 'nowrap' }}>
            ${b.label}${summary ? ` · ${Number(b.key === 'suggested' ? summary.proposals : b.key === 'auto' ? summary.auto_pending : summary.undecidable).toLocaleString()}` : ''}
          </button>`)}
        <span style=${{ flex: 1 }}></span>
        ${summary?.decided_total ? html`<span class="muted small">${Number(summary.decided_total).toLocaleString()} already decided</span>` : null}
        <button onClick=${() => { load(); loadSummary(); }}>Refresh</button>
      </div>
      <div class="muted small" style=${{ margin: '8px 4px 12px' }}>${info?.blurb}</div>

      ${bucket === 'auto' && rows.length ? html`
        <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', margin: '0 0 12px' }}>
          <div style=${{ fontWeight: 700, fontSize: '13px' }}>Apply Bell's own decisions</div>
          <div class="muted small" style=${{ margin: '2px 0 8px' }}>
            Writes the ${rows.length} verdicts below. None of them makes an address emailable —
            they only mark people and junk, which is the safe direction. Reversible per row.
          </div>
          <button class="btn btn-sm btn-primary" disabled=${busy === 'auto'} onClick=${runAuto}>
            ${busy === 'auto' ? 'Applying…' : `Apply all ${rows.length}`}
          </button>
        </div>` : null}

      ${bucket === 'suggested' && rulesHere.length ? html`
        <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', margin: '0 0 12px' }}>
          <div style=${{ fontWeight: 700, fontSize: '13px' }}>Accept a whole group</div>
          <div class="muted small" style=${{ margin: '2px 0 8px' }}>
            Only groups whose answer keeps addresses OUT of outreach can be accepted in bulk.
            Marking something a company inbox is always one row at a time.
          </div>
          <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            ${rulesHere.map((r) => html`
              <button key=${r.id} class="btn btn-sm" disabled=${!!busy}
                onClick=${() => acceptRule(r.id, r.verdict, r.n)}>
                ${busy === 'rule:' + r.id ? 'Applying…' : `All ${r.n} · ${RULE_NAME[r.id]} → ${VERDICT_LABEL[r.verdict]}`}
              </button>`)}
          </div>
        </div>` : null}

      ${loading ? html`<div class="muted" style=${{ padding: '20px' }}>Reading the whole address pool…</div>`
        : rows.length === 0 ? html`<div class="muted" style=${{ padding: '20px' }}>Nothing waiting here. 🎉</div>`
        : html`
          <div class="muted small" style=${{ margin: '0 4px 8px' }}>
            Showing ${rows.length.toLocaleString()} of ${total.toLocaleString()}.
          </div>
          <div style=${{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', paddingRight: '4px' }}>
            ${rows.map((r) => html`
              <div key=${r.email} style=${{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px' }}>
                <div style=${{ display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <div style=${{ flex: '1 1 340px', minWidth: 0 }}>
                    <div style=${{ fontWeight: 700, fontFamily: 'ui-monospace, monospace' }}>${r.email}</div>
                    <div class="muted small" style=${{ marginTop: '3px' }}>
                      ${(r.companies || []).slice(0, 3).map((c) => c.name).join(' · ')}
                      ${(r.companies || []).length > 3 ? ` +${r.companies.length - 3} more` : ''}
                    </div>
                    ${(r.companies || [])[0]?.website ? html`
                      <div class="muted small" style=${{ marginTop: '2px' }}>
                        <a href=${r.companies[0].website} target="_blank" rel="noreferrer">${r.companies[0].website}</a>
                      </div>` : null}
                    <div style=${{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      ${chips(r).map((c, i) => html`
                        <span key=${i} class="small" style=${{ background: 'var(--chip-bg, rgba(125,211,252,.12))', border: '1px solid var(--border)', borderRadius: '999px', padding: '2px 9px' }}>${c}</span>`)}
                    </div>
                    ${r.evidence?.reason ? html`<div class="muted small" style=${{ marginTop: '6px', fontStyle: 'italic' }}>${r.evidence.reason}</div>` : null}
                  </div>
                  <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '210px' }}>
                    ${(r.suggested || r.verdict) ? html`
                      <div class="small muted">Bell suggests: <strong>${VERDICT_LABEL[r.suggested || r.verdict]}</strong></div>` : null}
                    ${bucket === 'auto' ? html`
                      <button class="btn btn-sm" disabled=${busy === r.email} onClick=${() => undo(r)}>Undo this one</button>
                    ` : html`
                      <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                        ${['role_mailbox', 'named_person', 'not_a_company_address', 'left_unresolved'].map((v) => html`
                          <button key=${v} class=${'btn btn-sm' + ((r.suggested === v) ? ' btn-primary' : '')}
                            disabled=${busy === r.email} onClick=${() => decide(r, v)}>${VERDICT_LABEL[v]}</button>`)}
                      </div>`}
                  </div>
                </div>
              </div>`)}
          </div>`}
    </div>`;
}

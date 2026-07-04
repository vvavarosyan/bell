// Modal: pick a research type, pick the target, write the brief, hit Run.
//
// Phase R1 surface only: creates a queued job in the DB. R2 will fire the
// Firecrawl Agent. Only `company` is enabled; other types show as "soon".

import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const ORDER = ['company','person','sector','other'];

const BRIEF_TEMPLATES = {
  company: (t) => `Full operational picture of ${t} — ownership, leadership, financial trajectory, M&A signals.`,
  person:  (t) => `Public professional profile of ${t || 'this person'} — career arc, current roles, board seats, affiliations, and sphere of influence.`,
  sector:  (t) => `The Qatari ${t || 'sector'} sector — leading players, ownership clusters, regulatory direction, and M&A activity from 2022 to present.`,
  other:   (t) => `${t || 'Describe exactly what you want researched'} — a thorough, cited answer.`,
};

// For the non-company types, what the free-text "Subject" field asks for.
const SUBJECT_LABEL = {
  person: { label: "Person's name",       placeholder: 'e.g. Aisha Al-Sulaiti' },
  sector: { label: 'Sector',              placeholder: 'e.g. private healthcare, fintech, logistics' },
  other:  { label: 'Subject (optional)',  placeholder: 'e.g. Qatar EV charging market in 2026' },
};

export function NewResearchModal({ onClose, onCreated }) {
  const [types,    setTypes]    = useState({});  // {company: {label,tint,implemented,...}}
  const [type,     setType]     = useState('company');
  const [target,   setTarget]   = useState(null); // {id, name, bin} for company
  const [subject,  setSubject]  = useState('');    // free-text subject for person/sector/other
  const [brief,    setBrief]    = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Load type catalog once
  useEffect(() => {
    (async () => {
      try {
        const { types } = await api.researchTypes();
        setTypes(types || {});
      } catch (err) { toast('Could not load research types: ' + err.message, 'error'); }
    })();
  }, []);

  // Default brief when type or target changes
  useEffect(() => {
    const tmpl = BRIEF_TEMPLATES[type];
    if (!tmpl) return;
    const targetText = type === 'company' ? (target?.name || '') : subject.trim();
    setBrief(tmpl(targetText));
  }, [type, target, subject]);

  // Esc to close
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const info = types[type];
  const canSubmit = !!info?.implemented && brief.trim().length > 5 &&
                    (info.requires_target !== 'company' || target);

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const body = { type, brief: brief.trim() };
      if (type === 'company' && target?.id) body.target_company_id = target.id;
      if (type !== 'company' && subject.trim()) body.target_label = subject.trim();
      const r = await api.createResearchJob(body);
      toast('Research job created');
      onCreated && onCreated(r);
      onClose && onClose();
    } catch (err) {
      toast('Could not create job: ' + err.message, 'error');
    } finally { setSubmitting(false); }
  };

  return html`
    <div
      onClick=${onClose}
      style=${{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(6,9,17,0.7)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '8vh',
      }}
    >
      <div
        onClick=${(e) => e.stopPropagation()}
        style=${{
          width: 'min(680px, 92vw)',
          background: 'linear-gradient(180deg, #131826 0%, #0e1322 100%)',
          border: '1px solid var(--border)',
          borderRadius: '14px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.55)',
          overflow: 'hidden',
          maxHeight: '84vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <!-- header -->
        <div style=${{
          padding: '18px 22px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style=${{
              fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em',
              color: 'var(--text-dim)', fontWeight: 700, marginBottom: '4px',
            }}>Start a deep research</div>
            <div style=${{ fontSize: '16px', fontWeight: 600, color: 'var(--text)' }}>
              Bella will deploy research agents in parallel.
            </div>
          </div>
          <button onClick=${onClose} title="Close (Esc)" style=${{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            width: '30px', height: '30px', borderRadius: '8px', cursor: 'pointer',
            fontSize: '14px',
          }}>✕</button>
        </div>

        <!-- body -->
        <div style=${{ padding: '20px 22px', overflowY: 'auto' }}>

          <!-- type picker -->
          <div style=${{ marginBottom: '20px' }}>
            <Label>Research type</Label>
            <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginTop: '8px' }}>
              ${ORDER.map(tid => {
                const ti = types[tid];
                if (!ti) return null;
                const active   = type === tid;
                const disabled = !ti.implemented;
                const tint = ti.tint || 'rgb(140 140 140)';
                return html`
                  <button
                    key=${tid}
                    disabled=${disabled}
                    onClick=${() => !disabled && setType(tid)}
                    style=${{
                      padding: '10px',
                      textAlign: 'left',
                      background: active
                        ? tint.replace('rgb', 'rgba').replace(')', ' / 0.14)')
                        : 'rgba(255,255,255,0.02)',
                      border: '1px solid ' + (active
                        ? tint.replace('rgb', 'rgba').replace(')', ' / 0.45)')
                        : 'var(--border)'),
                      borderRadius: '8px',
                      color: 'var(--text)',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.45 : 1,
                      transition: 'all .15s ease',
                    }}
                  >
                    <div style=${{
                      fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: tint, fontWeight: 700,
                    }}>${ti.short}</div>
                    <div style=${{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.35 }}>
                      ${ti.description}
                    </div>
                    ${disabled ? html`<div style=${{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '6px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Soon</div>` : null}
                  </button>
                `;
              })}
            </div>
          </div>

          <!-- target picker (company only) -->
          ${info?.requires_target === 'company' ? html`
            <div style=${{ marginBottom: '20px' }}>
              <Label>Target company</Label>
              <${CompanyPicker} value=${target} onChange=${setTarget} />
            </div>
          ` : null}

          <!-- subject (free-text, person / sector / other) -->
          ${info && info.requires_target !== 'company' && info.implemented ? html`
            <div style=${{ marginBottom: '20px' }}>
              <Label>${SUBJECT_LABEL[type]?.label || 'Subject'}</Label>
              <input
                type="text"
                value=${subject}
                onChange=${(e) => setSubject(e.target.value)}
                placeholder=${SUBJECT_LABEL[type]?.placeholder || ''}
                style=${{
                  width: '100%', marginTop: '8px', padding: '10px 12px',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                  borderRadius: '8px', color: 'var(--text)', fontSize: '13px',
                }}
              />
            </div>
          ` : null}

          <!-- brief -->
          <div style=${{ marginBottom: '4px' }}>
            <Label>Brief</Label>
            <textarea
              value=${brief}
              onChange=${(e) => setBrief(e.target.value)}
              placeholder="What do you want to know? Bella reads this and decides how heavy the job is."
              rows=${4}
              style=${{
                width: '100%',
                marginTop: '8px',
                padding: '12px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                color: 'var(--text)',
                fontSize: '13px',
                fontFamily: 'inherit',
                lineHeight: '1.45',
                resize: 'vertical',
              }}
            ></textarea>
            <div style=${{ fontSize: '10.5px', color: 'var(--text-dim)', marginTop: '6px' }}>
              About 15 minutes from prompt to delivery, regardless of depth.
            </div>
          </div>
        </div>

        <!-- footer -->
        <div style=${{
          padding: '14px 22px',
          borderTop: '1px solid var(--border)',
          background: 'rgba(255,255,255,0.015)',
          display: 'flex', justifyContent: 'flex-end', gap: '8px',
        }}>
          <button onClick=${onClose} style=${{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
            fontSize: '12.5px',
          }}>Cancel</button>
          <button
            disabled=${!canSubmit || submitting}
            onClick=${submit}
            style=${{
              background: canSubmit ? 'var(--accent)' : 'rgba(91,140,255,0.3)',
              border: '1px solid ' + (canSubmit ? 'var(--accent)' : 'var(--border)'),
              color: '#fff',
              padding: '8px 18px', borderRadius: '8px',
              cursor: (canSubmit && !submitting) ? 'pointer' : 'not-allowed',
              fontSize: '12.5px', fontWeight: 600,
              boxShadow: canSubmit ? '0 4px 14px rgba(91,140,255,0.35)' : 'none',
              transition: 'all .15s ease',
            }}
          >
            ${submitting ? 'Creating…' : 'Run research'}
          </button>
        </div>
      </div>
    </div>
  `;
}

function Label({ children }) {
  return html`<div style=${{
    fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.08em',
    color: 'var(--text-dim)', fontWeight: 700,
  }}>${children}</div>`;
}

// Lightweight autocomplete over /api/companies?q=
function CompanyPicker({ value, onChange }) {
  const [q,      setQ]      = useState(value?.name || '');
  const [open,   setOpen]   = useState(false);
  const [rows,   setRows]   = useState([]);
  const [loading,setLoading]= useState(false);
  const boxRef = useRef(null);
  const tRef   = useRef(null);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      const term = q.trim();
      if (term.length < 2) { setRows([]); return; }
      setLoading(true);
      try {
        const r = await api.companies({ q: term, limit: 12 });
        setRows(r.rows || []);
      } catch { setRows([]); }
      finally { setLoading(false); }
    }, 200);
  }, [q, open]);

  // Click-outside close
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  const choose = (c) => {
    onChange && onChange({ id: c.id, name: c.name, bin: c.bin });
    setQ(c.name);
    setOpen(false);
  };

  return html`
    <div ref=${boxRef} style=${{ position: 'relative', marginTop: '8px' }}>
      <input
        type="text"
        value=${q}
        onChange=${(e) => { setQ(e.target.value); setOpen(true); onChange && onChange(null); }}
        onFocus=${() => setOpen(true)}
        placeholder="Search active companies by name, legal name, or registration #..."
        style=${{
          width: '100%',
          padding: '10px 12px',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid ' + (value ? 'rgba(91,140,255,0.45)' : 'var(--border)'),
          borderRadius: '8px',
          color: 'var(--text)',
          fontSize: '13px',
        }}
      />
      ${value ? html`<div style=${{
        marginTop: '6px',
        fontSize: '10.5px', color: 'var(--text-dim)',
      }}>Selected: <span style=${{ color: 'var(--text)' }}>${value.name}${value.bin ? ` · ${value.bin}` : ''}</span></div>` : null}

      ${open && rows.length > 0 ? html`
        <div style=${{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: '4px',
          background: '#131826',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          maxHeight: '240px',
          overflowY: 'auto',
          boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          zIndex: 10,
        }}>
          ${rows.map(c => html`
            <div
              key=${c.id}
              onMouseDown=${(e) => e.preventDefault()}
              onClick=${() => choose(c)}
              style=${{
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                transition: 'background .1s ease',
              }}
              onMouseEnter=${(e) => e.currentTarget.style.background = 'rgba(91,140,255,0.08)'}
              onMouseLeave=${(e) => e.currentTarget.style.background = 'transparent'}
            >
              <div style=${{ fontSize: '12.5px', color: 'var(--text)' }}>${c.name}</div>
              <div style=${{ fontSize: '10.5px', color: 'var(--text-dim)', marginTop: '2px' }}>
                ${c.bin ? c.bin + ' · ' : ''}${c.industry || '—'}${c.city ? ' · ' + c.city : ''}
              </div>
            </div>
          `)}
        </div>
      ` : (open && q.trim().length >= 2 && !loading ? html`
        <div style=${{
          position: 'absolute', top: '100%', left: 0, right: 0,
          marginTop: '4px', padding: '10px 12px',
          background: '#131826', border: '1px solid var(--border)', borderRadius: '8px',
          fontSize: '11.5px', color: 'var(--text-dim)',
        }}>No matching companies.</div>
      ` : null)}
    </div>
  `;
}

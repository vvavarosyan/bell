// Qatar Knowledge — the customer-facing browser over Bell's Qatar Knowledge Base
// (official government sources + Al Meezan laws, crawled locally, mirrored to
// prod). Search + browse pages; every result cites its source name + url + as-of
// date and the verbatim laws/bodies it mentions (Rule 2.1). Arabic pages render
// right-to-left. All hooks precede any return (hook-order rule).

import { useState, useEffect, useCallback, useMemo } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { Pagination } from './Pagination.js';

const PAGE = 20;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const isArabic = (s) => /[؀-ۿ]/.test(String(s || ''));

// Render a ts_headline excerpt (matches wrapped in «…»)  with the hits emphasised.
function Excerpt({ text }) {
  const parts = useMemo(() => String(text || '').split(/«([^»]*)»/g), [text]);
  if (!text) return null;
  return html`<span>${parts.map((p, i) => (i % 2 === 1
    ? html`<mark key=${i} style=${{ background: 'rgba(90,150,255,0.22)', color: 'var(--text)', padding: '0 1px', borderRadius: '2px' }}>${p}</mark>`
    : html`<span key=${i}>${p}</span>`))}</span>`;
}

function kpi(label, value, sub) {
  return html`
    <div style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '13px 15px', minWidth: 0 }}>
      <div style=${{ fontSize: '20px', fontWeight: 700, color: 'var(--text)' }}>${value}</div>
      <div class="muted small" style=${{ marginTop: '2px' }}>${label}</div>
      ${sub ? html`<div class="muted small" style=${{ opacity: 0.7, marginTop: '1px' }}>${sub}</div>` : null}
    </div>`;
}

export function KnowledgeTab() {
  const [view, setView] = useState('browse');
  const [stats, setStats] = useState(null);
  const [sources, setSources] = useState([]);
  const [q, setQ] = useState('');
  const [source, setSource] = useState(0);
  const [lang, setLang] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    api.knowledgeStats().then(setStats).catch(() => {});
    api.knowledgeSources().then((r) => setSources(r.rows || [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (view !== 'browse') return;
    setLoading(true);
    try {
      const params = { limit: PAGE, offset };
      if (q.trim()) params.q = q.trim();
      if (source) params.source = source;
      if (lang) params.lang = lang;
      const r = await api.knowledgePages(params);
      setRows(r.rows || []); setTotal(r.total || 0);
    } catch { setRows([]); setTotal(0); } finally { setLoading(false); }
  }, [view, q, source, lang, offset]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setOffset(0); }, [q, source, lang]);

  const empty = stats && stats.empty;

  return html`
    <div class="page-fill"><div class="page-scroll">
      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '4px 0 12px' }}>
        <h2 style=${{ margin: 0, fontSize: '17px' }}>Qatar Knowledge</h2>
        <span class="muted small">Qatar's political system, ministries, key people and laws — from official government sources, cited.</span>
      </div>

      <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '14px' }}>
        ${kpi('Pages learned', stats ? (stats.pages || 0).toLocaleString() : '…', 'official sources')}
        ${kpi('Laws & decrees', stats ? (stats.laws || 0).toLocaleString() : '…', 'Al Meezan legal portal')}
        ${kpi('Sources', stats ? (stats.sources || 0).toLocaleString() : '…', 'ministries & authorities')}
        ${kpi('Pages with entities', stats ? (stats.with_entities || 0).toLocaleString() : '…', 'laws · bodies · fees')}
      </div>

      <div class="filt-bar">
        <span class="filt-label">View</span>
        <div class="seg">
          <button class=${'seg-btn' + (view === 'browse' ? ' active' : '')} onClick=${() => setView('browse')}>Browse</button>
          <button class=${'seg-btn' + (view === 'updates' ? ' active' : '')} onClick=${() => setView('updates')}>Recent updates</button>
        </div>
      </div>

      ${view === 'updates' ? html`<${ChangesView} empty=${empty} />` : html`
      <div class="filt-bar">
        <input class="bdi-filter-input" type="text" placeholder="Search Qatar laws, ministries, the constitution, officials…"
          value=${q} onInput=${(e) => setQ(e.target.value)} style=${{ minWidth: '260px', flex: '1 1 260px' }} />
        <span class="filt-label">Language</span>
        <div class="pilltabs">
          ${[['', 'All'], ['en', 'English'], ['ar', 'العربية']].map(([id, label]) =>
            html`<button key=${id || 'all'} class=${'pilltab' + (lang === id ? ' active' : '')} onClick=${() => setLang(id)}>${label}</button>`)}
        </div>
      </div>

      ${sources.length ? html`
        <div class="filt-bar" style=${{ marginTop: '-4px' }}>
          <span class="filt-label">Source</span>
          <div class="pilltabs">
            <button class=${'pilltab' + (source === 0 ? ' active' : '')} onClick=${() => setSource(0)}>All</button>
            ${sources.map((s) => html`<button key=${s.id} class=${'pilltab' + (source === s.id ? ' active' : '')} onClick=${() => setSource(s.id)}>
              ${s.name}${s.pages ? html` <span class="ct">${s.pages}</span>` : null}</button>`)}
          </div>
        </div>` : null}

      ${empty ? html`
        <div class="empty" style=${{ lineHeight: 1.6 }}>
          <div style=${{ fontSize: '15px', color: 'var(--text)', marginBottom: '4px' }}>The Qatar Knowledge Base is empty on this environment.</div>
          Run <b>“Run Qatar Knowledge Scan.command”</b> on the local Mac to learn Qatar's governance + laws, then it publishes here.
        </div>`
        : loading ? html`<div class="empty">Searching Qatar Knowledge…</div>`
        : rows.length === 0 ? html`<div class="empty">No pages match${q ? html` “${q}”` : ''}. Try broader terms.</div>`
        : html`
          <div class="muted small" style=${{ margin: '2px 0 8px' }}>${total.toLocaleString()} page${total === 1 ? '' : 's'}${q ? html` matching “${q}”` : ''}</div>
          <div style=${{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            ${rows.map((r) => html`<${Row} key=${r.id} r=${r} onOpen=${() => setOpenId(r.id)} />`)}
          </div>
          <div class="feed-pager" style=${{ marginTop: '12px' }}>
            <${Pagination} total=${total} limit=${PAGE} offset=${offset} onChange=${setOffset} />
          </div>`}
      `}

      ${openId ? html`<${PageDrawer} id=${openId} onClose=${() => setOpenId(null)} />` : null}
    </div></div>`;
}

// "Recent updates" — what the periodic re-crawl found NEW or CHANGED. This is the
// change-tracking Val asked for (know when a law/regulation/page changes), scoped
// to the Qatar Knowledge section (not the global signals feed, which the initial
// baseline crawl would flood).
function ChangesView({ empty }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let dead = false;
    api.knowledgeChanges({ limit: 50 }).then((r) => { if (!dead) { setRows(r.rows || []); setLoading(false); } }).catch(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, []);
  const badge = (kind) => {
    const map = { new: ['New', 'rgba(80,200,120,0.9)'], changed: ['Updated', 'rgba(90,150,255,0.9)'], removed: ['Removed', 'rgba(240,120,120,0.9)'] };
    const [label, color] = map[kind] || [kind, 'var(--muted)'];
    return html`<span style=${{ fontSize: '10.5px', fontWeight: 600, color, border: '1px solid var(--border)', borderRadius: '6px', padding: '1px 7px' }}>${label}</span>`;
  };
  if (empty) return html`<div class="empty" style=${{ lineHeight: 1.6 }}>Nothing learned yet — run <b>“Run Qatar Knowledge Scan.command”</b> to populate the knowledge base.</div>`;
  if (loading) return html`<div class="empty">Loading recent updates…</div>`;
  if (!rows.length) return html`<div class="empty">No changes recorded yet. Each scan flags what's new or changed here.</div>`;
  return html`
    <div class="muted small" style=${{ margin: '2px 0 8px' }}>What the last scans found new or changed, newest first.</div>
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
      ${rows.map((c, i) => {
        const rtl = isArabic(c.title);
        return html`<div key=${i} style=${{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', padding: '10px 13px', display: 'flex', alignItems: 'baseline', gap: '9px' }}>
          ${badge(c.kind)}
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div dir=${rtl ? 'rtl' : 'ltr'} style=${{ fontSize: '13px', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              ${c.url ? html`<a href=${c.url} target="_blank" rel="noopener noreferrer" style=${{ color: 'var(--text)', textDecoration: 'none' }}>${c.title || '(untitled)'}</a>` : (c.title || '(untitled)')}
            </div>
            <div class="muted small">${c.source_name || '—'} · ${fmtDate(c.detected_at)}</div>
          </div>
        </div>`;
      })}
    </div>`;
}

function Row({ r, onOpen }) {
  const rtl = r.lang === 'ar' || isArabic(r.title);
  return html`
    <div onClick=${onOpen} style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '12px 14px', cursor: 'pointer' }}>
      <div style=${{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <div dir=${rtl ? 'rtl' : 'ltr'} style=${{ flex: 1, minWidth: 0, fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>${r.title || '(untitled)'}</div>
        ${r.category ? html`<span class="pilltab" style=${{ pointerEvents: 'none', fontSize: '10.5px', padding: '1px 7px' }}>${r.category}</span>` : null}
      </div>
      <div class="muted small" style=${{ marginTop: '3px' }}>${r.source || '—'} · ${fmtDate(r.as_of)}${r.lang === 'ar' ? ' · العربية' : ''}</div>
      ${r.excerpt ? html`<div dir=${rtl ? 'rtl' : 'ltr'} class="muted" style=${{ fontSize: '12.5px', marginTop: '6px', lineHeight: 1.55 }}><${Excerpt} text=${r.excerpt} /></div>` : null}
      ${r.mentions && r.mentions.length ? html`
        <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
          ${r.mentions.map((m, i) => html`<span key=${i} style=${{ fontSize: '10.5px', color: 'var(--muted)', border: '1px solid var(--border)', borderRadius: '6px', padding: '1px 7px' }}>${m}</span>`)}
        </div>` : null}
    </div>`;
}

function PageDrawer({ id, onClose }) {
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let dead = false;
    setLoading(true);
    api.knowledgePage(id).then((p) => { if (!dead) { setPage(p); setLoading(false); } }).catch(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rtl = page && (page.lang === 'ar' || isArabic(page.title));
  const ent = (page && page.entities) || {};
  const chipRow = (label, items) => (items && items.length ? html`
    <div style=${{ marginTop: '10px' }}>
      <div class="filt-label" style=${{ marginBottom: '4px' }}>${label}</div>
      <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
        ${items.map((t, i) => html`<span key=${i} style=${{ fontSize: '11px', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '6px', padding: '2px 8px' }}>${t}</span>`)}
      </div>
    </div>` : null);

  return html`
    <div onClick=${onClose} style=${{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60 }}>
      <div onClick=${(e) => e.stopPropagation()} style=${{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(620px, 94vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border)', boxShadow: '-8px 0 30px rgba(0,0,0,0.35)', display: 'flex', flexDirection: 'column' }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div dir=${rtl ? 'rtl' : 'ltr'} style=${{ fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>${page ? (page.title || '(untitled)') : 'Loading…'}</div>
            ${page ? html`<div class="muted small" style=${{ marginTop: '2px' }}>${page.source || '—'} · as of ${fmtDate(page.as_of)}</div>` : null}
          </div>
          <button class="btn btn-ghost" onClick=${onClose} style=${{ flex: '0 0 auto' }}>✕</button>
        </div>
        <div style=${{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          ${loading ? html`<div class="empty">Loading…</div>`
            : !page ? html`<div class="empty">Could not load this page.</div>`
            : html`
              ${chipRow('Laws referenced', (ent.law_refs || []).map((x) => x.text))}
              ${chipRow('Government bodies', (ent.bodies || []).map((x) => x.matched || x.name))}
              ${chipRow('Amounts / fees', (ent.amounts || []).map((x) => x.text))}
              ${chipRow('Officials named (public role)', (ent.officials || []).map((x) => x.name))}
              <div dir=${rtl ? 'rtl' : 'ltr'} style=${{ marginTop: '14px', whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.65, color: 'var(--text)' }}>${page.content || ''}</div>
              <div style=${{ marginTop: '18px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                <a href=${page.url} target="_blank" rel="noopener noreferrer" class="btn btn-secondary">View the original source ↗</a>
              </div>`}
        </div>
      </div>
    </div>`;
}

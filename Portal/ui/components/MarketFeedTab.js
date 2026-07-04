// Market Feed — the live intelligence stream.
// A unified, auto-updating feed of news + (later) research + company events,
// processed by Bell: categorized, sentiment-scored, and linked to company
// records (clickable chips). Filter rail + trending sidebar + "scanning" bar.

import { useState, useEffect, useCallback, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';
import { FeedSourcesNetwork } from './FeedSourcesNetwork.js';

const CATEGORIES = [
  ['', 'All'], ['economic', 'Economic'], ['political', 'Political'], ['corporate', 'Corporate'],
  ['energy', 'Energy'], ['real_estate', 'Real Estate'], ['tech', 'Tech'], ['legal', 'Legal'], ['sports', 'Sports'],
];
const CAT_COLOR = {
  economic: '#3b82f6', political: '#a855f7', corporate: '#14b8a6', energy: '#f59e0b',
  real_estate: '#ec4899', tech: '#6366f1', legal: '#64748b', sports: '#22c55e', other: '#94a3b8',
};
const SENT_COLOR = { positive: '#22c55e', negative: '#ef4444', neutral: '#94a3b8' };
const KIND_LABEL = {
  news: 'News', research: 'Research', company_registered: 'New company',
  dataset_update: 'Data', signal: 'Signal',
};

function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function MarketFeedTab({ mode } = {}) {
  const isAdmin = mode !== 'user';   // admin.bell.qa / local engine may delete wrong items
  const [events, setEvents]   = useState([]);
  const [cursor, setCursor]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats]     = useState(null);
  const [trending, setTrending] = useState([]);
  const [sources, setSources] = useState([]);   // live sources for the network visual
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [openedId, setOpenedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const maxIdRef = useRef(0);

  // Fetch richer detail for the opened news item (drawer).
  useEffect(() => {
    if (!openedId) { setDetail(null); return; }
    let cancelled = false;
    (async () => {
      try { const r = await api.feedItem(openedId); if (!cancelled) setDetail(r.event); }
      catch { /* keep card fallback */ }
    })();
    return () => { cancelled = true; };
  }, [openedId]);

  const filterParams = useCallback(() => {
    const p = {};
    if (category) p.category = category;
    if (kind) p.kind = kind;
    if (q.trim()) p.q = q.trim();
    return p;
  }, [category, kind, q]);

  const maxId = (arr) => arr.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.feed({ ...filterParams(), limit: 30 });
      const evs = r.events || [];
      setEvents(evs);
      setCursor(r.next_cursor || null);
      maxIdRef.current = maxId(evs);
    } catch (err) { toast('Feed load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [filterParams]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.feed({ ...filterParams(), cursor, limit: 30 });
      setEvents(prev => {
        const seen = new Set(prev.map(e => e.id));
        return [...prev, ...(r.events || []).filter(e => !seen.has(e.id))];
      });
      setCursor(r.next_cursor || null);
    } catch (err) { toast('Load more failed: ' + err.message, 'error'); }
    finally { setLoadingMore(false); }
  };

  const refreshStats = useCallback(async () => {
    try { setStats(await api.feedStats()); } catch { /* ignore */ }
  }, []);

  // Initial load + trending.
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    refreshStats();
    (async () => { try { const t = await api.feedTrending(); setTrending(t.companies || []); } catch {} })();
    (async () => { try { const s = await api.feedSources(); setSources(s.rows || []); } catch {} })();
  }, [refreshStats]);

  // Live updates: prepend new items + refresh stats every 20s.
  useEffect(() => {
    const t = setInterval(async () => {
      refreshStats();
      if (!maxIdRef.current) return;
      try {
        const r = await api.feed({ ...filterParams(), after_id: maxIdRef.current, limit: 30 });
        if (r.events && r.events.length) {
          maxIdRef.current = Math.max(maxIdRef.current, maxId(r.events));
          setEvents(prev => {
            const seen = new Set(prev.map(e => e.id));
            const fresh = r.events.filter(e => !seen.has(e.id));
            return fresh.length ? [...fresh, ...prev] : prev;
          });
        }
      } catch { /* ignore */ }
    }, 20_000);
    return () => clearInterval(t);
  }, [filterParams, refreshStats]);

  const breaking = events.filter(e => (e.importance || 0) >= 0.7).slice(0, 8);

  return html`
    <div class="page-fill">
     <div class="page-scroll">
     <div style=${{ display: 'flex', gap: '18px', alignItems: 'flex-start' }}>
      <!-- Main column -->
      <div style=${{ flex: 1, minWidth: 0 }}>

        <!-- Scanning / live stats bar -->
        <div class="feed-scanbar">
          <span class="feed-pulse" data-on=${stats?.scanning ? '1' : '0'}></span>
          <span class="feed-scan-label">${stats?.scanning ? 'Bell is scanning Qatar…' : 'Live market intelligence'}</span>
          <span class="spacer"></span>
          ${stats ? html`
            <span class="feed-stat"><b>${(stats.total_items || 0).toLocaleString()}</b> news total</span>
            <span class="feed-stat"><b>${(stats.active_sources || 0).toLocaleString()}</b> sources</span>
            <span class="feed-stat"><b>${(stats.items_today || 0).toLocaleString()}</b> news · 24h</span>
            <span class="feed-stat"><b>${(stats.linked_today || 0).toLocaleString()}</b> linked</span>
          ` : null}
        </div>
        ${stats && stats.engine_enabled === false ? html`
          <div class="feed-warn">News engine is off on this server. Set <code>BDI_NEWS_ENGINE=1</code> on the production portal service.</div>
        ` : null}
        ${stats && stats.engine_enabled && (stats.events_today || 0) === 0 && stats.poller_error ? html`
          <div class="feed-warn">No items ingested yet — last poll error: ${stats.poller_error}</div>
        ` : null}

        <!-- Breaking ticker -->
        ${breaking.length ? html`
          <div class="feed-ticker">
            <span class="feed-ticker-tag">BREAKING</span>
            <div class="feed-ticker-track">
              ${breaking.map(b => html`<span key=${b.id} class="feed-ticker-item">${b.title}</span>`)}
            </div>
          </div>
        ` : null}

        <!-- Primary switch: News / Research / New companies -->
        <div class="feed-tabs">
          ${[['', 'All'], ['news', 'News'], ['research', 'Research'], ['company_registered', 'New companies']].map(([val, label]) => html`
            <button key=${val || 'all'}
              class=${'feed-tab' + (val === 'research' ? ' research' : '') + (kind === val ? ' active' : '')}
              onClick=${() => setKind(val)}>${label}</button>
          `)}
        </div>

        <!-- Secondary: topic categories -->
        <div class="feed-filters">
          <span class="feed-cats-label">Topics</span>
          ${CATEGORIES.map(([val, label]) => html`
            <button key=${val || 'all'}
              class=${'feed-chip ' + (category === val ? 'active' : '')}
              onClick=${() => setCategory(val)}>${label}</button>
          `)}
          <span class="spacer"></span>
          <input class="feed-search" type="text" placeholder="Search the feed…"
            value=${q} onChange=${e => setQ(e.target.value)}
            onKeyDown=${e => { if (e.key === 'Enter') load(); }} />
        </div>

        <!-- Feed -->
        <div class="feed-stream">
          ${loading ? html`<div class="empty">Loading the market…</div>` :
            events.length === 0 ? html`<div class="empty">No events yet. Bell is warming up the feed — check back shortly.</div>` :
            events.map(e => {
              const onOpen = () => {
                if (e.kind === 'company_registered') {
                  const cid = e.ref_id || (e.companies && e.companies[0] && e.companies[0].id);
                  if (cid) navigateTo('companies', cid);
                } else {
                  setOpenedId(e.id);
                }
              };
              // Admin-only: delete a wrong news item / research report everywhere.
              const onDelete = (isAdmin && (e.kind === 'news' || e.kind === 'research')) ? async () => {
                const label = e.kind === 'research' ? 'research report' : 'news item';
                if (!window.confirm(`Delete this ${label}? It will be removed from the feed and the public site.`)) return;
                try {
                  if (e.kind === 'research') {
                    if (!e.payload?.job_id) throw new Error('missing job id');
                    await api.deleteResearchJob(e.payload.job_id);
                  } else {
                    await api.deleteNewsItem(e.ref_id || e.id);
                  }
                  setEvents((list) => list.filter((x) => x.id !== e.id));
                  toast('Deleted');
                } catch (err) { toast('Delete failed: ' + err.message, 'error'); }
              } : null;
              return e.kind === 'research'
                ? html`<${ResearchFeedCard} key=${e.id} e=${e} onOpen=${onOpen} onDelete=${onDelete} />`
                : html`<${FeedCard} key=${e.id} e=${e} onOpen=${onOpen} onDelete=${onDelete} />`;
            })}
          ${!loading && cursor ? html`
            <button class="feed-loadmore" onClick=${loadMore} disabled=${loadingMore}>
              ${loadingMore ? 'Loading…' : 'Load more'}
            </button>` : null}
        </div>
      </div>

      <!-- Trending sidebar -->
      <aside class="feed-aside">
        <!-- Live intelligence — Bell-native pulse (replaced the old sources→Bell
             network; no external sources shown, lives on the right sidebar). -->
        <div class="feed-live-card">
          <style>${`
            .feed-live-card{border:1px solid var(--border);border-radius:12px;padding:14px 15px;margin-bottom:16px;background:linear-gradient(180deg,rgba(91,140,255,0.07),rgba(13,18,35,0.25));}
            .feed-live-head{display:flex;align-items:center;gap:8px;}
            .feed-live-dot{width:8px;height:8px;border-radius:50%;background:#5b8cff;box-shadow:0 0 8px rgba(91,140,255,0.85);animation:feedLivePulse 1.8s ease-in-out infinite;}
            .feed-live-dot[data-on="1"]{background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,0.9);}
            .feed-live-title{font-size:11px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--text);}
            .feed-live-sub{font-size:11.5px;color:var(--text-muted);line-height:1.5;margin-top:6px;}
            .feed-live-bars{display:flex;align-items:flex-end;gap:3px;height:26px;margin-top:12px;}
            .feed-live-bar{flex:1;background:linear-gradient(180deg,#5b8cff,rgba(91,140,255,0.22));border-radius:2px;height:30%;animation:feedLiveEq 1.1s ease-in-out infinite;}
            .feed-live-stat{font-size:11px;color:var(--text-dim);margin-top:11px;}
            .feed-live-stat b{color:var(--text);}
            @keyframes feedLivePulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.3)}}
            @keyframes feedLiveEq{0%,100%{height:20%}50%{height:95%}}
          `}</style>
          <div class="feed-live-head">
            <span class="feed-live-dot" data-on=${stats?.scanning ? '1' : '0'}></span>
            <span class="feed-live-title">Live intelligence</span>
          </div>
          <div class="feed-live-sub">${stats?.scanning ? 'Bell is processing Qatar’s market in real time.' : 'Bell continuously watches Qatar’s market.'}</div>
          <div class="feed-live-bars">
            ${Array.from({ length: 14 }).map((_, i) => html`<span key=${i} class="feed-live-bar" style=${{ animationDelay: (i * 0.11).toFixed(2) + 's' }}></span>`)}
          </div>
          ${stats ? html`<div class="feed-live-stat"><b>${(stats.items_today || 0).toLocaleString()}</b> new today · <b>${(stats.linked_today || 0).toLocaleString()}</b> linked</div>` : null}
        </div>
        ${stats ? html`
          <div class="feed-aside-title">Data Statistics</div>
          <div class="feed-bdi-stats" title="The scale and freshness of Bell Data Intelligence">
            <div class="feed-bdi-stat"><b>${(stats.bdi_companies || 0).toLocaleString()}</b><span>Companies</span></div>
            <div class="feed-bdi-stat"><b>${(stats.bdi_people || 0).toLocaleString()}</b><span>People</span></div>
            <div class="feed-bdi-stat"><b>${(stats.bdi_datapoints || 0).toLocaleString()}</b><span>Data points</span></div>
            <div class="feed-bdi-stat feed-bdi-fresh"><b>${(stats.bdi_fresh_7d || 0).toLocaleString()}</b><span>Updated · 7d</span></div>
            <div class="feed-bdi-stat"><b>${(stats.bdi_new_companies_7d || 0).toLocaleString()}</b><span>New cos · 7d</span></div>
            <div class="feed-bdi-stat"><b>${(stats.bdi_jobs_active || 0).toLocaleString()}</b><span>Open jobs</span></div>
            <div class="feed-bdi-stat"><b>${(stats.bdi_industries || 0).toLocaleString()}</b><span>Industries</span></div>
            <div class="feed-bdi-stat"><b>${(stats.items_today || 0).toLocaleString()}</b><span>News · 24h</span></div>
            <div class="feed-bdi-stat"><b>${(stats.research_published || 0)}</b><span>Research published</span></div>
            <div class="feed-bdi-stat"><b>${(stats.research_feed_events || 0)}</b><span>Research in feed</span></div>
          </div>
        ` : null}
        <div class="feed-aside-title">Trending companies</div>
        ${trending.length === 0 ? html`<div class="muted small">Nothing trending yet.</div>` :
          trending.map(c => html`
            <button key=${c.id} class="feed-trend-row" onClick=${() => navigateTo('companies', c.id)}>
              <span class="feed-trend-name">${c.name}</span>
              <span class="feed-trend-count">${c.mentions}</span>
            </button>
          `)}
      </aside>
     </div>
     ${openedId ? (() => {
        const ev = detail || events.find(e => e.id === openedId);
        return ev && ev.kind === 'research'
          ? html`<${ResearchReport} event=${ev} onClose=${() => setOpenedId(null)} />`
          : html`<${NewsDetail} event=${ev} onClose=${() => setOpenedId(null)} />`;
      })() : null}
     </div>
    </div>
  `;
}

function NewsDetail({ event, onClose }) {
  if (!event) return null;
  const cat = event.category || 'other';
  const catColor = CAT_COLOR[cat] || CAT_COLOR.other;
  const fullSummary = event.detail?.summary || event.summary;
  const author = event.detail?.author;
  const published = event.detail?.published_at || event.occurred_at;
  return html`
    <div class="news-overlay" onClick=${onClose}>
      <aside class="news-drawer" onClick=${e => e.stopPropagation()}>
        <button class="news-close" onClick=${onClose} title="Close">✕</button>
        ${event.image_url ? html`<div class="news-hero" style=${{ backgroundImage: `url(${event.image_url})` }}></div>` : null}
        <div class="news-drawer-body">
          <div class="feed-card-meta">
            <span class="feed-kind">${KIND_LABEL[event.kind] || event.kind}</span>
            <span class="feed-cat" style=${{ color: catColor, borderColor: catColor }}>${cat.replace('_', ' ')}</span>
            ${event.sentiment ? html`<span class="feed-sent" style=${{ background: SENT_COLOR[event.sentiment] || SENT_COLOR.neutral }}></span>` : null}
          </div>
          <h2 class="news-title">${event.title}</h2>
          <div class="news-sub">
            ${event.source_name ? html`<span>${cleanSource(event.source_name)}</span>` : null}
            ${author ? html`<span>· ${author}</span>` : null}
            <span>· ${new Date(published).toLocaleString()}</span>
          </div>
          ${fullSummary ? html`<p class="news-summary">${fullSummary}</p>` : html`<p class="muted small">No summary available — read the full story at the source.</p>`}
          ${(() => {
            const paras = String(event.detail?.body || '').split(/\n+/).map(s => s.trim()).filter(Boolean);
            return paras.length ? html`
              <div class="news-fullstory" style=${{ marginTop: '12px' }}>
                <div class="news-section-label">The full story</div>
                ${paras.map((p, i) => html`<p key=${i} style=${{ margin: '0 0 10px', lineHeight: 1.65, color: 'var(--text-muted)', fontSize: '14px' }}>${p}</p>`)}
              </div>` : null;
          })()}
          ${(event.companies && event.companies.length) ? html`
            <div class="news-section-label">Mentioned companies</div>
            <div class="feed-card-chips">
              ${event.companies.map(c => html`
                <button key=${c.id} class="feed-company-chip" onClick=${() => navigateTo('companies', c.id)}>${c.name}</button>
              `)}
            </div>` : null}
          ${event.url ? html`<a class="news-source-link" href=${event.url} target="_blank" rel="noopener">Read full story at source ↗</a>` : null}
        </div>
      </aside>
    </div>
  `;
}

function cleanSource(name) {
  return String(name || '').split(/\s[—–-]\s/)[0].trim() || name;
}

function FeedCard({ e, onOpen, onDelete }) {
  const cat = e.category || 'other';
  const catColor = CAT_COLOR[cat] || CAT_COLOR.other;

  return html`
    <article class="feed-card" onClick=${onOpen} style=${{ cursor: 'pointer' }}>
      ${e.image_url ? html`<div class="feed-card-img" style=${{ backgroundImage: `url(${e.image_url})` }}></div>` : null}
      <div class="feed-card-body">
        <div class="feed-card-meta">
          <span class="feed-kind">${KIND_LABEL[e.kind] || e.kind}</span>
          <span class="feed-cat" style=${{ color: catColor, borderColor: catColor }}>${cat.replace('_', ' ')}</span>
          ${e.sentiment ? html`<span class="feed-sent" title=${e.sentiment} style=${{ background: SENT_COLOR[e.sentiment] || SENT_COLOR.neutral }}></span>` : null}
          <span class="spacer"></span>
          ${e.source_name ? html`<span class="muted small">${cleanSource(e.source_name)}</span>` : null}
          <span class="muted small">· ${timeAgo(e.occurred_at)}</span>
          ${onDelete ? html`<button title="Delete (admin)" onClick=${(ev) => { ev.stopPropagation(); onDelete(); }}
            style=${{ marginLeft: '6px', border: 'none', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '13px', lineHeight: 1, padding: '0 2px' }}>✕</button>` : null}
        </div>
        <div class="feed-card-title">${e.title}</div>
        ${e.summary ? html`<div class="feed-card-summary">${e.summary}</div>` : null}
        ${(e.companies && e.companies.length) ? html`
          <div class="feed-card-chips">
            ${e.companies.map(c => html`
              <button key=${c.id} class="feed-company-chip" onClick=${(ev) => { ev.stopPropagation(); navigateTo('companies', c.id); }}>
                ${c.name}
              </button>
            `)}
          </div>` : null}
      </div>
    </article>
  `;
}

// Distinct, branded card for a research report — deliberately unlike a news card.
const RESEARCH_TINT = 'rgb(111 207 151)';
function ResearchFeedCard({ e, onOpen, onDelete }) {
  return html`
    <article onClick=${onOpen} style=${{
      cursor: 'pointer', position: 'relative',
      display: 'flex', gap: '14px',
      padding: '16px 18px 16px 16px', marginBottom: '10px',
      background: 'linear-gradient(180deg, rgba(111,207,151,0.07) 0%, rgba(13,18,35,0.5) 100%)',
      border: '1px solid rgba(111,207,151,0.28)',
      borderLeft: '3px solid ' + RESEARCH_TINT,
      borderRadius: '12px',
    }}>
      <div style=${{
        flexShrink: 0, width: '40px', height: '40px', borderRadius: '9px',
        background: 'rgba(111,207,151,0.14)', color: RESEARCH_TINT,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
      }}>◎</div>
      <div style=${{ minWidth: 0, flex: 1 }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style=${{
            fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: RESEARCH_TINT,
          }}>Bell Research · Report</span>
          <span class="spacer" style=${{ flex: 1 }}></span>
          <span class="muted small">${timeAgo(e.occurred_at)}</span>
          ${onDelete ? html`<button title="Delete (admin)" onClick=${(ev) => { ev.stopPropagation(); onDelete(); }}
            style=${{ marginLeft: '6px', border: 'none', background: 'transparent', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '13px', lineHeight: 1, padding: '0 2px' }}>✕</button>` : null}
        </div>
        <div style=${{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.35, marginBottom: '5px' }}>
          ${e.title}
        </div>
        ${e.summary ? html`<div style=${{
          fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.55,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>${e.summary}</div>` : null}
        <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '9px', flexWrap: 'wrap' }}>
          ${(e.companies && e.companies.length) ? e.companies.map(c => html`
            <button key=${c.id} class="feed-company-chip" onClick=${(ev) => { ev.stopPropagation(); navigateTo('companies', c.id); }}>${c.name}</button>
          `) : null}
          <span class="spacer" style=${{ flex: 1 }}></span>
          <span style=${{ fontSize: '11.5px', fontWeight: 600, color: RESEARCH_TINT }}>Read full report →</span>
        </div>
      </div>
    </article>
  `;
}

// Inline renderer for a research paragraph: turns [1],[2] (and [[n]](url)) into
// clickable citation links using the report's 1-indexed sources array.
function renderResearchInline(text, sources) {
  const out = [];
  const rx = /\[\[(\d+)\]\]\(([^)\s]+)\)|\[(\d{1,3})\](?!\()/g;
  let last = 0, m, k = 0;
  const link = (label, href) => html`<a key=${'c' + (k++)} href=${href} target="_blank" rel="noopener noreferrer" style=${{
    color: RESEARCH_TINT, textDecoration: 'none', fontWeight: 700, fontSize: '10.5px', verticalAlign: 'super', padding: '0 1px',
  }}>${label}</a>`;
  while ((m = rx.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(link(`[${m[1]}]`, m[2]));
    else {
      const n = Number(m[3]); const src = sources && sources[n - 1];
      out.push(src && src.url ? link(`[${n}]`, src.url) : `[${n}]`);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Professional report reader — opens in the same drawer shell as news but
// renders like a document: title, attribution, summary callout, numbered
// sections with headings.
function ResearchReport({ event, onClose }) {
  if (!event) return null;
  const sections = Array.isArray(event.payload?.sections) ? event.payload.sections : [];
  const published = event.occurred_at;
  return html`
    <div class="news-overlay" onClick=${onClose}>
      <aside class="news-drawer" onClick=${e => e.stopPropagation()}>
        <button class="news-close" onClick=${onClose} title="Close">✕</button>
        <div class="news-drawer-body">
          <div style=${{
            fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            color: RESEARCH_TINT, marginBottom: '10px',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span>◎ Bell Research</span>
            <span style=${{ color: 'var(--text-dim)' }}>·</span>
            <span style=${{ color: 'var(--text-dim)', letterSpacing: '0.04em' }}>Intelligence Report</span>
          </div>
          <h1 style=${{ margin: '0 0 10px', fontSize: '23px', fontWeight: 700, color: 'var(--text)', lineHeight: 1.25 }}>
            ${event.title}
          </h1>
          <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '18px' }}>
            ${published ? html`<span class="muted small">${new Date(published).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>` : null}
            ${(event.companies && event.companies.length) ? html`
              <span style=${{ color: 'var(--text-dim)' }}>·</span>
              ${event.companies.map(c => html`<button key=${c.id} class="feed-company-chip" onClick=${() => navigateTo('companies', c.id)}>${c.name}</button>`)}
            ` : null}
          </div>

          ${event.summary ? html`
            <div style=${{
              padding: '14px 16px', marginBottom: '22px',
              background: 'rgba(111,207,151,0.07)',
              borderLeft: '3px solid ' + RESEARCH_TINT, borderRadius: '8px',
              fontSize: '14px', color: 'var(--text)', lineHeight: 1.6,
            }}>${renderResearchInline(event.summary || '', event.payload?.sources)}</div>
          ` : null}

          ${sections.length ? sections.map((sec, i) => html`
            <section key=${sec.number ?? i} style=${{ marginBottom: '24px' }}>
              <div style=${{
                fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                color: 'var(--text-dim)', marginBottom: '5px',
              }}>Section ${String(sec.number ?? (i + 1)).padStart(2, '0')}</div>
              ${sec.title ? html`<h2 style=${{ margin: '0 0 10px', fontSize: '17px', fontWeight: 600, color: 'var(--text)' }}>${sec.title}</h2>` : null}
              ${String(sec.body_markdown || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean).map((para, j) => html`
                <p key=${j} style=${{ margin: '0 0 11px', fontSize: '13.5px', lineHeight: 1.7, color: 'var(--text)' }}>${renderResearchInline(para, event.payload?.sources)}</p>
              `)}
            </section>
          `) : html`<p class="muted small">The full report is being prepared.</p>`}

          ${Array.isArray(event.payload?.sources) && event.payload.sources.length ? html`
            <div style=${{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
              <div style=${{ fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '8px' }}>Sources</div>
              <ol style=${{ margin: 0, paddingLeft: '18px', fontSize: '11.5px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
                ${event.payload.sources.map((s, i) => html`<li key=${i} style=${{ marginBottom: '3px' }}>
                  ${s.url ? html`<a href=${s.url} target="_blank" rel="noopener noreferrer" style=${{ color: 'var(--accent-bright)', textDecoration: 'none' }}>${s.label || s.url}</a>` : (s.label || '—')}
                </li>`)}
              </ol>
            </div>
          ` : null}

          <div style=${{
            marginTop: '12px', paddingTop: '14px', borderTop: '1px solid var(--border)',
            fontSize: '11px', color: 'var(--text-dim)',
          }}>Researched and synthesized by Bell · Qatar market intelligence</div>
        </div>
      </aside>
    </div>
  `;
}

// Market Feed — the live intelligence stream.
// A unified, auto-updating feed of news + (later) research + company events,
// processed by Bell: categorized, sentiment-scored, and linked to company
// records (clickable chips). Filter rail + trending sidebar + "scanning" bar.

import { useState, useEffect, useCallback, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

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

export function MarketFeedTab() {
  const [events, setEvents]   = useState([]);
  const [cursor, setCursor]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [stats, setStats]     = useState(null);
  const [trending, setTrending] = useState([]);
  const [category, setCategory] = useState('');
  const [q, setQ] = useState('');
  const maxIdRef = useRef(0);

  const filterParams = useCallback(() => {
    const p = {};
    if (category) p.category = category;
    if (q.trim()) p.q = q.trim();
    return p;
  }, [category, q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.feed({ ...filterParams(), limit: 30 });
      setEvents(r.events || []);
      setCursor(r.next_cursor || null);
      maxIdRef.current = (r.events && r.events[0]) ? r.events[0].id : 0;
    } catch (err) { toast('Feed load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [filterParams]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.feed({ ...filterParams(), cursor, limit: 30 });
      setEvents(prev => [...prev, ...(r.events || [])]);
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
  }, [refreshStats]);

  // Live updates: prepend new items + refresh stats every 20s.
  useEffect(() => {
    const t = setInterval(async () => {
      refreshStats();
      if (!maxIdRef.current) return;
      try {
        const r = await api.feed({ ...filterParams(), after_id: maxIdRef.current, limit: 30 });
        if (r.events && r.events.length) {
          maxIdRef.current = r.events[0].id;
          setEvents(prev => [...r.events, ...prev]);
        }
      } catch { /* ignore */ }
    }, 20_000);
    return () => clearInterval(t);
  }, [filterParams, refreshStats]);

  const breaking = events.filter(e => (e.importance || 0) >= 0.7).slice(0, 8);

  return html`
    <div style=${{ display: 'flex', gap: '18px', padding: '18px 22px', height: '100%', overflow: 'hidden' }}>
      <!-- Main column -->
      <div style=${{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        <!-- Scanning / live stats bar -->
        <div class="feed-scanbar">
          <span class="feed-pulse" data-on=${stats?.scanning ? '1' : '0'}></span>
          <span class="feed-scan-label">${stats?.scanning ? 'Bell is scanning Qatar…' : 'Live market intelligence'}</span>
          <span class="spacer"></span>
          ${stats ? html`
            <span class="feed-stat"><b>${(stats.active_sources || 0).toLocaleString()}</b> sources</span>
            <span class="feed-stat"><b>${(stats.events_today || 0).toLocaleString()}</b> events / 24h</span>
            <span class="feed-stat"><b>${(stats.linked_today || 0).toLocaleString()}</b> linked to companies</span>
          ` : null}
        </div>

        <!-- Breaking ticker -->
        ${breaking.length ? html`
          <div class="feed-ticker">
            <span class="feed-ticker-tag">BREAKING</span>
            <div class="feed-ticker-track">
              ${breaking.map(b => html`<span key=${b.id} class="feed-ticker-item">${b.title}</span>`)}
            </div>
          </div>
        ` : null}

        <!-- Filters -->
        <div class="feed-filters">
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
            events.map(e => html`<${FeedCard} key=${e.id} e=${e} />`)}
          ${!loading && cursor ? html`
            <button class="feed-loadmore" onClick=${loadMore} disabled=${loadingMore}>
              ${loadingMore ? 'Loading…' : 'Load more'}
            </button>` : null}
        </div>
      </div>

      <!-- Trending sidebar -->
      <aside class="feed-aside">
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
  `;
}

function FeedCard({ e }) {
  const cat = e.category || 'other';
  const catColor = CAT_COLOR[cat] || CAT_COLOR.other;
  const openSource = () => { if (e.url) window.open(e.url, '_blank', 'noopener'); };

  return html`
    <article class="feed-card">
      ${e.image_url ? html`<div class="feed-card-img" style=${{ backgroundImage: `url(${e.image_url})` }}></div>` : null}
      <div class="feed-card-body">
        <div class="feed-card-meta">
          <span class="feed-kind">${KIND_LABEL[e.kind] || e.kind}</span>
          <span class="feed-cat" style=${{ color: catColor, borderColor: catColor }}>${cat.replace('_', ' ')}</span>
          ${e.sentiment ? html`<span class="feed-sent" title=${e.sentiment} style=${{ background: SENT_COLOR[e.sentiment] || SENT_COLOR.neutral }}></span>` : null}
          <span class="spacer"></span>
          ${e.source_name ? html`<span class="muted small">${e.source_name}</span>` : null}
          <span class="muted small">· ${timeAgo(e.occurred_at)}</span>
        </div>
        <div class="feed-card-title" onClick=${openSource} style=${{ cursor: e.url ? 'pointer' : 'default' }}>${e.title}</div>
        ${e.summary ? html`<div class="feed-card-summary">${e.summary}</div>` : null}
        ${(e.companies && e.companies.length) ? html`
          <div class="feed-card-chips">
            ${e.companies.map(c => html`
              <button key=${c.id} class="feed-company-chip" onClick=${() => navigateTo('companies', c.id)}>
                ${c.name}
              </button>
            `)}
          </div>` : null}
      </div>
    </article>
  `;
}

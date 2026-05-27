'use client';

// Import Mapbox CSS at module top so webpack bundles it alongside the JS chunk.
// (Same pattern as <HeroGlobe/> — runtime CDN injection raced Map() init.)
import 'mapbox-gl/dist/mapbox-gl.css';

import { useEffect, useRef, useState } from 'react';

/**
 * Live Mapbox embed for /platform/map.
 *
 * Differs from <HeroGlobe/> in three ways:
 *   1. Doha-locked from frame 1 — no world→Qatar flyTo, no rotation intro
 *   2. Continuous signal pulse loop with VISIBLE LABELS on each pulse
 *      (hero shows them in side cards; map page shows them on the dot itself)
 *   3. Dark-v11 basemap for visual distinction from the homepage Standard
 *
 * Falls back to the same CSS-only pulse layer as the hero when:
 *   - NEXT_PUBLIC_MAPBOX_TOKEN is missing
 *   - WebGL is unavailable
 *   - prefers-reduced-motion is set
 *
 * Signal data lives below (inline rather than in /content/ because it's
 * tightly coupled to the loop tick + label rendering here).
 */

export type MapSignalKind =
  | 'hiring' | 'funding' | 'rfp' | 'expansion' | 'partnership';

type MapSignal = {
  lngLat:     [number, number];
  location:   string;
  kindLabel:  string;
  text:       string;
  kind:       MapSignalKind;
  appearAt:   number;
  visibleFor: number;
};

// Color per signal kind — kept consistent with hero-signals.ts so the
// brand palette is unified across the site.
const SIGNAL_COLORS: Record<MapSignalKind, string> = {
  hiring:      'rgb(111 207 151)',
  funding:     'rgb(255 196 99)',
  rfp:         'rgb(196 154 255)',
  expansion:   'rgb(91 140 255)',
  partnership: 'rgb(255 159 180)',
};

// ── Signal dataset ─────────────────────────────────────────────────────────
// 14 signals anchored on real Doha-area coordinates. Each one stays
// visible for ~6 seconds so the labels are readable; the appearAt times
// stagger them so 3-4 pulses overlap at any moment.

const LOOP_SECONDS = 22;

const MAP_SIGNALS: MapSignal[] = [
  { lngLat: [51.5310, 25.3200], location: 'West Bay',          kindLabel: 'LICENCE',    text: 'New QFC licence issued · fintech infra',     kind: 'partnership', appearAt: 0.0,  visibleFor: 6.5 },
  { lngLat: [51.4912, 25.4286], location: 'Lusail',            kindLabel: 'EXPANSION',  text: 'Mwani Qatar capacity expansion announced',  kind: 'expansion',   appearAt: 1.4,  visibleFor: 6.5 },
  { lngLat: [51.5530, 25.3700], location: 'The Pearl',         kindLabel: 'RFP',        text: 'Hospital chain sourcing ERP vendor',         kind: 'rfp',         appearAt: 2.8,  visibleFor: 6.5 },
  { lngLat: [51.4344, 25.3169], location: 'Education City',    kindLabel: 'PARTNERSHIP',text: 'University partners with fintech accelerator',kind: 'partnership',appearAt: 4.2,  visibleFor: 6.5 },
  { lngLat: [51.5278, 25.2828], location: 'Rumailah · Hamad',  kindLabel: 'LEADERSHIP', text: 'New CFO at Doha Health Network',             kind: 'hiring',      appearAt: 5.6,  visibleFor: 6.5 },
  { lngLat: [51.4500, 25.2200], location: 'Industrial Area',   kindLabel: 'FUNDING',    text: 'Manufacturer raised QAR 60M Series B',       kind: 'funding',     appearAt: 7.0,  visibleFor: 6.5 },
  { lngLat: [51.6034, 25.1715], location: 'Al Wakra',          kindLabel: 'EXPANSION',  text: 'Retail group opens 3rd Al Wakra store',      kind: 'expansion',   appearAt: 8.4,  visibleFor: 6.5 },
  { lngLat: [51.5775, 25.9046], location: 'Ras Laffan',        kindLabel: 'FUNDING',    text: 'Energy startup secured QAR 80M',              kind: 'funding',     appearAt: 9.8,  visibleFor: 6.5 },
  { lngLat: [51.5544, 24.9836], location: 'Mesaieed',          kindLabel: 'HIRING',     text: 'Petrochem operator opens 24 senior roles',   kind: 'hiring',      appearAt: 11.2, visibleFor: 6.5 },
  { lngLat: [51.5683, 25.2611], location: 'Hamad Intl Airport',kindLabel: 'PARTNERSHIP',text: 'Cargo handler signs cross-border JV',        kind: 'partnership', appearAt: 12.6, visibleFor: 6.5 },
  { lngLat: [51.4453, 25.2670], location: 'Aspire Zone',       kindLabel: 'RFP',        text: 'Sports body sourcing media-rights agency',   kind: 'rfp',         appearAt: 14.0, visibleFor: 6.5 },
  { lngLat: [51.5460, 25.2350], location: 'C-Ring road',       kindLabel: 'FUNDING',    text: 'Fintech raises QAR 9M seed round',           kind: 'funding',     appearAt: 15.4, visibleFor: 6.5 },
  { lngLat: [51.5333, 25.2867], location: 'Old Doha',          kindLabel: 'LEADERSHIP', text: 'New CEO appointed at Almuftah Group',        kind: 'hiring',      appearAt: 16.8, visibleFor: 4.8 },
  { lngLat: [51.4977, 25.6892], location: 'Al Khor',           kindLabel: 'EXPANSION',  text: 'Logistics co. opens northern hub',           kind: 'expansion',   appearAt: 18.0, visibleFor: 3.8 },
];

// ── Component ──────────────────────────────────────────────────────────────

export function MapPageLive() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef       = useRef<any>(null);
  const [mode, setMode] = useState<'pending' | 'map' | 'fallback'>('pending');

  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      console.warn('[map-page-live] No NEXT_PUBLIC_MAPBOX_TOKEN — falling back.');
      setMode('fallback');
      return;
    }

    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setMode('fallback');
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) { setMode('fallback'); return; }
    } catch {
      setMode('fallback');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        if (cancelled || !containerRef.current) return;

        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({
          container:          containerRef.current,
          style:              'mapbox://styles/mapbox/dark-v11',
          center:             [51.50, 25.30],    // Doha
          zoom:               9.4,
          pitch:              28,
          bearing:            -8,
          interactive:        true,
          // Disable scroll-zoom so the page can scroll past the map without
          // grabbing the wheel. Users can still pan with drag, pinch-zoom on
          // touch, or use the +/- keyboard controls.
          scrollZoom:         false,
          attributionControl: false,
          fadeDuration:       0,
        });
        mapRef.current = map;

        map.on('load', () => {
          if (cancelled) return;
          setMode('map');

          // Defensive resize after the container fades in.
          window.setTimeout(() => {
            try { map.resize(); } catch {}
          }, 200);

          // ── Continuous signal pulse loop ────────────────────────────────
          // No camera animation — the map is static, signals come and go.
          const start = Date.now();
          const markers: any[] = [];

          const tick = () => {
            if (cancelled) return;
            const elapsed  = (Date.now() - start) / 1000;
            const loopTime = elapsed % LOOP_SECONDS;

            // Remove expired markers
            for (let i = markers.length - 1; i >= 0; i--) {
              const m = markers[i];
              const inWindow =
                loopTime >= m.signal.appearAt &&
                loopTime <= m.signal.appearAt + m.signal.visibleFor;
              if (!inWindow) {
                m.marker.remove();
                markers.splice(i, 1);
              }
            }
            // Add markers whose window has just opened
            for (const signal of MAP_SIGNALS) {
              if (loopTime >= signal.appearAt && loopTime <= signal.appearAt + signal.visibleFor) {
                const already = markers.find(m => m.signal === signal);
                if (!already) {
                  const color = SIGNAL_COLORS[signal.kind];
                  const el = document.createElement('div');
                  el.className = 'bell-map-pulse';
                  el.style.color = color;
                  el.innerHTML = `
                    <span class="bell-signal-dot" style="background:${color}"></span>
                    <span class="bell-signal-ring" style="border-color:${color}"></span>
                    <div class="bell-map-pulse-label">
                      <span class="bell-map-pulse-kind" style="color:${color}">${signal.kindLabel}</span>
                      <span class="bell-map-pulse-text">${signal.text}</span>
                      <span class="bell-map-pulse-loc">${signal.location}</span>
                    </div>
                  `;
                  const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                    .setLngLat(signal.lngLat)
                    .addTo(map);
                  markers.push({ signal, marker });
                }
              }
            }
          };

          const interval = window.setInterval(tick, 250);
          (map as any).__bellMapInterval = interval;
        });

        map.on('error', (e: any) => {
          const msg    = e?.error?.message || String(e?.error || e || '');
          const status = e?.error?.status;
          const fatalAuth = status === 401 || status === 403 || /access token|unauthorized/i.test(msg);
          if (fatalAuth) {
            console.error('[map-page-live] AUTH ERROR — token rejected:', msg);
            setMode('fallback');
          } else {
            console.warn('[map-page-live] Mapbox warning (non-fatal):', msg);
          }
        });
      } catch (err) {
        console.error('[map-page-live] init threw — falling back. Error:', err);
        if (!cancelled) setMode('fallback');
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          window.clearInterval((mapRef.current as any).__bellMapInterval);
          mapRef.current.remove();
        } catch {}
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full h-[540px] md:h-[640px] rounded-2xl overflow-hidden border border-border">
      {/* Map container */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: mode === 'map' ? 1 : 0,
          transition: 'opacity 0.9s ease-out',
        }}
      />

      {/* Fallback layer */}
      {mode !== 'map' && (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(180deg, rgba(19,24,41,0.94) 0%, rgba(13,18,35,0.94) 100%)',
          }}
        >
          <div className="absolute inset-0 bg-subtle-grid bg-[size:48px_48px] opacity-[0.06]" />
          {mode === 'fallback' && (
            <>
              {/* Static "Doha" pulses */}
              {[
                { top: '32%', left: '46%', color: SIGNAL_COLORS.partnership, delay: 0   },
                { top: '24%', left: '40%', color: SIGNAL_COLORS.expansion,   delay: 1.0 },
                { top: '38%', left: '54%', color: SIGNAL_COLORS.rfp,         delay: 2.0 },
                { top: '52%', left: '34%', color: SIGNAL_COLORS.partnership, delay: 3.0 },
                { top: '46%', left: '50%', color: SIGNAL_COLORS.hiring,      delay: 4.0 },
                { top: '60%', left: '42%', color: SIGNAL_COLORS.funding,     delay: 5.0 },
                { top: '68%', left: '56%', color: SIGNAL_COLORS.expansion,   delay: 6.0 },
              ].map((p, i) => (
                <span
                  key={i}
                  className="bell-signal-pulse-static"
                  style={{
                    top: p.top, left: p.left,
                    ['--pulse-color' as string]: p.color,
                    animationDelay: p.delay + 's',
                  } as React.CSSProperties}
                />
              ))}
              <div className="absolute bottom-4 left-4 text-[10px] font-mono uppercase tracking-wider text-text-dim">
                Map preview &middot; live mode requires Mapbox token
              </div>
            </>
          )}
        </div>
      )}

      {/* Legend overlay — top-right */}
      <div className="absolute top-3 right-3 z-10 pointer-events-none">
        <div
          className="rounded-lg border border-border px-3 py-2.5"
          style={{
            background: 'rgba(13,18,35,0.85)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="text-[9.5px] font-mono uppercase tracking-wider text-text-dim mb-2">
            Signal kinds
          </div>
          <ul className="space-y-1.5">
            {(['expansion','funding','rfp','partnership','hiring'] as MapSignalKind[]).map((k) => (
              <li key={k} className="flex items-center gap-2 text-[10.5px]">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ background: SIGNAL_COLORS[k], boxShadow: '0 0 6px ' + SIGNAL_COLORS[k] }}
                />
                <span className="text-text capitalize">{k}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Live indicator — top-left */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <div
          className="rounded-lg border border-border px-3 py-2 flex items-center gap-2"
          style={{
            background: 'rgba(13,18,35,0.85)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <span className="relative inline-flex items-center justify-center w-2 h-2">
            <span className="absolute inline-flex w-full h-full rounded-full bg-accent-bright opacity-50 animate-ping" />
            <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-accent-bright" />
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text">
            Live signal feed &middot; Doha
          </span>
        </div>
      </div>

      {/* Bottom gradient for text legibility on dark basemap */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, transparent 0%, rgba(13,18,35,0.6) 100%)',
        }}
      />

      {/* Bottom-left info chip — anchored flush to the corner so the
          Mapbox logo underneath is fully covered (no peek at the side).
          Only the top-right corner is rounded since the other two edges
          meet the map's own rounded corner. */}
      <div className="absolute bottom-0 left-0 z-10 pointer-events-none">
        <div
          className="rounded-tr-lg border-t border-r border-border px-3.5 py-2.5"
          style={{
            background: 'rgba(13,18,35,0.94)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-text-dim mb-0.5">
            <span
              className="inline-block w-1.5 h-1.5 rounded-full bg-accent-bright"
              style={{ boxShadow: '0 0 6px rgb(165 195 255)' }}
              aria-hidden="true"
            />
            Demo loop
          </div>
          <div className="text-[11px] text-text leading-snug">
            14 signals &middot; auto-refresh every 22s
          </div>
        </div>
      </div>
    </div>
  );
}

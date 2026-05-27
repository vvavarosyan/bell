'use client';

// Import Mapbox CSS at module top so webpack bundles it alongside the JS chunk.
// Without this, the map canvas renders at 0x0 pixels and is invisible — even
// though Mapbox JS itself loads fine. We tried runtime CDN <link> injection but
// it raced the Map() init: by the time CSS arrived the canvas was already sized.
import 'mapbox-gl/dist/mapbox-gl.css';

import { useEffect, useRef, useState } from 'react';
import {
  HERO_SIGNALS,
  SIGNAL_COLORS,
  LOOP_SECONDS,
  QATAR_CENTER,
  QATAR_ZOOM,
  QATAR_PITCH,
  QATAR_BEARING,
  CAMERA_ARRIVAL_MS,
  FLY_DURATION_MS,
  FLY_START_MS,
  ROTATION_START_MS,
  ROTATION_DURATION_MS,
  FLY_OVERLAP_FRACTION,
} from '@/content/hero-signals';

/**
 * Hero background globe.
 *
 * Animation timeline:
 *   T=0      Mapbox loads in globe projection at world scale, slow auto-rotate
 *   T=600ms  flyTo(Qatar) begins — 4-second cinematic ease
 *   T=4.6s   Camera settles on Qatar (zoom 7.6, pitch 35°)
 *   T=5s+    Signal pulses appear across Qatar on a 16-second loop
 *
 * Falls back to a static dark gradient + animated SVG signal pulses when:
 *   - NEXT_PUBLIC_MAPBOX_TOKEN is missing
 *   - The browser lacks WebGL
 *   - The user has prefers-reduced-motion set
 *
 * The overlay text content lives in <HeroOverlay/> and sits ABOVE this
 * component in the DOM, so this layer is purely atmospheric.
 */
export function HeroGlobe() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef       = useRef<any>(null);
  const [mode, setMode] = useState<'pending' | 'map' | 'fallback'>('pending');

  useEffect(() => {
    // Bail to fallback if any preflight check fails
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    console.log('[hero-globe] init — token present?', !!token, 'length:', token?.length);

    if (!token) {
      console.warn('[hero-globe] No NEXT_PUBLIC_MAPBOX_TOKEN at build time. Did you restart the dev server after creating .env.local?');
      setMode('fallback');
      return;
    }

    const reduceMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      console.info('[hero-globe] prefers-reduced-motion is on → showing static fallback.');
      setMode('fallback');
      return;
    }

    // Quick WebGL sniff
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) {
        console.warn('[hero-globe] No WebGL on this browser → showing static fallback.');
        setMode('fallback');
        return;
      }
      console.log('[hero-globe] WebGL OK');
    } catch (e) {
      console.warn('[hero-globe] WebGL check threw:', e);
      setMode('fallback');
      return;
    }

    // All checks passed — load Mapbox lazily so it stays out of the initial bundle.
    let cancelled = false;
    (async () => {
      try {
        console.log('[hero-globe] importing mapbox-gl…');
        const mapboxgl = (await import('mapbox-gl')).default;
        console.log('[hero-globe] mapbox-gl loaded, version:', mapboxgl.version);

        // (CSS is imported at module top — no runtime injection needed.)
        if (cancelled || !containerRef.current) return;

        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({
          container:     containerRef.current,
          // "Standard" — Mapbox's flagship 3D-capable style. Lighter, more
          // colorful than dark-v11. We tone it down with the vignette + an
          // opacity of 0.78 so it stays atmospheric rather than busy.
          style:         'mapbox://styles/mapbox/standard',
          projection:    'globe',           // v3 accepts the string form
          center:        [55, 25],          // start tilted, will fly into Qatar
          zoom:          1.6,
          pitch:         0,
          bearing:       0,
          interactive:   false,
          attributionControl: false,
          fadeDuration:  0,
        });
        mapRef.current = map;
        console.log('[hero-globe] map instance created, waiting for style.load…');

        map.on('style.load', () => {
          console.log('[hero-globe] style loaded ✓');

          // Subtle space "fog" + atmosphere for the globe view. Tuned for
          // the Standard basemap's lighter palette so the horizon doesn't
          // clash with the colorful continents.
          try {
            (map as any).setFog?.({
              'color':         'rgb(10, 14, 26)',
              'high-color':    'rgb(60, 90, 170)',
              'horizon-blend': 0.05,
              'space-color':   'rgb(5, 7, 16)',
              'star-intensity': 0.6,
            });
          } catch { /* fog not supported on this style — fine */ }

          // The Standard style supports config presets. We could switch to
          // "dusk" or "night" for a moodier look (uncomment if Val prefers):
          // try { (map as any).setConfigProperty?.('basemap', 'lightPreset', 'dusk'); } catch {}
        });

        map.on('load', () => {
          if (cancelled) return;
          console.log('[hero-globe] map loaded ✓ — switching to map mode');
          setMode('map');
          // Defensive: re-measure the canvas right after the container's
          // opacity transition starts. If layout shifted at all, the canvas
          // gets the right size instead of being stuck at last measurement.
          window.setTimeout(() => {
            try {
              map.resize();
              const canvas = containerRef.current?.querySelector('canvas');
              const rect   = containerRef.current?.getBoundingClientRect();
              console.log(
                '[hero-globe] DEBUG container size:',
                rect?.width, 'x', rect?.height,
                '| canvas size:', canvas?.width, 'x', canvas?.height,
              );
            } catch {}
          }, 200);

          // ── Phase 1 → Phase 2: 360° rotation OVERLAPPING flyTo Qatar ────
          // The rotation animates the map center longitude from `startLng`
          // round to `startLng + 360` over ROTATION_DURATION_MS using
          // easeInOutQuad. When the rotation reaches FLY_OVERLAP_FRACTION
          // (e.g. 85%), we fire the flyTo INSTEAD of completing the
          // remaining frames. The visual effect: the tail of the spin
          // blends seamlessly into the zoom toward Qatar.
          //
          // Once flyTo fires, we stop scheduling rotation frames so our
          // setCenter calls don't fight Mapbox's own camera animation.
          const startLng = 55;
          let rotationFrameId = 0;
          const rotationStart = Date.now() + ROTATION_START_MS;
          let flyTriggered    = false;
          let rotationStopped = false;

          const easeInOutQuad = (t: number) =>
            t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

          const startFlyToQatar = (source: string) => {
            if (cancelled || flyTriggered) return;
            flyTriggered    = true;
            rotationStopped = true;
            console.log(`[hero-globe] flyTo Qatar (triggered by: ${source})`);
            map.flyTo({
              center:   QATAR_CENTER,
              zoom:     QATAR_ZOOM,
              pitch:    QATAR_PITCH,
              bearing:  QATAR_BEARING,
              duration: FLY_DURATION_MS,
              essential: true,
              curve:    1.4,
            });
          };

          const rotateFrame = () => {
            if (cancelled || rotationStopped) return;
            const elapsed = Date.now() - rotationStart;
            if (elapsed < 0) {
              rotationFrameId = window.requestAnimationFrame(rotateFrame);
              return;
            }
            const progress = Math.min(elapsed / ROTATION_DURATION_MS, 1);
            const eased    = easeInOutQuad(progress);
            const lng      = startLng + (eased * 360);
            try { map.setCenter([lng, 25]); } catch { /* ignore */ }

            // Overlap trigger: at FLY_OVERLAP_FRACTION (default 0.85),
            // hand off from manual rotation to the flyTo animation.
            if (progress >= FLY_OVERLAP_FRACTION) {
              startFlyToQatar('rotation overlap');
              return;     // stop scheduling rotation frames
            }
            rotationFrameId = window.requestAnimationFrame(rotateFrame);
            (map as any).__bellRotationFrame = rotationFrameId;
          };
          rotationFrameId = window.requestAnimationFrame(rotateFrame);
          (map as any).__bellRotationFrame = rotationFrameId;

          // Safety net: if for any reason the rotation callback doesn't fire
          // (paused tab, hidden viewport, browser throttle), a backup timer
          // kicks the flyTo at the expected moment.
          window.setTimeout(() => {
            if (!flyTriggered && !cancelled) {
              console.warn('[hero-globe] rotation never reached overlap — using backup flyTo timer');
              startFlyToQatar('backup timer');
            }
          }, FLY_START_MS + 300);

          // After camera settles, start the signal cycling loop.
          // Each signal places a small pulsing dot on the map (NO text label
          // here — the human-readable copy lives in the side cards rendered
          // by <HeroSignalCards/>). The map dots are purely a spatial cue.
          const start = Date.now();
          const cameraArrivedSec = CAMERA_ARRIVAL_MS / 1000;     // 6.6
          const markers: any[] = [];

          const tick = () => {
            if (cancelled) return;
            const elapsed  = (Date.now() - start) / 1000;
            const loopTime = (elapsed - cameraArrivedSec) % LOOP_SECONDS;
            if (loopTime < 0) return;          // still pre-arrival

            // Remove markers whose window has closed
            for (let i = markers.length - 1; i >= 0; i--) {
              const m = markers[i];
              if (loopTime < m.signal.appearAt || loopTime > m.signal.appearAt + m.signal.visibleFor) {
                m.marker.remove();
                markers.splice(i, 1);
              }
            }
            // Add markers whose window has just opened
            for (const signal of HERO_SIGNALS) {
              if (loopTime >= signal.appearAt && loopTime <= signal.appearAt + signal.visibleFor) {
                const already = markers.find(m => m.signal === signal);
                if (!already) {
                  const el = document.createElement('div');
                  el.className = 'bell-signal-pulse';
                  el.innerHTML = `
                    <span class="bell-signal-dot" style="background:${SIGNAL_COLORS[signal.kind]}"></span>
                    <span class="bell-signal-ring" style="border-color:${SIGNAL_COLORS[signal.kind]}"></span>
                  `;
                  const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
                    .setLngLat(signal.lngLat)
                    .addTo(map);
                  markers.push({ signal, marker });
                }
              }
            }
          };

          // Tick every 250ms — smooth enough without burning CPU
          const interval = window.setInterval(tick, 250);
          (map as any).__bellSignalsInterval = interval;
        });

        // Mapbox emits 'error' for lots of transient things (a single failed
        // tile fetch, network glitch, etc.). Only treat AUTH errors as fatal —
        // those mean the token is rejected and the map will never work.
        // Everything else: log it and let Mapbox keep trying.
        map.on('error', (e: any) => {
          const msg    = e?.error?.message || String(e?.error || e || '');
          const status = e?.error?.status;
          const fatalAuth = status === 401 || status === 403 || /access token|unauthorized/i.test(msg);
          if (fatalAuth) {
            console.error('[hero-globe] AUTH ERROR — token rejected by Mapbox:', msg);
            console.error('              Double-check your token at https://account.mapbox.com/access-tokens/');
            console.error('              and make sure URL restrictions include "localhost".');
            setMode('fallback');
          } else {
            console.warn('[hero-globe] Mapbox warning (non-fatal):', msg);
          }
        });
      } catch (err) {
        console.error('[hero-globe] init threw — falling back. Error:', err);
        if (!cancelled) setMode('fallback');
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          window.clearInterval((mapRef.current as any).__bellSignalsInterval);
          window.cancelAnimationFrame((mapRef.current as any).__bellRotationFrame);
          mapRef.current.remove();
        } catch { /* ignore */ }
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      {/* Map container — fills the hero. Inline width/height to bypass any
          Tailwind compilation surprises (we hit this in dev). Pointer events
          disabled on the parent wrapper so clicks pass through to the
          overlay; Mapbox is purely decorative. */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          top: 0, right: 0, bottom: 0, left: 0,
          width: '100%',
          height: '100%',
          opacity: mode === 'map' ? 0.78 : 0,
          transition: 'opacity 1.6s ease-out',
        }}
      />

      {/* Fallback layer — radial accent glow + animated pulses (CSS only) */}
      {mode !== 'map' && (
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-accent-glow opacity-60" />
          <div className="absolute inset-0 bg-subtle-grid bg-[size:48px_48px] opacity-[0.04]" />
          {mode === 'fallback' && (
            <>
              {[
                { top:'22%', left:'34%', color: SIGNAL_COLORS.hiring,      delay:0   },
                { top:'40%', left:'58%', color: SIGNAL_COLORS.funding,     delay:1.2 },
                { top:'62%', left:'30%', color: SIGNAL_COLORS.rfp,         delay:2.4 },
                { top:'34%', left:'72%', color: SIGNAL_COLORS.expansion,   delay:3.6 },
                { top:'70%', left:'60%', color: SIGNAL_COLORS.partnership, delay:4.8 },
              ].map((p, i) => (
                <span
                  key={i}
                  className="bell-signal-pulse-static"
                  style={{
                    top: p.top, left: p.left,
                    '--pulse-color': p.color,
                    animationDelay: p.delay + 's',
                  } as React.CSSProperties}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Dark vignette over the map. Keeps the colorful Standard-style basemap
          atmospheric at the center while ensuring the text overlay (white-ish
          headlines, etc.) stays readable. Slightly stronger than the dark
          basemap version because Standard has more chroma. */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, rgba(10,14,26,0.10) 0%, rgba(10,14,26,0.40) 45%, rgba(10,14,26,0.85) 80%, rgba(10,14,26,0.97) 100%)',
        }}
      />
    </div>
  );
}

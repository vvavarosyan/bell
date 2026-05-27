/**
 * Market signals shown on the home page hero.
 *
 * Each signal renders in TWO places:
 *   • As a small pulsing dot on the Mapbox map (at lngLat)
 *   • As a card in the side-drawer columns (left or right of the hero),
 *     showing the full text and metadata
 *
 * Currently these are illustrative placeholders. When the live data feed
 * is wired up (later round), they'll be replaced with real-time signals
 * pulled from the BDI dataset via the user-portal API.
 */

export type SignalKind = 'hiring' | 'funding' | 'rfp' | 'expansion' | 'partnership';

export type HeroSignal = {
  /** Map coordinates: [longitude, latitude] */
  lngLat: [number, number];
  /** Human-readable location label shown in the card footer */
  location: string;
  /** Short ALL-CAPS badge: HIRING / FUNDING / RFP / EXPANSION / PARTNERSHIP */
  kindLabel: string;
  /** Main signal text shown in the card body */
  text: string;
  /** Category — drives color */
  kind: SignalKind;
  /** When during the looped animation this signal appears (seconds, relative to loop start) */
  appearAt: number;
  /** How long it stays visible before fading (seconds) */
  visibleFor: number;
};

// Coordinates anchored on real Qatar locations so the dots on the map sit
// over the actual cities the signals reference.
// Doha city centre ≈ [51.5310, 25.2854]
//
// All appearAt times are RELATIVE TO CAMERA ARRIVAL. The first signal fires
// the moment the flyTo completes — no gap between zoom-in and content.
export const HERO_SIGNALS: HeroSignal[] = [
  {
    lngLat:    [51.5310, 25.2854],     // Doha — West Bay
    location:  'Doha · West Bay',
    kindLabel: 'HIRING',
    text:      'Tech firm opening 14 senior engineering roles.',
    kind:      'hiring',
    appearAt:  0.0,                    // immediately on camera arrival
    visibleFor: 5.5,
  },
  {
    lngLat:    [51.4912, 25.4286],     // Lusail
    location:  'Lusail',
    kindLabel: 'FUNDING',
    text:      'Logistics startup closed a Series B round.',
    kind:      'funding',
    appearAt:  1.4,
    visibleFor: 5.5,
  },
  {
    lngLat:    [51.5530, 25.3700],     // The Pearl
    location:  'The Pearl-Qatar',
    kindLabel: 'RFP',
    text:      'Hospital chain sourcing ERP vendors.',
    kind:      'rfp',
    appearAt:  2.8,
    visibleFor: 5.5,
  },
  {
    lngLat:    [51.6034, 25.1715],     // Al Wakrah
    location:  'Al Wakrah',
    kindLabel: 'EXPANSION',
    text:      'Retail group opens 3rd store in Al Wakrah.',
    kind:      'expansion',
    appearAt:  4.2,
    visibleFor: 5.5,
  },
  {
    lngLat:    [51.5775, 25.9046],     // Ras Laffan
    location:  'Ras Laffan',
    kindLabel: 'FUNDING',
    text:      'Energy startup secured QAR 80M.',
    kind:      'funding',
    appearAt:  5.6,
    visibleFor: 5.5,
  },
  {
    lngLat:    [51.4344, 25.3169],     // Education City
    location:  'Education City',
    kindLabel: 'PARTNERSHIP',
    text:      'University partners with fintech accelerator.',
    kind:      'partnership',
    appearAt:  7.0,
    visibleFor: 5.5,
  },
  {
    lngLat:    [51.5544, 24.9836],     // Mesaieed (industrial)
    location:  'Mesaieed',
    kindLabel: 'HIRING',
    text:      'Manufacturer tripled hiring pace.',
    kind:      'hiring',
    appearAt:  8.4,
    visibleFor: 5.5,
  },
  {
    lngLat:    [51.4977, 25.6892],     // Al Khor
    location:  'Al Khor',
    kindLabel: 'PARTNERSHIP',
    text:      'New QFC license issued for fintech.',
    kind:      'partnership',
    appearAt:  9.8,
    visibleFor: 5.5,
  },
];

// Color per signal kind. Used by both the marker pulse and the card accent.
export const SIGNAL_COLORS: Record<SignalKind, string> = {
  hiring:      'rgb(111 207 151)',     // green
  funding:     'rgb(255 196 99)',      // amber
  rfp:         'rgb(196 154 255)',     // violet
  expansion:   'rgb(91 140 255)',      // blue (brand)
  partnership: 'rgb(255 159 180)',     // pink
};

// The full loop length — signals cycle every LOOP_SECONDS so the hero feels
// alive even if the user lingers. Slightly longer than the last signal's
// (appearAt + visibleFor) so there's a brief breath before the loop restarts.
export const LOOP_SECONDS = 17;

// ─── Hero animation timeline (milliseconds from page load) ──────────────────
//
//   T=0                                Map appears, globe view at world scale
//   T=ROTATION_START_MS                Globe begins a full 360° spin
//   T=FLY_START_MS                     flyTo Qatar STARTS — overlaps the last
//                                      15% of the rotation, so the tail of the
//                                      spin visually blends into the zoom
//   T=CAMERA_ARRIVAL_MS                Camera settles over Qatar
//   T=CAMERA_ARRIVAL_MS                Signals + text overlay start IMMEDIATELY
//                                      (no delay between zoom-in and content)
//
// To tune the intro, only edit these constants.
export const ROTATION_START_MS    = 300;       // start rotating almost immediately
export const ROTATION_DURATION_MS = 4000;      // 4-second full 360° spin

// At what fraction of the rotation should the flyTo START? 0.85 = "85% into
// the rotation, kick off the zoom". The remaining 15% of rotation is then
// overridden by the flyTo so the transition is seamless.
export const FLY_OVERLAP_FRACTION = 0.85;

export const FLY_START_MS         = ROTATION_START_MS + (ROTATION_DURATION_MS * FLY_OVERLAP_FRACTION);  // 3700
export const FLY_DURATION_MS      = 6000;
export const CAMERA_ARRIVAL_MS    = FLY_START_MS + FLY_DURATION_MS;             // 9700

// Map camera targets after flyTo completes.
// Center is on the Doha → Lusail → Pearl signal cluster so the visual focus
// matches where most market activity happens. The two outliers (Ras Laffan
// to the north, Mesaieed to the south) sit just off-screen — that's fine
// because their cards still appear in the side feed.
export const QATAR_CENTER:  [number, number] = [51.50, 25.40];
export const QATAR_ZOOM     = 8.0;    // bumped from 7.6 — Val wanted closer
export const QATAR_PITCH    = 35;
export const QATAR_BEARING  = -8;

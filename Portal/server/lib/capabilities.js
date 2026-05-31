// Single source of truth for WHICH OPERATIONS each deployment may perform.
//
// Bell runs one codebase as three deployments (BDI_MODE):
//   • local-admin  → Val's Mac. The data ENGINE + source of truth. Reads the
//                    directory JSON files, runs enrichment/assembly, assigns ids,
//                    and is the only place canonical data may be mutated.
//   • admin        → admin.bell.qa. Bell staff observing/operating PROD. Prod is
//                    an exact mirror of local, so it must NOT originate or mutate
//                    canonical data (a write here gets clobbered by the next
//                    mirror push). It may manage prod-owned things (settings).
//   • user         → app.bell.qa. Customers. Read + reveal only.
//
// Declaring a capability HERE drives both (a) the server route gate and (b) what
// the UI shows — so a capability can never be visible somewhere it isn't allowed.
// As we add more complex operations, each one gets a line here and is hidden +
// blocked everywhere it doesn't belong, automatically.

const MODE = (process.env.BDI_MODE || 'local-admin').toLowerCase();

// Tier → which modes may use a capability in that tier.
//   local   = local engine ONLY (heavy compute, local files, canonical writes)
//   admin   = admin.bell.qa + local engine (prod-staff tools)
//   feature = any signed-in product surface (user + admin + local)
const TIER_MODES = {
  local:   ['local-admin'],
  admin:   ['local-admin', 'admin'],
  feature: ['local-admin', 'admin', 'user'],
};

// Capability catalog. Keep keys stable — the UI references them.
const CAPABILITIES = {
  // --- local engine only (source-of-truth compute) ---
  directory_ingest:    'local',  // /api/sources — read Mac JSON, upsert canonical
  enrichment_stages:   'local',  // /api/enrichment — Stages 1-6
  assembly_dedup:      'local',  // /api/assembly — BIN/PIN assignment + dedup
  job_runs:            'local',  // /api/job-runs — logs for the above
  canonical_mutation:  'local',  // edit/archive/reset/delete companies·people·jobs
  reconciliation:      'local',  // upload review queue (Phase 2)
  sync_push:           'local',  // local→live mirror push / rebuild (already gated)
  // --- admin + local ---
  platform_settings:   'admin',  // /api/settings — prod service keys, etc.
  similar_companies:   'admin',  // similar-company panel data
  // --- any signed-in surface ---
  research:            'feature',
  market_feed:         'feature',
  companies_view:      'feature',
  people_view:         'feature',
  deep_data:           'feature',
  map:                 'feature',
};

/** True if `mode` may use `capability`. */
export function modeAllows(capability, mode = MODE) {
  const tier = CAPABILITIES[capability];
  if (!tier) return false;
  return TIER_MODES[tier].includes(mode);
}

/** Flat { capability: boolean } map for a mode — surfaced to the UI. */
export function capabilitiesForMode(mode = MODE) {
  const out = {};
  for (const cap of Object.keys(CAPABILITIES)) out[cap] = modeAllows(cap, mode);
  return out;
}

export { CAPABILITIES, MODE as CURRENT_MODE };

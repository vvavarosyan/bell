// Research type dispatch — the six job types from the marketing site.
//
// Phase R1 ships the metadata; only `company` is "implemented" (i.e. you can
// create a job, but R2 will wire it to actually run). Other types are visible
// in the UI as "soon" so admin sees the full menu.

export const RESEARCH_TYPES = {
  company: {
    id:           'company',
    label:        'Company deep-dive',
    short:        'Company',
    tint:         'rgb(91 140 255)',
    description:  'Full operational picture of one company — ownership, leadership, financial trajectory, M&A signals.',
    brief_template: (target) =>
      `Full operational picture of ${target} — ownership, leadership, financial trajectory, M&A signals.`,
    requires_target: 'company',
    implemented: true,
  },
  person: {
    id:           'person',
    label:        'Person profile',
    short:        'Person',
    tint:         'rgb(111 207 151)',
    description:  'Career arc, public footprint, and current sphere of influence.',
    brief_template: (target) =>
      `Career arc, public footprint, and current sphere of influence for ${target}.`,
    requires_target: 'person',
    implemented: false,
  },
  sector: {
    id:           'sector',
    label:        'Sector landscape',
    short:        'Sector',
    tint:         'rgb(255 196 99)',
    description:  'A Qatari sector mapped end-to-end — providers, ownership clusters, regulatory direction, M&A.',
    brief_template: (target) =>
      `The full Qatari ${target} sector — providers, ownership clusters, regulatory direction, M&A activity 2022 to present.`,
    requires_target: null,
    implemented: false,
  },
  theme: {
    id:           'theme',
    label:        'Thematic deep-dive',
    short:        'Theme',
    tint:         'rgb(196 154 255)',
    description:  'A theme or macro question — exposure, mitigation, peer responses.',
    brief_template: (target) =>
      `${target} — exposure, mitigation, peer responses.`,
    requires_target: null,
    implemented: false,
  },
  region: {
    id:           'region',
    label:        'Regional cluster',
    short:        'Region',
    tint:         'rgb(165 195 255)',
    description:  'A regional competitive map — players, funding flows, regulator stance.',
    brief_template: (target) =>
      `${target} competitive map — players, funding flows, regulator stance.`,
    requires_target: null,
    implemented: false,
  },
  regulation: {
    id:           'regulation',
    label:        'Regulatory tracking',
    short:        'Regulation',
    tint:         'rgb(232 142 168)',
    description:  'Standing monitor — any change in QFC / QCB / QFMA / MoCI output affecting clients.',
    brief_template: () =>
      `Live monitoring of QFC, QCB, QFMA, and MoCI regulatory output — any change affecting our advisory clients.`,
    requires_target: null,
    implemented: false,
  },
};

export const STATUS_META = {
  queued:        { label: 'Queued',       color: 'rgb(165 195 255)' },
  gathering:     { label: 'Gathering',    color: 'rgb(165 195 255)' },
  synthesizing: { label: 'Synthesizing', color: 'rgb(255 196 99)'  },
  ready:         { label: 'Ready',        color: 'rgb(111 207 151)' },
  failed:        { label: 'Failed',       color: 'rgb(232 142 168)' },
  cancelled:     { label: 'Cancelled',    color: 'rgb(140 140 140)' },
};

export function typeInfo(id) { return RESEARCH_TYPES[id] || null; }

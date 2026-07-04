// Research type dispatch — the job types offered in the Research console.
//
// Val 2026-07-04: the menu is Company (deep-dive), Person (profile),
// Sector (landscape), and Other (research anything). Theme / Region /
// Regulation were retired — "Other" covers any free-form research need.

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
    description:  'Public professional profile of an individual — career arc, roles, affiliations, and sphere of influence.',
    // Free-form subject (a name typed into the brief). We do NOT force a
    // target_person_id: customers can't browse People (lockdown), and the
    // subject may be a public figure who isn't a Bell record.
    brief_template: (target) =>
      `Public professional profile of ${target} — career arc, current roles, board seats, affiliations, and sphere of influence.`,
    requires_target: null,
    implemented: true,
  },
  sector: {
    id:           'sector',
    label:        'Sector landscape',
    short:        'Sector',
    tint:         'rgb(255 196 99)',
    description:  'A Qatari sector mapped end-to-end — leading players, ownership clusters, regulatory direction, and M&A.',
    brief_template: (target) =>
      `The Qatari ${target} sector — leading players, ownership clusters, regulatory direction, and M&A activity from 2022 to present.`,
    requires_target: null,
    implemented: true,
  },
  other: {
    id:           'other',
    label:        'Research anything',
    short:        'Other',
    tint:         'rgb(196 154 255)',
    description:  'Open-ended research on any question, market, event, or topic — a cited report built to your brief.',
    brief_template: (target) =>
      `${target || 'Describe exactly what you want researched'} — a thorough, cited answer.`,
    requires_target: null,
    implemented: true,
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

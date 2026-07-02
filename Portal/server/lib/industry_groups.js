// Umbrella SECTOR groups over the canonical industries (A3 findability, Val
// 2026-07-02): users think "beauty salons" / "medical establishments", not tag
// taxonomy. Each sector expands to canonical industry tags; the Companies
// filter shows sectors WITH LIVE COUNTS ("Health & Medical · 4,182") and the
// industry picker's search also matches the derivation KEYWORDS (so "salon"
// finds Beauty & Wellness). Selecting a sector simply selects its tags — the
// existing `industries && ARRAY[...]` filter mechanics do the rest.

import { query } from '../db.js';
import { LABEL_MAP } from './industry.js';

// Every canonical industry appears in exactly one sector (35 tags / 15 sectors).
export const SECTOR_GROUPS = [
  { id: 'health',       label: 'Health & Medical',          tags: ['Healthcare', 'Pharmaceuticals'] },
  { id: 'beauty',       label: 'Beauty & Personal Care',    tags: ['Beauty & Wellness'] },
  { id: 'finance',      label: 'Financial Services',        tags: ['Banking & Finance', 'Insurance'] },
  { id: 'construction', label: 'Construction & Real Estate', tags: ['Construction & Contracting', 'Engineering', 'Real Estate', 'Furniture & Interior'] },
  { id: 'energy',       label: 'Energy & Industrials',      tags: ['Oil & Gas', 'Energy & Utilities', 'Manufacturing', 'Chemicals & Plastics'] },
  { id: 'tech',         label: 'Technology & Telecom',      tags: ['Information Technology', 'Telecommunications'] },
  { id: 'trade',        label: 'Trade & Retail',            tags: ['Trading & Distribution', 'Retail', 'Jewellery & Gold', 'Textiles & Garments', 'Automotive'] },
  { id: 'hospitality',  label: 'Hospitality & Tourism',     tags: ['Hospitality & F&B', 'Travel & Tourism'] },
  { id: 'logistics',    label: 'Transport & Logistics',     tags: ['Logistics & Transport', 'Aviation & Aerospace'] },
  { id: 'services',     label: 'Professional Services',     tags: ['Consulting', 'Legal Services', 'Marketing & Advertising', 'Media & Entertainment', 'Manpower & Recruitment'] },
  { id: 'facilities',   label: 'Facilities & Security',     tags: ['Facilities & Cleaning', 'Security Services'] },
  { id: 'education',    label: 'Education & Training',      tags: ['Education & Training'] },
  { id: 'public',       label: 'Government & Public',       tags: ['Government & Public Sector'] },
  { id: 'agri',         label: 'Agriculture & Fisheries',   tags: ['Agriculture & Fisheries'] },
  { id: 'sports',       label: 'Sports & Recreation',       tags: ['Sports & Recreation'] },
];

// tag → search keywords, reusing the SAME keyword lists the derivation engine
// uses (single source of truth: industry.js LABEL_MAP). "salon" → Beauty &
// Wellness because that's literally how the tag is derived.
export const TAG_SYNONYMS = Object.fromEntries(
  LABEL_MAP.map(([canonical, keywords]) => [canonical, keywords.map((k) => String(k).trim())]),
);

// Live per-sector counts over ACTIVE, unarchived companies. One round trip
// (FILTER aggregates), cached for 10 minutes — counts inform, they don't need
// to be real-time.
let cache = { at: 0, payload: null };
const TTL_MS = 10 * 60 * 1000;

export async function getIndustryGroups() {
  if (cache.payload && Date.now() - cache.at < TTL_MS) return cache.payload;
  const selects = SECTOR_GROUPS.map((g, i) => `count(*) FILTER (WHERE industries && $${i + 1}) AS g${i}`);
  const params = SECTOR_GROUPS.map((g) => g.tags);
  const r = await query(
    `SELECT ${selects.join(', ')}
       FROM companies
      WHERE COALESCE(archived, false) = false AND COALESCE(is_active, true) = true`,
    params,
  );
  const row = r.rows[0] || {};
  const payload = {
    groups: SECTOR_GROUPS.map((g, i) => ({ ...g, count: Number(row['g' + i]) || 0 })),
    synonyms: TAG_SYNONYMS,
  };
  cache = { at: Date.now(), payload };
  return payload;
}

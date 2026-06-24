// Persistent side detail panel — 3 tabs: Company, People, Legal.
// All fields a company can possibly have are surfaced across these three tabs.

import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';
import { formatValue, isEmptyValue } from '../lib/format.js';
import { BellScore } from './BellScore.js';
import { ContactIcons } from './ContactIcons.js';
import { RequestDetailsBox } from './RequestDetailsBox.js';
import { CompanyLogo } from './CompanyLogo.js';
import { SourceBadge } from './SourceBadge.js';
import { ContactsList } from './ContactsList.js';
import { EditableKv } from './EditableKv.js';

// Human labels for the archive/reconciliation reason codes set by the engine.
const ARCHIVE_REASON_LABEL = {
  inactive:        'inactive',
  qfz_disappeared: 'left QFZ',
  admin:           'by admin',
  legacy:          'legacy',
};
// 'disappeared_from_MOCI' → 'MOCI'
function REVIEW_REASON_LABEL(reason) {
  const m = /^disappeared_from_(.+)$/.exec(reason || '');
  return m ? m[1] : (reason || 'a source');
}

// Per-field type + editability override map. Default: type='text', editable=true.
// System fields (timestamps, IDs, JSON aggregates) are explicitly read-only.
const COMPANY_FIELD_META = {
  bin:                     { editable: false },
  is_active:               { type: 'boolean' },
  incorporation_date:      { type: 'date' },
  founded_year:            { type: 'number' },
  latitude:                { type: 'number' },
  longitude:               { type: 'number' },
  employee_count:          { type: 'number' },
  __employees:             { editable: false },   // merged exact+range display (read-only)
  __industries:            { editable: false },   // extra industry tags beyond the primary (read-only)
  linkedin_followers:      { type: 'number' },
  gmaps_rating:            { type: 'number' },
  gmaps_reviews_count:     { type: 'number' },
  website:                 { type: 'url' },
  linkedin_url:            { type: 'url' },
  linkedin_logo_url:       { type: 'url' },
  linkedin_cover_url:      { type: 'url' },
  gmaps_url:               { type: 'url' },
  // jsonb / system fields — read-only
  linkedin_locations:      { editable: false },
  gmaps_hours:             { editable: false },
  gmaps_photos:            { editable: false },
  // Enrichment + bookkeeping — all read-only
  stage1_status: { editable: false }, stage1_at: { editable: false, type: 'date' },
  stage2_status: { editable: false }, stage2_at: { editable: false, type: 'date' },
  stage3_status: { editable: false }, stage3_at: { editable: false, type: 'date' },
  stage4_status: { editable: false }, stage4_at: { editable: false, type: 'date' },
  stage5_status: { editable: false }, stage5_at: { editable: false, type: 'date' },
  stage6_status: { editable: false }, stage6_at: { editable: false, type: 'date' },
  stage7_status: { editable: false }, stage7_at: { editable: false, type: 'date' },
  stage8_status: { editable: false }, stage8_at: { editable: false, type: 'date' },
  created_at:    { editable: false, type: 'date' },
  updated_at:    { editable: false, type: 'date' },
  assembled_at:  { editable: false, type: 'date' },
  archived:      { editable: false, type: 'boolean' },
};

// ============================================================================
// Company tab field groups — everything we know ABOUT the company
// ============================================================================
const COMPANY_GROUPS = [
  {
    label: 'Identity',
    fields: [
      ['bin', 'BIN'],
      ['name', 'Name'],
      ['legal_name', 'Legal name'],
      ['legal_form', 'Legal form'],
      ['primary_registration_no', 'Registration #'],
      ['incorporation_date', 'Incorporation date'],
      ['founded_year', 'Founded year'],
    ],
  },
  {
    label: 'Status',
    fields: [
      ['status_normalized', 'Status (normalized)'],
      ['status_raw', 'Status (raw)'],
      ['is_active', 'Active'],
    ],
  },
  {
    label: 'Contact',
    fields: [
      ['website', 'Website'],
      ['address', 'Address'],
      ['city', 'City'],
      ['country', 'Country'],
      ['postal_code', 'Postal code'],
      ['latitude', 'Latitude'],
      ['longitude', 'Longitude'],
    ],
    // Note: emails + phones now live in their own multi-row Contacts panel
    // rendered separately, below this group.
  },
  {
    label: 'Classification',
    fields: [
      ['industry', 'Industry'],
      ['__industries', 'Also tagged'],
      ['sector', 'Sector'],
      ['sub_sector', 'Sub-sector'],
      ['__employees', 'Employees'],
      ['company_size_category', 'Size category'],
    ],
  },
  {
    label: 'LinkedIn',
    fields: [
      ['linkedin_url', 'LinkedIn URL'],
      ['linkedin_id', 'LinkedIn ID'],
      ['linkedin_description', 'Description'],
      ['linkedin_followers', 'Followers'],
      ['linkedin_logo_url', 'Logo URL'],
      ['linkedin_cover_url', 'Cover URL'],
      ['linkedin_specialties', 'Specialties'],
      ['linkedin_headquarters', 'HQ description'],
      ['linkedin_locations', 'All locations'],
    ],
  },
  {
    label: 'Google Maps',
    fields: [
      ['gmaps_place_id', 'Place ID'],
      ['gmaps_url', 'Maps URL'],
      ['gmaps_rating', 'Rating'],
      ['gmaps_reviews_count', 'Reviews count'],
      ['gmaps_hours', 'Opening hours'],
      ['gmaps_photos', 'Photo URLs'],
    ],
  },
  {
    label: 'Enrichment stages',
    fields: [
      ['stage1_status', 'Stage 1 — LinkedIn Discovery'],
      ['stage1_at',     '   at'],
      ['stage2_status', 'Stage 2 — LinkedIn Profile'],
      ['stage2_at',     '   at'],
      ['stage3_status', 'Stage 3 — Employees'],
      ['stage3_at',     '   at'],
      ['stage4_status', 'Stage 4 — Jobs'],
      ['stage4_at',     '   at'],
      ['stage5_status', 'Stage 5 — Google Maps'],
      ['stage5_at',     '   at'],
      ['stage6_status', 'Stage 6 — Website Contacts'],
      ['stage6_at',     '   at'],
      ['stage8_status', 'Local Engine 1 — Website Finder'],
      ['stage8_at',     '   at'],
      ['stage7_status', 'Local Engine 2 — Website Harvester'],
      ['stage7_at',     '   at'],
      ['stage9_status', 'Local Engine 3 — Network Mapper'],
      ['stage9_at',     '   at'],
    ],
  },
  {
    label: 'Bookkeeping',
    fields: [
      ['created_at', 'Created at'],
      ['updated_at', 'Updated at'],
      ['assembled_at', 'BIN assigned at'],
      ['archived', 'Archived'],
    ],
  },
];

// Linkedin / google-maps extras live in extra_fields with linkedin_* / gmaps_*
// prefixes. Show them all in the Company tab too.
const ENRICHMENT_PREFIXES = ['linkedin_', 'gmaps_', 'firecrawl_'];

// Legal-tab regulatory field groups by source. Each row pulls from extra_fields.
const LEGAL_GROUPS = [
  {
    source: 'QFC',
    label: 'QFC — Qatar Financial Centre',
    fields: [
      ['qfc_license_status',          'License status'],
      ['qfc_registration_status',     'Registration status'],
      ['qfc_directors',               'Directors'],
      ['qfc_secretary',               'Secretary'],
      ['qfc_senior_executive_function','Senior executive'],
      ['qfc_authorised_share_capital','Authorised share capital'],
      ['qfc_issued_share_capital',    'Issued share capital'],
      ['qfc_permitted_activities',    'Permitted activities'],
      ['qfc_financial_year_end',      'Financial year end'],
      ['qfc_place_of_incorporation',  'Place of incorporation'],
      ['qfc_date_of_licence',         'Date of licence'],
      ['qfc_date_of_incorporation',   'Date of incorporation'],
      ['qfc_entity_type',             'Entity type'],
      ['qfc_card_index',              'Card index'],
      ['qfc_source_listing_page',     'Source listing page'],
      ['qfc_scraped_at',              'Scraped at'],
    ],
  },
  {
    source: 'MOCI',
    label: 'MOCI — Ministry of Commerce',
    fields: [
      ['moci_cr_number',       'CR number'],
      ['moci_cr_status',       'CR status'],
      ['moci_cr_expiry_date',  'CR expiry date'],
      ['moci_cp_number',       'CP number'],
      ['moci_cp_status',       'CP status'],
      ['moci_cp_expiry_date',  'CP expiry date'],
      ['moci_entity_type',     'Entity type'],
      ['moci_name_script',     'Name script'],
      ['moci_name_was_missing','Name was missing'],
    ],
  },
  {
    source: 'QFZ',
    label: 'QFZ — Qatar Free Zones',
    fields: [
      ['qfz_description',  'Description'],
      ['qfz_sectors_raw',  'Sectors (raw)'],
    ],
  },
  {
    source: 'QSTP',
    label: 'QSTP — Qatar Science & Technology Park',
    fields: [
      ['qstp_slug',        'Slug'],
      ['qstp_category',    'Category'],
      ['qstp_sector_tags', 'Sector tags'],
      ['qstp_stage',       'Stage'],
      ['qstp_impact',      'Impact'],
      ['qstp_description', 'Description'],
      ['qstp_logo_url',    'Logo URL'],
      ['qstp_directory_url','Directory URL'],
    ],
  },
  {
    source: 'QSE',
    label: 'QSE — Qatar Stock Exchange',
    fields: [
      ['qse_symbol',             'Ticker symbol'],
      ['qse_isin',               'ISIN'],
      ['qse_market',             'Market'],
      ['qse_comp_type',          'Listing type'],
      ['qse_shariah',            'Shariah'],
      ['qse_market_cap',         'Market cap (QAR)'],
      ['qse_free_float',         'Free float %'],
      ['qse_eps',                'EPS'],
      ['qse_pe_ratio',           'P/E ratio'],
      ['qse_price_book',         'Price/Book'],
      ['qse_last_price',         'Last price'],
      ['qse_shares_outstanding', 'Shares outstanding'],
    ],
  },
  {
    source: 'QCCI',
    label: 'QCCI — Qatar Chamber Directory',
    fields: [
      ['qcci_cr_number',          'CR number'],
      ['qcci_membership_number',  'Chamber membership #'],
      ['qcci_company_type',       'Company type'],
      ['qcci_location',           'Location'],
      ['qcci_owner_name',         'Owner'],
      ['qcci_listing_url',        'Listing URL'],
    ],
  },
];

// Regulatory fields that are internal noise for customers — admin-only.
const ADMIN_ONLY_LEGAL_FIELDS = new Set([
  'moci_name_script', 'moci_name_was_missing', 'qcci_listing_url',
]);

// ============================================================================

export function CompanyDetail({ companyId, onMutated, onDeleted, canHardDelete = false, isLocalEngine = false, isUser = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [similar, setSimilar] = useState([]);
  const [rels, setRels] = useState(null);
  const [tab, setTab] = useState('company');
  const bodyRef = useRef(null);

  // Switching tabs should start the new tab at the very top, not wherever the
  // previous tab was scrolled to.
  useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [tab]);

  const reload = async () => {
    if (!companyId) return;
    try {
      const r = await api.company(companyId);
      setData(r);
    } catch (err) { toast('Reload failed: ' + err.message, 'error'); }
  };

  useEffect(() => {
    if (!companyId) { setData(null); setSimilar([]); setRels(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [r, sim, rel] = await Promise.all([
          api.company(companyId),
          api.similarBySource(companyId).catch(() => ({ rows: [] })),
          isLocalEngine ? api.relationships(companyId).catch(() => ({ outgoing: [], incoming: [] })) : Promise.resolve({ outgoing: [], incoming: [] }),
        ]);
        if (!cancelled) {
          setData(r);
          setSimilar(sim.rows || []);
          setRels(rel);
        }
      } catch (err) {
        if (!cancelled) toast('Load failed: ' + err.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  if (!companyId) {
    return html`
      <aside class="detail-side empty-state">
        <div class="muted small">Select a company on the left to load its profile here.</div>
      </aside>
    `;
  }

  if (loading || !data) {
    return html`<aside class="detail-side"><div class="empty">Loading intelligence dossier…</div></aside>`;
  }

  const c = data.company;
  const extra = c.extra_fields || {};
  const sources = data.sources || [];
  const needsReveal = isUser && c.revealed_by_tenant === false;
  const intelCount = (data.financials?.length || 0) + (data.shareholders?.length || 0) + (data.partnerships?.length || 0);
  // Users don't see the raw "Sources" section in Legal — only the regulatory
  // groups that actually have data — so the tab count should match that.
  const legalTabCount = isUser
    ? LEGAL_GROUPS.filter(g => sources.some(s => s.source === g.source) && g.fields.some(([k]) => !isEmptyValue(extra[k]) && !ADMIN_ONLY_LEGAL_FIELDS.has(k))).length
    : sources.length;

  const revealContacts = async () => {
    try {
      await api.revealCompany(c.id);
      window.dispatchEvent(new Event('bdi:credits-changed'));
      toast('Contact details revealed');
      reload();
      onMutated?.();
    } catch (err) {
      toast(/insufficient/i.test(err.message) ? 'Not enough credits to reveal' : 'Reveal failed: ' + err.message, 'error');
    }
  };

  // Reveal a single person from the drawer's People tab (1 credit; already-
  // revealed people are free and just show their contacts).
  const revealPerson = async (personId) => {
    try {
      await api.revealPerson(personId);
      window.dispatchEvent(new Event('bdi:credits-changed'));
      toast('Person revealed');
      reload();
    } catch (err) {
      toast(/insufficient/i.test(err.message) ? 'Not enough credits to reveal' : 'Reveal failed: ' + err.message, 'error');
    }
  };

  return html`
    <aside class="detail-side">
      <div class="detail-head">
        <${CompanyLogo} company=${c} size=${44} />
        <div class="detail-title">
          <span class="bin">${c.bin || '— (unassembled)'}</span>
          <strong>${c.name}</strong>
          <div class="detail-status-row">
            <${BellScore} score=${c.bell_score} />
            ${[...new Set(sources.map(s => s.source))].map(src => html`<${SourceBadge} key=${src} source=${src} compact=${true} />`)}
            <span class=${'pill ' + (c.is_active ? 'active' : 'inactive')}>${c.status_normalized || (c.is_active ? 'active' : 'inactive')}</span>
            ${c.archived ? html`<span class="pill" style=${{borderColor:'var(--amber)',color:'var(--amber)'}} title=${'Archived' + (c.archive_reason ? ' · ' + (ARCHIVE_REASON_LABEL[c.archive_reason] || c.archive_reason) : '')}>archived${c.archive_reason ? ' · ' + (ARCHIVE_REASON_LABEL[c.archive_reason] || c.archive_reason) : ''}</span>` : null}
            ${c.needs_review ? html`<span class="pill" style=${{borderColor:'rgb(91 140 255)',color:'rgb(91 140 255)'}} title="Disappeared from a source — needs an admin decision">needs review</span>` : null}
          </div>
        </div>
        <div style=${{gap:'6px', alignSelf:'flex-start', flexShrink: 0, display: isLocalEngine ? 'flex' : 'none'}}>
          <button
            class="linkbtn"
            style=${{padding:'4px 10px', borderRadius:'5px',
                    background:'transparent',
                    border:'1px solid var(--border)', color:'var(--text-muted)', fontSize:'11px'}}
            title="Wipe LinkedIn-derived enrichment data (Stages 2/3/4/6 fields, employees, jobs, web contacts) so they can be re-run from a clean slate. Use this when Stage 1 had picked the wrong LinkedIn URL. Stage 5 (Google Maps) and identity fields are preserved."
            onClick=${async () => {
              if (!window.confirm(`Reset enrichment data for "${c.name}"?\n\nThis will delete:\n• LinkedIn fields (description, HQ, followers, …)\n• Address fields populated by LinkedIn (city, country, industry, employees, founded)\n• All person links for this company\n• All jobs for this company\n• Web-scraped contacts (Stage 6)\n\nIt does NOT touch:\n• Google Maps data (Stage 5)\n• Identity (name, BIN, registration numbers)\n• Original source records\n\nYou'll then want to re-run Stages 2/3/4/5/6.`)) return;
              try {
                const r = await api.resetEnrichment(c.id);
                toast(`Reset done — wiped ${r.fields_wiped} fields, ${r.people_links_removed} people, ${r.jobs_removed} jobs, ${r.web_contacts_removed} contacts`, 'success');
                reload(); onMutated?.();
              } catch (err) { toast(err.message, 'error'); }
            }}
          >Reset enrichment</button>
          <button
            class="linkbtn"
            style=${{padding:'4px 10px', borderRadius:'5px',
                    background: c.archived ? 'var(--bg-elev-2)' : 'transparent',
                    border:'1px solid var(--border)', color:'var(--text-muted)', fontSize:'11px'}}
            title=${c.archived ? 'Restore this company to Active' : 'Archive this company'}
            onClick=${async () => {
              try {
                await api.archiveCompany(c.id, !c.archived);
                toast(c.archived ? 'Unarchived' : 'Archived');
                reload(); onMutated?.();
              } catch (err) { toast(err.message, 'error'); }
            }}
          >${c.archived ? 'Unarchive' : 'Archive'}</button>
          ${canHardDelete ? html`<button
            class="linkbtn"
            style=${{padding:'4px 10px', borderRadius:'5px',
                    background:'transparent',
                    border:'1px solid rgba(232,142,168,0.45)', color:'rgb(232 142 168)', fontSize:'11px'}}
            title="Permanently delete this company and all its child records (contacts, sources, people links, jobs). This cannot be undone. Use for wrong/non-Qatar/expired records."
            onClick=${async () => {
              if (!window.confirm(`PERMANENTLY DELETE "${c.name}"?\n\nThis removes the company and ALL of its data:\n• Contacts, sources, people links, jobs\n• Dedup + similarity records\n\nThis is NOT archive — the row is gone for good and will sync the deletion to production on the next push.\n\nThis cannot be undone.`)) return;
              try {
                await api.deleteCompany(c.id);
                toast(`Deleted "${c.name}" permanently`);
                onDeleted?.();
              } catch (err) {
                toast(/admin_only/i.test(err.message) ? 'Only admins can permanently delete' : 'Delete failed: ' + err.message, 'error');
              }
            }}
          >Delete permanently</button>` : null}
        </div>
      </div>

      ${isLocalEngine && c.needs_review ? html`
        <div style=${{
          margin: '0 0 4px', padding: '12px 14px',
          background: 'rgba(91,140,255,0.08)',
          border: '1px solid rgba(91,140,255,0.32)',
          borderRadius: '10px',
        }}>
          <div style=${{ fontSize: '12.5px', fontWeight: 700, color: 'rgb(91 140 255)', marginBottom: '4px' }}>
            Needs your decision
          </div>
          <div style=${{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: '10px' }}>
            This company ${c.review_reason ? `disappeared from ${REVIEW_REASON_LABEL(c.review_reason)}` : 'disappeared from a source'} in the latest upload. It was NOT changed automatically — decide what to do:
          </div>
          <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              class="linkbtn"
              style=${{ padding:'5px 12px', borderRadius:'6px', background:'rgb(91 140 255)', border:'1px solid rgb(91 140 255)', color:'#fff', fontSize:'11.5px', fontWeight:600 }}
              title="Keep this company as-is. It stays active and won't be flagged again."
              onClick=${async () => {
                try { await api.keepCompany(c.id); toast('Kept — review cleared'); reload(); onMutated?.(); }
                catch (err) { toast('Keep failed: ' + err.message, 'error'); }
              }}
            >Keep as-is</button>
            <span style=${{ fontSize:'11px', color:'var(--text-dim)', alignSelf:'center' }}>
              …or use <strong>Archive</strong> / <strong>Delete permanently</strong> above.
            </span>
          </div>
        </div>
      ` : null}

      <div class="detail-tabs">
        <button class=${tab==='company'?'active':''} onClick=${()=>setTab('company')}>Company</button>
        <button class=${tab==='people'?'active':''}  onClick=${()=>setTab('people')}>People (${data.people.length})</button>
        <button class=${tab==='intel'?'active':''}   onClick=${()=>setTab('intel')}>Intel${intelCount ? ` (${intelCount})` : ''}</button>
        ${isLocalEngine ? html`<button class=${tab==='sources'?'active':''} onClick=${()=>setTab('sources')}>Sources</button>` : null}
        <button class=${tab==='legal'?'active':''}   onClick=${()=>setTab('legal')}>Legal (${legalTabCount})</button>
      </div>

      <div class="detail-body" ref=${bodyRef}>
        ${tab === 'company' ? html`<${CompanyTab} company=${c} extra=${extra} similar=${similar} relationships=${rels} contacts=${data.contacts || []} onReload=${reload} needsReveal=${needsReveal} onReveal=${revealContacts} isUser=${isUser} isLocalEngine=${isLocalEngine} />` : null}
        ${tab === 'people'  ? html`<${PeopleView}  people=${data.people} isUser=${isUser} onReveal=${revealPerson} />` : null}
        ${tab === 'intel'   ? html`<${IntelTab} financials=${data.financials || []} shareholders=${data.shareholders || []} partnerships=${data.partnerships || []} />` : null}
        ${isLocalEngine && tab === 'sources' ? html`<${SourcesActivityTab} company=${c} extra=${extra} contacts=${data.contacts || []} people=${data.people || []} financials=${data.financials || []} shareholders=${data.shareholders || []} rejects=${data.rejects || []} />` : null}
        ${tab === 'legal'   ? html`<${LegalTab}    sources=${sources} extra=${extra} isUser=${isUser} />` : null}
      </div>
    </aside>
  `;
}

function CompanyTab({ company, extra, similar, relationships, contacts, onReload, needsReveal = false, onReveal, isUser = false, isLocalEngine = false }) {
  const saveField = async (field, value) => {
    try {
      await api.updateCompany(company.id, { [field]: value });
      toast('Saved');
      onReload?.();
    } catch (err) { toast('Save failed: ' + err.message, 'error'); throw err; }
  };
  // ONE "Employees" line. Prefer the exact headcount (e.g. 56,331); only fall
  // back to LinkedIn's coarse size bracket (e.g. "10001+") when no exact count
  // exists. (Showing both was redundant — the bracket just buckets the count.)
  company.__employees = (!isEmptyValue(company.employee_count))
    ? Number(company.employee_count).toLocaleString()
    : (!isEmptyValue(company.employee_count_range) ? String(company.employee_count_range) : null);
  // Extra industry tags beyond the primary (multi-industry companies).
  const __indTags = Array.isArray(company.industries) ? company.industries.filter(Boolean) : [];
  company.__industries = __indTags.filter((t) => t !== company.industry).join(' · ') || null;
  // The Stage 1 result card (chosen URL + "Candidates considered" with raw
  // Firecrawl guesses) was removed 2026-05-23 per Val. Those candidate slugs
  // are guesses, not verified data, and shouldn't be surfaced in a customer-
  // facing drawer. The canonical linkedin_url is still editable inline via
  // the LinkedIn group below.

  // Split extra_fields into ACTUAL company-data (LinkedIn profile + Google Maps
  // profile fields) vs. RUNTIME METADATA (stage stats, error reasons, audit
  // crumbs). Per Val 2026-05-23: drawer should only show company-relevant
  // data, never actor/runtime noise. We render LinkedIn + Maps fields in
  // their own dedicated sections; everything else is suppressed entirely.
  const linkedinExtras = {};
  const gmapsExtras    = {};
  // Hard skip list — these are real Stage-related metadata, not company data,
  // even though they happen to use a "linkedin_" / "firecrawl_" prefix.
  const RUNTIME_KEY_PREFIXES = ['stage', 'firecrawl_', 'manual_', 'merged_'];
  const LINKEDIN_RUNTIME_KEYS = new Set([
    'linkedin_scraped_at',          // when actor ran, not company data
    'linkedin_scrape_engine',       // which actor we used
    'linkedin_company_id_hint',     // internal hint
    'linkedin_locations_count',     // we surface locations themselves separately
    'linkedin_similar_count',       // we show the similar list separately
  ]);
  for (const [k, v] of Object.entries(extra)) {
    if (v === null || v === undefined) continue;
    if (RUNTIME_KEY_PREFIXES.some(p => k.startsWith(p))) continue;
    if (LINKEDIN_RUNTIME_KEYS.has(k)) continue;
    if (isUser && /photo|logo_url|cover_url|call_to_action/i.test(k)) continue;   // image URLs / CTA: not useful for customers
    if (isUser && isEmptyValue(v)) continue;                                       // hide empty fields from customers
    if (k.startsWith('linkedin_')) linkedinExtras[k] = v;
    else if (k.startsWith('gmaps_')) gmapsExtras[k] = v;
  }
  // Friendly labels for the most-asked-about keys. Anything not in this map
  // renders with its raw key.
  const EXTRA_LABELS = {
    linkedin_company_name:           'LinkedIn company name',
    linkedin_universal_name:         'LinkedIn URL slug',
    linkedin_company_id:             'LinkedIn company ID',
    linkedin_tagline:                'Tagline',
    linkedin_hashtag:                'Hashtag',
    linkedin_industry_v2_taxonomy:   'Industry taxonomy',
    linkedin_call_to_action:         'Call to action',
    linkedin_employee_count_range:   'Employee range (LinkedIn)',
    linkedin_founded_on:             'Founded (LinkedIn)',
    linkedin_crunchbase_funding:     'Crunchbase funding',
    linkedin_affiliated_by_employees:'Affiliated companies (employees)',
    linkedin_affiliated_by_showcases:'Affiliated showcases',
    gmaps_categories:                'Google Maps categories',
    gmaps_category:                  'Primary Google Maps category',
    gmaps_raw_features:              'Google Maps features',
    gmaps_title:                     'Google Maps title',
  };
  function labelFor(k) {
    return EXTRA_LABELS[k] || k.replace(/^linkedin_|^gmaps_/, '').replace(/_/g, ' ');
  }

  const importedSimilar = similar.filter(s => s.decision === 'added_to_scope');
  const skippedSimilar  = similar.filter(s => s.decision === 'skipped');

  // Customers (app.bell.qa) see a curated view: internal/runtime groups are
  // admin-only, and Google "Photo URLs" are dropped (not useful to display).
  const USER_HIDDEN_GROUPS = new Set(['Status', 'Enrichment stages', 'Bookkeeping']);
  const USER_HIDDEN_FIELDS = new Set(['gmaps_photos', 'linkedin_logo_url', 'linkedin_cover_url']);
  const groups = (isUser ? COMPANY_GROUPS.filter(g => !USER_HIDDEN_GROUPS.has(g.label)) : COMPANY_GROUPS)
    .map(g => (isUser
      ? { ...g, fields: g.fields.filter(([k]) => !USER_HIDDEN_FIELDS.has(k) && !isEmptyValue(company[k])) }
      : g))
    // Drop now-empty groups for users — but always keep Contact (it hosts the
    // contacts list) and Identity (name/BIN summary).
    .filter(g => g.fields.length > 0 || g.label === 'Contact' || g.label === 'Identity');

  return html`
    <div class="overview">
      ${isUser && !needsReveal ? html`<${RequestDetailsBox} companyId=${company.id} />` : null}
      ${groups.map(g => html`
        <section class="group" key=${g.label}>
          <h3>${g.label}</h3>
          <dl>
            ${g.fields.map(([k, lbl]) => {
              const meta = COMPANY_FIELD_META[k] || {};
              const locked = needsReveal && ((k === 'email' && company.email_locked) || (k === 'phone' && company.phone_locked));
              return html`<${EditableKv}
                key=${k}
                label=${lbl}
                field=${k}
                value=${company[k]}
                type=${meta.type || 'text'}
                editable=${meta.editable !== false && !isUser && isLocalEngine}
                locked=${locked}
                onSave=${saveField}
              />`;
            })}
          </dl>
          ${g.label === 'Identity' && Array.isArray(extra.merged_registration_nos) && extra.merged_registration_nos.length > 0 ? html`
            <div class="merged-regs" style=${{
              marginTop: '8px',
              padding: '8px 10px',
              background: 'var(--bg-elev-2)',
              border: '1px solid var(--border)',
              borderRadius: '5px',
              fontSize: '12px',
            }}>
              <div class="muted small" style=${{marginBottom:'4px', fontSize:'10px', textTransform:'uppercase', letterSpacing:'.6px'}}>
                Also registered under (${extra.merged_registration_nos.length} additional from merged duplicates)
              </div>
              <div style=${{display:'flex', flexWrap:'wrap', gap:'4px'}}>
                ${extra.merged_registration_nos.map(reg => html`
                  <span key=${reg} style=${{
                    display: 'inline-block',
                    padding: '2px 8px',
                    background: 'var(--bg-elev)',
                    border: '1px solid var(--border)',
                    borderRadius: '3px',
                    fontFamily: 'var(--mono, ui-monospace, monospace)',
                    fontSize: '11px',
                  }}>${reg}</span>
                `)}
              </div>
            </div>
          ` : null}
          ${g.label === 'Contact' && needsReveal ? html`
            <div class="reveal-banner">
              <span>🔒 Email & phone are hidden. Reveal to view this company's contact details.</span>
              <button class="reveal-btn" onClick=${onReveal}>Reveal · 1 credit</button>
            </div>
          ` : null}
          ${g.label === 'Contact' && !needsReveal ? html`
            <div style=${{marginTop:'10px'}}>
              <${ContactsList} kind="company" refId=${company.id} contacts=${contacts} onChange=${onReload} readOnly=${!isLocalEngine} />
            </div>
          ` : null}
        </section>
      `)}

      ${(extra.qcci_category || extra.qcci_sub_category || extra.qcci_opening_hours || extra.qcci_description || extra.qcci_po_box) ? html`
        <section class="group" key="directory-details">
          <h3>Directory details</h3>
          <dl>
            ${extra.qcci_category ? html`<div class="kv"><dt>Category</dt><dd>${extra.qcci_category}</dd></div>` : null}
            ${extra.qcci_sub_category ? html`<div class="kv"><dt>Sub-category</dt><dd>${extra.qcci_sub_category}</dd></div>` : null}
            ${extra.qcci_po_box ? html`<div class="kv"><dt>PO Box</dt><dd>${extra.qcci_po_box}</dd></div>` : null}
            ${extra.qcci_opening_hours ? html`<div class="kv"><dt>Opening hours</dt><dd>${extra.qcci_opening_hours}</dd></div>` : null}
            ${extra.qcci_description ? html`<div class="kv"><dt>Description</dt><dd>${extra.qcci_description}</dd></div>` : null}
          </dl>
        </section>
      ` : null}

      ${(extra.website_description || extra.website_keywords) ? html`
        <section class="group" key="from-website">
          <h3>From the website</h3>
          <dl>
            ${extra.website_description ? html`<div class="kv"><dt>Description</dt><dd>${extra.website_description}</dd></div>` : null}
            ${extra.website_keywords ? html`<div class="kv"><dt>Keywords</dt><dd>${extra.website_keywords}</dd></div>` : null}
          </dl>
        </section>
      ` : null}

      ${Object.keys(linkedinExtras).length > 0 ? html`
        <section class="group" key="more-linkedin">
          <h3>More LinkedIn details</h3>
          <dl>
            ${Object.entries(linkedinExtras).map(([k, v]) => html`
              <div class="kv" key=${k}>
                <dt>${labelFor(k)}</dt>
                <dd>${renderValue(v)}</dd>
              </div>
            `)}
          </dl>
        </section>
      ` : null}

      ${Object.keys(gmapsExtras).length > 0 ? html`
        <section class="group" key="more-gmaps">
          <h3>More Google Maps details</h3>
          <dl>
            ${Object.entries(gmapsExtras).map(([k, v]) => html`
              <div class="kv" key=${k}>
                <dt>${labelFor(k)}</dt>
                <dd>${renderValue(v)}</dd>
              </div>
            `)}
          </dl>
        </section>
      ` : null}

      ${importedSimilar.length > 0 ? html`
        <section class="group" key="similar-imported" style=${{borderColor:'var(--green)'}}>
          <h3>Similar Qatar companies — auto-imported (${importedSimilar.length})</h3>
          <ul class="similar-list">
            ${importedSimilar.map(s => html`
              <li key=${s.id}>
                <div class="similar-row">
                  <a href=${s.similar_linkedin_url} target="_blank" rel="noreferrer">${s.similar_name || s.similar_linkedin_url}</a>
                  ${s.similar_industry ? html`<div class="muted small">${s.similar_industry}${s.similar_size ? ' · '+s.similar_size+' employees' : ''}</div>` : null}
                </div>
              </li>
            `)}
          </ul>
        </section>
      ` : null}

      ${skippedSimilar.length > 0 ? html`
        <section class="group" key="similar-skipped">
          <h3>Similar — non-Qatar, skipped (${skippedSimilar.length})</h3>
          <ul class="similar-list">
            ${skippedSimilar.map(s => html`
              <li key=${s.id}>
                <div class="similar-row">
                  <a href=${s.similar_linkedin_url} target="_blank" rel="noreferrer">${s.similar_name || s.similar_linkedin_url}</a>
                  ${s.similar_industry ? html`<div class="muted small">${s.similar_industry}</div>` : null}
                </div>
              </li>
            `)}
          </ul>
        </section>
      ` : null}

      ${isLocalEngine ? html`<${NetworkSection} relationships=${relationships} />` : null}
    </div>
  `;
}

// Engine 3 — the company's mapped business network. Admin/local-only: edges can
// point at International / pending candidates that customers must never see, so
// the whole section is gated to the local engine.
const REL_GROUPS = [
  ['partner',    'Partners & clients'],
  ['client',     'Clients'],
  ['parent',     'Parent / owner'],
  ['affiliate',  'Affiliates'],
  ['subsidiary', 'Subsidiaries'],
  ['competitor', 'Competitors'],
];
const COUNTRY_BADGE = {
  qatar:     { label: 'Qatar · live',     color: 'var(--green)' },
  existing:  { label: 'in Bell',          color: 'var(--green)' },
  non_qatar: { label: 'International',     color: 'var(--amber)' },
  uncertain: { label: 'pending',          color: 'rgb(91 140 255)' },
};

function NetworkSection({ relationships }) {
  const out = relationships?.outgoing || [];
  const inc = relationships?.incoming || [];
  if (!out.length && !inc.length) {
    return html`<section class="group" key="network"><h3>Network (Engine 3)</h3>
      <div class="muted small">No relationships mapped yet. Run Engine 3 · Map Network.</div></section>`;
  }
  const byType = (t) => out.filter(r => r.relation_type === t);
  return html`
    <section class="group" key="network" style=${{borderColor:'var(--accent, #5b8cff)'}}>
      <h3>Network (Engine 3) — ${out.length} edge${out.length === 1 ? '' : 's'}</h3>
      ${REL_GROUPS.map(([type, label]) => {
        const rows = byType(type);
        if (!rows.length) return null;
        return html`
          <div key=${type} style=${{marginBottom:'8px'}}>
            <div class="muted small" style=${{marginBottom:'3px', textTransform:'uppercase', letterSpacing:'.04em'}}>${label} (${rows.length})</div>
            <ul class="similar-list">
              ${rows.map(r => {
                const badge = COUNTRY_BADGE[r.country_status] || null;
                const name = r.target_company_name || r.target_name;
                return html`<li key=${r.id}>
                  <div class="similar-row" style=${{display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap'}}>
                    ${r.target_company_id
                      ? html`<strong>${name}</strong>${r.target_company_bin ? html`<span class="muted small">${r.target_company_bin}</span>` : null}`
                      : html`<span>${name}</span>`}
                    ${r.target_domain ? html`<a class="muted small" href=${'https://' + r.target_domain} target="_blank" rel="noreferrer">${r.target_domain}</a>` : null}
                    ${badge ? html`<span class="pill" style=${{borderColor:badge.color, color:badge.color, fontSize:'10px'}}>${badge.label}</span>` : null}
                    <span class="muted small">· ${r.discovered_via || ''}${r.confidence ? ' · ' + r.confidence : ''}</span>
                  </div>
                </li>`;
              })}
            </ul>
          </div>`;
      })}
      ${inc.length ? html`
        <div style=${{marginTop:'6px'}}>
          <div class="muted small" style=${{marginBottom:'3px', textTransform:'uppercase', letterSpacing:'.04em'}}>Referenced by (${inc.length})</div>
          <ul class="similar-list">
            ${inc.map(r => html`<li key=${'in'+r.id}>
              <div class="similar-row"><strong>${r.source_company_name}</strong>
                <span class="muted small"> — lists this company as ${r.relation_type}</span></div>
            </li>`)}
          </ul>
        </div>` : null}
    </section>`;
}

function PeopleView({ people, isUser = false, onReveal }) {
  if (!people || people.length === 0) return html`<div class="empty">No people linked yet. They appear after Stage 3 enrichment.</div>`;

  // Group by org_chart_level (1=C-level, 5=Other staff, null=unknown)
  const groups = [
    { level: 1, label: 'C-Level / Founders / Owners' },
    { level: 2, label: 'Vice Presidents' },
    { level: 3, label: 'Directors / Heads of' },
    { level: 4, label: 'Managers' },
    { level: 5, label: 'Other Staff' },
  ];
  const buckets = new Map(groups.map(g => [g.level, []]));
  const unknown = [];
  for (const p of people) {
    const lvl = p.org_chart_level;
    if (lvl && buckets.has(lvl)) buckets.get(lvl).push(p);
    else unknown.push(p);
  }
  // Sort each bucket: keep name-alphabetical for stable order
  for (const arr of buckets.values()) arr.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  unknown.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));

  const openInPeople = (personId) => {
    navigateTo('people', personId);
  };

  const renderRow = (p) => html`
    <tr key=${p.id} class="person-row">
      <td class="person-main" onClick=${() => openInPeople(p.id)} title="Open this person in the People tab">
        <div class="person-name">${p.full_name || '—'}</div>
        ${(p.headline || p.title) ? html`<div class="muted small person-title">${p.headline || p.title}</div>` : null}
      </td>
      <td class="person-contacts">
        ${isUser && p.revealed_by_tenant === false
          ? html`<button class="reveal-btn" onClick=${(e) => { e.stopPropagation(); onReveal?.(p.id); }}>Reveal · 1</button>`
          : html`<${ContactIcons} company=${p} />`}
      </td>
    </tr>
  `;

  return html`
    <div class="overview org-chart-wrap">
      <div class="org-chart-summary">
        <strong>Org chart</strong>
        <span class="muted small"> · ${people.length} ${people.length === 1 ? 'person' : 'people'}</span>
      </div>
      ${groups.map(g => {
        const rows = buckets.get(g.level);
        if (!rows || rows.length === 0) return null;
        return html`
          <section class="org-level" key=${g.level}>
            <h4 class=${'org-level-h org-level-' + g.level}>
              <span class="org-level-bar"></span>
              <span>${g.label}</span>
              <span class="muted small"> · ${rows.length}</span>
            </h4>
            <table class="grid org-grid">
              <colgroup>
                <col/>
                <col style=${{width:'118px'}}/>
              </colgroup>
              <thead><tr><th>Name</th><th>Contacts</th></tr></thead>
              <tbody>${rows.map(renderRow)}</tbody>
            </table>
          </section>
        `;
      })}
      ${unknown.length > 0 ? html`
        <section class="org-level" key="unknown">
          <h4 class="org-level-h org-level-x">
            <span class="org-level-bar"></span>
            <span>Unknown seniority</span>
            <span class="muted small"> · ${unknown.length}</span>
          </h4>
          <table class="grid org-grid">
            <colgroup>
              <col style=${{width:'45%'}}/>
              <col style=${{width:'55%'}}/>
            </colgroup>
            <thead><tr><th>Name</th><th>Title</th></tr></thead>
            <tbody>${unknown.map(renderRow)}</tbody>
          </table>
        </section>
      ` : null}
    </div>
  `;
}

// Rich research data — financials, ownership, partnerships gathered by research.
function IntelTab({ financials, shareholders, partnerships }) {
  const empty = !financials.length && !shareholders.length && !partnerships.length;
  if (empty) {
    return html`<div class="overview"><div class="muted small" style=${{ padding: '16px' }}>
      No research intelligence yet. Run a company deep-dive research job and its findings — financials, ownership, and partnerships — will appear here.
    </div></div>`;
  }
  const sectionHead = (label, n) => html`<div style=${{
    fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700,
    color: 'var(--text-dim)', margin: '18px 0 8px',
  }}>${label}${n ? ` · ${n}` : ''}</div>`;
  const cellStyle = { padding: '7px 10px', fontSize: '12.5px', color: 'var(--text)', borderBottom: '1px solid rgba(255,255,255,0.05)' };
  const srcChip = (s) => s ? html`<span style=${{ fontSize: '9.5px', color: 'var(--text-dim)' }}>${String(s).replace('research:job-', 'research #')}</span>` : null;

  return html`<div class="overview" style=${{ padding: '4px 14px 16px' }}>
    ${financials.length ? html`
      ${sectionHead('Financials', financials.length)}
      <div>
        ${financials.map(f => html`<div key=${f.id} style=${{ display: 'flex', justifyContent: 'space-between', gap: '10px', ...cellStyle }}>
          <span><strong style=${{ textTransform: 'capitalize' }}>${String(f.metric).replace(/_/g, ' ')}</strong>${f.period ? html` <span class="muted small">· ${f.period}</span>` : null}</span>
          <span style=${{ textAlign: 'right' }}>${f.value_text || (f.value_num != null ? Number(f.value_num).toLocaleString() : '—')}${f.currency ? ' ' + f.currency : ''} ${srcChip(f.source)}</span>
        </div>`)}
      </div>
    ` : null}

    ${shareholders.length ? html`
      ${sectionHead('Ownership & shareholders', shareholders.length)}
      <div>
        ${shareholders.map(s => html`<div key=${s.id} style=${{ display: 'flex', justifyContent: 'space-between', gap: '10px', ...cellStyle }}>
          <span>${s.holder_name}${s.holder_type ? html` <span class="muted small">· ${s.holder_type}</span>` : null}</span>
          <span style=${{ textAlign: 'right' }}>${s.stake_text || (s.stake_pct != null ? s.stake_pct + '%' : '—')} ${srcChip(s.source)}</span>
        </div>`)}
      </div>
    ` : null}

    ${partnerships.length ? html`
      ${sectionHead('Partnerships & relationships', partnerships.length)}
      <div>
        ${partnerships.map(p => html`<div key=${p.id} style=${{ ...cellStyle }}>
          <div style=${{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
            <strong>${p.partner_name}</strong>
            <span style=${{ textAlign: 'right' }}>${p.relationship ? html`<span class="muted small" style=${{ textTransform: 'capitalize' }}>${p.relationship}</span>` : null} ${srcChip(p.source)}</span>
          </div>
          ${p.description ? html`<div class="muted small" style=${{ marginTop: '3px' }}>${p.description}</div>` : null}
        </div>`)}
      </div>
    ` : null}
  </div>`;
}

// Sources & Activity — local-admin view of WHAT each engine did for this company
// and WHERE every saved value came from. Everything is coerced to strings (never
// render a jsonb object as a child — that blanks the view).
function SourcesActivityTab({ company, extra, contacts, people, financials, shareholders, rejects }) {
  const e = extra || {};
  const num = (x) => Number(x || 0);
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u ? String(u).slice(0, 40) : ''; } };
  const when = (t) => { try { return t ? new Date(t).toLocaleString() : ''; } catch { return ''; } };
  const fmtFound = (f) => {
    if (!f || typeof f !== 'object') return '';
    const p = [];
    if (f.emails) p.push(`${f.emails} email${f.emails > 1 ? 's' : ''}`);
    if (f.phones) p.push(`${f.phones} phone${f.phones > 1 ? 's' : ''}`);
    if (f.socials) p.push(`${f.socials} social${f.socials > 1 ? 's' : ''}`);
    if (f.people) p.push(`${f.people} ${f.people > 1 ? 'people' : 'person'}`);
    if (f.partners) p.push(`${f.partners} partner${f.partners > 1 ? 's' : ''}`);
    return p.join(' · ');
  };
  const SC = { done: '#22c55e', skipped: '#64748b', no_data: '#64748b', failed: '#e5534b', running: '#f59e0b', pending: '#475569', candidate: '#f59e0b' };

  const engines = [
    { name: 'Engine 1 · Website Finder', st: company.stage8_status, at: company.stage8_at,
      detail: e.stage8_found ? `Found ${e.stage8_found}${e.stage8_method ? ` (via ${e.stage8_method})` : ''}`
        : e.stage8_candidate ? `Candidate ${e.stage8_candidate} — pending review, not saved`
        : e.stage8_skip_reason ? `Skipped — ${String(e.stage8_skip_reason).replace(/_/g, ' ')}`
        : 'No website found yet' },
    { name: 'Engine 2 · Website Harvester', st: company.stage7_status, at: company.stage7_at,
      detail: e.stage7_found ? `Harvested ${fmtFound(e.stage7_found) || 'nothing'}${Array.isArray(e.stage7_pages) ? ` · ${e.stage7_pages.length} page(s)` : ''}${e.stage7_rendered ? ' · JS-rendered' : ''}`
        : e.stage7_skip_reason ? `Skipped — ${String(e.stage7_skip_reason).replace(/_/g, ' ')}` : 'Not harvested yet' },
    { name: 'Engine 3 · Network Mapper', st: company.stage9_status, at: company.stage9_at,
      detail: (e.stage9_found && (e.stage9_found.count || fmtFound(e.stage9_found))) ? `Mapped ${fmtFound(e.stage9_found) || (num(e.stage9_found.count) + ' relationship(s)')}`
        : e.stage9_skip_reason ? `Skipped — ${String(e.stage9_skip_reason).replace(/_/g, ' ')}` : 'Not mapped yet' },
    { name: 'Engine 4 · Email Finder', st: company.stage10_status, at: company.stage10_at,
      detail: num(e.stage10_emails) > 0 ? `${num(e.stage10_emails)} email(s) — ${num(e.stage10_observed)} matched, ${num(e.stage10_pattern)} pattern-verified${e.stage10_format ? ` · format “${e.stage10_format}”` : ''}`
        : e.stage10_skip ? `Skipped — ${String(e.stage10_skip).replace(/-/g, ' ')}` : 'No emails added' },
    { name: 'Engine 5 · Company Facts', st: company.stage11_status, at: company.stage11_at,
      detail: (num(e.stage11_financials) + num(e.stage11_shareholders)) > 0 ? `${num(e.stage11_financials)} financial(s) + ${num(e.stage11_shareholders)} shareholder(s)`
        : e.stage11_skip === 'no-facts-keywords' ? 'Skipped — site doesn’t mention financials'
        : e.stage11_skip ? `Skipped — ${String(e.stage11_skip).replace(/-/g, ' ')}` : 'No facts found' },
  ];

  const head = (label, n) => html`<div style=${{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: 'var(--text-dim)', margin: '18px 0 8px' }}>${label}${n ? ` · ${n}` : ''}</div>`;
  const cell = { padding: '7px 10px', fontSize: '12.5px', borderBottom: '1px solid rgba(255,255,255,0.05)' };
  const tag = (s, x) => html`<span style=${{ fontSize: '9.5px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>${s || '—'}${x ? ` · ${x}` : ''}</span>`;
  const kind = (t) => html`<span class="muted small" style=${{ textTransform: 'uppercase', fontSize: '9px', marginRight: '6px' }}>${t}</span>`;

  return html`<div class="overview" style=${{ padding: '4px 14px 16px' }}>
    ${head('Engine activity')}
    <div>
      ${engines.map((g, i) => html`<div key=${i} style=${{ ...cell, display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <span style=${{ width: '8px', height: '8px', borderRadius: '50%', background: (SC[g.st] || '#475569'), marginTop: '5px', flexShrink: 0 }}></span>
        <div style=${{ flex: 1 }}>
          <div style=${{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
            <strong style=${{ fontSize: '12px' }}>${g.name}</strong>
            <span class="muted small">${g.at ? when(g.at) : (g.st || 'pending')}</span>
          </div>
          <div class="muted small" style=${{ marginTop: '2px', lineHeight: 1.5 }}>${g.detail}</div>
        </div>
      </div>`)}
    </div>

    ${head('Every saved detail & where it came from')}
    <div>
      ${company.website ? html`<div style=${{ ...cell, display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
        <span>${kind('site')}${company.website}</span>${tag(e.website_found && e.website_found.method ? 'website-finder (' + e.website_found.method + ')' : 'website')}
      </div>` : null}
      ${(contacts || []).map((c) => html`<div key=${'c' + c.id} style=${{ ...cell, display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
        <span>${kind(c.type)}${c.value_display || c.value}</span>${tag(c.source, c.source_url ? host(c.source_url) : (c.is_verified ? 'verified' : ''))}
      </div>`)}
      ${(financials || []).map((f) => html`<div key=${'f' + f.id} style=${{ ...cell, display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
        <span>${kind('fact')}${String(f.metric).replace(/_/g, ' ')}: ${f.value_text || (f.value_num != null ? Number(f.value_num).toLocaleString() : '—')}${f.currency ? ' ' + f.currency : ''}</span>${tag(f.source, f.confidence)}
      </div>`)}
      ${(shareholders || []).map((s) => html`<div key=${'s' + s.id} style=${{ ...cell, display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
        <span>${kind('owner')}${s.holder_name}${s.stake_text ? ` · ${s.stake_text}` : ''}</span>${tag(s.source, s.confidence)}
      </div>`)}
      ${(people && people.length) ? html`<div style=${{ ...cell, display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
        <span>${kind('people')}${people.length} ${people.length > 1 ? 'people' : 'person'} linked</span>${tag('harvester / linkedin')}
      </div>` : null}
      ${(!company.website && !(contacts || []).length && !(financials || []).length && !(shareholders || []).length) ? html`<div class="muted small" style=${{ padding: '10px' }}>Nothing saved yet — the engines haven’t produced data for this company.</div>` : null}
    </div>

    ${(rejects && rejects.length) ? html`
      ${head('Found but not saved', rejects.length)}
      <div>
        ${rejects.map((r) => html`<div key=${'r' + r.id} style=${{ ...cell, display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
          <span>${kind(r.kind)}<span style=${{ color: 'var(--text-muted)' }}>${r.value}</span></span>
          <span style=${{ fontSize: '9.5px', color: '#e0a050', whiteSpace: 'nowrap' }}>${r.engine} · ${r.reason}</span>
        </div>`)}
      </div>
    ` : null}

    <div class="muted small" style=${{ marginTop: '14px', lineHeight: 1.5, opacity: 0.85 }}>
      Every value shows its source. “Skipped / candidate / not saved” means an engine looked but didn’t keep it (e.g. an email on another company’s domain, an address that failed mailbox verification, or a site that doesn’t publish financials) — so nothing unverified enters Bell.
    </div>
  </div>`;
}

function LegalTab({ sources, extra, isUser = false }) {
  // Only show source-specific groups when that source actually exists for this company.
  const visibleSources = new Set(sources.map(s => s.source));

  return html`
    <div class="overview">
      ${!isUser ? html`
      <section class="group">
        <h3>Sources (${sources.length})</h3>
        ${sources.length === 0 ? html`<div class="empty">No source records.</div>` : null}
        ${sources.map(s => html`
          <div class="source-block" key=${s.id} style=${{borderTop:'1px solid var(--border)', paddingTop:'8px', marginTop:'6px'}}>
            <div style=${{display:'flex',alignItems:'baseline',gap:'8px'}}>
              <${SourceBadge} source=${s.source} compact=${false} />
              <span class="muted small">${s.source_record_id}</span>
              ${s.source_url ? html`· <a href=${s.source_url} target="_blank" rel="noreferrer">open ↗</a>` : null}
            </div>
            <div class="muted small">first seen ${new Date(s.first_seen_at).toLocaleString()} · last seen ${new Date(s.last_seen_at).toLocaleString()}</div>
            <details class="rawpayload">
              <summary>Raw payload (${Object.keys(s.raw_payload || {}).length} fields)</summary>
              <pre>${JSON.stringify(s.raw_payload, null, 2)}</pre>
            </details>
          </div>
        `)}
      </section>
      ` : null}

      ${LEGAL_GROUPS.filter(g => visibleSources.has(g.source)).map(g => {
        const present = g.fields.filter(([k]) => extra[k] !== null && extra[k] !== undefined && !(isUser && ADMIN_ONLY_LEGAL_FIELDS.has(k)));
        if (present.length === 0) return null;
        return html`
          <section class="group" key=${g.source}>
            <h3>${g.label}</h3>
            <dl>
              ${present.map(([k, lbl]) => html`
                <div class="kv" key=${k}>
                  <dt>${lbl}</dt>
                  <dd>${renderValue(extra[k])}</dd>
                </div>
              `)}
            </dl>
          </section>
        `;
      })}
    </div>
  `;
}

// Delegate to the shared friendly formatter (chips / readable lines, no raw JSON).
function renderValue(v) {
  return formatValue(v);
}

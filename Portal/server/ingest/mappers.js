// Per-source mappers: convert one raw scraper record into the shape
// the ingest runner needs:
//   {
//     source_record_id,
//     source_url,
//     companyFields,    // columns for the companies table
//     rawPayload,       // full original record (jsonb)
//   }

import {
  namePair,
  normalizeQFCStatus,
  normalizeMOCIStatus,
  normalizeUnspecifiedStatus,
  normalizeStatus,
  parseDate,
  nz,
} from './normalize.js';

// ------- QFZ --------------------------------------------------------------
// QFZ records are minimal: name, sectors, description. No license #, no status.
// We synthesize a source_record_id from the slugified name.
function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'unknown';
}

export function mapQFZ(raw) {
  const { name, name_normalized } = namePair(raw.name);
  if (!name) return null;
  const recordId = 'qfz:' + slug(name);
  const { status_normalized, is_active } = normalizeUnspecifiedStatus();

  return {
    source_record_id: recordId,
    source_url: 'https://qfz.gov.qa/investors/featured-investors/',
    companyFields: {
      name,
      name_normalized,
      legal_form: 'QFZ Entity',
      is_active,
      archived: !is_active,
      status_normalized,
      status_raw: null,
      sector: nz(raw.sectors),
    },
    extraFields: {
      qfz_description: nz(raw.description),
      qfz_sectors_raw: nz(raw.sectors),
    },
    rawPayload: raw,
  };
}

// ------- QFC --------------------------------------------------------------
export function mapQFC(raw) {
  const isTrust = raw.entity_type === 'trust';
  const englishName = nz(raw.english_name) || nz(raw.english_name_from_detail);
  if (!englishName) return null;
  const { name, name_normalized } = namePair(englishName);

  const qfcNumber = nz(raw.qfc_number);
  if (!qfcNumber) return null;
  const recordId = 'qfc:' + qfcNumber;

  const licenseStatus      = nz(raw.license_status) || nz(raw.licence_status);
  const registrationStatus = nz(raw.registration_status);
  const { status_normalized, is_active } = normalizeQFCStatus(licenseStatus, registrationStatus);

  return {
    source_record_id: recordId,
    source_url: 'https://eservices.qfc.qa/QFCPublicRegister/PublicRegister.aspx',
    companyFields: {
      name,
      name_normalized,
      legal_name: nz(raw.arabic_name),
      legal_form: isTrust ? 'Trust' : nz(raw.legal_status),
      is_active,
      archived: !is_active,
      status_normalized,
      status_raw: licenseStatus,
      primary_registration_no: qfcNumber,
      incorporation_date: parseDate(raw.date_of_qfc_incorporation_or_registration) || parseDate(raw.date_of_licence),
      address: nz(raw.registered_address) || nz(raw.location),
      // NO city guess (Rule 2.1). The QFC register states no city field, so
      // asserting 'Doha' for every entity was a guess that put wrong cities on the
      // map. City is left missing; a real one can be derived later from the
      // registered_address via the $0 geocoder. Country is definitionally Qatar.
      country: 'Qatar',
    },
    extraFields: {
      qfc_card_index: raw.card_index,
      qfc_directors: nz(raw.directors),
      qfc_financial_year_end: nz(raw.financial_year_end),
      qfc_permitted_activities: nz(raw.permitted_activities),
      qfc_place_of_incorporation: nz(raw.place_of_incorporation),
      qfc_senior_executive_function: nz(raw.senior_executive_function),
      qfc_authorised_share_capital: nz(raw.detail_other_authorised_share_capital),
      qfc_issued_share_capital: nz(raw.detail_other_issued_share_capital),
      qfc_secretary: nz(raw.detail_other_secretary),
      qfc_entity_type: raw.entity_type,
      qfc_license_status: licenseStatus,
      qfc_registration_status: registrationStatus,
      qfc_date_of_licence: nz(raw.date_of_licence),
      qfc_date_of_incorporation: nz(raw.date_of_qfc_incorporation_or_registration),
      qfc_source_listing_page: raw._source_listing_page,
      qfc_scraped_at: nz(raw._scraped_at),
    },
    rawPayload: raw,
  };
}

// ------- MOCI --------------------------------------------------------------
// MOCI is messy: some rows have only an Arabic name, some have only a CP
// number (commercial permit) rather than a CR number, some have no name at
// all (the scraper missed it but the entity exists). We KEEP every row that
// has at least one identifier; missing names get a placeholder so the record
// is still enrichable later (LinkedIn discovery, re-scrape, manual edit).
export function mapMOCI(raw) {
  const crNumber = nz(raw.cr_number);
  const cpNumber = nz(raw.cp_number);
  if (!crNumber && !cpNumber) return null;             // truly no identifier — drop

  // Prefer CR # as the canonical primary identifier; fall back to CP #.
  const recordId = crNumber
    ? 'moci-cr:' + crNumber
    : 'moci-cp:' + cpNumber;

  const orgName = nz(raw.organization_name);
  const displayName = orgName || (crNumber ? `MOCI CR-${crNumber} (name missing)` : `MOCI CP-${cpNumber} (name missing)`);
  const { name, name_normalized } = namePair(displayName);

  const crStatus = nz(raw.cr_status);
  const cpStatus = nz(raw.cp_status);
  const { status_normalized, is_active } = normalizeMOCIStatus(crStatus, cpStatus);

  const isArabicName = orgName && /[؀-ۿ]/.test(orgName);
  const nameMissing  = !orgName;

  return {
    source_record_id: recordId,
    source_url: 'https://businessmap.moci.gov.qa/en/',
    companyFields: {
      name,
      name_normalized,
      legal_name: isArabicName ? orgName : null,
      legal_form: nz(raw.legal_form),
      is_active,
      archived: !is_active,
      status_normalized,
      status_raw: crStatus,
      primary_registration_no: crNumber || cpNumber,
      country: 'Qatar',
    },
    extraFields: {
      moci_cr_number: crNumber,
      moci_cp_number: cpNumber,
      moci_cr_status: nz(raw.cr_status),
      moci_cp_status: nz(raw.cp_status),
      moci_cr_expiry_date: nz(raw.cr_expiry_date),
      moci_cp_expiry_date: nz(raw.cp_expiry_date),
      moci_entity_type: raw.entity_type,
      moci_name_script: nameMissing ? 'missing' : (isArabicName ? 'arabic' : 'latin'),
      moci_name_was_missing: nameMissing,
    },
    rawPayload: raw,
  };
}

// ------- QSTP --------------------------------------------------------------
export function mapQSTP(raw) {
  const orgName = nz(raw.name);
  if (!orgName) return null;
  const { name, name_normalized } = namePair(orgName);

  const qstpId = nz(raw.id);
  if (!qstpId) return null;
  const recordId = 'qstp:' + qstpId;

  const { status_normalized, is_active } = normalizeUnspecifiedStatus();

  const contact = raw.contact || {};
  return {
    source_record_id: recordId,
    source_url: nz(raw.directory_url) || 'https://qstp.qa/directory/',
    companyFields: {
      name,
      name_normalized,
      legal_form: nz(raw.category),  // "Company" or "Startup"
      is_active,
      archived: !is_active,
      status_normalized,
      status_raw: null,
      sector: nz(raw.sector) || (Array.isArray(raw.sector_tags) ? raw.sector_tags.join(', ') : null),
      website: nz(contact.website),
      email: nz(contact.email),
      phone: nz(contact.phone),
      linkedin_url: nz(contact.linkedin),
      linkedin_logo_url: nz(raw.logo_url),
      country: 'Qatar',
    },
    extraFields: {
      qstp_slug: nz(raw.slug),
      qstp_category: nz(raw.category),
      qstp_sector_tags: raw.sector_tags || null,
      qstp_stage: nz(raw.stage),
      qstp_impact: nz(raw.impact),
      qstp_description: nz(raw.description),
      qstp_directory_url: nz(raw.directory_url),
      qstp_logo_url: nz(raw.logo_url),
    },
    rawPayload: raw,
  };
}

// ------- QSE --------------------------------------------------------------
// Qatar Stock Exchange listed companies (Main + Venture markets). Each record
// is a publicly-traded company; we key on the trading symbol (fallback ISIN).
export function mapQSE(raw) {
  const orgName = nz(raw.name) || nz(raw.name_short);
  if (!orgName) return null;
  const { name, name_normalized } = namePair(orgName);

  const key = nz(raw.symbol) || nz(raw.isin);
  if (!key) return null;
  const recordId = 'qse:' + key;

  // Listed companies are, by definition, active/operating entities.
  const { status_normalized, is_active } = normalizeUnspecifiedStatus();

  return {
    source_record_id: recordId,
    source_url: nz(raw.listed_securities_url) || 'https://www.qe.com.qa/listed-companies',
    companyFields: {
      name,
      name_normalized,
      legal_name: nz(raw.name_ar),
      legal_form: 'Listed Company (QSE)',
      is_active,
      archived: !is_active,
      status_normalized,
      status_raw: nz(raw.listing_state) || 'Listed',
      sector: nz(raw.sector),
      country: 'Qatar',
    },
    extraFields: {
      qse_symbol: nz(raw.symbol),
      qse_isin: nz(raw.isin),
      qse_market: nz(raw.market),
      qse_comp_type: nz(raw.comp_type),
      qse_sector_code: nz(raw.sector_code),
      qse_shariah: nz(raw.shariah),
      qse_market_cap: raw.market_cap ?? null,
      qse_free_float: raw.free_float ?? null,
      qse_eps: raw.eps ?? null,
      qse_pe_ratio: raw.pe_ratio ?? null,
      qse_price_book: raw.price_book ?? null,
      qse_last_price: raw.last_price ?? null,
      qse_shares_outstanding: raw.shares_outstanding ?? null,
    },
    rawPayload: raw,
  };
}

// ------- QCCI (Qatar Chamber) ---------------------------------------------
// Qatar Chamber Commercial & Industrial Directory (qatarcid.com). Rich contact
// data + the MOCI CR number, so we set primary_registration_no = CR to let the
// Assembly stage merge these with MOCI rows for the same company.
export function mapQATARCID(raw) {
  const orgName = nz(raw.name);
  if (!orgName) return null;
  const { name, name_normalized } = namePair(orgName);

  const cr   = nz(raw.cr_number);
  const memb = nz(raw.qcci_membership_number) || nz(raw.membership_number);
  const slug = nz(raw.slug);
  const key  = cr || memb || slug;
  if (!key) return null;
  const recordId = 'qcci:' + key;

  const { status_normalized, is_active } = normalizeUnspecifiedStatus();

  // Opening hours → a single readable string (object kept in rawPayload).
  const ohStr = (raw.opening_hours && typeof raw.opening_hours === 'object')
    ? Object.entries(raw.opening_hours).map(([d, t]) => `${d}: ${t}`).join('; ')
    : null;

  const extraFields = {
    qcci_cr_number: cr,
    qcci_membership_number: memb,
    qcci_company_type: nz(raw.company_type),
    qcci_category: nz(raw.category),
    qcci_sub_category: nz(raw.sub_category),
    qcci_owner_name: nz(raw.owner_name),
    qcci_contact_person: nz(raw.contact_person),
    qcci_mobile: nz(raw.mobile),
    qcci_fax: nz(raw.fax),
    qcci_po_box: nz(raw.po_box),
    qcci_location: nz(raw.location),
    qcci_opening_hours: ohStr,
    qcci_description: nz(raw.description),
    qcci_listing_url: nz(raw.listing_url),
  };

  // Completeness guarantee: fold EVERY label found on the page into extra_fields
  // so nothing is ever dropped (listings vary in which fields they show). Known
  // labels already have canonical qcci_* keys above; anything else becomes
  // qcci_x_<label>. Uses all_fields (complete) with other_details as fallback.
  const CURATED = new Set([
    'cr_number', 'qcci_membership_number', 'company_type', 'address', 'po_box',
    'email', 'website', 'phone', 'telephone', 'mobile', 'contact_person_mobile',
    'fax', 'contact_person', 'owner_name', 'location', 'listing_type',
  ]);
  const allFields = (raw.all_fields && typeof raw.all_fields === 'object') ? raw.all_fields
    : (raw.other_details && typeof raw.other_details === 'object' ? raw.other_details : {});
  for (const [k, v] of Object.entries(allFields)) {
    const val = nz(v);
    if (!val) continue;
    const slug = String(k).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (CURATED.has(slug)) continue;
    const key = 'qcci_x_' + slug;
    if (!(key in extraFields)) extraFields[key] = val;
  }

  return {
    source_record_id: recordId,
    source_url: nz(raw.listing_url) || 'https://www.qatarcid.com/',
    companyFields: {
      name,
      name_normalized,
      legal_form: null,
      is_active,
      archived: !is_active,
      status_normalized,
      status_raw: null,
      primary_registration_no: cr || null,   // CR # → cross-links with MOCI
      sector: nz(raw.sub_category) || nz(raw.category),
      website: nz(raw.website),
      email: nz(raw.email),
      phone: nz(raw.phone) || nz(raw.mobile),
      address: nz(raw.address),
      country: 'Qatar',
    },
    extraFields,
    rawPayload: raw,
  };
}

// ------- MoPH / DHP (healthcare facilities) -------------------------------
// From the DHP "Place of work" directory: each facility is a healthcare company
// (pharmacy, clinic, hospital, optics, lab…). Keyed by the DHP facility id.
// No registration number is exposed here, so primary_registration_no stays null
// (dedup still links these to MOCI/QCCI by name + the usual signals).
export function mapMOPH(raw) {
  const orgName = nz(raw.name);
  if (!orgName) return null;
  const { name, name_normalized } = namePair(orgName);

  const fid = nz(raw.dhp_facility_id);
  if (!fid) return null;
  const recordId = 'moph:' + fid;

  const { status_normalized, is_active } = normalizeUnspecifiedStatus();

  return {
    source_record_id: recordId,
    source_url: nz(raw.listing_url) || 'https://dhp.moph.gov.qa/en/Pages/SearchPractitionersPage.aspx',
    companyFields: {
      name,
      name_normalized,
      legal_form: null,
      is_active,
      archived: !is_active,
      status_normalized,
      status_raw: null,
      primary_registration_no: null,
      sector: 'Healthcare',
      website: null,
      email: null,
      phone: null,
      address: null,
      country: 'Qatar',
    },
    extraFields: {
      moph_facility_id: fid,
    },
    rawPayload: raw,
  };
}

// ------- Tasmu Digital Valley (Qatar Digital Directory, MCIT) --------------
// Digital companies with rich contacts (website + phone + email) + sector +
// technology tags. No registration number exposed, so dedup links these to
// existing MOCI/QCCI rows by name/website and folds in the contacts.
export function mapTASMU(raw) {
  const orgName = nz(raw.name);
  if (!orgName) return null;
  const { name, name_normalized } = namePair(orgName);
  const recordId = 'tasmu:' + (slug(orgName) || 'unknown');

  const { status_normalized, is_active } = normalizeUnspecifiedStatus();

  return {
    source_record_id: recordId,
    source_url: nz(raw.profile_url) || nz(raw.listing_url) || 'https://tdv.motc.gov.qa/business-directory',
    companyFields: {
      name,
      name_normalized,
      legal_form: null,
      is_active,
      archived: !is_active,
      status_normalized,
      status_raw: null,
      primary_registration_no: null,
      sector: nz(raw.sector),
      website: nz(raw.website),
      email: nz(raw.email),
      phone: nz(raw.phone),
      address: null,
      country: 'Qatar',
    },
    extraFields: {
      tasmu_sector:      nz(raw.sector),
      tasmu_technology:  nz(raw.technology),
      tasmu_description: nz(raw.description),
      tasmu_profile_url: nz(raw.profile_url),
    },
    rawPayload: raw,
  };
}

// ------- CRA ICT (Communications Regulatory Authority — ICT companies) -----
// Licensed ICT companies from the CRA directory: CR number + website/email/phone
// + ICT category. The CR number → primary_registration_no so Assembly merges
// these with the MOCI/QCCI row for the same company.
export function mapCRA(raw) {
  const orgName = nz(raw.name);
  if (!orgName) return null;
  const { name, name_normalized } = namePair(orgName);
  const cr = nz(raw.cr_number);
  const key = cr || nz(raw.permit_number) || name_normalized;
  if (!key) return null;
  const recordId = 'cra:' + key;
  const { status_normalized, is_active } = normalizeUnspecifiedStatus();
  return {
    source_record_id: recordId,
    source_url: 'https://www.cra.gov.qa/en/Services/ICT-Business/ICT-Business-List/ICT-Business-Directory',
    companyFields: {
      name,
      name_normalized,
      is_active,
      archived: !is_active,
      status_normalized,
      primary_registration_no: cr || null,   // CR # → cross-links with MOCI/QCCI
      sector: nz(raw.category),
      website: nz(raw.website),
      email: nz(raw.email),
      phone: nz(raw.phone),
      country: 'Qatar',
    },
    extraFields: {
      cra_cr_number: cr,
      cra_permit_number: nz(raw.permit_number),
      cra_category: nz(raw.category),
      cra_subcategory: nz(raw.subcategory),
      cra_main_category: Array.isArray(raw.main_category) ? raw.main_category.join(', ') : nz(raw.main_category),
    },
    rawPayload: raw,
  };
}

// ------- Made in Qatar (exhibitor directory) ------------------------------
// Qatari manufacturers/exhibitors from madeinqatar.com.qa. Each record carries
// the company owner (a decision-maker → folded in as a person by the companion
// ingestMadeInQatarOwners pass) plus phone/mobile/email/website/logo. No CR
// number on the listing, so we key on the GravityView entry id.
export function mapMadeInQatar(raw) {
  const orgName = nz(raw.name);
  if (!orgName) return null;
  const { name, name_normalized } = namePair(orgName);

  const entryId = nz(raw.entry_id);
  const key = entryId || name_normalized;
  if (!key) return null;
  const recordId = 'madeinqatar:' + key;

  const { status_normalized, is_active } = normalizeUnspecifiedStatus();

  // Listing gives a landline (phone) and/or a mobile; prefer the landline as the
  // primary phone, keep both in extra_fields. The runner mirrors phone+email
  // into company_contacts; the mobile is also surfaced there below.
  const phone  = nz(raw.phone);
  const mobile = nz(raw.mobile);

  return {
    source_record_id: recordId,
    source_url: nz(raw.source_url) || 'https://www.madeinqatar.com.qa/exhibitor-directory-2023/',
    companyFields: {
      name,
      name_normalized,
      is_active,
      archived: !is_active,
      status_normalized,
      sector: nz(raw.category),
      website: nz(raw.website),
      email: nz(raw.email),
      phone: phone || mobile,
      country: 'Qatar',
    },
    extraFields: {
      madeinqatar_entry_id:   entryId,
      madeinqatar_owner:      nz(raw.owner),     // decision-maker → person
      madeinqatar_mobile:     mobile,
      madeinqatar_category:   nz(raw.category),
      madeinqatar_logo_url:   nz(raw.logo_url),
      madeinqatar_description: nz(raw.description),
    },
    rawPayload: raw,
  };
}

// ------- QFCRA (QFC Regulatory Authority public register) -----------------
// Authorised firms + DNFBP firms regulated by the QFCRA. The QFC number is the
// firm's official QFC registration → primary_registration_no so Assembly merges
// these with the QFC public-register row for the same firm. Approved individuals
// are folded in as people by the companion ingestQfcraPeople pass.
export function mapQFCRA(raw) {
  const orgName = nz(raw.name);
  if (!orgName) return null;
  const { name, name_normalized } = namePair(orgName);

  const qfc = nz(raw.qfc_number);
  const key = qfc || name_normalized;
  if (!key) return null;
  const recordId = 'qfcra:' + key;

  // These are the ACTIVE/authorised registers, so treat all as operating;
  // keep the verbatim status (e.g. "Authorised - Closed to New Business").
  const { status_normalized, is_active } = normalizeUnspecifiedStatus();
  const firmType = nz(raw.firm_type) || 'Authorised Firm';

  return {
    source_record_id: recordId,
    source_url: nz(raw.source_url) || 'https://www.qfcra.com/public_registers/search-authorised-firms/',
    companyFields: {
      name,
      name_normalized,
      legal_form: firmType + ' (QFC)',
      is_active,
      archived: !is_active,
      status_normalized,
      status_raw: nz(raw.status) || 'Authorised',
      primary_registration_no: qfc || null,   // QFC # → cross-links with the QFC register
      country: 'Qatar',
    },
    extraFields: {
      qfcra_qfc_number:           qfc,
      qfcra_firm_type:            firmType,
      qfcra_status:               nz(raw.status),
      qfcra_date_authorised:      nz(raw.date_authorised),
      qfcra_date_current_status:  nz(raw.date_of_current_status),
      qfcra_previous_names:       Array.isArray(raw.previous_names) ? raw.previous_names.join(', ') : nz(raw.previous_names),
    },
    rawPayload: raw,
  };
}

export const MAPPERS = {
  QFZ:  mapQFZ,
  QFC:  mapQFC,
  MOCI: mapMOCI,
  QSTP: mapQSTP,
  QSE:  mapQSE,
  QCCI: mapQATARCID,
  MoPH: mapMOPH,
  Tasmu: mapTASMU,
  CRA:  mapCRA,
  MadeInQatar: mapMadeInQatar,
  QFCRA: mapQFCRA,
};

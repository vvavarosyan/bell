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
      city: 'Doha',
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

export const MAPPERS = {
  QFZ:  mapQFZ,
  QFC:  mapQFC,
  MOCI: mapMOCI,
  QSTP: mapQSTP,
};

// Shared table/column definitions for the local → Bell.qa data sync.
//
// These column lists are the SINGLE SOURCE OF TRUTH used by BOTH sides of the
// sync so the SELECT (push, local) and the INSERT/UPDATE (ingest, prod) can
// never drift apart:
//   - push.js   reads these columns out of the local Postgres
//   - ingest.js upserts these columns into the production Postgres
//
// Design rules baked in here:
//   • Only ASSEMBLED canonical rows are synced (bin / pin / jin assigned).
//     Mid-pipeline rows stay on the local Mac.
//   • Child tables (company_sources, person_companies, jobs) carry the PARENT'S
//     natural key (company bin / person pin) — NOT the local integer id, which
//     is meaningless on prod. ingest.js resolves the prod id from that key.
//   • Reveal state (is_revealed / revealed_at / revealed_by) is PROD-OWNED.
//     A customer reveals a person on app.bell.qa; the local engine must NEVER
//     overwrite that. So those columns are deliberately EXCLUDED from PEOPLE_COLS.
//   • `archived` IS synced — that's our soft-delete signal (archived locally →
//     hidden on the app). Rows are never hard-deleted on prod.

// ---------------------------------------------------------------------------
// companies — conflict key: bin
// ---------------------------------------------------------------------------
export const COMPANY_COLS = [
  'bin',
  'name', 'name_normalized', 'legal_name', 'legal_form',
  'is_active', 'status_raw', 'status_normalized',
  'primary_registration_no', 'incorporation_date',
  'website', 'email', 'phone', 'address', 'city', 'country', 'postal_code',
  'latitude', 'longitude',
  'industry', 'sector', 'sub_sector', 'employee_count', 'employee_count_range',
  'founded_year', 'company_size_category',
  'linkedin_url', 'linkedin_id', 'linkedin_description', 'linkedin_followers',
  'linkedin_logo_url', 'linkedin_cover_url', 'linkedin_specialties',
  'linkedin_headquarters', 'linkedin_locations',
  'gmaps_place_id', 'gmaps_url', 'gmaps_rating', 'gmaps_reviews_count',
  'gmaps_hours', 'gmaps_photos',
  'extra_fields', 'assembled_at', 'archived', 'updated_at',
];

// ---------------------------------------------------------------------------
// people — conflict key: pin
// NOTE: is_revealed / revealed_at / revealed_by intentionally omitted (prod-owned).
// ---------------------------------------------------------------------------
export const PEOPLE_COLS = [
  'pin',
  'full_name', 'first_name', 'last_name', 'headline',
  'linkedin_url', 'linkedin_public_id', 'linkedin_profile_id',
  'email', 'phone', 'location_text', 'country', 'city',
  'summary', 'profile_picture_url', 'languages', 'skills', 'education',
  'experience', 'certifications',
  'extra_fields', 'assembled_at', 'archived', 'updated_at',
];

// ---------------------------------------------------------------------------
// jobs — conflict key: jin. Parent company carried as company_bin (nullable).
// ---------------------------------------------------------------------------
export const JOB_COLS = [
  'jin',
  'linkedin_job_url', 'linkedin_job_id', 'title', 'description',
  'location_text', 'is_remote', 'workplace_type',
  'employment_type', 'seniority_level', 'job_function', 'industries',
  'salary_min', 'salary_max', 'salary_currency', 'salary_period',
  'posted_at', 'expires_at', 'is_active', 'applicant_count',
  'extra_fields', 'raw_payload', 'assembled_at', 'archived', 'updated_at',
];

// ---------------------------------------------------------------------------
// company_sources — conflict key: (source, source_record_id).
// Parent carried as company_bin; ingest resolves company_id.
// ---------------------------------------------------------------------------
export const COMPANY_SOURCE_COLS = [
  'source', 'source_record_id', 'source_url', 'raw_payload',
  'first_seen_at', 'last_seen_at',
];

// ---------------------------------------------------------------------------
// person_companies — upsert by the expression unique index
//   (person_id, company_id, COALESCE(start_date,'1970-01-01'), COALESCE(title,'')).
// Parents carried as person_pin + company_bin.
// ---------------------------------------------------------------------------
export const PERSON_COMPANY_COLS = [
  'title', 'department', 'seniority_level', 'org_chart_level',
  'start_date', 'end_date', 'is_current', 'source_stage', 'raw_payload',
];

// Order matters: parents before children (FK resolution on the prod side).
export const SYNC_ORDER = [
  'companies',
  'people',
  'jobs',
  'company_sources',
  'person_companies',
];

export const CHUNK_SIZE = 500;

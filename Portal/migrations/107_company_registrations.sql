-- 107 — Every registration a company actually holds, from the body that issued it.
--
-- Val, 2026-08-06: "If it's the same company it has to have 1 record. If the company is
-- registered under multiple ministries then it should show all the applicable tags and legal
-- section as well."
--
-- Bell already HAS this information — it is just buried. iHorizons exists as five separate
-- company rows because QSTP, MOCI, QCCI, CRA and Tasmu each published it, and every one of
-- those payloads is stored in company_sources.raw_payload. Nobody could see that CRA's row and
-- MOCI's row state the IDENTICAL commercial registration 18483, because nothing ever lifted the
-- numbers out into a place you could join on.
--
-- This migration is DELIBERATELY ADDITIVE. It merges nothing, deletes nothing and changes no
-- existing row. It is the prerequisite for safe merging, not the merge:
--   · it gives the company drawer a real Legal section listing every registration + issuer;
--   · it gives the duplicate finder an exact, registry-STATED key to match on, instead of the
--     name/website guessing that scored iHorizons at 0.750 and left it pending for two months.
--
-- RULE 2.1 — only numbers a source states verbatim are recorded. Directory row ids are NOT
-- registrations and are excluded on purpose: QSTP's `id`, MadeInQatar's `entry_id` and QSE's
-- `sector_code` identify a listing, not a legal registration, and recording them as one would be
-- Bell inventing a licence.

CREATE TABLE IF NOT EXISTS company_registrations (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  body              text   NOT NULL,          -- MOCI · QCCI · QFC · QFCRA · CRA · MoPH
  registration_type text   NOT NULL,          -- commercial_registration · licence · permit · facility_licence
  number            text   NOT NULL,          -- VERBATIM, exactly as the body prints it
  -- Join key. A commercial registration is the same registration whether it is printed
  -- "18483" or "00018483" — QCCI zero-pads and MOCI does not, which is precisely why iHorizons'
  -- CRA row never matched its MOCI row. Leading zeros are stripped for CRs only; every other
  -- kind keeps its shape because "QFC/00332" is not the same string as "QFC/332".
  number_normalized text GENERATED ALWAYS AS (
    CASE WHEN registration_type = 'commercial_registration'
         THEN NULLIF(regexp_replace(regexp_replace(number, '\D', '', 'g'), '^0+', ''), '')
         ELSE upper(regexp_replace(number, '\s', '', 'g'))
    END) STORED,
  status            text,
  issued_on         date,
  expires_on        date,
  source_record_id  text,
  source_url        text,
  raw               jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  -- Scoped to the company on purpose. A GLOBAL unique on (body, type, number) would reject the
  -- second of two duplicate company rows that state the same CR — silently discarding the very
  -- evidence that proves they are one company.
  UNIQUE (company_id, body, registration_type, number)
);

-- The duplicate-detection index: same normalized number, different company_id.
CREATE INDEX IF NOT EXISTS idx_company_registrations_number
  ON company_registrations (registration_type, number_normalized)
  WHERE number_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_registrations_company
  ON company_registrations (company_id);

-- ── Backfill, verbatim only ──────────────────────────────────────────────────
-- MOCI / QCCI / CRA state a commercial registration.
INSERT INTO company_registrations (company_id, body, registration_type, number, source_record_id, source_url)
SELECT s.company_id, s.source, 'commercial_registration',
       btrim(s.raw_payload->>'cr_number'), s.source_record_id, s.source_url
  FROM company_sources s
 WHERE s.raw_payload ? 'cr_number'
   AND btrim(COALESCE(s.raw_payload->>'cr_number','')) <> ''
   AND s.company_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- CRA additionally issues an ICT permit — a different registration from the same body.
INSERT INTO company_registrations (company_id, body, registration_type, number, source_record_id, source_url)
SELECT s.company_id, s.source, 'permit',
       btrim(s.raw_payload->>'permit_number'), s.source_record_id, s.source_url
  FROM company_sources s
 WHERE s.raw_payload ? 'permit_number'
   AND btrim(COALESCE(s.raw_payload->>'permit_number','')) <> ''
   AND s.company_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- QFC / QFCRA licence numbers.
INSERT INTO company_registrations (company_id, body, registration_type, number, source_record_id, source_url)
SELECT s.company_id, s.source, 'licence',
       btrim(s.raw_payload->>'qfc_number'), s.source_record_id, s.source_url
  FROM company_sources s
 WHERE s.raw_payload ? 'qfc_number'
   AND btrim(COALESCE(s.raw_payload->>'qfc_number','')) <> ''
   AND s.company_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- MoPH facility licences (a clinic/pharmacy licence, not a company CR).
INSERT INTO company_registrations (company_id, body, registration_type, number, source_record_id, source_url)
SELECT s.company_id, s.source, 'facility_licence',
       btrim(s.raw_payload->>'dhp_facility_id'), s.source_record_id, s.source_url
  FROM company_sources s
 WHERE s.raw_payload ? 'dhp_facility_id'
   AND btrim(COALESCE(s.raw_payload->>'dhp_facility_id','')) <> ''
   AND s.company_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- The number already on the company row, when no source has supplied it.
INSERT INTO company_registrations (company_id, body, registration_type, number)
SELECT c.id, 'company_record', 'commercial_registration', btrim(c.primary_registration_no)
  FROM companies c
 WHERE btrim(COALESCE(c.primary_registration_no,'')) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM company_registrations r
      WHERE r.company_id = c.id AND r.registration_type = 'commercial_registration')
ON CONFLICT DO NOTHING;

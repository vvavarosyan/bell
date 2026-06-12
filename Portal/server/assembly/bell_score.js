// Bell Score recompute — 0–100 completeness score per record. Run at the end of
// an assembly pass so scores reflect the merged/enriched data. Mirrors the
// formula in migration 035.

import { query } from '../db.js';

export async function recomputeBellScores(jobLog = null) {
  const co = await query(`
    UPDATE companies SET bell_score = LEAST(100, (
        (CASE WHEN name IS NOT NULL AND btrim(name) <> '' THEN 10 ELSE 0 END)
      + (CASE WHEN website IS NOT NULL THEN 10 ELSE 0 END)
      + (CASE WHEN email IS NOT NULL OR EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = companies.id AND cc.type='email') THEN 8 ELSE 0 END)
      + (CASE WHEN phone IS NOT NULL OR EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = companies.id AND cc.type='phone') THEN 8 ELSE 0 END)
      + (CASE WHEN industry IS NOT NULL OR sector IS NOT NULL THEN 8 ELSE 0 END)
      + (CASE WHEN employee_count IS NOT NULL OR employee_count_range IS NOT NULL THEN 8 ELSE 0 END)
      + (CASE WHEN city IS NOT NULL OR address IS NOT NULL THEN 8 ELSE 0 END)
      + (CASE WHEN primary_registration_no IS NOT NULL THEN 10 ELSE 0 END)
      + (CASE WHEN linkedin_url IS NOT NULL THEN 8 ELSE 0 END)
      + (CASE WHEN linkedin_description IS NOT NULL THEN 6 ELSE 0 END)
      + (CASE WHEN linkedin_logo_url IS NOT NULL THEN 4 ELSE 0 END)
      + (CASE WHEN founded_year IS NOT NULL OR incorporation_date IS NOT NULL THEN 4 ELSE 0 END)
      + (CASE WHEN (SELECT count(DISTINCT source) FROM company_sources cs WHERE cs.company_id = companies.id) >= 2 THEN 8 ELSE 0 END)
    ))`);

  const pe = await query(`
    UPDATE people SET bell_score = LEAST(100, (
        (CASE WHEN full_name IS NOT NULL AND btrim(full_name) <> '' THEN 15 ELSE 0 END)
      + (CASE WHEN headline IS NOT NULL THEN 15 ELSE 0 END)
      + (CASE WHEN linkedin_url IS NOT NULL THEN 15 ELSE 0 END)
      + (CASE WHEN email IS NOT NULL OR EXISTS (SELECT 1 FROM person_contacts pc WHERE pc.person_id = people.id AND pc.type='email') THEN 15 ELSE 0 END)
      + (CASE WHEN phone IS NOT NULL OR EXISTS (SELECT 1 FROM person_contacts pc WHERE pc.person_id = people.id AND pc.type='phone') THEN 10 ELSE 0 END)
      + (CASE WHEN location_text IS NOT NULL OR city IS NOT NULL THEN 10 ELSE 0 END)
      + (CASE WHEN EXISTS (SELECT 1 FROM person_companies pcx WHERE pcx.person_id = people.id) THEN 15 ELSE 0 END)
      + (CASE WHEN profile_picture_url IS NOT NULL THEN 5 ELSE 0 END)
    ))`);

  jobLog?.(`▸ Bell Score recomputed — ${co.rowCount} companies, ${pe.rowCount} people`);
  return { companies: co.rowCount, people: pe.rowCount };
}

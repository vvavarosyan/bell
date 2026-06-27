// /api/export — customer data export (CSV), scoped to req.tenant.id. Mounted
// under the `feature` gate (auth + active subscription). v1 exports the CRM (the
// companies + people a tenant has curated / revealed). Contact details are
// reveal-masked exactly like the browse lists, so an export never leaks
// unrevealed contacts. platform_admin / internal tenant bypass the masking.
//
// EXPORT POLICY (set by Val 2026-06-27): a single export is capped at a FLAT
// MAX_EXPORT_ROWS rows for EVERYONE, regardless of plan. To export more, the
// client pulls successive non-overlapping batches via ?offset= (rows are ordered
// by the immutable r.id so batches never overlap or repeat). The client may also
// export an explicit set of selected record ids via ?ids=.

import { Router } from 'express';
import { query } from '../db.js';
import { toCsv, slugFilename } from '../lib/csv.js';
import { getRevealedSet, bypassesCredits } from '../lib/credits.js';

const router = Router();

// Hard per-export row cap — applies to every tenant + every plan. More than this
// is exported as multiple non-overlapping batches (see ?offset=).
export const MAX_EXPORT_ROWS = 2500;

const tenantId = (req) => req.tenant?.id;

// GET /api/export/limits — the flat per-export cap (drives the UI batch math).
router.get('/limits', (req, res) => {
  res.json({ max: MAX_EXPORT_ROWS });
});

const COLUMNS = [
  { key: 'type',              label: 'Type' },
  { key: 'name',              label: 'Name' },
  { key: 'company',           label: 'Company' },
  { key: 'title_or_industry', label: 'Title / Industry' },
  { key: 'email',             label: 'Email' },
  { key: 'phone',             label: 'Phone' },
  { key: 'website',           label: 'Website' },
  { key: 'city',              label: 'City' },
  { key: 'linkedin',          label: 'LinkedIn' },
  { key: 'ref',               label: 'Bell Ref' },
  { key: 'status',            label: 'CRM Status' },
  { key: 'source',            label: 'Source' },
  { key: 'owner',             label: 'Owner' },
  { key: 'added_at',          label: 'Added' },
  { key: 'last_activity',     label: 'Last Activity' },
];

const SELECT_BODY = `
  SELECT r.id, r.entity_type, r.entity_id, r.status, r.source, r.created_at, r.last_activity_at,
         c.name AS company_name, c.bin AS company_bin, c.industry AS company_industry,
         c.city AS company_city, c.website AS company_website, c.email AS company_email,
         c.phone AS company_phone, c.linkedin_url AS company_linkedin,
         p.full_name AS person_name, p.headline AS person_headline, p.pin AS person_pin,
         p.email AS person_email, p.phone AS person_phone, p.linkedin_url AS person_linkedin,
         u.email AS owner_email
    FROM crm_records r
    LEFT JOIN companies c ON r.entity_type='company' AND c.id=r.entity_id
    LEFT JOIN people    p ON r.entity_type='person'  AND p.id=r.entity_id
    LEFT JOIN users     u ON u.id=r.owner_user_id
`;

// GET /api/export/crm.csv
//   ?ids=1,2,3            export exactly these record ids (selected rows), OR
//   ?entity_type=&status=&archived=&offset=   export a filtered batch
router.get('/crm.csv', async (req, res, next) => {
  try {
    const tid = tenantId(req);
    if (!tid) return res.status(401).json({ error: 'no_tenant' });

    // Parse an explicit id selection, if any (selected-rows export).
    const idList = String(req.query.ids || '')
      .split(',').map((s) => Number(s.trim())).filter(Number.isFinite);

    let rows, totalMatching, offset = 0, selectedMode = false;

    if (idList.length) {
      selectedMode = true;
      totalMatching = idList.length;
      // Always tenant-scoped; cap at MAX (extra selected ids beyond the cap are
      // dropped and flagged as truncated).
      const capped = idList.slice(0, MAX_EXPORT_ROWS);
      rows = (await query(
        `${SELECT_BODY} WHERE r.tenant_id = $1 AND r.id = ANY($2::bigint[])
         ORDER BY r.id DESC`,
        [tid, capped],
      )).rows;
    } else {
      const where = ['r.tenant_id = $1'];
      const params = [tid];
      if (req.query.entity_type === 'company' || req.query.entity_type === 'person') {
        params.push(req.query.entity_type); where.push(`r.entity_type = $${params.length}`);
      }
      if (req.query.status) { params.push(req.query.status); where.push(`r.status = $${params.length}`); }
      if (req.query.archived !== 'all') {
        params.push(req.query.archived === 'true'); where.push(`r.archived = $${params.length}`);
      }
      offset = Math.max(0, Number(req.query.offset) || 0);

      // Total matching (for the truncation / "more batches" flag).
      totalMatching = (await query(
        `SELECT count(*)::int AS n FROM crm_records r WHERE ${where.join(' AND ')}`,
        params,
      )).rows[0].n;

      // Stable ORDER BY the immutable id so successive offset batches never
      // overlap or repeat (Val's requirement).
      params.push(MAX_EXPORT_ROWS, offset);
      rows = (await query(
        `${SELECT_BODY} WHERE ${where.join(' AND ')}
         ORDER BY r.id DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      )).rows;
    }

    // Reveal-mask contact details (unless admin / internal).
    if (!bypassesCredits(req.user, req.tenant)) {
      const compIds = rows.filter(r => r.entity_type === 'company').map(r => Number(r.entity_id));
      const persIds = rows.filter(r => r.entity_type === 'person').map(r => Number(r.entity_id));
      const revComp = compIds.length ? await getRevealedSet(tid, 'company', compIds) : new Set();
      const revPers = persIds.length ? await getRevealedSet(tid, 'person', persIds) : new Set();
      for (const r of rows) {
        const revealed = r.entity_type === 'company'
          ? revComp.has(Number(r.entity_id))
          : revPers.has(Number(r.entity_id));
        if (!revealed) { r.company_email = r.company_phone = r.person_email = r.person_phone = null; }
      }
    }

    const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
    const flat = rows.map((r) => {
      const isCo = r.entity_type === 'company';
      return {
        type: isCo ? 'Company' : 'Person',
        name: isCo ? r.company_name : r.person_name,
        company: isCo ? r.company_name : '',
        title_or_industry: isCo ? (r.company_industry || '') : (r.person_headline || ''),
        email: isCo ? (r.company_email || '') : (r.person_email || ''),
        phone: isCo ? (r.company_phone || '') : (r.person_phone || ''),
        website: isCo ? (r.company_website || '') : '',
        city: isCo ? (r.company_city || '') : '',
        linkedin: isCo ? (r.company_linkedin || '') : (r.person_linkedin || ''),
        ref: isCo ? (r.company_bin || '') : (r.person_pin || ''),
        status: r.status || '',
        source: r.source || '',
        owner: r.owner_email || '',
        added_at: iso(r.created_at),
        last_activity: iso(r.last_activity_at),
      };
    });

    // truncated = there is more data beyond what this single export returned.
    const truncated = selectedMode
      ? (totalMatching > rows.length)
      : (offset + rows.length < totalMatching);

    const csv = toCsv(flat, COLUMNS);
    const batchTag = (!selectedMode && totalMatching > MAX_EXPORT_ROWS)
      ? `-rows-${offset + 1}-${offset + rows.length}` : '';
    const fname = `bell-crm-${slugFilename(req.tenant?.slug || req.tenant?.name || 'export')}${batchTag}-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
    res.setHeader('Access-Control-Expose-Headers', 'X-Export-Rows, X-Export-Total, X-Export-Offset, X-Export-Truncated, X-Export-Max');
    res.setHeader('X-Export-Rows', String(rows.length));
    res.setHeader('X-Export-Total', String(totalMatching));
    res.setHeader('X-Export-Offset', String(offset));
    res.setHeader('X-Export-Truncated', truncated ? '1' : '0');
    res.setHeader('X-Export-Max', String(MAX_EXPORT_ROWS));
    res.send(csv);
  } catch (err) { next(err); }
});

export default router;

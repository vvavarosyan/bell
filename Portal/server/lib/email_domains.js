// Per-tenant outbound SENDING IDENTITY (Phase 1 outreach).
//
//   • Every tenant gets an instant Bell-subdomain address (kind='bell'),
//     "<slug>@<BDI_OUTREACH_DOMAIN>" — usable immediately (the parent domain is
//     verified in Resend once by Bell). from-name defaults to the company name.
//   • A tenant may connect their OWN custom domain (kind='custom'), registered
//     with the Resend Domains API; we store the DNS records for them to add and
//     poll verification. Once verified they can make it their default sender.
//
// getSendingIdentity() returns the identity outbound mail should send as.

import { getKey } from '../keychain.js';
import { query, withTransaction } from '../db.js';

const RESEND_DOMAINS_URL = 'https://api.resend.com/domains';
// The verified Bell sending domain. Defaults to bell.qa (already verified in
// Resend). When the dedicated outreach subdomain mail.bell.qa is verified (paid
// Resend plan), set BDI_OUTREACH_DOMAIN=mail.bell.qa — identities self-heal.
const OUTREACH_DOMAIN = (process.env.BDI_OUTREACH_DOMAIN || 'bell.qa').trim();

function slugLocalPart(slug) {
  return String(slug || 'team').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 40) || 'team';
}

async function resend(method, path = '', body) {
  const key = await getKey('resend');
  if (!key) throw new Error('email_provider_key_missing');
  const res = await fetch(RESEND_DOMAINS_URL + path, {
    method,
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  let data; try { data = JSON.parse(t); } catch { data = { raw: t }; }
  if (!res.ok) throw new Error('resend ' + res.status + ': ' + String(data?.message || data?.error || t).slice(0, 300));
  return data;
}

/** Ensure the tenant has its default Bell-subdomain sending identity. Idempotent. */
export async function ensureBellIdentity(tenant) {
  const tenantId = Number(tenant.id);
  const fromEmail = `${slugLocalPart(tenant.slug)}@${OUTREACH_DOMAIN}`;
  const existing = await query(
    `SELECT id, domain FROM tenant_email_domains WHERE tenant_id = $1 AND kind = 'bell' LIMIT 1`, [tenantId]);
  if (existing.rows.length) {
    // Self-heal: if the parent outreach domain changed (env), update the Bell identity.
    if (existing.rows[0].domain !== OUTREACH_DOMAIN) {
      await query(`UPDATE tenant_email_domains SET domain = $2, from_email = $3 WHERE id = $1`,
        [existing.rows[0].id, OUTREACH_DOMAIN, fromEmail]);
    }
    return;
  }
  await withTransaction(async (client) => {
    const hasDefault = await client.query(
      `SELECT 1 FROM tenant_email_domains WHERE tenant_id = $1 AND is_default LIMIT 1`, [tenantId]);
    await client.query(
      `INSERT INTO tenant_email_domains (tenant_id, kind, domain, from_email, from_name, status, is_default)
       VALUES ($1, 'bell', $2, $3, $4, 'active', $5)
       ON CONFLICT (tenant_id, domain) DO NOTHING`,
      [tenantId, OUTREACH_DOMAIN, fromEmail, tenant.name || 'Bell', hasDefault.rows.length ? false : true]);
  });
}

/** All sending identities for a tenant (default first). */
export async function listIdentities(tenantId) {
  const r = await query(
    `SELECT id, kind, domain, from_email, from_name, signature_html, resend_domain_id,
            dns_records, status, is_default, created_at, verified_at
       FROM tenant_email_domains WHERE tenant_id = $1
      ORDER BY is_default DESC, created_at ASC`, [Number(tenantId)]);
  return r.rows;
}

const usableIdentity = (x) => x && (x.kind === 'bell' || x.status === 'verified');

/** The identity outbound mail should send as (the usable default, else Bell). */
export async function getSendingIdentity(tenantId) {
  const rows = await listIdentities(tenantId);
  return rows.find((x) => x.is_default && usableIdentity(x))
      || rows.find((x) => x.kind === 'bell')
      || rows.find(usableIdentity) || null;
}

/** The sending identity for a tenant, auto-provisioning the Bell default if none. */
export async function resolveSendIdentity(tenantId) {
  const found = await getSendingIdentity(tenantId);
  if (found) return found;
  const t = await query(`SELECT id, slug, name FROM tenants WHERE id = $1`, [Number(tenantId)]);
  if (!t.rows.length) return null;
  await ensureBellIdentity(t.rows[0]);
  return getSendingIdentity(tenantId);
}

/** "Name <email>" header form for an identity. */
export function formatFrom(identity) {
  if (!identity) return null;
  const name = String(identity.from_name || '').replace(/["<>]/g, '').trim();
  return name ? `${name} <${identity.from_email}>` : identity.from_email;
}

/** Connect a custom domain: register with Resend, store the DNS records to add. */
export async function connectCustomDomain(tenantId, domainRaw, fromEmail, fromName) {
  const domain = String(domainRaw || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('invalid_domain');
  const data = await resend('POST', '', { name: domain });
  const records = data?.records || data?.data?.records || null;
  const resendId = data?.id || data?.data?.id || null;
  const from = fromEmail && fromEmail.includes('@') ? fromEmail : `outreach@${domain}`;
  const r = await query(
    `INSERT INTO tenant_email_domains (tenant_id, kind, domain, from_email, from_name, resend_domain_id, dns_records, status, is_default)
     VALUES ($1, 'custom', $2, $3, $4, $5, $6::jsonb, 'pending', false)
     ON CONFLICT (tenant_id, domain) DO UPDATE
       SET resend_domain_id = EXCLUDED.resend_domain_id, dns_records = EXCLUDED.dns_records, status = 'pending'
     RETURNING *`,
    [Number(tenantId), domain, from, fromName || null, resendId, JSON.stringify(records)]);
  return r.rows[0];
}

/** Re-check a custom domain's verification with Resend. */
export async function verifyCustomDomain(tenantId, id) {
  const r = await query(
    `SELECT * FROM tenant_email_domains WHERE id = $1 AND tenant_id = $2 AND kind = 'custom'`,
    [Number(id), Number(tenantId)]);
  const row = r.rows[0];
  if (!row) throw new Error('not_found');
  if (!row.resend_domain_id) throw new Error('no_resend_domain');
  await resend('POST', `/${row.resend_domain_id}/verify`).catch(() => {});
  const data = await resend('GET', `/${row.resend_domain_id}`);
  const raw = data?.status || data?.data?.status || 'pending';
  const status = raw === 'verified' ? 'verified' : (raw === 'failed' ? 'failed' : 'pending');
  const recs = data?.records || data?.data?.records || null;
  const upd = await query(
    `UPDATE tenant_email_domains
        SET status = $3, dns_records = COALESCE($4::jsonb, dns_records),
            verified_at = CASE WHEN $3 = 'verified' THEN now() ELSE verified_at END
      WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [Number(id), Number(tenantId), status, recs ? JSON.stringify(recs) : null]);
  return upd.rows[0];
}

/** Remove a custom domain (also from Resend). The Bell identity cannot be removed. */
export async function removeCustomDomain(tenantId, id) {
  const r = await query(
    `SELECT * FROM tenant_email_domains WHERE id = $1 AND tenant_id = $2 AND kind = 'custom'`,
    [Number(id), Number(tenantId)]);
  const row = r.rows[0];
  if (!row) throw new Error('not_found');
  if (row.resend_domain_id) await resend('DELETE', `/${row.resend_domain_id}`).catch(() => {});
  await withTransaction(async (client) => {
    await client.query(`DELETE FROM tenant_email_domains WHERE id = $1 AND tenant_id = $2`, [Number(id), Number(tenantId)]);
    if (row.is_default) {
      await client.query(`UPDATE tenant_email_domains SET is_default = true WHERE tenant_id = $1 AND kind = 'bell'`, [Number(tenantId)]);
    }
  });
}

/** Update from-name / signature / which identity is the default sender. */
export async function updateIdentity(tenantId, id, { fromName, signatureHtml, makeDefault }) {
  await withTransaction(async (client) => {
    if (makeDefault) {
      const chk = await client.query(`SELECT kind, status FROM tenant_email_domains WHERE id = $1 AND tenant_id = $2`, [Number(id), Number(tenantId)]);
      const row = chk.rows[0];
      if (row && usableIdentity(row)) {
        await client.query(`UPDATE tenant_email_domains SET is_default = false WHERE tenant_id = $1`, [Number(tenantId)]);
        await client.query(`UPDATE tenant_email_domains SET is_default = true WHERE id = $1 AND tenant_id = $2`, [Number(id), Number(tenantId)]);
      }
    }
    if (fromName !== undefined) await client.query(`UPDATE tenant_email_domains SET from_name = $3 WHERE id = $1 AND tenant_id = $2`, [Number(id), Number(tenantId), fromName]);
    if (signatureHtml !== undefined) await client.query(`UPDATE tenant_email_domains SET signature_html = $3 WHERE id = $1 AND tenant_id = $2`, [Number(id), Number(tenantId), signatureHtml]);
  });
  return (await query(`SELECT * FROM tenant_email_domains WHERE id = $1 AND tenant_id = $2`, [Number(id), Number(tenantId)])).rows[0];
}

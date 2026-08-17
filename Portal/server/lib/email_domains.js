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

/**
 * The ONLY shape of an identity that may leave the server.
 *
 * ⚠️ THREE FUNCTIONS BELOW USE `RETURNING *` AND THEIR ROWS GO STRAIGHT INTO HTTP RESPONSES.
 * The moment migration 122 added smtp_password_enc / imap_password_enc, those responses would
 * have carried a tenant's encrypted mail-server passwords to the browser. An explicit
 * allow-list is the fix, and it must stay an ALLOW-list: a deny-list would leak the next
 * secret column somebody adds. Connection settings ARE included (a customer must see and edit
 * their own host and username); the two encrypted secrets never are.
 */
export function publicIdentity(row) {
  if (!row) return null;
  const {
    id, kind, domain, from_email, from_name, signature_html, resend_domain_id, dns_records,
    status, is_default, created_at, verified_at,
    transport, smtp_host, smtp_port, smtp_secure, smtp_username, smtp_verified_at, smtp_last_error,
    imap_host, imap_port, imap_secure, imap_username, imap_last_polled_at, imap_last_error,
  } = row;
  return {
    id, kind, domain, from_email, from_name, signature_html, resend_domain_id, dns_records,
    status, is_default, created_at, verified_at,
    transport: transport || 'resend',
    smtp_host: smtp_host || null, smtp_port: smtp_port || null, smtp_secure: smtp_secure ?? null,
    smtp_username: smtp_username || null,
    smtp_verified_at: smtp_verified_at || null, smtp_last_error: smtp_last_error || null,
    // Whether a password is stored is a fact the UI needs ("leave blank to keep"); the value is not.
    smtp_password_set: !!row.smtp_password_enc,
    imap_host: imap_host || null, imap_port: imap_port || null, imap_secure: imap_secure ?? null,
    imap_username: imap_username || null,
    imap_password_set: !!row.imap_password_enc,
    imap_last_polled_at: imap_last_polled_at || null, imap_last_error: imap_last_error || null,
  };
}

/** All sending identities for a tenant (default first). Secrets never included. */
export async function listIdentities(tenantId) {
  const r = await query(
    `SELECT id, kind, domain, from_email, from_name, signature_html, resend_domain_id,
            dns_records, status, is_default, created_at, verified_at,
            transport, smtp_host, smtp_port, smtp_secure, smtp_username,
            smtp_verified_at, smtp_last_error, (smtp_password_enc IS NOT NULL) AS smtp_password_enc,
            imap_host, imap_port, imap_secure, imap_username,
            (imap_password_enc IS NOT NULL) AS imap_password_enc,
            imap_last_polled_at, imap_last_error
       FROM tenant_email_domains WHERE tenant_id = $1
      ORDER BY is_default DESC, created_at ASC`, [Number(tenantId)]);
  return r.rows.map(publicIdentity);
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
  // ALWAYS ensure/self-heal the Bell identity first (e.g. migrate an old
  // mail.bell.qa address to the current verified OUTREACH_DOMAIN) — not only
  // when missing — then resolve the identity to send as.
  const t = await query(`SELECT id, slug, name FROM tenants WHERE id = $1`, [Number(tenantId)]);
  if (t.rows.length) await ensureBellIdentity(t.rows[0]);
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
  return publicIdentity(r.rows[0]);          // never the raw row: it now carries encrypted secrets
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
  return publicIdentity(upd.rows[0]);        // never the raw row
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
  return publicIdentity((await query(
    `SELECT * FROM tenant_email_domains WHERE id = $1 AND tenant_id = $2`,
    [Number(id), Number(tenantId)])).rows[0]);   // never the raw row
}

// ── PER-TENANT SMTP ───────────────────────────────────────────────────────────────────────────
// A tenant may send through their OWN mail server instead of Bell's provider. Two things follow
// from that, and both are handled here rather than in a route:
//   · the password is encrypted before it touches the database (lib/secrets.js), and a blank
//     password on an update KEEPS the stored one — the "leave blank" pattern, so a customer
//     editing a port number does not have to retype a credential;
//   · saving new settings RESETS verification. Settings that have not been proven must never be
//     allowed to carry mail: the send path refuses anything but status='verified'.

import { encryptSecret, secretsConfigured } from './secrets.js';
import { verifySmtp, smtpConfigFromRow } from './smtp.js';

/**
 * Store a tenant's mail-server settings on one identity.
 *
 * @param patch {host, port, secure, username, password?, imap_host?, imap_port?, imap_secure?,
 *               imap_username?, imap_password?, transport?}
 * A password of undefined or '' means "keep what is stored"; the caller cannot read it back to
 * re-send it, so this is the only way an edit can work.
 */
export async function saveSmtpSettings(tenantId, id, patch = {}) {
  if (!(await secretsConfigured())) throw new Error('secrets_not_configured');
  const cur = (await query(
    `SELECT * FROM tenant_email_domains WHERE id = $1 AND tenant_id = $2`,
    [Number(id), Number(tenantId)])).rows[0];
  if (!cur) throw new Error('not_found');

  const host = patch.host !== undefined ? String(patch.host || '').trim() : cur.smtp_host;
  const username = patch.username !== undefined ? String(patch.username || '').trim() : cur.smtp_username;
  const secure = patch.secure !== undefined ? !!patch.secure : cur.smtp_secure;
  const port = patch.port !== undefined ? (Number(patch.port) || null) : cur.smtp_port;
  const passwordEnc = patch.password ? await encryptSecret(String(patch.password)) : cur.smtp_password_enc;

  const imapHost = patch.imap_host !== undefined ? String(patch.imap_host || '').trim() || null : cur.imap_host;
  const imapUser = patch.imap_username !== undefined ? String(patch.imap_username || '').trim() || null : cur.imap_username;
  const imapSecure = patch.imap_secure !== undefined ? !!patch.imap_secure : cur.imap_secure;
  const imapPort = patch.imap_port !== undefined ? (Number(patch.imap_port) || null) : cur.imap_port;
  const imapPassEnc = patch.imap_password ? await encryptSecret(String(patch.imap_password)) : cur.imap_password_enc;

  // Anything that changes HOW Bell connects invalidates the proof. Changing only the IMAP side
  // does not: sending was already proven and is unaffected by where bounces are read from.
  const sendingChanged = host !== cur.smtp_host || username !== cur.smtp_username
    || secure !== cur.smtp_secure || port !== cur.smtp_port
    || passwordEnc !== cur.smtp_password_enc;

  const r = await query(
    `UPDATE tenant_email_domains
        SET smtp_host = $3, smtp_port = $4, smtp_secure = $5, smtp_username = $6,
            smtp_password_enc = $7,
            imap_host = $8, imap_port = $9, imap_secure = $10, imap_username = $11,
            imap_password_enc = $12,
            transport = COALESCE($13, transport),
            smtp_verified_at = CASE WHEN $14 THEN NULL ELSE smtp_verified_at END,
            smtp_last_error  = CASE WHEN $14 THEN NULL ELSE smtp_last_error END,
            status = CASE WHEN $14 AND COALESCE($13, transport) = 'smtp' THEN 'pending' ELSE status END
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [Number(id), Number(tenantId), host || null, port, secure, username || null, passwordEnc,
     imapHost, imapPort, imapSecure, imapUser, imapPassEnc,
     patch.transport === 'smtp' || patch.transport === 'resend' ? patch.transport : null,
     sendingChanged]);
  return publicIdentity(r.rows[0]);
}

/**
 * Prove the stored settings by connecting and authenticating — and by sending NOTHING.
 *
 * On success the identity becomes 'verified', which is what the send path requires. On failure
 * the mail server's own words are stored and returned; Bell never paraphrases them into
 * "Could not send the email."
 */
export async function verifySmtpSettings(tenantId, id) {
  const row = (await query(
    `SELECT * FROM tenant_email_domains WHERE id = $1 AND tenant_id = $2`,
    [Number(id), Number(tenantId)])).rows[0];
  if (!row) throw new Error('not_found');
  const config = await smtpConfigFromRow(row);
  if (!config) throw new Error('smtp_not_configured');

  const out = await verifySmtp(config);
  const r = await query(
    `UPDATE tenant_email_domains
        SET smtp_verified_at = CASE WHEN $3 THEN now() ELSE NULL END,
            smtp_last_error  = $4,
            status = CASE WHEN $3 THEN 'verified'
                          WHEN transport = 'smtp' THEN 'failed' ELSE status END
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    [Number(id), Number(tenantId), out.ok, out.ok ? null : out.error]);
  return { ok: out.ok, error: out.error, identity: publicIdentity(r.rows[0]) };
}

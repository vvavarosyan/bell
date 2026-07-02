// WhatsApp Business Cloud API — per-tenant send + config helpers (Phase F1).
//
// Official Meta Graph API only. Each tenant connects its OWN WhatsApp Business
// number (phone_number_id + a long-lived access token). Bell stores the token
// to send on the tenant's behalf and NEVER exposes it back through the API.
//
// v1 sends FREE-FORM text — which Meta allows inside the 24-hour customer-service
// window (i.e. after the customer messaged the number). Business-initiated cold
// messages need pre-approved message templates; sendTemplate() is stubbed for
// that next step. Callers surface the window rule to the user.

import { query } from '../db.js';

const GRAPH = 'https://graph.facebook.com/v21.0';

/** Full config incl. the secret token — INTERNAL use only (send path). */
export async function getConfigInternal(tenantId) {
  const r = await query(`SELECT * FROM whatsapp_config WHERE tenant_id = $1`, [tenantId]);
  return r.rows[0] || null;
}

/** Safe, tokenless connection status for the API/UI. */
export async function getStatus(tenantId) {
  const c = await getConfigInternal(tenantId);
  if (!c || !c.phone_number_id || !c.access_token) {
    return { connected: false };
  }
  return {
    connected: !!c.active,
    display_number: c.display_number || null,
    phone_number_id: c.phone_number_id,
    business_account_id: c.business_account_id || null,
    connected_at: c.connected_at,
    // The webhook URL + verify token the user pastes into Meta's dashboard.
    verify_token: c.verify_token || null,
  };
}

/** Connect / update. Only provided fields change; token kept if omitted. */
export async function saveConfig(tenantId, fields, actor) {
  const { phone_number_id, business_account_id, access_token, verify_token, display_number, active } = fields;
  await query(
    `INSERT INTO whatsapp_config (tenant_id, phone_number_id, business_account_id, access_token, verify_token, display_number, connected_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id) DO UPDATE SET
       phone_number_id     = COALESCE($2, whatsapp_config.phone_number_id),
       business_account_id = COALESCE($3, whatsapp_config.business_account_id),
       access_token        = COALESCE(NULLIF($4,''), whatsapp_config.access_token),
       verify_token        = COALESCE($5, whatsapp_config.verify_token),
       display_number      = COALESCE($6, whatsapp_config.display_number),
       active              = COALESCE($8, whatsapp_config.active),
       updated_at          = now()`,
    [tenantId, phone_number_id || null, business_account_id || null, access_token || null,
     verify_token || null, display_number || null, actor || null,
     active === undefined ? null : !!active],
  );
  return getStatus(tenantId);
}

export async function disconnect(tenantId) {
  await query(`UPDATE whatsapp_config SET active = false, updated_at = now() WHERE tenant_id = $1`, [tenantId]);
  return { ok: true };
}

// E.164-ish: digits only, drop a leading +. Meta wants the number without '+'.
export function normalizeMsisdn(n) {
  return String(n || '').replace(/[^\d]/g, '');
}

/** Send a free-form text message. Returns { id } (Meta message id) or throws. */
export async function sendText(tenantId, to, body) {
  const cfg = await getConfigInternal(tenantId);
  if (!cfg || !cfg.active || !cfg.phone_number_id || !cfg.access_token) {
    const e = new Error('not_connected'); e.code = 'not_connected'; throw e;
  }
  const msisdn = normalizeMsisdn(to);
  if (!msisdn) { const e = new Error('bad_number'); e.code = 'bad_number'; throw e; }
  const text = String(body || '').trim();
  if (!text) { const e = new Error('empty'); e.code = 'empty'; throw e; }

  const res = await fetch(`${GRAPH}/${cfg.phone_number_id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.access_token },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: msisdn,
      type: 'text',
      text: { preview_url: false, body: text },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Surface Meta's own error (24h-window violations, template requirement,
    // bad token) so the UI can show something actionable.
    const detail = data?.error?.message || `HTTP ${res.status}`;
    const err = new Error(detail); err.code = data?.error?.code || res.status; err.meta = data?.error || null;
    throw err;
  }
  return { id: data?.messages?.[0]?.id || null };
}

/** Template send — the compliant path for business-INITIATED (cold) messages.
 *  Stubbed for the next iteration (needs a pre-approved template + Meta review). */
export async function sendTemplate() {
  const e = new Error('templates_not_enabled');
  e.code = 'templates_not_enabled';
  throw e;
}

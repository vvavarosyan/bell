// PII encryption at rest (Phase 4: QID / Passport verification, Val 2026-07-12).
// ----------------------------------------------------------------------------
// A registrant's national ID (Qatar QID) or, for a company/person expanding
// INTO Qatar, their Passport number is collected at signup FOR VERIFICATION and
// stored ENCRYPTED — never in plaintext, never in logs. AES-256-GCM (authenticated,
// so tampering is detected on decrypt). The key comes from getKey('pii') →
// BDI_KEY_PII on Railway / the macOS Keychain locally; if it's absent, encryption
// fails LOUDLY (we never fall back to storing plaintext) and collection stays off.
//
// Format of the stored blob: base64( iv[12] || authTag[16] || ciphertext ).

import crypto from 'node:crypto';
import { getKey } from '../keychain.js';

let cachedKey = null;

async function rawKey() {
  if (process.env.BDI_KEY_PII) return process.env.BDI_KEY_PII;   // Railway / tests
  try { return await getKey('pii'); } catch { return null; }     // macOS Keychain locally
}

async function keyBytes() {
  if (cachedKey) return cachedKey;
  const raw = await rawKey();
  if (!raw) return null;
  const s = String(raw).trim();
  // 64 hex chars = a real 32-byte key; anything else is hashed to 32 bytes so a
  // human-typed passphrase still yields a valid AES key.
  cachedKey = /^[0-9a-fA-F]{64}$/.test(s) ? Buffer.from(s, 'hex') : crypto.createHash('sha256').update(s).digest();
  return cachedKey;
}

/** True once an encryption key is available — the gate for ID collection. */
export async function piiConfigured() { return !!(await keyBytes()); }

export async function encryptPII(plaintext) {
  const key = await keyBytes();
  if (!key) throw new Error('pii_key_missing');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export async function decryptPII(blob) {
  const key = await keyBytes();
  if (!key) throw new Error('pii_key_missing');
  const buf = Buffer.from(String(blob), 'base64');
  if (buf.length < 29) throw new Error('pii_blob_too_short');
  const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), ct = buf.subarray(28);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

// ── validation (exported for tests + reuse) ─────────────────────────────────

/** Last 4 chars for a masked display (e.g. "•••• 4821"). */
export function idLast4(s) { return String(s || '').replace(/\s+/g, '').slice(-4); }

/**
 * Validate + normalize an ID by type. Qatar QID is 11 digits; a passport is
 * 5–15 alphanumeric. Returns { ok, value } or { ok:false, reason }. Never
 * guesses — an unrecognized type or malformed value fails.
 */
export function normalizeId(type, value) {
  const t = String(type || '').toLowerCase();
  const v = String(value || '').replace(/\s+/g, '').toUpperCase();
  if (t === 'qid') {
    if (!/^\d{11}$/.test(v)) return { ok: false, reason: 'A Qatar ID (QID) is 11 digits.' };
    return { ok: true, value: v, type: 'qid' };
  }
  if (t === 'passport') {
    if (!/^[A-Z0-9]{5,15}$/.test(v)) return { ok: false, reason: 'Enter a valid passport number (5–15 letters/digits).' };
    return { ok: true, value: v, type: 'passport' };
  }
  return { ok: false, reason: 'Choose Qatar ID or Passport.' };
}

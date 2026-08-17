// Secrets a TENANT gives Bell to act on their behalf — today, mail-server passwords.
//
// This is deliberately a thin naming layer over lib/pii.js rather than a second crypto
// implementation: AES-256-GCM, one key, one format, one place where a mistake could be made.
// The key is getKey('pii') / BDI_KEY_PII. Sharing it is a choice with a consequence worth
// stating plainly: on a deployment with no key, encryption fails LOUDLY and per-tenant SMTP
// simply cannot be switched on — which is the correct failure. Nothing here ever falls back
// to storing a password in plaintext.
//
// ⚠️ A value encrypted here must never leave the server. The only code allowed to decrypt is
// the transport that opens the connection (lib/smtp.js) and the mailbox poller. No route
// returns these columns; see the explicit column lists in lib/email_domains.js.

import { encryptPII, decryptPII, piiConfigured } from './pii.js';

/** True once an encryption key exists — the gate for storing any tenant credential. */
export async function secretsConfigured() { return piiConfigured(); }

/** Encrypt a tenant secret for storage. Throws (never returns plaintext) without a key. */
export async function encryptSecret(plaintext) { return encryptPII(plaintext); }

/** Decrypt a stored tenant secret. Throws on a wrong key or a tampered blob (GCM auth tag). */
export async function decryptSecret(blob) { return decryptPII(blob); }

// Open tracking for mail Bell sends through a tenant's OWN server.
//
// When Resend carries the message, Resend reports the open and Bell does nothing. Over a
// customer's own SMTP there is no provider in the path, so the only honest way to know an
// email was opened is to serve something from Bell's server and record the request: a 1×1
// transparent image with a per-message token.
//
// ⚠️ WHAT AN OPEN ACTUALLY PROVES, AND WHAT THE UI MUST NOT CLAIM. A recorded open means the
// image was fetched. Many mail clients block remote images by default (so a real read can go
// unrecorded), and some — Gmail, Apple Mail Privacy Protection — fetch it on the recipient's
// behalf before a human looks (so a fetch is not proof of a human). It is a signal, not a fact,
// and it is labelled that way wherever it is shown. Bell does not infer "read" from it.
//
// The token is random, not derived from the row id: an id-shaped token invites walking the
// sequence to mark other people's mail as opened.

import crypto from 'node:crypto';

/** 1×1 transparent GIF — the smallest thing a mail client will fetch. */
export const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

/** A fresh, unguessable token for one message. */
export function newOpenToken() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Append the tracking pixel to an HTML body. Returns the html unchanged when there is no html
 * to append to (a plain-text-only email cannot carry an image, and inventing one would change
 * what the customer wrote).
 */
export function withOpenPixel(html, token, baseUrl) {
  if (!html || !token) return html;
  const src = `${String(baseUrl || '').replace(/\/$/, '')}/t/o/${token}.gif`;
  // alt="" and the zero-ish dimensions keep it invisible and unannounced by screen readers.
  const img = `<img src="${src}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0" />`;
  return /<\/body\s*>/i.test(html) ? html.replace(/<\/body\s*>/i, img + '</body>') : html + img;
}

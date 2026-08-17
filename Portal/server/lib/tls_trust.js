// One extra trust anchor, for a server that forgot to send its chain.
//
// On 2026-08-06 the Ministry of Finance rotated *.mof.gov.qa's TLS certificate and the new
// config sends ONLY the leaf — the issuing intermediate ("DigiCert Global G2 TLS RSA SHA256
// 2020 CA1") is omitted. Browsers quietly fetch the missing link themselves (AIA chasing);
// Node's fetch does not, so every plain-fetch request to Monaqasat failed with
// UNABLE_TO_VERIFY_LEAF_SIGNATURE — and the nightly award scanner recorded a clean "zero"
// for twelve days while awards piled up unread on a site any human could open.
//
// The fix ADDS the public DigiCert intermediate (shipped in lib/certs/, valid to 2031) to the
// process-wide default CA store via tls.setDefaultCACertificates (Node 24) — built-in fetch,
// https, everything. Nothing is disabled: the chain still has to verify to Mozilla's roots;
// we only supply the link the server should have sent. Loaded from db.js because db.js is the
// one module every Bell process imports — a per-entrypoint import would eventually miss one
// (the one-guard-per-action lesson).
//
// ⚠️ Node without the API (pre-24) keeps default trust — Monaqasat plain fetches then fail as
// RED errors naming the cause (the scanner throws on a blind first page), never as silence.

import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

try {
  if (typeof tls.setDefaultCACertificates === 'function' && typeof tls.getCACertificates === 'function') {
    const pem = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'certs', 'digicert-global-g2-tls-2020-ca1.pem'),
      'utf8');
    tls.setDefaultCACertificates([...tls.getCACertificates('default'), pem]);
  } else {
    console.error('[tls_trust] Node ' + process.version + ' lacks tls.setDefaultCACertificates — Monaqasat plain fetches will fail until Node is updated to 24+.');
  }
} catch (err) {
  console.error('[tls_trust] could not add the DigiCert intermediate: ' + err.message);
}

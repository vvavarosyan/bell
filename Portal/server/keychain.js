// API key storage — macOS Keychain on local Mac, environment variables on
// Linux/Railway deployments.
//
// macOS path: wraps the `security` CLI. Reads/writes API keys (Firecrawl,
// Apify, etc.) without ever storing them on disk. Entries are stored under
// the prefix `bdi-<name>`  e.g. bdi-firecrawl, bdi-apify.
//
// Linux path: read-only via env vars named `BDI_KEY_<NAME>` (uppercase).
// Writes are rejected — keys go through Railway's Variables panel, not the
// Portal's settings UI. This is correct: Railway is the source of truth for
// production secrets, and Portal Settings can't survive container restarts
// on Linux anyway.

import os from 'os';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);
const ACCOUNT = 'bell-data-intelligence';
const SERVICE_PREFIX = 'bdi-';
const IS_MAC = os.platform() === 'darwin';

function serviceFor(name) {
  if (!/^[a-z0-9-]+$/i.test(name)) {
    throw new Error('Invalid keychain entry name: ' + name);
  }
  return SERVICE_PREFIX + name.toLowerCase();
}

function envVarFor(name) {
  return 'BDI_KEY_' + name.toUpperCase().replace(/-/g, '_');
}

/** Write or update a Keychain entry. macOS only — throws on Linux. */
export async function setKey(name, value) {
  if (!IS_MAC) {
    throw new Error(
      `Cannot set API key '${name}' on this platform. Set the environment ` +
      `variable ${envVarFor(name)} via your deploy platform (Railway Variables tab).`
    );
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('Keychain value must be a non-empty string');
  }
  await execFileP('security', [
    'add-generic-password',
    '-a', ACCOUNT,
    '-s', serviceFor(name),
    '-w', value,
    '-U',
  ]);
  return true;
}

/**
 * Read an API key. On macOS: Keychain. On Linux: env var `BDI_KEY_<NAME>`.
 * Returns null if not present. Never throws on "not found" — only on
 * unexpected errors.
 */
export async function getKey(name) {
  if (!IS_MAC) {
    const v = process.env[envVarFor(name)];
    return v && v.length > 0 ? v : null;
  }
  try {
    const { stdout } = await execFileP('security', [
      'find-generic-password',
      '-a', ACCOUNT,
      '-s', serviceFor(name),
      '-w',
    ]);
    return stdout.replace(/\n$/, '');
  } catch (err) {
    // Exit code 44 = item not found
    if (err.code === 44 || /could not be found/i.test(err.stderr || '')) {
      return null;
    }
    // ENOENT on the `security` binary itself (shouldn't happen on macOS but
    // could on a weird mac without dev tools) — treat same as "no key".
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Returns true if a key exists, without revealing the value. */
export async function hasKey(name) {
  const v = await getKey(name);
  return v !== null && v.length > 0;
}

/** Delete a Keychain entry. macOS only — throws on Linux. */
export async function deleteKey(name) {
  if (!IS_MAC) {
    throw new Error(
      `Cannot delete API key '${name}' on this platform. Remove ` +
      `${envVarFor(name)} from your deploy platform's environment variables.`
    );
  }
  try {
    await execFileP('security', [
      'delete-generic-password',
      '-a', ACCOUNT,
      '-s', serviceFor(name),
    ]);
    return true;
  } catch (err) {
    if (err.code === 44 || /could not be found/i.test(err.stderr || '')) {
      return false;
    }
    throw err;
  }
}

/** List the names of all keys we've stored (without values). */
export async function listKeyNames() {
  // We check known names rather than enumerating, on both platforms.
  // This list grows as new enrichment tools are added.
  const known = ['firecrawl', 'apify', 'linkedin', 'reoon'];
  const results = [];
  for (const name of known) {
    if (await hasKey(name)) results.push(name);
  }
  return results;
}

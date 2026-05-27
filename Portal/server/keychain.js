// macOS Keychain helper — wraps the `security` CLI for reading and writing
// API keys (Firecrawl, Apify, etc.) without ever storing them on disk.
//
// All entries are stored under the same Keychain "service" prefix so they're
// easy to find and clear:  bdi-<name>  e.g. bdi-firecrawl, bdi-apify.

import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileP = promisify(execFile);
const ACCOUNT = 'bell-data-intelligence';
const SERVICE_PREFIX = 'bdi-';

function serviceFor(name) {
  if (!/^[a-z0-9-]+$/i.test(name)) {
    throw new Error('Invalid keychain entry name: ' + name);
  }
  return SERVICE_PREFIX + name.toLowerCase();
}

/** Write or update a Keychain entry. Always uses -U to upsert. */
export async function setKey(name, value) {
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

/** Read a Keychain entry. Returns null if not present. */
export async function getKey(name) {
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
    throw err;
  }
}

/** Returns true if a Keychain entry exists, without revealing the value. */
export async function hasKey(name) {
  const v = await getKey(name);
  return v !== null && v.length > 0;
}

/** Delete a Keychain entry. No-op if missing. */
export async function deleteKey(name) {
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
  // We can't easily list-only-our-prefix via `security`, so we just check the
  // known names. This list grows as new enrichment tools are added.
  const known = ['firecrawl', 'apify', 'linkedin'];
  const results = [];
  for (const name of known) {
    if (await hasKey(name)) results.push(name);
  }
  return results;
}

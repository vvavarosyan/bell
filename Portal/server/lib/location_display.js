// A stored "address" that is really just a coordinate must never be shown as an address.
//
// When the harvester follows a Google-Maps link that carries no place name, it writes the
// coordinate string itself into company_locations.address ("25.27792, 51.50532"). That is a
// faithful record of what the pin is, but it is not an address, and every consumer that prints
// an address printed it verbatim — the company drawer, CSV export, Bella's get_company, and
// the physical-letter generator, which would have posted a real envelope addressed to a pair
// of numbers.
//
// 537 rows are in this shape today. They are not wrong data — the coordinate IS the fact — so
// nothing is deleted; the value is simply not offered where a street address is expected.
// Rule 2.1 in the display direction: show what the source states, or show nothing.

/** Bare "lat, lng" — the harvester's fallback when a map link has no place name. */
const COORD_ONLY = /^\s*-?\d{1,3}\.\d+\s*,\s*-?\d{1,3}\.\d+\s*$/;
/**
 * Google Plus Code ("7HC2+5X Doha") — also a coordinate wearing an address's clothes.
 * The Open Location Code alphabet is exactly 23456789CFGHJMPQRVWX — it INCLUDES W and X.
 * A first attempt used [0-9A-HJ-NP-V], which rejected the real code "7HC2+5X" because of
 * its X. Caught by the unit test below, not in production.
 */
const PLUS_CODE = /^\s*[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3}\b/i;

export function isCoordinateAddress(value) {
  const s = String(value ?? '').trim();
  if (!s) return false;
  return COORD_ONLY.test(s) || PLUS_CODE.test(s);
}

/** The address to SHOW: the stored one, or null when it is only a coordinate. */
export function displayAddress(value) {
  return isCoordinateAddress(value) ? null : (value ?? null);
}

/**
 * Same rule in SQL, for queries that select the address directly.
 * Pass the column expression, e.g. displayAddressSql('l.address').
 */
export function displayAddressSql(col = 'address') {
  return `CASE WHEN btrim(${col}) ~ '^-?[0-9]{1,3}\\.[0-9]+\\s*,\\s*-?[0-9]{1,3}\\.[0-9]+$'
                 OR btrim(${col}) ~* '^[23456789CFGHJMPQRVWX]{4,8}\\+[23456789CFGHJMPQRVWX]{2,3}([[:space:]]|$)'
              THEN NULL ELSE ${col} END`;
}
